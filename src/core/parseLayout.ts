import type { Block, Line, PageLayout } from './types';

// layout XML は機械生成で、属性のみを持つ単純な構造。DOMParser は Service Worker で使えないため
// 属性値内の ">" も許容する小さなトークナイザで解析する。
const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body] ?? m;
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  for (let m = ATTR_RE.exec(raw); m; m = ATTR_RE.exec(raw)) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
  }
  return attrs;
}

function toLine(a: Record<string, string>): Line {
  const x = Number(a.X ?? 0);
  const y = Number(a.Y ?? 0);
  return {
    type: a.TYPE ?? '',
    text: a.STRING ?? '',
    x0: x,
    x1: x + Number(a.WIDTH ?? 0),
    y0: y,
    y1: y + Number(a.HEIGHT ?? 0),
    order: Number(a.ORDER ?? 0),
  };
}

/**
 * layout XML を文書順のブロック列にする。
 * - <TEXTBLOCK> 内の <LINE> は1ブロックにまとめる（LINE を持たない TEXTBLOCK は捨てる）
 * - <PAGE> 直下の <LINE> は1行だけのブロックにする
 * テキストモードの描画と同じ順序・粒度。種別(TYPE)の絞り込みは呼び出し側で行う。
 */
export function parseLayout(xml: string): PageLayout {
  const layout: PageLayout = { width: 0, height: 0, blocks: [], regions: [] };
  let current: Block | null = null;

  TAG_RE.lastIndex = 0;
  for (let m = TAG_RE.exec(xml); m; m = TAG_RE.exec(xml)) {
    const closing = m[1] === '/';
    const name = m[2];
    const selfClosing = m[4] === '/';

    if (name === 'PAGE' && !closing) {
      const a = parseAttrs(m[3]);
      layout.width = Number(a.WIDTH ?? 0);
      layout.height = Number(a.HEIGHT ?? 0);
    } else if (name === 'TEXTBLOCK') {
      if (closing) {
        if (current && current.lines.length > 0) layout.blocks.push(current);
        current = null;
      } else if (selfClosing) {
        current = null;
      } else {
        current = { lines: [] };
      }
    } else if (name === 'BLOCK' && !closing) {
      const a = parseAttrs(m[3]);
      const x = Number(a.X ?? 0);
      const y = Number(a.Y ?? 0);
      layout.regions.push({
        type: a.TYPE ?? '',
        x0: x,
        x1: x + Number(a.WIDTH ?? 0),
        y0: y,
        y1: y + Number(a.HEIGHT ?? 0),
      });
    } else if (name === 'LINE' && !closing) {
      const line = toLine(parseAttrs(m[3]));
      if (current) current.lines.push(line);
      else layout.blocks.push({ lines: [line] });
    }
  }
  return layout;
}
