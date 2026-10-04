import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildOutput, expandFileName, sanitizeSegment, sanitizeSubfolder } from '../src/core/output';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settings';
import type { PageSection } from '../src/core/types';

const book = { pid: '1234567', title: 'サンプル資料', volume: '', totalKoma: 320, leftOpen: true, index: [] };
const meta = { book, from: 73, to: 320, now: new Date(2026, 9, 3) }; // 2026-10-03
const pages: PageSection[] = [
  { koma: 73, side: 'right', pageNo: null, label: '73コマ右', blocks: [{ kind: 'body', lines: ['一行目'] }] },
  { koma: 74, side: 'right', pageNo: 4, label: '4頁', blocks: [{ kind: 'body', lines: ['二行目'] }] },
];
const S = (patch: (s: Settings) => void = () => {}): Settings => {
  const s = structuredClone(DEFAULT_SETTINGS);
  patch(s);
  return s;
};

describe('ファイル名', () => {
  it('テンプレートを展開する', () => {
    expect(expandFileName('{title}_{from}-{to}', meta)).toBe('サンプル資料_73-320');
    expect(expandFileName('{pid}_{date}', meta)).toBe('1234567_20261003');
  });
  it('禁止文字・予約語・末尾ドットを除く', () => {
    expect(sanitizeSegment('a/b:c*?"<>|d.')).toBe('a_b_c______d');
    expect(sanitizeSegment('CON')).toBe('_CON');
    expect(sanitizeSegment('')).toBe('_');
  });
  it('サブフォルダの .. と絶対パスを無効化する', () => {
    expect(sanitizeSubfolder('../../Windows\\System32/ sample ')).toBe('Windows/System32/sample');
    expect(sanitizeSubfolder('')).toBe('');
  });
});

describe('buildOutput', () => {
  it('既定: 単一の .txt（UTF-8, BOMなし, LF）', () => {
    const f = buildOutput(pages, S(), meta);
    expect(f.path).toBe('サンプル資料_73-320.txt');
    expect(f.data[0]).not.toBe(0xef);
    expect(new TextDecoder().decode(f.data)).toBe('73コマ右\n一行目\n\n4頁\n二行目');
  });
  it('MD / BOM / CRLF / サブフォルダ', () => {
    const f = buildOutput(
      pages,
      S((x) => {
        x.output.format = 'md';
        x.output.bom = true;
        x.output.newline = 'crlf';
        x.output.subfolder = 'NDL/sample';
      }),
      meta,
    );
    expect(f.path).toBe('NDL/sample/サンプル資料_73-320.md');
    expect([...f.data.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(f.data)).toContain('\r\n');
  });
  it('zip: コマごとのファイル', () => {
    const f = buildOutput(
      pages,
      S((x) => {
        x.output.unit = 'zip';
      }),
      meta,
    );
    expect(f.path).toBe('サンプル資料_73-320.zip');
    const files = unzipSync(f.data);
    expect(Object.keys(files).sort()).toEqual(['0073.txt', '0074.txt']);
    expect(strFromU8(files['0074.txt'])).toBe('4頁\n二行目');
  });
});
