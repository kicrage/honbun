import { describe, expect, it } from 'vitest';
import { collectionUrl, parseSource, textModeUrl } from '../src/ext/source';

describe('parseSource', () => {
  it('テキストモード', () => {
    expect(parseSource('https://lab.ndl.go.jp/dl-text/book?pid=1234567&page=73')).toEqual({
      pid: '1234567',
      koma: 73,
      kind: 'text-mode',
    });
    expect(parseSource('https://lab.ndl.go.jp/dl-text/book?pid=1234567')).toEqual({
      pid: '1234567',
      koma: undefined,
      kind: 'text-mode',
    });
  });
  it('通常のデジタルコレクション', () => {
    expect(parseSource('https://dl.ndl.go.jp/pid/1234567/1/77')).toEqual({ pid: '1234567', koma: 77, kind: 'collection' });
    expect(parseSource('https://dl.ndl.go.jp/ja/pid/1234567/1/77')).toEqual({ pid: '1234567', koma: 77, kind: 'collection' });
    expect(parseSource('https://dl.ndl.go.jp/en/pid/1234567')).toEqual({ pid: '1234567', koma: undefined, kind: 'collection' });
    expect(parseSource('https://dl.ndl.go.jp/pid/1234567/')?.pid).toBe('1234567');
  });
  it('次世代デジタルライブラリー通常モード', () => {
    expect(parseSource('https://lab.ndl.go.jp/dl/book/1234567')?.pid).toBe('1234567');
  });
  it('手入力: PID / info:ndljp', () => {
    expect(parseSource(' 1234567 ')).toEqual({ pid: '1234567', kind: 'input' });
    expect(parseSource('info:ndljp/pid/1234567')).toEqual({ pid: '1234567', koma: undefined, kind: 'input' });
  });
  it('書誌ID(12桁)・無関係URL・空文字は受け付けない', () => {
    expect(parseSource('000000771657')).toBeNull();
    expect(parseSource('https://example.com/pid/1234567')).toBeNull();
    expect(parseSource('https://lab.ndl.go.jp/dl-text/book')).toBeNull();
    expect(parseSource('')).toBeNull();
    expect(parseSource('hello')).toBeNull();
  });
});

describe('URL 生成', () => {
  it('テキストモードはデータ側のコマ、デジタルコレクションは画像のコマ', () => {
    expect(textModeUrl('7654321', 24)).toBe('https://lab.ndl.go.jp/dl-text/book?pid=7654321&page=24');
    expect(collectionUrl('7654321', 25)).toBe('https://dl.ndl.go.jp/pid/7654321/1/25');
    // 生成した URL は parseSource で元に戻る
    expect(parseSource(textModeUrl('1234567', 73))).toMatchObject({ pid: '1234567', koma: 73, kind: 'text-mode' });
    expect(parseSource(collectionUrl('1234567', 77))).toMatchObject({ pid: '1234567', koma: 77, kind: 'collection' });
  });
});
