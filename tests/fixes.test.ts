import { describe, expect, it } from 'vitest';
import { formatKoma, isPageNumberBlock } from '../src/core/format';
import { makeContext } from '../src/core/job';
import { headingKey } from '../src/core/offset';
import { sanitizeSegment } from '../src/core/output';
import { parseLayout } from '../src/core/parseLayout';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settings';
import { isUserCanceled } from '../src/ext/chromeApi';

const book = { pid: '1234567', title: 'サンプル', volume: '', totalKoma: 10, leftOpen: true, index: [] };

describe('isPageNumberBlock', () => {
  const pn = { earlier: 12, later: 13 };
  it('算出した頁と一致する数字だけの行を頁番号とみなす（空白が混じっていても）', () => {
    expect(isPageNumberBlock({ kind: 'body', lines: ['十二'] }, pn)).toBe(true);
    expect(isPageNumberBlock({ kind: 'body', lines: [' 十 二 '] }, pn)).toBe(true);
    expect(isPageNumberBlock({ kind: 'title', lines: ['１３'] }, pn)).toBe(true);
  });
  it('一致しない数字・複数行・注は頁番号とみなさない', () => {
    expect(isPageNumberBlock({ kind: 'body', lines: ['三四'] }, pn)).toBe(false);
    expect(isPageNumberBlock({ kind: 'body', lines: ['十二', '本文'] }, pn)).toBe(false);
    expect(isPageNumberBlock({ kind: 'note', lines: ['十二'] }, pn)).toBe(false);
  });
});

describe('外字「〓」の集計', () => {
  const xml =
    '<PAGE WIDTH="5600" HEIGHT="3800"><TEXTBLOCK>' +
    '<LINE TYPE="本文" X="4000" Y="600" WIDTH="70" HEIGHT="2000" ORDER="1" STRING="山〓川〓" />' +
    '</TEXTBLOCK></PAGE>';
  const count = (patch: (s: Settings) => void) => {
    const s = structuredClone(DEFAULT_SETTINGS);
    patch(s);
    const pages = formatKoma(makeContext(book, s), 3, parseLayout(xml), 0.5);
    return pages.flatMap((p) => p.blocks).reduce((n, b) => n + (b.gaiji ?? 0), 0);
  };
  it('保持・置換・除去のどの設定でも、整形前の個数を数える', () => {
    expect(count(() => {})).toBe(2);
    expect(count((s) => (s.content.gaiji = 'replace'))).toBe(2);
    expect(count((s) => (s.content.gaiji = 'remove'))).toBe(2);
  });
});

describe('sanitizeSegment（切り詰め）', () => {
  it('120文字で切った後に末尾が . や空白になっても除く', () => {
    const name = 'あ'.repeat(119) + '.' + 'い'.repeat(10);
    const out = sanitizeSegment(name);
    expect(out).toBe('あ'.repeat(119));
    expect(sanitizeSegment('a'.repeat(119) + ' b')).toBe('a'.repeat(119));
  });
});

describe('headingKey（算用・全角数字）', () => {
  const key = (title: string) => headingKey({ title, page: 1, koma: 1 });
  it('第1章・1.・１ などの接頭辞を除く', () => {
    expect(key('第1章 地理')).toBe(key('第一章 地理'));
    expect(key('第１章 地理')).toBe(key('第一章 地理'));
    expect(key('1. 地理')).toBe(key('地理'));
    expect(key('１ 地理')).toBe(key('地理'));
    expect(key('地理')).not.toBeNull();
  });
});

describe('isUserCanceled', () => {
  it('Chrome の「キャンセル」例外だけを判別する', () => {
    expect(isUserCanceled(new Error('Download canceled by the user'))).toBe(true);
    expect(isUserCanceled(new Error('Invalid filename'))).toBe(false);
  });
});
