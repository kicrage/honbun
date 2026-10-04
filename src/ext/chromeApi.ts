import type { OutputFile } from '../core/output';
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '../core/settings';

/** 拡張として動作しているか（vite dev など通常のページでは false）。 */
export const inExtension: boolean = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

// ---- アクティブタブ --------------------------------------------------------

/** 現在のタブの URL。拡張外（開発時）は ?src=URL で代用できる。host 権限のないサイトでは undefined。 */
export async function getActiveTabUrl(): Promise<string | undefined> {
  if (inExtension && chrome.tabs?.query) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url;
  }
  return new URLSearchParams(location.search).get('src') ?? undefined;
}

/** タブの切替・遷移を購読する（サイドパネルで常駐させたとき用）。解除関数を返す。 */
export function onActiveTabChanged(cb: () => void): () => void {
  if (!inExtension || !chrome.tabs?.onActivated) return () => {};
  const onUpdated = (_id: number, info: { url?: string; status?: string }) => {
    if (info.url || info.status === 'complete') cb();
  };
  chrome.tabs.onActivated.addListener(cb);
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.windows?.onFocusChanged?.addListener(cb);
  return () => {
    chrome.tabs.onActivated.removeListener(cb);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.windows?.onFocusChanged?.removeListener(cb);
  };
}

// ---- 永続化 ----------------------------------------------------------------

const SETTINGS_KEY = 'settings';
const LAST_PID_KEY = 'lastPid';

async function storageGet(key: string): Promise<unknown> {
  try {
    if (inExtension && chrome.storage?.local) {
      const r = await chrome.storage.local.get(key);
      return r[key];
    }
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function storageSet(key: string, value: unknown): Promise<void> {
  try {
    if (inExtension && chrome.storage?.local) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 永続化できなくても動作は続ける */
  }
}

export async function loadSettings(): Promise<Settings> {
  return mergeSettings(DEFAULT_SETTINGS, await storageGet(SETTINGS_KEY));
}
export const saveSettings = (s: Settings) => storageSet(SETTINGS_KEY, s);

export async function loadLastPid(): Promise<string> {
  const v = await storageGet(LAST_PID_KEY);
  return typeof v === 'string' ? v : '';
}
export const saveLastPid = (pid: string) => storageSet(LAST_PID_KEY, pid);

// ---- ダウンロード ----------------------------------------------------------

const SAVE_AS_DATA_URL_LIMIT = 24 * 1024 * 1024;

function toDataUrl(file: OutputFile): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < file.data.length; i += chunk) {
    bin += String.fromCharCode(...file.data.subarray(i, i + chunk));
  }
  return `data:${file.mime};base64,${btoa(bin)}`;
}

/** downloads.download の「ユーザーによるキャンセル」（Chrome: "Download canceled by the user"）か。 */
export const isUserCanceled = (e: unknown): boolean => /cancel/i.test(e instanceof Error ? e.message : String(e));

/**
 * 出力ファイルを保存する。保存できれば true、ユーザーがキャンセルしたら false。
 * ポップアップで「名前を付けて保存」ダイアログを開くとポップアップが閉じ、blob URL が失効して
 * ダウンロードが失敗しうるため、その場合は自己完結した data URL を使う。
 */
export async function saveFile(file: OutputFile, saveAs: boolean): Promise<boolean> {
  const blob = new Blob([file.data as BlobPart], { type: file.mime });

  if (inExtension && chrome.downloads?.download) {
    const useData = saveAs && file.data.length <= SAVE_AS_DATA_URL_LIMIT;
    const url = useData ? toDataUrl(file) : URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename: file.path, saveAs, conflictAction: 'uniquify' });
    } catch (e) {
      // 「名前を付けて保存」でユーザーがキャンセルしたときはエラーにしない
      if (isUserCanceled(e)) return false;
      throw e;
    } finally {
      if (!useData) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return true;
  }

  // 拡張外（開発時）: a[download] で保存
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.path.split('/').pop() ?? 'output.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

// ---- サイドパネル ----------------------------------------------------------

export const canUseSidePanel: boolean = inExtension && typeof chrome.sidePanel?.open === 'function';

/** 現在のウィンドウでサイドパネルを開く（ユーザー操作の中で呼ぶこと）。 */
export async function openSidePanel(): Promise<void> {
  const win = await chrome.windows.getCurrent();
  if (win.id !== undefined) await chrome.sidePanel.open({ windowId: win.id });
}
