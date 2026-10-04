import { strToU8, zipSync } from 'fflate';
import type { BookInfo, PageSection } from './types';
import type { Settings } from './settings';
import { EXTENSION, renderPages } from './render';

export interface OutputFile {
  /** Downloads 配下の相対パス（サブフォルダ含む。区切りは /） */
  path: string;
  data: Uint8Array;
  mime: string;
}

export interface OutputMeta {
  book: BookInfo;
  from: number;
  to: number;
  /** ファイル名の {date} 用。省略時は現在日時。 */
  now?: Date;
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Windows/macOS/Linux 共通で安全なファイル名要素にする。 */
export function sanitizeSegment(name: string): string {
  let s = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (s.length > 120) s = s.slice(0, 120);
  if (s === '' || s === '.' || s === '..') s = '_';
  if (RESERVED.test(s.split('.')[0])) s = `_${s}`;
  return s;
}

/** Downloads 配下に置くサブフォルダ。.. や絶対パスは取り除く。 */
export function sanitizeSubfolder(sub: string): string {
  return sub
    .split(/[\\/]+/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && p !== '.' && p !== '..')
    .map(sanitizeSegment)
    .join('/');
}

export function expandFileName(template: string, meta: OutputMeta): string {
  const d = meta.now ?? new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const values: Record<string, string> = {
    title: meta.book.title || meta.book.pid,
    volume: meta.book.volume,
    pid: meta.book.pid,
    from: String(meta.from),
    to: String(meta.to),
    date,
  };
  const name = template.replace(/\{(title|volume|pid|from|to|date)\}/g, (_, k: string) => values[k]);
  return sanitizeSegment(name === '' ? meta.book.pid : name);
}

export function encodeText(text: string, s: Settings['output']): Uint8Array {
  let t = text.replace(/\r\n?/g, '\n');
  if (s.newline === 'crlf') t = t.replaceAll('\n', '\r\n');
  if (s.bom) t = `﻿${t}`;
  return strToU8(t);
}

const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

/** 頁の列を、設定に従って1つのダウンロード対象ファイルにまとめる。 */
export function buildOutput(pages: PageSection[], s: Settings, meta: OutputMeta): OutputFile {
  const ext = EXTENSION[s.output.format];
  const folder = sanitizeSubfolder(s.output.subfolder);
  const base = expandFileName(s.output.fileNameTemplate, meta);

  if (s.output.unit === 'zip') {
    const byKoma = new Map<number, PageSection[]>();
    for (const p of pages) {
      const list = byKoma.get(p.koma);
      if (list) list.push(p);
      else byKoma.set(p.koma, [p]);
    }
    const entries: Record<string, Uint8Array> = {};
    for (const [koma, list] of [...byKoma].sort((a, b) => a[0] - b[0])) {
      entries[`${String(koma).padStart(4, '0')}.${ext}`] = encodeText(renderPages(list, s), s.output);
    }
    return { path: joinPath(folder, `${base}.zip`), data: zipSync(entries), mime: 'application/zip' };
  }

  return {
    path: joinPath(folder, `${base}.${ext}`),
    data: encodeText(renderPages(pages, s), s.output),
    mime: s.output.format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
  };
}
