import { describe, expect, it } from 'vitest';
import { decide, detectOffset, foldText, headingKey, resolveOffset } from '../src/core/offset';
import { parseIndex } from '../src/core/pageNumber';
import type { AnalyzeData } from '../src/core/types';
import type { NdlApi } from '../src/core/api';

describe('見出し語の取り出しと字体の正規化', () => {
  it('番号・章の接頭辞を除き、異体字を同一視する', () => {
    const [a, b, c, d] = parseIndex(['（一）　緖言/1p  (0025.jp2)', '第一章　地理/1  (0077.jp2)', '一　德川時代/70  (0112.jp2)', '標題  (0004.jp2)']);
    expect(headingKey(a)).toBe('緒言');
    expect(headingKey(b)).toBe('地理');
    expect(headingKey(c)).toBe('徳川時代');
    expect(headingKey(d)).toBe('標題');
    expect(foldText('緖言') === foldText('緒言')).toBe(true);
  });
  it('1文字の見出しは使わない', () => {
    expect(headingKey({ title: '序', page: 1, koma: 3 })).toBeNull();
  });
});

describe('decide', () => {
  it('一致が多く、ずれなしを大きく上回るときだけ採用する', () => {
    expect(decide({ [-2]: 0, [-1]: 15, 0: 2, 1: 2, 2: 1 }, 42)).toMatchObject({ offset: -1, confidence: 'high' });
    expect(decide({ [-2]: 1, [-1]: 1, 0: 23, 1: 11, 2: 9 }, 32)).toMatchObject({ offset: 0, confidence: 'high' });
  });
  it('僅差・少数ならずれなし（unknown）', () => {
    expect(decide({ [-2]: 0, [-1]: 3, 0: 2, 1: 0, 2: 0 }, 10)).toMatchObject({ offset: 0, confidence: 'unknown' });
    expect(decide({ [-2]: 0, [-1]: 0, 0: 0, 1: 0, 2: 0 }, 10)).toMatchObject({ offset: 0, confidence: 'unknown' });
  });
});

describe('detectOffset（偽APIで、見出しが画像より1コマ前のデータにある書籍を再現）', () => {
  const headings = ['緒言', '創立', '開校', '學業', '事業', '年譜'];
  const komaOf = [25, 26, 31, 35, 41, 49];
  const book = {
    pid: 'x', title: 't', volume: '', totalKoma: 60, leftOpen: false,
    index: parseIndex(headings.map((h, i) => `${h}  (${String(komaOf[i]).padStart(4, '0')}.jp2)`)),
  };
  const apiShift = (shift: number): NdlApi => ({
    async book() { return book; },
    async layoutXml() { return ''; },
    async analyze(_p, k): Promise<AnalyzeData> {
      // データのコマ k には、画像 k-shift の見出しが入っている
      const i = komaOf.indexOf(k - shift);
      return { divide: 0.5, contents: i >= 0 ? `本文${headings[i]}本文` : '本文のみ', tokens: [] };
    },
  });
  it.each([-1, 0, 1, -2])('ずれ %i を検出する', async (shift) => {
    const d = await detectOffset(book, apiShift(shift));
    expect(d.offset).toBe(shift === 0 ? 0 : shift);
  });
});

describe('resolveOffset', () => {
  const det = { offset: -1, scores: {}, entries: 10, confidence: 'high' as const };
  it('auto は検出値、manual は手動値、off は 0', () => {
    expect(resolveOffset('auto', 0, det)).toBe(-1);
    expect(resolveOffset('auto', 0, null)).toBe(0);
    expect(resolveOffset('manual', 2, det)).toBe(2);
    expect(resolveOffset('manual', NaN, det)).toBe(0);
    expect(resolveOffset('off', 5, det)).toBe(0);
  });
});
