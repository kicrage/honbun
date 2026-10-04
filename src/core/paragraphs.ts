import type { FormattedBlock, Line } from './types';

/**
 * 行連結モードの段落判定。縦書きの本文では、1行（＝1桁）の長さと書き出し位置から「この行は次の行へ流れ続けるか」を推定する。
 *
 * 次の行へ続かない（＝段落の切れ目）とみなす条件:
 *  (a) 次の行が字下げされている（段落の書き出し）
 *  (b) この行が全桁より短く、かつ文末（。！？）で終わっている（段落の最終行）
 *  (c) この行が極端に短い（見出し・項目）
 *  (d) ブロック全体が頁に対して短い（目次・図版目録・キャプションのような項目の並び）
 * 表や図のそばで桁が短くなった本文は、文の途中で終わるので (b) に当たらず、そのまま連結される。
 */
export const FULL_RATIO = 0.88; // 全桁とみなす長さ（ブロック内最長の行に対する比）
export const TINY_RATIO = 0.35; // これ未満は極端に短い行
export const SHORT_BLOCK_RATIO = 0.3; // 最長行が頁寸法のこの割合に満たないブロックは項目の並びとみなす
export const INDENT_RATIO = 0.6; // 字下げとみなす、桁の幅（≒1字分）に対する書き出しのずれ

const isVertical = (l: Line) => l.y1 - l.y0 >= l.x1 - l.x0;
const extent = (l: Line) => (isVertical(l) ? l.y1 - l.y0 : l.x1 - l.x0);
const start = (l: Line) => (isVertical(l) ? l.y0 : l.x0);
const charSize = (l: Line) => (isVertical(l) ? l.x1 - l.x0 : l.y1 - l.y0);

const SENTENCE_END = /[。！？][」』）)]*$/;

/** next が l と同じ桁（縦書きなら x が重なる）で、l より後ろ（下）に位置するか。 */
function sameColumnBelow(l: Line, next: Line): boolean {
  if (isVertical(l) !== isVertical(next)) return false;
  const [a0, a1, b0, b1, after] = isVertical(l)
    ? [l.x0, l.x1, next.x0, next.x1, next.y0 >= l.y1 - 1]
    : [l.y0, l.y1, next.y0, next.y1, next.x0 >= l.x1 - 1];
  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  return after && overlap >= 0.5 * Math.min(a1 - a0, b1 - b0);
}

/**
 * @param lines ブロック内の行（幾何情報）
 * @param texts 同じ行の整形後テキスト（同じ長さ）
 * @param pageSize 頁の寸法（縦書きなら高さ、横書きなら幅）。0 なら (d) は使わない
 * @returns cont[i] = lines[i] が次の行へ続く（最後の行は false）
 */
export function continuationFlags(lines: Line[], texts: string[], pageSize = 0): boolean[] {
  const n = lines.length;
  if (n === 0) return [];
  const max = Math.max(...lines.map(extent));
  const top = Math.min(...lines.map(start));
  const itemList = pageSize > 0 && max < pageSize * SHORT_BLOCK_RATIO;

  return lines.map((l, i) => {
    if (i === n - 1 || max <= 0 || itemList) return false;
    const next = lines[i + 1];
    if (sameColumnBelow(l, next)) return true; // (e) 行内の注などで同じ桁が分断された場合
    if (start(next) - top >= INDENT_RATIO * charSize(next)) return false; // (a)
    const e = extent(l);
    if (e < max * TINY_RATIO) return false; // (c)
    if (e < max * FULL_RATIO && SENTENCE_END.test(texts[i])) return false; // (b)
    return true;
  });
}

/**
 * 行連結モードで使う段落への分割。cont が無いブロックは、全行が1段落に連なるものとして扱う。
 */
export function splitParagraphs(block: FormattedBlock): string[][] {
  const paragraphs: string[][] = [];
  let cur: string[] = [];
  block.lines.forEach((line, i) => {
    cur.push(line);
    const continues = block.cont ? block.cont[i] === true : i < block.lines.length - 1;
    if (!continues) {
      paragraphs.push(cur);
      cur = [];
    }
  });
  if (cur.length > 0) paragraphs.push(cur);
  return paragraphs;
}
