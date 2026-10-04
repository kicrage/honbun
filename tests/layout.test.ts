import { describe, expect, it } from 'vitest';
import { parseLayout, decodeEntities } from '../src/core/parseLayout';

describe('parseLayout', () => {
  it('PAGE 直下の LINE は1行ブロックになる', () => {
    const xml = `<OCRDATASET><PAGE WIDTH="100" HEIGHT="50"><LINE TYPE="本文" X="1" Y="2" WIDTH="3" HEIGHT="4" ORDER="1" STRING="a" /></PAGE></OCRDATASET>`;
    const l = parseLayout(xml);
    expect(l.blocks).toEqual([{ lines: [{ type: '本文', text: 'a', x0: 1, x1: 4, y0: 2, y1: 6, order: 1 }] }]);
  });

  it('属性値内の > や XML 実体参照を扱える', () => {
    const xml = `<PAGE WIDTH="10" HEIGHT="10"><TEXTBLOCK><LINE TYPE="本文" X="0" Y="0" WIDTH="1" HEIGHT="1" ORDER="1" STRING="a&gt;b &amp; &quot;c&quot; &#x3042;" /></TEXTBLOCK></PAGE>`;
    expect(parseLayout(xml).blocks[0].lines[0].text).toBe('a>b & "c" あ');
    expect(decodeEntities('&lt;&#65;&unknown;')).toBe('<A&unknown;');
  });
});
