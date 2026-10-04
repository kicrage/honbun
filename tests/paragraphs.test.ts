import { describe, expect, it } from 'vitest';
import { continuationFlags, splitParagraphs } from '../src/core/paragraphs';
import type { Line } from '../src/core/types';

/** 縦書きの1桁。y0 は書き出し位置（字下げ）。 */
const vline = (len: number, y0 = 600): Line => ({ type: '本文', text: 'x', x0: 0, x1: 70, y0, y1: y0 + len, order: 1 });
const PAGE = 3800;

describe('continuationFlags（縦書き: 桁の長さ・書き出し・文末で段落の継続を判定）', () => {
  it('桁いっぱいの行は次へ続き、最後の行は続かない', () => {
    expect(continuationFlags([vline(2600), vline(2640), vline(900)], ['あ', 'い', 'う。'], PAGE)).toEqual([true, true, false]);
  });
  it('(b) 全桁より短く「。」で終わる行は段落の終わり', () => {
    expect(continuationFlags([vline(2640), vline(1500), vline(2640)], ['あ', 'い。', 'う'], PAGE)).toEqual([true, false, false]);
  });
  it('表や図のそばで短くなった桁（文の途中）は連結される', () => {
    const lines = [vline(2640), vline(1700), vline(1700), vline(1700)];
    expect(continuationFlags(lines, ['あ', 'い', 'う', 'え。'], PAGE)).toEqual([true, true, true, false]);
  });
  it('(a) 次の行が字下げされていれば、その手前で段落が切れる', () => {
    // 2行目は1字（≒幅70の0.6倍以上）下がって書き出されている
    const lines = [vline(2640), vline(2640, 600 + 80), vline(2640)];
    expect(continuationFlags(lines, ['あ', 'い', 'う'], PAGE)).toEqual([false, true, false]);
  });
  it('(e) 同じ桁が行内の注で分断された場合（x が重なり下に続く）は、短くても・書き出しが下がっても連結する', () => {
    const upper: Line = { type: '本文', text: 'x', x0: 3702, x1: 3766, y0: 671, y1: 1631, order: 1 };
    const lower: Line = { type: '本文', text: 'x', x0: 3709, x1: 3779, y0: 1947, y1: 3259, order: 2 };
    const full: Line = { type: '本文', text: 'x', x0: 3602, x1: 3673, y0: 620, y1: 3264, order: 3 };
    expect(continuationFlags([upper, lower, full], ['氣候は溫和である。最近五ヶ年間', 'の觀測では', '氣溫は'], PAGE)).toEqual([true, true, false]);
  });
  it('(c) 極端に短い行は続かない', () => {
    expect(continuationFlags([vline(2640), vline(500), vline(2640)], ['あ', 'い', 'う'], PAGE)).toEqual([true, false, false]);
  });
  it('(d) 頁に対して短いブロック（目次・図版目録）は1行ずつ独立', () => {
    expect(continuationFlags([vline(790), vline(784), vline(963)], ['a', 'b', 'c'], PAGE)).toEqual([false, false, false]);
  });
  it('横書きは幅で判定する', () => {
    const h = (w: number, x0 = 0, y0 = 0): Line => ({ type: '本文', text: 'x', x0, x1: x0 + w, y0, y1: y0 + 40, order: 1 });
    expect(continuationFlags([h(2000), h(2000, 0, 50), h(800, 0, 100)], ['a', 'b', 'c。'], 2400)).toEqual([true, true, false]);
  });
});

describe('splitParagraphs', () => {
  it('cont が無い場合は全行が1段落', () => {
    expect(splitParagraphs({ kind: 'body', lines: ['a', 'b', 'c'] })).toEqual([['a', 'b', 'c']]);
  });
  it('cont で段落を区切る', () => {
    expect(splitParagraphs({ kind: 'body', lines: ['a', 'b', 'c'], cont: [true, false, false] })).toEqual([['a', 'b'], ['c']]);
  });
});
