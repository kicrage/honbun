import type { AnalyzeData, BookInfo, Token } from './types';
import { parseIndex } from './pageNumber';

declare const __API_BASE__: string | undefined;

/** 拡張ビルドでは https://lab.ndl.go.jp、開発サーバでは同一オリジン（vite の proxy 経由）。 */
export const API_BASE: string = typeof __API_BASE__ === 'string' ? __API_BASE__ : '';

export interface NdlApi {
  book(pid: string, signal?: AbortSignal): Promise<BookInfo>;
  /** layout XML（行単位OCR）。コマ番号はゼロ埋めなし。 */
  layoutXml(pid: string, koma: number, signal?: AbortSignal): Promise<string>;
  /** 文字単位OCR・全文・綴じ位置。取得できなければ null（補完や綴じ位置の自動判定ができないだけで、続行できる）。 */
  analyze(pid: string, koma: number, signal?: AbortSignal): Promise<AnalyzeData | null>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

export function createApi(base: string = API_BASE, fetchImpl: typeof fetch = (...a) => fetch(...a)): NdlApi {
  const MAX_TRIES = 3;

  async function get(path: string, signal?: AbortSignal): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      try {
        const res = await fetchImpl(base + path, { signal });
        if (res.ok) return res;
        lastError = new ApiError(`HTTP ${res.status}: ${path}`, res.status);
        // 4xx（429 以外）は再試行しても変わらない
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw lastError;
      } catch (e) {
        if (signal?.aborted) throw e;
        if (e instanceof ApiError && e.status !== undefined && e.status < 500 && e.status !== 429) throw e;
        lastError = e;
      }
      if (attempt < MAX_TRIES - 1) await sleep(300 * 3 ** attempt, signal);
    }
    throw lastError instanceof Error ? lastError : new ApiError(String(lastError));
  }

  return {
    async book(pid, signal) {
      const res = await get(`/dl/api/book/${encodeURIComponent(pid)}`, signal);
      const j = (await res.json()) as {
        title?: string;
        volume?: string;
        page?: number;
        leftopen?: boolean;
        index?: string[];
      };
      if (typeof j.page !== 'number' || j.page < 1) throw new ApiError('書誌情報にコマ数がありません');
      return {
        pid,
        title: j.title ?? '',
        volume: j.volume ?? '',
        totalKoma: j.page,
        leftOpen: j.leftopen === true,
        index: parseIndex(j.index ?? []),
      };
    },
    async layoutXml(pid, koma, signal) {
      const res = await get(`/dl/api/page/layout/${encodeURIComponent(pid)}_${koma}`, signal);
      return res.text();
    },
    async analyze(pid, koma, signal) {
      try {
        const res = await get(`/dl/api/analyze/page/${encodeURIComponent(pid)}_${koma}`, signal);
        return parseAnalyze((await res.json()) as RawAnalyze);
      } catch (e) {
        if (signal?.aborted) throw e;
        return null;
      }
    },
  };
}

interface RawAnalyze {
  divide?: number;
  contents?: string;
  coordjson?: string;
}

export function parseAnalyze(j: RawAnalyze): AnalyzeData {
  let tokens: Token[] = [];
  try {
    const raw = JSON.parse(j.coordjson ?? '[]') as {
      contenttext?: string;
      xmin: number;
      xmax: number;
      ymin: number;
      ymax: number;
    }[];
    tokens = raw
      .filter((t) => typeof t.contenttext === 'string' && t.contenttext !== '')
      .map((t) => ({ text: t.contenttext as string, x0: t.xmin, x1: t.xmax, y0: t.ymin, y1: t.ymax }));
  } catch {
    /* 文字OCRが壊れていても、レイアウトだけで続行する */
  }
  return {
    divide: typeof j.divide === 'number' && j.divide > 0 && j.divide < 1 ? j.divide : null,
    contents: j.contents ?? '',
    tokens,
  };
}

/** items を最大 concurrency 並列で処理する。結果は入力順。 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}
