import { describe, expect, it } from 'vitest';
import { alignGlyphs, recoverMissing } from '../src/core/recover';
import { parseLayout } from '../src/core/parseLayout';
import type { Token } from '../src/core/types';

const tok = (text: string, x0: number, y0: number, w = 70, h = 70): Token => ({ text, x0, x1: x0 + w, y0, y1: y0 + h });

describe('alignGlyphs（新字体の文字OCR → 旧字体の全文）', () => {
  it('同じ長さなら、字体の差だけを旧字体に置き換える', () => {
    const r = alignGlyphs([tok('山川〓町図', 0, 0), tok('巻', 0, 0)], '山川〓町圖卷');
    expect(r.ok).toBe(true);
    expect(r.texts).toEqual(['山川〓町圖', '卷']);
  });
  it('文字OCR側にだけ余分な文字（「〓」）があっても追従する', () => {
    const r = alignGlyphs([tok('春夏秋冬', 0, 0), tok('〓', 0, 0), tok('緒言大坂', 0, 0)], '春夏秋冬緒言大阪');
    expect(r.ok).toBe(true);
    expect(r.texts.join('')).toBe('春夏秋冬〓緒言大阪');
  });
  it('並びが合わない（かなが食い違う）ときは字体そろえを諦め、元の文字を返す', () => {
    const r = alignGlyphs([tok('あいうえお', 0, 0)], 'かきくけこ');
    expect(r.ok).toBe(false);
    expect(r.texts).toEqual(['あいうえお']);
  });
});

describe('recoverMissing（縦書き）', () => {
  const layout = parseLayout(
    `<PAGE WIDTH="1000" HEIGHT="1000"><TEXTBLOCK><LINE TYPE="本文" X="800" Y="100" WIDTH="70" HEIGHT="500" ORDER="1" STRING="既存の行" /></TEXTBLOCK></PAGE>`,
  );
  const opts = { vertical: true, contents: '', glyphs: 'ocr' as const, includeRunningHead: false };

  it('レイアウトの行に載っていない文字だけを、桁ごとの行に組み直す（右→左・上→下）', () => {
    const tokens = [
      tok('既', 800, 100), // 既存の行の中 → 補わない
      tok('い', 600, 200), tok('ろ', 600, 100), // 桁A（x=600）: 上から ろ,い の順に直される
      tok('は', 500, 100), // 桁B（x=500）
    ];
    const r = recoverMissing(layout, tokens, opts);
    expect(r.chars).toBe(3);
    const lines = r.blocks.flatMap((b) => b.lines.map((l) => l.text));
    expect(lines).toEqual(['既存の行', 'ろい', 'は']); // 既存(x大)が先、補った桁は右から左
  });

  it('ノンブル・柱・ルビ相当の文字は補わない（柱は設定で補える）', () => {
    const l = parseLayout(
      `<PAGE WIDTH="1000" HEIGHT="1000"><BLOCK TYPE="ノンブル" X="100" Y="900" WIDTH="60" HEIGHT="60" /><BLOCK TYPE="柱" X="400" Y="20" WIDTH="60" HEIGHT="60" /></PAGE>`,
    );
    const tokens = [tok('三', 100, 900, 60, 60), tok('柱', 400, 20, 60, 60), tok('本', 600, 300), tok('ふ', 700, 300, 20, 20)];
    expect(recoverMissing(l, tokens, opts).blocks.flatMap((b) => b.lines.map((x) => x.text))).toEqual(['本']);
    expect(recoverMissing(l, tokens, { ...opts, includeRunningHead: true }).blocks.flatMap((b) => b.lines.map((x) => x.text))).toEqual(['本', '柱']);
  });

  it('同じ位置に重複して出る文字は1つにする', () => {
    const r = recoverMissing(layout, [tok('字', 300, 300), tok('字', 305, 302)], opts);
    expect(r.chars).toBe(1);
  });
});

describe('頁番号（レイアウトに BLOCK(ノンブル) が付いていないもの）の除外', () => {
  const opts = { vertical: true, contents: '', glyphs: 'ocr' as const, includeRunningHead: false, divide: 0.5 };
  const empty = parseLayout('<PAGE WIDTH="1000" HEIGHT="1000"></PAGE>');

  it('本文の桁の範囲より外側にある数字だけの文字は落とし、範囲内の数字は残す', () => {
    const tokens = [
      tok('二', 930, 800), // 右頁の最も右の桁より外側 → 頁番号
      tok('本文一行目です', 800, 100, 70, 400), // 右頁の桁
      tok('本文二行目です', 700, 100, 70, 400),
      tok('三', 750, 600), // 桁と桁の間（表中の数字など）→ 残す
      tok('四', 60, 800), // 左頁の本文の左外 → 頁番号
      tok('左頁の文', 200, 100, 70, 400),
    ];
    const lines = recoverMissing(empty, tokens, opts).blocks.flatMap((b) => b.lines.map((l) => l.text));
    expect(lines.join('|')).not.toContain('二|');
    expect(lines).not.toContain('二');
    expect(lines).not.toContain('四');
    expect(lines.some((l) => l.includes('三'))).toBe(true);
    expect(lines).toContain('左頁の文');
  });

  it('本文のない頁にある数字だけの文字は頁番号として落とす', () => {
    expect(recoverMissing(empty, [tok('五', 600, 900)], opts).chars).toBe(0);
  });
});

describe('parseNumeral', () => {
  it('位取り・十百千・算用/全角を読む', async () => {
    const { parseNumeral } = await import('../src/core/recover');
    expect(parseNumeral('五一')).toBe(51);
    expect(parseNumeral('五十一')).toBe(51);
    expect(parseNumeral('百二十')).toBe(120);
    expect(parseNumeral('〇')).toBe(0);
    expect(parseNumeral('５１')).toBe(51);
    expect(parseNumeral('五の一')).toBeNull();
  });
});

describe('目次から算出した頁番号との照合', () => {
  const l = parseLayout('<PAGE WIDTH="1000" HEIGHT="1000"></PAGE>');
  const base = { vertical: true, contents: '', glyphs: 'ocr' as const, includeRunningHead: false, divide: 0.5 };
  // 本文の桁の範囲の内側にあって「外縁ルール」では落ちない位置の頁番号
  const tokens = [tok('本文一行目', 800, 100, 70, 400), tok('本文二行目', 600, 100, 70, 400), tok('五一', 700, 700), tok('二二', 650, 800)];
  it('頁番号と同じ数字だけを落とし、他の数字（表の数値など）は残す', () => {
    const r = recoverMissing(l, tokens, { ...base, pageNumbers: [50, 51] });
    const text = r.blocks.flatMap((b) => b.lines.map((x) => x.text)).join('|');
    expect(text).not.toContain('五一');
    expect(text).toContain('二二');
  });
  it('頁番号が不明なら落とさない', () => {
    const text = recoverMissing(l, tokens, base).blocks.flatMap((b) => b.lines.map((x) => x.text)).join('|');
    expect(text).toContain('五一');
  });
});
