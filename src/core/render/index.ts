import type { PageSection } from '../types';
import type { OutputFormat, Settings } from '../settings';
import { renderTxt } from './txt';
import { renderMd } from './md';

export { renderTxt, renderMd };
export { escapeMd } from './md';

export function renderPages(pages: PageSection[], s: Settings, format: OutputFormat = s.output.format): string {
  return format === 'md' ? renderMd(pages, s) : renderTxt(pages, s);
}

export const EXTENSION: Record<OutputFormat, string> = { txt: 'txt', md: 'md' };
