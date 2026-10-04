import { describe, expect, it } from 'vitest';
import { cleanLine, formatNumber, renderLabel, toKanjiNumeral } from '../src/core/format';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/core/settings';

describe('数字表記', () => {
  it('漢数字', () => {
    const cases: [number, string][] = [
      [1, '一'],
      [10, '十'],
      [11, '十一'],
      [20, '二十'],
      [100, '百'],
      [101, '百一'],
      [123, '百二十三'],
      [1000, '千'],
      [1234, '千二百三十四'],
      [10000, '一万'],
      [12345, '一万二千三百四十五'],
    ];
    for (const [n, k] of cases) expect(toKanjiNumeral(n)).toBe(k);
  });
  it('全角・算用', () => {
    expect(formatNumber(10, 'fullwidth')).toBe('１０');
    expect(formatNumber(10, 'arabic')).toBe('10');
    expect(formatNumber(10, 'kanji')).toBe('十');
  });
});

describe('ラベル', () => {
  const L = DEFAULT_SETTINGS.label;
  const v = { koma: 73, side: 'right' as const, page: '10', pid: '1234567', title: 'サンプル資料' };
  it('印刷頁があれば template、なければ fallbackTemplate', () => {
    expect(renderLabel({ ...L, template: '{page}頁' }, v)).toBe('10頁');
    expect(renderLabel({ ...L, template: 'p.{page}' }, v)).toBe('p.10');
    expect(renderLabel(L, { ...v, page: null })).toBe('73コマ右');
    expect(renderLabel({ ...L, template: '【{title} {page}頁】' }, v)).toBe('【サンプル資料 10頁】');
  });
});

describe('cleanLine', () => {
  const C = DEFAULT_SETTINGS.content;
  it('〓 の扱い', () => {
    expect(cleanLine('山川〓町', { ...C, cjkSpaces: 'keep', gaiji: 'keep' })).toBe('山川〓町');
    expect(cleanLine('山川〓町', { ...C, cjkSpaces: 'keep', gaiji: 'replace', gaijiReplacement: '■' })).toBe('山川■町');
    expect(cleanLine('山川〓町', { ...C, cjkSpaces: 'keep', gaiji: 'remove' })).toBe('山川町');
  });
  it('空白: keep / punct / all', () => {
    const s = '名稱 山川とは、 其間に成立した。 傳說では';
    expect(cleanLine(s, { ...C, cjkSpaces: 'keep' })).toBe(s);
    expect(cleanLine(s, { ...C, cjkSpaces: 'punct' })).toBe('名稱 山川とは、其間に成立した。傳說では');
    expect(cleanLine(s, { ...C, cjkSpaces: 'all' })).toBe('名稱山川とは、其間に成立した。傳說では');
    expect(cleanLine('入 圖 挿 地', { ...C, cjkSpaces: 'all' })).toBe('入圖挿地');
  });
  it('英数字どうしの空白は all でも残す', () => {
    expect(cleanLine('no. 10 と 11', { ...C, cjkSpaces: 'all' })).toBe('no. 10 と 11');
  });
});

describe('mergeSettings', () => {
  it('欠けたキーは既定値、型違いも既定値に戻す', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { output: { format: 'md', bom: 'yes' }, extra: 1 });
    expect(merged.output.format).toBe('md');
    expect(merged.output.bom).toBe(false);
    expect(merged.split).toEqual(DEFAULT_SETTINGS.split);
    expect('extra' in merged).toBe(false);
  });
});
