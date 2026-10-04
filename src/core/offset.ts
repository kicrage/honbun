import type { NdlApi } from './api';
import type { BookInfo, IndexEntry } from './types';

/**
 * OCRデータのコマずれの検出。
 * 登録時の不備で、OCRデータが画像と1コマ以上ずれている書籍がある（例: 画像Nの文字がデータN-1に入っている）。
 * 書誌の目次（画像のコマ番号で書かれている）の見出し語が、どのコマの文字OCR全文に現れるかを数え、
 * 最も多く一致するずれ量を採る。 データのコマ = 画像のコマ + offset。
 */

export const OFFSET_CANDIDATES = [-2, -1, 0, 1, 2] as const;

export interface OffsetDetection {
  /** 採用するずれ（判定できなければ 0） */
  offset: number;
  /** ずれ量ごとの、目次見出しの一致数 */
  scores: Record<number, number>;
  /** 判定に使った目次項目の数 */
  entries: number;
  /** 判定の確からしさ。unknown は目次が無い・一致が少ないなどで判断できなかった */
  confidence: 'high' | 'low' | 'unknown';
}

/** 旧字体・異体字の差を吸収する（目次と文字OCRで表記が揺れる語を同一視する）。 */
const VARIANTS: Record<string, string> = {
  緖: '緒', 德: '徳', 學: '学', 關: '関', 圖: '図', 會: '会', 傳: '伝', 營: '営', 體: '体', 寫: '写', 眞: '真',
  舊: '旧', 變: '変', 號: '号', 實: '実', 觀: '観', 辭: '辞', 國: '国', 區: '区', 禮: '礼', 戰: '戦', 當: '当',
  總: '総', 經: '経', 讀: '読', 對: '対', 臺: '台', 爲: '為', 獨: '独', 兩: '両', 擧: '挙', 譯: '訳',
  懷: '懐', 竝: '並', 并: '並', 敎: '教', 效: '効', 來: '来', 價: '価', 產: '産', 驛: '駅', 廳: '庁', 驗: '験',
};

export function foldText(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFKC')) {
    if (/[\s　()（）［］\[\]「」『』、。・・]/.test(ch)) continue;
    out += VARIANTS[ch] ?? ch;
  }
  return out;
}

/** 目次項目から、本文中に現れるはずの見出し語を取り出す。取り出せない（短すぎる等）ものは null。 */
export function headingKey(e: IndexEntry): string | null {
  const t = e.title
    .replace(/^[（(][^）)]*[）)]\s*/, '') // （一）
    .replace(/^[一二三四五六七八九〇十百0-9０-９]+[.．、]?\s+/, '') // 一 / 1 / 1.
    .replace(/^第[一二三四五六七八九〇十百0-9０-９]+[章節編部]\s*/, ''); // 第一章 / 第1章
  const key = foldText(t);
  return key.length >= 2 ? key : null;
}

const MAX_ENTRIES = 24;

export async function detectOffset(book: BookInfo, api: NdlApi, signal?: AbortSignal): Promise<OffsetDetection> {
  const all = book.index.map((e) => ({ e, key: headingKey(e) })).filter((x): x is { e: IndexEntry; key: string } => x.key !== null);
  // 多数あるときは均等に間引く
  const picked =
    all.length <= MAX_ENTRIES ? all : Array.from({ length: MAX_ENTRIES }, (_, i) => all[Math.floor((i * all.length) / MAX_ENTRIES)]);
  const scores: Record<number, number> = Object.fromEntries(OFFSET_CANDIDATES.map((o) => [o, 0]));
  if (picked.length === 0) return { offset: 0, scores, entries: 0, confidence: 'unknown' };

  const need = new Set<number>();
  for (const { e } of picked) for (const o of OFFSET_CANDIDATES) need.add(e.koma + o);
  const komas = [...need].filter((k) => k >= 1 && k <= book.totalKoma);

  const text = new Map<number, string>();
  let next = 0;
  const worker = async () => {
    while (next < komas.length) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      const k = komas[next++];
      const a = await api.analyze(book.pid, k, signal);
      text.set(k, foldText(a?.contents ?? ''));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  for (const { e, key } of picked) {
    for (const o of OFFSET_CANDIDATES) {
      if (text.get(e.koma + o)?.includes(key)) scores[o]++;
    }
  }
  return decide(scores, picked.length);
}

/** 一致数からずれ量を決める。最多でも僅差・少数なら、ずれなしとして扱う。 */
export function decide(scores: Record<number, number>, entries: number): OffsetDetection {
  let best = 0;
  for (const o of OFFSET_CANDIDATES) if (scores[o] > scores[best] || (scores[o] === scores[best] && Math.abs(o) < Math.abs(best))) best = o;
  const zero = scores[0];
  if (best === 0) return { offset: 0, scores, entries, confidence: zero >= 3 ? 'high' : 'unknown' };
  const clear = scores[best] >= 3 && scores[best] >= zero * 2 + 2;
  return clear
    ? { offset: best, scores, entries, confidence: scores[best] >= 6 ? 'high' : 'low' }
    : { offset: 0, scores, entries, confidence: 'unknown' };
}

/** 設定と検出結果から、実際に使うずれを決める。 */
export function resolveOffset(
  mode: 'auto' | 'manual' | 'off',
  manual: number,
  detected: OffsetDetection | null,
): number {
  if (mode === 'off') return 0;
  if (mode === 'manual') return Number.isFinite(manual) ? Math.trunc(manual) : 0;
  return detected?.offset ?? 0;
}
