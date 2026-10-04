import type { Block, PageLayout, PageLines, Side } from './types';

export interface SplitOptions {
  /** 綴じ位置（画像幅に対する比 0〜1）。 */
  divide: number;
  /** true: 右頁を先に読む（右開き・縦書き） */
  rightFirst: boolean;
}

const centerX = (l: { x0: number; x1: number }) => (l.x0 + l.x1) / 2;

/**
 * 見開き1コマを「右頁」「左頁」に分ける。判定は行ごと（行の X 中心 ≥ 綴じ位置 なら右頁）。
 * TEXTBLOCK 内で両側にまたがる行があれば、ブロックを側ごとに分割して文書順を保つ。
 * 戻り値は読み順（rightFirst なら 右→左）。行が無い側も含める（空頁の扱いは整形側で決める）。
 */
export function splitSpread(layout: PageLayout, opts: SplitOptions): PageLines[] {
  const gutterX = layout.width * opts.divide;
  const right: Block[] = [];
  const left: Block[] = [];

  for (const block of layout.blocks) {
    const r = block.lines.filter((l) => centerX(l) >= gutterX);
    const l = block.lines.filter((x) => centerX(x) < gutterX);
    if (r.length > 0) right.push({ lines: r });
    if (l.length > 0) left.push({ lines: l });
  }

  const pages: PageLines[] = [
    { side: 'right', blocks: right },
    { side: 'left', blocks: left },
  ];
  if (!opts.rightFirst) pages.reverse();
  return pages;
}

/** 分割しない場合: コマ全体を1頁として扱う。 */
export function wholeSpread(layout: PageLayout): PageLines[] {
  return [{ side: 'whole' as Side, blocks: layout.blocks }];
}
