import { describe, expect, it } from 'vitest';
import { parseIndex } from '../src/core/pageNumber';

describe('parseIndex', () => {
  it('章名・印刷頁・コマに分解する', () => {
    expect(parseIndex(['標題  (0004.jp2)', '第一章　地理/1  (0077.jp2)', '一　德川時代/70  (0112.jp2)'])).toEqual([
      { title: '標題', page: null, koma: 4 },
      { title: '第一章 地理', page: 1, koma: 77 },
      { title: '一 德川時代', page: 70, koma: 112 },
    ]);
  });
  it('形式外の文字列は無視する', () => {
    expect(parseIndex(['???', ''])).toEqual([]);
  });
});
