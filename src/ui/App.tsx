import { AppBar, Alert, Box, Button, LinearProgress, Paper, Stack, Tab, Tabs, Toolbar, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runJob, type JobStats, makeContext } from '../core/job';
import { buildOutput } from '../core/output';
import { resolveOffset, type OffsetDetection } from '../core/offset';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import { canUseSidePanel, loadSettings, openSidePanel, saveFile, saveSettings } from '../ext/chromeApi';
import { PreviewPanel } from './PreviewPanel';
import { SettingsPanel, validateRange, type Range } from './SettingsPanel';
import { SourceCard } from './SourceCard';
import { api, useBook } from './useBook';

type RunState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; stats: JobStats; path: string; bytes: number }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export function App({ mode }: { mode: 'popup' | 'sidepanel' }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [range, setRange] = useState<Range>({ from: 1, to: 1 });
  const [previewKoma, setPreviewKoma] = useState(1);
  const [tab, setTab] = useState<'settings' | 'preview'>('settings');
  const [run, setRun] = useState<RunState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  const { state, load, origin, tabChecked, lastPid, currentKoma: tabKoma, tabKind } = useBook(
    useCallback((book, koma, detected, kind) => {
      // テキストモードの URL の page= はOCRデータのコマ番号。画像のコマ（デジタルコレクションと同じ番号）に換算する
      const s = settingsRef.current;
      const off = s ? resolveOffset(s.ocr.offsetMode, s.ocr.offsetManual, detected) : (detected?.offset ?? 0);
      const image = koma === undefined ? 1 : Math.min(book.totalKoma, Math.max(1, kind === 'text-mode' ? koma - off : koma));
      setRange({ from: image, to: book.totalKoma });
      setPreviewKoma(image);
      setRun({ status: 'idle' });
    }, []),
  );

  // 設定の読み込みと保存（保存は少し待ってまとめる）
  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);
  const loaded = settings !== null;
  useEffect(() => {
    if (!settings) return;
    const t = setTimeout(() => void saveSettings(settings), 300);
    return () => clearTimeout(t);
  }, [settings]);

  const update = useCallback((fn: (s: Settings) => void) => {
    setSettings((prev) => {
      const next = structuredClone(prev ?? DEFAULT_SETTINGS);
      fn(next);
      return next;
    });
  }, []);

  const book = state.status === 'ready' ? state.book : null;
  const detected: OffsetDetection | null = state.status === 'ready' ? state.detected : null;
  const offset = settings ? resolveOffset(settings.ocr.offsetMode, settings.ocr.offsetManual, detected) : 0;
  const currentKoma =
    tabKoma === undefined || !book
      ? undefined
      : Math.min(book.totalKoma, Math.max(1, tabKind === 'text-mode' ? tabKoma - offset : tabKoma));
  const rangeError = book ? validateRange(range, book.totalKoma) : null;
  const anomalies = useMemo(
    () => (book && settings ? makeContext(book, settings, detected).numbering.anomalies : []),
    [book, settings, detected],
  );

  const start = async () => {
    if (!book || !settings || rangeError) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRun({ status: 'running', done: 0, total: range.to - range.from + 1 });
    try {
      const { pages, stats } = await runJob({
        book,
        from: range.from,
        to: range.to,
        settings,
        api,
        detected,
        signal: ac.signal,
        onProgress: (p) => setRun({ status: 'running', done: p.done, total: p.total }),
      });
      if (pages.length === 0) {
        setRun({ status: 'error', message: '出力できる本文がありませんでした（範囲や取り込む行の種類を確認してください）。' });
        return;
      }
      const file = buildOutput(pages, settings, { book, from: range.from, to: range.to });
      const saved = await saveFile(file, settings.output.saveAs);
      if (!saved) {
        setRun({ status: 'cancelled' });
        return;
      }
      setRun({ status: 'done', stats, path: file.path, bytes: file.data.length });
    } catch (e) {
      if (ac.signal.aborted) setRun({ status: 'idle' });
      else setRun({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      abortRef.current = null;
    }
  };

  const running = run.status === 'running';
  const ext = settings?.output.unit === 'zip' ? 'zip' : (settings?.output.format ?? 'txt');
  const nKoma = book && !rangeError ? range.to - range.from + 1 : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0 }}>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>
            Honbun
          </Typography>
          {mode === 'popup' && canUseSidePanel && (
            <Button
              size="small"
              onClick={() => {
                void openSidePanel().then(() => window.close());
              }}
              title="サイドパネルに固定して開きます（変換中も閉じません）"
            >
              サイドパネルで開く
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Stack spacing={1.5} sx={{ p: 1.5, pb: 0 }}>
        <SourceCard state={state} tabKind={origin} tabChecked={tabChecked} lastPid={lastPid} onLoad={(pid, koma, kind) => void load(pid, koma, kind)} />
      </Stack>

      {book && loaded ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ minHeight: 40, mt: 0.5 }}>
            <Tab value="settings" label="設定" sx={{ minHeight: 40 }} />
            <Tab value="preview" label="プレビュー" sx={{ minHeight: 40 }} />
          </Tabs>
          <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, minHeight: 0 }}>
            {tab === 'settings' ? (
              <SettingsPanel s={settings} update={update} book={book} range={range} onRange={setRange} currentKoma={currentKoma} anomalies={anomalies} detected={detected} offset={offset} />
            ) : (
              <PreviewPanel book={book} settings={settings} koma={previewKoma} onKoma={setPreviewKoma} currentKoma={currentKoma} detected={detected} />
            )}
          </Box>
          <Paper square elevation={4} sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              {run.status === 'running' && (
                <>
                  <LinearProgress variant="determinate" value={(run.done / run.total) * 100} />
                  <Typography variant="caption" color="text.secondary">
                    取得中 {run.done} / {run.total} コマ
                  </Typography>
                </>
              )}
              {run.status === 'done' && (
                <Alert severity={run.stats.failed.length > 0 ? 'warning' : 'success'} sx={{ py: 0 }}>
                  <b>{run.path}</b> を保存しました（{run.stats.komaCount}コマ・{run.stats.pageCount}頁・{(run.bytes / 1024).toFixed(0)}KB）。
                  {run.stats.failed.length > 0 && (
                    <> 取得に失敗したコマ: {run.stats.failed.slice(0, 10).join(', ')}{run.stats.failed.length > 10 ? ' ほか' : ''}。</>
                  )}
                  {run.stats.offset !== 0 && <> OCRデータのコマずれ（{run.stats.offset > 0 ? '+' : ''}{run.stats.offset}）を補正しました。</>}
                  {run.stats.recoveredChars > 0 && <> レイアウトに載っていなかった {run.stats.recoveredChars}字を文字OCRから補いました。</>}
                  {run.stats.glyphMismatch > 0 && <> 字体をそろえられなかったコマ: {run.stats.glyphMismatch}（補った文字は新字体のままです）。</>}
                  {run.stats.gaijiCount > 0 && <> 外字「〓」: {run.stats.gaijiCount}字。</>}
                  {run.stats.divideFallback > 0 && <> 綴じ位置を取得できず中央で代用: {run.stats.divideFallback}コマ。</>}
                </Alert>
              )}
              {run.status === 'cancelled' && (
                <Alert severity="info" sx={{ py: 0 }}>
                  保存をキャンセルしました。
                </Alert>
              )}
              {run.status === 'error' && (
                <Alert severity="error" sx={{ py: 0 }}>
                  {run.message}
                </Alert>
              )}
              <Stack direction="row" spacing={1}>
                <Button variant="contained" fullWidth size="large" disabled={!!rangeError || running} onClick={() => void start()}>
                  {running ? '出力中…' : `${nKoma}コマを .${ext} に出力`}
                </Button>
                {running && (
                  <Button variant="outlined" color="inherit" onClick={() => abortRef.current?.abort()} sx={{ whiteSpace: 'nowrap' }}>
                    中止
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        </>
      ) : (
        <Box sx={{ flex: 1 }} />
      )}
    </Box>
  );
}
