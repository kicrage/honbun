import type { FormattedBlock, PageSection } from '../types';
import type { Settings } from '../settings';
import { splitParagraphs } from '../paragraphs';

/** Markdown の記法として解釈されうる文字をエスケープする。 */
export function escapeMd(text: string): string {
  let t = text.replace(/([\\`*_[\]<~])/g, '\\$1');
  t = t.replace(/^(\s*)([#>+\-])/, '$1\\$2'); // 行頭の見出し・引用・リスト記号
  t = t.replace(/^(\s*\d+)([.)])/, '$1\\$2'); // 行頭の「1.」形式リスト
  return t;
}

function renderBlock(block: FormattedBlock, s: Settings, join: boolean): string {
  const { md } = s.output;
  const escaped: FormattedBlock = { ...block, lines: block.lines.map(escapeMd) };
  // 連結モードでは、流れ続ける行を繋ぎ、短く終わる行で段落を分ける
  const paragraphs = join ? splitParagraphs(escaped).map((p) => p.join('')) : escaped.lines;
  switch (block.kind) {
    case 'title':
      return `${'#'.repeat(Math.min(6, Math.max(1, md.titleLevel)))} ${escaped.lines.join('')}`;
    case 'note':
    case 'caption':
      return paragraphs.map((l) => `> ${l}`).join('\n');
    default:
      return join ? paragraphs.join('\n\n') : paragraphs.join(md.hardBreak ? '  \n' : '\n');
  }
}

function renderLabel(label: string, s: Settings): string {
  const { labelStyle, labelHeadingLevel } = s.output.md;
  const safe = escapeMd(label);
  switch (labelStyle) {
    case 'heading':
      return `${'#'.repeat(Math.min(6, Math.max(1, labelHeadingLevel)))} ${safe}`;
    case 'comment':
      return `<!-- ${label.replaceAll('--', '- -')} -->`;
    default:
      return `---\n\n**${safe}**`;
  }
}

/** 中間表現を Markdown（LF 改行）にする。 */
export function renderMd(pages: PageSection[], s: Settings): string {
  const join = s.content.lineJoin !== 'keep'; // auto は MD では連結
  const parts = pages.map((p) => {
    const body = p.blocks.map((b) => renderBlock(b, s, join)).join('\n\n');
    if (s.label.position === 'none' || p.label === '') return body;
    const label = renderLabel(p.label, s);
    if (body === '') return label;
    return s.label.position === 'before' ? `${label}\n\n${body}` : `${body}\n\n${label}`;
  });
  return parts.join('\n\n');
}
