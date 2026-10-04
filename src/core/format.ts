import type { BlockKind, BookInfo, FormattedBlock, Line, PageLayout, PageLines, PageSection, Side } from './types';
import type { CjkSpaces, Numerals, Settings } from './settings';
import type { PageNumbering } from './pageNumber';
import { splitSpread, wholeSpread } from './spread';
import { continuationFlags } from './paragraphs';
import { parseNumeral } from './recover';

// ---- 数字表記 ---------------------------------------------------------------

const KANJI = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1〜99999 を漢数字（十・百・千・万の位取り表記）にする。範囲外は算用数字のまま返す。 */
export function toKanjiNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99999) return String(n);
  const units = ['', '十', '百', '千'];
  let out = '';
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  const part = (v: number) => {
    let s = '';
    for (let pos = 3; pos >= 0; pos--) {
      const d = Math.floor(v / 10 ** pos) % 10;
      if (d === 0) continue;
      s += (d === 1 && pos > 0 ? '' : KANJI[d]) + units[pos];
    }
    return s;
  };
  if (man > 0) out += part(man) + '万';
  out += part(rest);
  return out;
}

export function formatNumber(n: number, style: Numerals): string {
  if (style === 'fullwidth') return String(n).replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));
  if (style === 'kanji') return toKanjiNumeral(n);
  return String(n);
}

// ---- ラベル -----------------------------------------------------------------

const SIDE_LABEL: Record<Side, string> = { right: '右', left: '左', whole: '' };

export interface LabelValues {
  koma: number;
  side: Side;
  /** 印刷頁表記（算用/全角/漢数字済み）。算出不能なら null */
  page: string | null;
  pid: string;
  title: string;
}

export function renderLabel(settings: Settings['label'], v: LabelValues): string {
  const tpl = v.page !== null ? settings.template : settings.fallbackTemplate;
  return tpl.replace(/\{(page|koma|side|pid|title)\}/g, (_, key: string) => {
    switch (key) {
      case 'page':
        return v.page ?? '';
      case 'koma':
        return formatNumber(v.koma, settings.numerals);
      case 'side':
        return SIDE_LABEL[v.side];
      case 'pid':
        return v.pid;
      default:
        return v.title;
    }
  });
}

// ---- 行の整形 ---------------------------------------------------------------

const KIND_OF_TYPE: Record<string, BlockKind> = {
  本文: 'body',
  タイトル本文: 'title',
  注: 'note',
  キャプション: 'caption',
};

const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\u3000-\\u303F\\uFF00-\\uFFEF\\u30FB\\u00B7';
const SPACES = '[ \\t\\u3000]+';
const RE_ALL = new RegExp(`(?<=[${CJK}])${SPACES}(?=[${CJK}])`, 'gu');
// 句読点・閉じ括弧の後ろ / 開き括弧の前後
const CLOSE_PUNCT = '、。，．！？）」』】〕〉》］｝・';
const OPEN_PUNCT = '（「『【〔〈《［｛';
const RE_AFTER_CLOSE = new RegExp(`(?<=[${CLOSE_PUNCT}])${SPACES}`, 'gu');
const RE_BEFORE_CLOSE = new RegExp(`${SPACES}(?=[${CLOSE_PUNCT}])`, 'gu');
const RE_AROUND_OPEN = new RegExp(`${SPACES}(?=[${OPEN_PUNCT}])|(?<=[${OPEN_PUNCT}])${SPACES}`, 'gu');

export function cleanLine(text: string, content: Settings['content']): string {
  let s = text;
  if (content.gaiji === 'replace') s = s.replaceAll('〓', content.gaijiReplacement);
  else if (content.gaiji === 'remove') s = s.replaceAll('〓', '');

  const mode: CjkSpaces = content.cjkSpaces;
  if (mode === 'all') s = s.replace(RE_ALL, '');
  else if (mode === 'punct') s = s.replace(RE_AFTER_CLOSE, '').replace(RE_BEFORE_CLOSE, '').replace(RE_AROUND_OPEN, '');
  return s.trim();
}

function includeKind(kind: BlockKind, types: Settings['content']['types']): boolean {
  return types[kind];
}

/** 1ブロックを、同種の連続行ごとの FormattedBlock に変換する。 */
function formatBlockLines(
  lines: Line[],
  content: Settings['content'],
  dims: { width: number; height: number },
): FormattedBlock[] {
  const runs: { kind: BlockKind; texts: string[]; src: Line[] }[] = [];
  for (const line of lines) {
    const kind = KIND_OF_TYPE[line.type];
    if (!kind || !includeKind(kind, content.types)) continue;
    const text = cleanLine(line.text, content);
    if (text === '') continue;
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) {
      last.texts.push(text);
      last.src.push(line);
    } else runs.push({ kind, texts: [text], src: [line] });
  }
  return runs.map((r) => {
    // 縦書きの行は頁の高さ、横書きの行は頁の幅を基準に「長い/短い」を判断する
    const first = r.src[0];
    const vertical = first.y1 - first.y0 >= first.x1 - first.x0;
    return {
      kind: r.kind,
      lines: r.texts,
      cont: continuationFlags(r.src, r.texts, vertical ? dims.height : dims.width),
    };
  });
}

// ---- コマ → 頁（中間表現） --------------------------------------------------

export interface FormatContext {
  book: BookInfo;
  settings: Settings;
  numbering: PageNumbering;
  /** OCRデータのコマ = 画像のコマ + offset（コマずれの補正量） */
  offset: number;
}

/** 数字だけの1行で、目次から算出したこの見開きの印刷頁と一致するブロック（レイアウトが本文・タイトル本文として持つノンブル）。 */
function isPageNumberBlock(b: FormattedBlock, pn: { earlier: number | null; later: number | null }): boolean {
  if ((b.kind !== 'body' && b.kind !== 'title') || b.lines.length !== 1) return false;
  const n = parseNumeral(b.lines[0].replace(/s+/g, ''));
  return n !== null && (n === pn.earlier || n === pn.later);
}

export function isRightFirst(book: BookInfo, settings: Settings): boolean {
  const o = settings.split.readingOrder;
  return o === 'auto' ? !book.leftOpen : o === 'rtl';
}

/**
 * 1コマ分の layout を、設定に従って頁（PageSection）の列にする。
 * @param divide analyze API の綴じ位置（比）。取得できなかった場合は 0.5 を渡す。
 */
export function formatKoma(ctx: FormatContext, koma: number, layout: PageLayout, divide: number): PageSection[] {
  const { book, settings, numbering } = ctx;
  const rightFirst = isRightFirst(book, settings);
  const gutter = settings.split.gutter === 'half' ? 0.5 : divide;
  const pages: PageLines[] = settings.split.enabled
    ? splitSpread(layout, { divide: gutter, rightFirst })
    : wholeSpread(layout);

  const pn = numbering.forKoma(koma);
  const earlierSide: Side = rightFirst ? 'right' : 'left';

  const sections: PageSection[] = [];
  for (const page of pages) {
    let blocks = page.blocks.flatMap((b) => formatBlockLines(b.lines, settings.content, layout));
    if (settings.content.dropPageNumbers) blocks = blocks.filter((b) => !isPageNumberBlock(b, pn));
    if (blocks.length === 0 && settings.content.emptyPages === 'skip') continue;

    let pageNo: number | null;
    let pageText: string | null;
    if (page.side === 'whole') {
      pageNo = pn.later;
      const a = pn.earlier;
      const b = pn.later;
      const f = (n: number) => formatNumber(n, settings.label.numerals);
      pageText = a !== null && b !== null ? `${f(a)}-${f(b)}` : b !== null ? f(b) : a !== null ? f(a) : null;
    } else {
      pageNo = page.side === earlierSide ? pn.earlier : pn.later;
      pageText = pageNo !== null ? formatNumber(pageNo, settings.label.numerals) : null;
    }

    sections.push({
      koma,
      side: page.side,
      pageNo,
      label: renderLabel(settings.label, {
        koma,
        side: page.side,
        page: pageText,
        pid: book.pid,
        title: book.title,
      }),
      blocks,
    });
  }
  return sections;
}
