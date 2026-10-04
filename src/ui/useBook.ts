import { useCallback, useEffect, useRef, useState } from 'react';
import { createApi, type NdlApi } from '../core/api';
import { detectOffset, type OffsetDetection } from '../core/offset';
import type { BookInfo } from '../core/types';
import { getActiveTabUrl, loadLastPid, onActiveTabChanged, saveLastPid } from '../ext/chromeApi';
import { parseSource, type Source, type SourceKind } from '../ext/source';

export type BookState =
  | { status: 'idle' }
  | { status: 'loading'; pid: string }
  | { status: 'ready'; book: BookInfo; detected: OffsetDetection | null }
  | { status: 'error'; pid: string; message: string };

export const api: NdlApi = createApi();

function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/HTTP 4\d\d|HTTP 500/.test(msg)) return 'この PID の資料が見つかりません（テキストモード非対応の可能性があります）。';
  return `読み込めませんでした: ${msg}`;
}

/**
 * 起動元（テキストモード / 通常のデジタルコレクション / 手入力）から資料を決めて書誌を読み込む。
 * - アクティブタブの URL に PID が見つかればそれを使う（タブの切替・遷移にも追従）
 * - 見つからなければ手入力された PID を使う
 * - 手入力した資料は、タブ側の PID が変わるまで上書きしない
 */
export function useBook(
  onLoaded: (book: BookInfo, koma: number | undefined, detected: OffsetDetection | null, kind: SourceKind | undefined) => void,
) {
  const [state, setState] = useState<BookState>({ status: 'idle' });
  const [tabSource, setTabSource] = useState<Source | null>(null);
  const [tabChecked, setTabChecked] = useState(false);
  const [lastPid, setLastPid] = useState('');
  const lastTabPid = useRef<string | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const seq = useRef(0);

  const load = useCallback(async (pid: string, koma?: number, kind?: SourceKind) => {
    const id = ++seq.current;
    setState({ status: 'loading', pid });
    try {
      const book = await api.book(pid);
      // 目次の見出し位置から、OCRデータの画像に対するコマずれを調べる（失敗しても続行）
      const detected = await detectOffset(book, api).catch(() => null);
      if (id !== seq.current) return;
      setState({ status: 'ready', book, detected });
      onLoadedRef.current(book, koma, detected, kind);
      void saveLastPid(pid);
    } catch (e) {
      if (id !== seq.current) return;
      setState({ status: 'error', pid, message: describeError(e) });
    }
  }, []);

  // アクティブタブの監視
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const url = await getActiveTabUrl();
      if (!alive) return;
      setTabSource(url ? parseSource(url) : null);
      setTabChecked(true);
    };
    void check();
    void loadLastPid().then((p) => alive && setLastPid(p));
    const off = onActiveTabChanged(() => void check());
    return () => {
      alive = false;
      off();
    };
  }, []);

  // タブ側の資料（PID）が切り替わったときだけ読み込む
  useEffect(() => {
    if (tabSource && tabSource.pid !== lastTabPid.current) {
      lastTabPid.current = tabSource.pid;
      void load(tabSource.pid, tabSource.koma, tabSource.kind);
    }
  }, [tabSource, load]);

  // 読み込み済みの資料がタブの資料と同じときだけ、閲覧中のコマ・検出元を使う
  const sameAsTab = state.status === 'ready' && tabSource?.pid === state.book.pid;
  return {
    state,
    load,
    tabChecked,
    lastPid,
    /** 閲覧中のタブが示すコマ番号（テキストモードのときはデータ側の番号。画像のコマへの換算は呼び出し側で行う） */
    currentKoma: sameAsTab ? tabSource?.koma : undefined,
    tabKind: sameAsTab ? tabSource?.kind : undefined,
    origin: (state.status === 'ready' ? (sameAsTab ? tabSource?.kind : 'input') : undefined) as SourceKind | undefined,
  };
}
