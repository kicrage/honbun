import type { FormattedBlock, PageSection } from '../types';
import type { PageSeparator, Settings } from '../settings';
import { splitParagraphs } from '../paragraphs';

const SEPARATORS: Record<PageSeparator, string> = {
  blank: '\n\n',
  rule: '\n\n--------------------\n\n',
  formfeed: '\n\f\n',
  none: '\n',
};

function blockText(block: FormattedBlock, join: boolean): string {
  if (!join) return block.lines.join('\n');
  // 連結: 流れ続ける行どうしを繋ぎ、短く終わる行で段落（改行）を区切る
  return splitParagraphs(block)
    .map((p) => p.join(''))
    .join('\n');
}

/** 中間表現をプレーンテキスト（LF 改行）にする。 */
export function renderTxt(pages: PageSection[], s: Settings): string {
  const join = s.content.lineJoin === 'join';
  const gap = '\n'.repeat(Math.max(0, s.content.blockGap) + 1);
  const { position, separator } = s.label;

  const parts = pages.map((p) => {
    const body = p.blocks.map((b) => blockText(b, join)).join(gap);
    if (position === 'none' || p.label === '') return body;
    if (position === 'before') return body === '' ? p.label : `${p.label}\n${body}`;
    return body === '' ? p.label : `${body}\n${p.label}`;
  });
  return parts.join(SEPARATORS[separator]);
}
