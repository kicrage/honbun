import type { IndexEntry } from './types';
import type { Settings } from './settings';

/**
 * 書誌 index の1文字列 `"第一章　地理/1  (0077.jp2)"` を分解する。
 * 印刷頁が無い項目（`"標題  (0004.jp2)"`）は page=null。
 */
export function parseIndex(raw: string[]): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const s of raw) {
    // 「/1p」「/1」は印刷頁、「/折込」のような頁でない注記は頁なし扱い
    const m = /^(.*?)(?:\/(?:(\d+)p?|[^\s(]*))?\s*\((\d+)\.jp2\)\s*$/.exec(s);
    if (!m) continue;
    out.push({
      title: m[1].replace(/\s+/g, ' ').trim(),
      page: m[2] !== undefined ? Number(m[2]) : null,
      koma: Number(m[3]),
    });
  }
  return out;
}

export interface KomaPages {
  /** 見開きの「先に読む側」の頁番号（右開きなら右頁）。算出不能・0以下は null */
  earlier: number | null;
  /** 「後に読む側」の頁番号（右開きなら左頁） */
  later: number | null;
}

export interface Anomaly {
  koma: number;
  expected: number;
  actual: number;
}

export interface PageNumbering {
  forKoma(koma: number): KomaPages;
  /** 区間の連続性が崩れている箇所（挿図コマ等による頁ずれの疑い） */
  anomalies: Anomaly[];
}

const NONE: KomaPages = { earlier: null, later: null };

/** 見開きの2頁は (奇数, 奇数-1)。奇数側(=後に読む側)の頁番号 o を、index の頁番号から求める。 */
const laterOf = (page: number) => (page % 2 === 1 ? page : page + 1);

const norm = (n: number): number | null => (n >= 1 ? n : null);

function fromAnchor(o: number, koma: number, anchorKoma: number): KomaPages {
  const later = o + 2 * (koma - anchorKoma);
  return { earlier: norm(later - 1), later: norm(later) };
}

interface Anchor {
  koma: number;
  /** null は「ここから頁番号なし」の区切り（標題・目次・附録など） */
  later: number | null;
}

export function buildNumbering(
  index: IndexEntry[],
  cfg: Settings['numbering'],
  rightFirst: boolean,
): PageNumbering {
  if (cfg.mode === 'off') return { forKoma: () => NONE, anomalies: [] };

  if (cfg.mode === 'manual') {
    // manualSide が「先に読む側」か「後に読む側」かで奇数側の番号を決める。
    const earlierSide = rightFirst ? 'right' : 'left';
    const o = cfg.manualSide === earlierSide ? cfg.manualPage + 1 : cfg.manualPage;
    return { forKoma: (k) => fromAnchor(o, k, cfg.manualKoma), anomalies: [] };
  }

  // auto: index 項目を基準点にする。同一コマに複数あれば、頁番号を持つ最初のものを優先。
  const byKoma = new Map<number, Anchor>();
  for (const e of index) {
    const cur = byKoma.get(e.koma);
    const later = e.page === null ? null : laterOf(e.page);
    if (!cur || (cur.later === null && later !== null)) byKoma.set(e.koma, { koma: e.koma, later });
  }
  const anchors = [...byKoma.values()].sort((a, b) => a.koma - b.koma);

  const anomalies: Anomaly[] = [];
  let prev: Anchor | null = null;
  for (const a of anchors) {
    if (a.later !== null && prev && prev.later !== null) {
      const expected = prev.later + 2 * (a.koma - prev.koma);
      if (expected !== a.later) anomalies.push({ koma: a.koma, expected, actual: a.later });
    }
    prev = a;
  }

  return {
    anomalies,
    forKoma(koma) {
      let found: Anchor | null = null;
      for (const a of anchors) {
        if (a.koma <= koma) found = a;
        else break;
      }
      if (!found || found.later === null) return NONE;
      return fromAnchor(found.later, koma, found.koma);
    },
  };
}
