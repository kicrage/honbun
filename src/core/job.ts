import type { AnalyzeData, BookInfo, PageLayout, PageSection } from './types';
import type { Settings } from './settings';
import { mapPool, type NdlApi } from './api';
import { parseLayout } from './parseLayout';
import { formatKoma, isRightFirst, type FormatContext } from './format';
import { buildNumbering, type Anomaly } from './pageNumber';
import { resolveOffset, type OffsetDetection } from './offset';
import { recoverMissing } from './recover';

export interface Progress {
  done: number;
  total: number;
  koma: number;
}

export interface JobStats {
  komaCount: number;
  pageCount: number;
  gaijiCount: number;
  /** 取得に失敗したコマ */
  failed: number[];
  /** 綴じ位置を取得できず 50% で代用したコマ数 */
  divideFallback: number;
  /** 書誌 index から見た頁番号の不連続箇所（頁ずれの疑い） */
  anomalies: Anomaly[];
  /** 適用した OCRデータのコマずれ（データのコマ = 画像のコマ + offset） */
  offset: number;
  /** レイアウトに載らず、文字OCRから補った文字数 */
  recoveredChars: number;
  /** 補ったコマのうち、字体を旧字体にそろえられなかったコマ数 */
  glyphMismatch: number;
}

export interface JobResult {
  pages: PageSection[];
  stats: JobStats;
}

export function makeContext(book: BookInfo, settings: Settings, detected: OffsetDetection | null = null): FormatContext {
  return {
    book,
    settings,
    numbering: buildNumbering(book.index, settings.numbering, isRightFirst(book, settings)),
    offset: resolveOffset(settings.ocr.offsetMode, settings.ocr.offsetManual, detected),
  };
}

export interface KomaResult {
  pages: PageSection[];
  gaiji: number;
  divideFallback: boolean;
  recoveredChars: number;
  glyphMismatch: boolean;
}

const EMPTY: KomaResult = { pages: [], gaiji: 0, divideFallback: false, recoveredChars: 0, glyphMismatch: false };

/**
 * 画像の1コマ分を取得して整形する（プレビューと本番出力で共通）。
 * @param koma 画像のコマ番号（デジタルコレクションの閲覧画面と同じ）。OCRデータはその koma + offset から取る。
 */
export async function processKoma(
  ctx: FormatContext,
  koma: number,
  api: NdlApi,
  signal?: AbortSignal,
): Promise<KomaResult> {
  const { book, settings } = ctx;
  const dataKoma = koma + ctx.offset;
  // ずれの結果、画像に対応するOCRデータが存在しない（先頭・末尾）コマ
  if (dataKoma < 1 || dataKoma > book.totalKoma) return EMPTY;

  const needDivide = settings.split.enabled && settings.split.gutter === 'auto';
  const needAnalyze = needDivide || settings.ocr.recover;
  const [xml, analyze] = await Promise.all([
    api.layoutXml(book.pid, dataKoma, signal),
    needAnalyze ? api.analyze(book.pid, dataKoma, signal) : Promise.resolve<AnalyzeData | null>(null),
  ]);
  let layout: PageLayout = parseLayout(xml);

  let recoveredChars = 0;
  let glyphMismatch = false;
  if (settings.ocr.recover && analyze) {
    const r = recoverMissing(layout, analyze.tokens, {
      vertical: isRightFirst(book, settings),
      contents: analyze.contents,
      glyphs: settings.ocr.recoverGlyphs,
      includeRunningHead: settings.ocr.includeRunningHead,
      divide: analyze.divide ?? 0.5,
      pageNumbers: (() => {
        const pn = ctx.numbering.forKoma(koma);
        return [pn.earlier, pn.later].filter((n): n is number => n !== null);
      })(),
    });
    layout = { ...layout, blocks: r.blocks };
    recoveredChars = r.chars;
    glyphMismatch = r.chars > 0 && r.glyphMismatch;
  }

  const pages = formatKoma(ctx, koma, layout, analyze?.divide ?? 0.5);
  let gaiji = 0;
  for (const p of pages) for (const b of p.blocks) gaiji += b.gaiji ?? 0;

  return { pages, gaiji, divideFallback: needDivide && analyze?.divide == null, recoveredChars, glyphMismatch };
}

export interface JobInput {
  book: BookInfo;
  from: number;
  to: number;
  settings: Settings;
  api: NdlApi;
  /** コマずれの自動検出結果（設定が auto のとき使う） */
  detected?: OffsetDetection | null;
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
}

export async function runJob(input: JobInput): Promise<JobResult> {
  const { book, settings, api, signal, onProgress } = input;
  const from = Math.max(1, Math.min(input.from, input.to));
  const to = Math.min(book.totalKoma, Math.max(input.from, input.to));
  const ctx = makeContext(book, settings, input.detected ?? null);

  const komas = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  let done = 0;
  const results = await mapPool(
    komas,
    settings.fetch.concurrency,
    async (koma): Promise<KomaResult | null> => {
      let r: KomaResult | null = null;
      try {
        r = await processKoma(ctx, koma, api, signal);
      } catch (e) {
        if (signal?.aborted) throw e;
      }
      onProgress?.({ done: ++done, total: komas.length, koma });
      return r;
    },
    signal,
  );

  const stats: JobStats = {
    komaCount: komas.length,
    pageCount: 0,
    gaijiCount: 0,
    failed: [],
    divideFallback: 0,
    anomalies: ctx.numbering.anomalies,
    offset: ctx.offset,
    recoveredChars: 0,
    glyphMismatch: 0,
  };
  const pages: PageSection[] = [];
  results.forEach((r, i) => {
    if (!r) {
      stats.failed.push(komas[i]);
      return;
    }
    pages.push(...r.pages);
    stats.gaijiCount += r.gaiji;
    stats.recoveredChars += r.recoveredChars;
    if (r.divideFallback) stats.divideFallback++;
    if (r.glyphMismatch) stats.glyphMismatch++;
  });
  stats.pageCount = pages.length;
  return { pages, stats };
}
