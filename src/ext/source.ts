export type SourceKind = 'text-mode' | 'collection' | 'input';

export interface Source {
  pid: string;
  /** 閲覧中のコマ。分からなければ undefined */
  koma?: number;
  kind: SourceKind;
}

const PID_RE = /^\d{4,}$/;

/** テキストモードの URL。page はデータ側のコマ（画像のコマ＋OCRずれ）。 */
export const textModeUrl = (pid: string, dataKoma: number): string =>
  `https://lab.ndl.go.jp/dl-text/book?pid=${encodeURIComponent(pid)}&page=${dataKoma}`;

/** 通常のデジタルコレクションの URL。koma は画像のコマ。 */
export const collectionUrl = (pid: string, imageKoma: number): string =>
  `https://dl.ndl.go.jp/pid/${encodeURIComponent(pid)}/1/${imageKoma}`;

function toKoma(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/**
 * ページ URL または手入力文字列から、資料の PID（永続的識別子）と閲覧中のコマを取り出す。
 * 受け付ける形:
 *  - https://lab.ndl.go.jp/dl-text/book?pid=1234567&page=73   （テキストモード）
 *  - https://dl.ndl.go.jp/pid/1234567/1/77, /ja/pid/…, /en/pid/…   （通常のデジタルコレクション）
 *  - https://lab.ndl.go.jp/dl/book/1234567                     （次世代デジタルライブラリー通常モード）
 *  - info:ndljp/pid/1234567 / 1234567                          （手入力）
 * 書誌ID（000000771657 のような12桁）は PID ではないので受け付けない。
 */
export function parseSource(input: string): Source | null {
  const text = input.trim();
  if (text === '') return null;

  if (PID_RE.test(text)) return text.length >= 12 ? null : { pid: text, kind: 'input' };

  const info = /^info:ndljp\/pid\/(\d+)(?:\/(\d+))?$/.exec(text);
  if (info) return { pid: info[1], koma: toKoma(info[2]), kind: 'input' };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (url.hostname === 'lab.ndl.go.jp') {
    if (url.pathname.startsWith('/dl-text/')) {
      const pid = url.searchParams.get('pid');
      return pid && PID_RE.test(pid) ? { pid, koma: toKoma(url.searchParams.get('page')), kind: 'text-mode' } : null;
    }
    const m = /^\/dl\/book\/(\d+)/.exec(url.pathname);
    if (m) return { pid: m[1], koma: toKoma(url.searchParams.get('page')), kind: 'input' };
    return null;
  }

  if (url.hostname === 'dl.ndl.go.jp') {
    // /pid/{pid}[/{n}/{koma}] ・ 先頭に言語 (/ja, /en) が付くことがある
    const m = /^(?:\/[a-z]{2})?\/pid\/(\d+)(?:\/(\d+)\/(\d+))?\/?$/.exec(url.pathname);
    if (m) return { pid: m[1], koma: toKoma(m[3]), kind: 'collection' };
    const legacy = /^\/info:ndljp\/pid\/(\d+)(?:\/(\d+))?/.exec(url.pathname);
    if (legacy) return { pid: legacy[1], koma: toKoma(legacy[2]), kind: 'collection' };
  }
  return null;
}
