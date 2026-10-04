import type { Block, Line, PageLayout, Token } from './types';

/**
 * テキストモードのレイアウト(layout XML)には、段組み解析で行を作れなかった箇所の文字が載らないことがある。
 * 一方、文字単位OCR(analyze API)にはその文字が座標つきで残っている。ここでは、レイアウトの行に載っていない
 * 文字を拾い直して「行」に組み直し、レイアウトのブロック列へ読み順に挿し込む。
 */

export interface RecoverOptions {
  /** 縦書き（桁が右→左に並ぶ）か。false は横書き（行が上→下） */
  vertical: boolean;
  /** analyze の全文（旧字体）。glyphs が 'contents' のとき字体をそろえるのに使う */
  contents: string;
  glyphs: 'contents' | 'ocr';
  /** 柱（欄外の書名・章名）も補うか */
  includeRunningHead: boolean;
  /** 見開きの綴じ位置（画像幅に対する比）。ノンブル判定で、頁ごとの本文の範囲を求めるのに使う。省略時は 0.5 */
  divide?: number;
  /** この画像コマの印刷頁番号（目次から算出）。数字だけの文字がこれと一致すれば頁番号として落とす */
  pageNumbers?: number[];
}

export interface RecoverResult {
  /** 補った行を挿し込んだブロック列 */
  blocks: Block[];
  /** 補った文字数 */
  chars: number;
  /** 字体をそろえられなかったか（文字の並びが全文と一致しなかった） */
  glyphMismatch: boolean;
}

const KANA = /[぀-ヿ]/;
const ASCII_OR_DIGIT = /[\x21-\x7e０-９〇]/;

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** 字体の違いとして許せる置換か（かなや数字は字体差がないので、食い違えば並びがずれている） */
const plausibleVariant = (a: string, b: string) =>
  !KANA.test(a) && !KANA.test(b) && !ASCII_OR_DIGIT.test(a) && !ASCII_OR_DIGIT.test(b);

/**
 * 文字OCR(新字体)の各トークンを、全文 contents(旧字体)の字体にそろえる。
 * 両者は同じ並びだが、1〜数文字の過不足がありうる（例: 文字OCRだけ「〓」が1つ多い）。
 * 食い違いは「字体差」「どちらかの余分な1文字」のいずれかとして順に吸収し、
 * 吸収できない食い違い（並びが合わない）が出たら、字体そろえを諦めて元の文字を返す。
 */
export function alignGlyphs(tokens: Token[], contents: string): { texts: string[]; ok: boolean } {
  const orig = tokens.map((t) => t.text);
  const flat: { ch: string; tok: number }[] = [];
  tokens.forEach((t, i) => [...t.text].forEach((ch) => flat.push({ ch, tok: i })));
  const target = [...contents];

  const out: string[] = flat.map((f) => f.ch);
  let p = 0;
  let subs = 0;
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i].ch;
    if (p >= target.length) break;
    const d = target[p];
    if (c === d) {
      p++;
      continue;
    }
    // 文字OCR側にだけある余分な1文字（次の文字が全文の現在位置と一致する）
    if (flat[i + 1] && flat[i + 1].ch === d && !(target[p + 1] === flat[i + 1].ch)) continue;
    // 全文側にだけある余分な1文字
    if (target[p + 1] === c && !(flat[i + 1] && flat[i + 1].ch === d)) {
      p += 2;
      continue;
    }
    if (plausibleVariant(c, d)) {
      out[i] = d;
      p++;
      subs++;
      continue;
    }
    return { texts: orig, ok: false };
  }
  if (flat.length > 20 && subs > flat.length * 0.4) return { texts: orig, ok: false };
  // 末尾で全文が大きく余る/足りないときは、並びが合っていない
  if (Math.abs(target.length - p) > Math.max(8, flat.length * 0.05)) return { texts: orig, ok: false };

  const texts = orig.map(() => '');
  flat.forEach((f, i) => (texts[f.tok] += out[i]));
  return { texts, ok: true };
}

const center = (t: { x0: number; x1: number; y0: number; y1: number }) => ({ x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2 });
const inside = (r: { x0: number; x1: number; y0: number; y1: number }, x: number, y: number) =>
  r.x0 <= x && x <= r.x1 && r.y0 <= y && y <= r.y1;

/** 同じ文字列で、一方の中心がもう一方の枠に入るトークン（文字OCRに重複して出ることがある）を除く。 */
function dedupe(tokens: Token[]): Token[] {
  const drop = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    if (drop.has(i)) continue;
    const a = tokens[i];
    const ca = center(a);
    for (let j = i + 1; j < tokens.length; j++) {
      const b = tokens[j];
      if (a.text === b.text && inside(b, ca.x, ca.y)) drop.add(j);
    }
  }
  return tokens.filter((_, i) => !drop.has(i));
}

const EXCLUDED_ALWAYS = new Set(['ノンブル', 'ルビ']);

export function recoverMissing(layout: PageLayout, tokens: Token[], opts: RecoverOptions): RecoverResult {
  if (tokens.length === 0) return { blocks: layout.blocks, chars: 0, glyphMismatch: false };

  let glyphMismatch = false;
  let toks = tokens;
  if (opts.glyphs === 'contents' && opts.contents) {
    const al = alignGlyphs(tokens, opts.contents);
    glyphMismatch = !al.ok;
    toks = tokens.map((t, i) => ({ ...t, text: al.texts[i] }));
  }
  toks = dedupe(toks);

  const lines = layout.blocks.flatMap((b) => b.lines);
  const excluded = layout.regions.filter((r) => EXCLUDED_ALWAYS.has(r.type) || (r.type === '柱' && !opts.includeRunningHead));

  const size = (t: Token) => Math.min(t.x1 - t.x0, t.y1 - t.y0);
  const med = median(toks.map(size));

  const orphan = toks.filter((t) => {
    const { x, y } = center(t);
    if (lines.some((l) => inside(l, x, y))) return false; // レイアウトの行に載っている
    if (excluded.some((r) => inside(r, x, y))) return false; // ノンブル・柱・ルビ
    if (med > 0 && size(t) < med * 0.55) return false; // ルビ相当の小さな文字
    return true;
  });
  if (orphan.length === 0) return { blocks: layout.blocks, chars: 0, glyphMismatch };

  const known = new Set(opts.pageNumbers ?? []);
  const kept = dropPageNumbers(orphan, lines, layout.width * (opts.divide ?? 0.5), med, opts.vertical).filter((t) => {
    if (known.size === 0 || !NUMERAL_ONLY.test(t.text)) return true;
    const n = parseNumeral(t.text);
    return n === null || !known.has(n); // 目次から算出した頁番号と同じ数字は、頁番号とみなす
  });
  if (kept.length === 0) return { blocks: layout.blocks, chars: 0, glyphMismatch };

  const recovered = toBlocks(kept, med, opts.vertical);
  const chars = kept.reduce((n, t) => n + [...t.text].length, 0);
  return { blocks: mergeBlocks(layout.blocks, recovered, opts.vertical), chars, glyphMismatch };
}

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const KANJI_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 「五一」(位取り)・「五十一」(十百千)・「51」「５１」を数にする。数字でなければ null。 */
export function parseNumeral(s: string): number | null {
  const t = s.normalize('NFKC');
  if (/^[0-9]+$/.test(t)) return Number(t);
  if (!/^[〇一二三四五六七八九十百千]+$/.test(t)) return null;
  if (!/[十百千]/.test(t)) return Number([...t].map((c) => KANJI_DIGIT[c]).join(''));
  let total = 0;
  let cur = 0;
  for (const c of t) {
    if (c in KANJI_DIGIT) cur = KANJI_DIGIT[c];
    else {
      total += (cur || 1) * KANJI_UNIT[c];
      cur = 0;
    }
  }
  return total + cur;
}

const NUMERAL_ONLY = /^[〇一二三四五六七八九十百千0-9０-９]{1,4}$/;

/**
 * レイアウトに BLOCK(ノンブル) が付いていない頁番号を除く。
 * 頁番号は本文の外側の欄外にある。頁（見開きの右・左）ごとに本文の桁の範囲を求め、
 * その範囲より外にある「数字だけの短い文字」を頁番号とみなして落とす。
 */
function dropPageNumbers(orphan: Token[], lines: Line[], gutterX: number, med: number, vertical: boolean): Token[] {
  const cross = (r: { x0: number; x1: number; y0: number; y1: number }) => (vertical ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2);
  const sideOf = (r: { x0: number; x1: number }) => ((r.x0 + r.x1) / 2 >= gutterX ? 1 : 0);
  const isNumber = (t: Token) => NUMERAL_ONLY.test(t.text);

  // 頁ごとの本文の桁の範囲（レイアウトの行 + 数字以外の補った文字）
  const extent: Record<number, { min: number; max: number } | undefined> = {};
  const widen = (side: number, c: number) => {
    const e = extent[side];
    if (!e) extent[side] = { min: c, max: c };
    else {
      e.min = Math.min(e.min, c);
      e.max = Math.max(e.max, c);
    }
  };
  for (const l of lines) widen(sideOf(l), cross(l));
  for (const t of orphan) if (!isNumber(t)) widen(sideOf(t), cross(t));

  const margin = med * 0.3;
  return orphan.filter((t) => {
    if (!isNumber(t)) return true;
    const e = extent[sideOf(t)];
    if (!e) return false; // 本文のない頁にある数字だけの文字は頁番号
    const c = cross(t);
    return !(c > e.max + margin || c < e.min - margin);
  });
}

/** 文字を桁（縦書き）または行（横書き）に組み、近い桁どうしをブロックにまとめる。 */
function toBlocks(orphan: Token[], med: number, vertical: boolean): Block[] {
  // 主軸: 桁の位置（縦書きは x、横書きは y）。副軸: 桁の中の並び（縦書きは y、横書きは x）
  const cross = (t: Token) => (vertical ? center(t).x : center(t).y);
  const along = (t: Token) => (vertical ? t.y0 : t.x0);
  const sorted = [...orphan].sort((a, b) => (vertical ? cross(b) - cross(a) : cross(a) - cross(b)));

  const tol = Math.max(1, med * 0.6);
  const cols: { toks: Token[]; mean: number }[] = [];
  for (const t of sorted) {
    const c = cols[cols.length - 1];
    if (c && Math.abs(cross(t) - c.mean) <= tol) {
      c.toks.push(t);
      c.mean = (c.mean * (c.toks.length - 1) + cross(t)) / c.toks.length;
    } else cols.push({ toks: [t], mean: cross(t) });
  }

  const colLines: Line[] = cols.map((c, i) => {
    const ts = [...c.toks].sort((a, b) => along(a) - along(b));
    return {
      type: '本文',
      text: ts.map((t) => t.text).join(''),
      x0: Math.min(...ts.map((t) => t.x0)),
      x1: Math.max(...ts.map((t) => t.x1)),
      y0: Math.min(...ts.map((t) => t.y0)),
      y1: Math.max(...ts.map((t) => t.y1)),
      order: 1_000_000 + i,
    };
  });

  // 桁の間隔が大きく開いたところでブロックを分ける（表・図・見出しなどで離れた領域）
  const gapLimit = Math.max(1, med * 3);
  const blocks: Block[] = [];
  let cur: Line[] = [];
  let prevMean = 0;
  cols.forEach((c, i) => {
    if (cur.length > 0 && Math.abs(c.mean - prevMean) > gapLimit) {
      blocks.push({ lines: cur });
      cur = [];
    }
    cur.push(colLines[i]);
    prevMean = c.mean;
  });
  if (cur.length > 0) blocks.push({ lines: cur });
  return blocks;
}

/**
 * 補ったブロックを、読み順（縦書きは右から左、横書きは上から下）の位置に挿し込む。
 * レイアウト側のブロックの相対順序は変えない。
 */
function mergeBlocks(real: Block[], added: Block[], vertical: boolean): Block[] {
  // 読み順の先頭ほど大きくなるキー
  const key = (b: Block) => (vertical ? Math.max(...b.lines.map((l) => l.x1)) : -Math.min(...b.lines.map((l) => l.y0)));
  const out = [...real];
  for (const b of [...added].sort((a, c) => key(c) - key(a))) {
    const k = key(b);
    const at = out.findIndex((r) => key(r) < k);
    if (at < 0) out.push(b);
    else out.splice(at, 0, b);
  }
  return out;
}
