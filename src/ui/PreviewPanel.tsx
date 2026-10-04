import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { makeContext, processKoma } from '../core/job';
import { renderPages } from '../core/render';
import type { Settings } from '../core/settings';
import type { OffsetDetection } from '../core/offset';
import type { BookInfo } from '../core/types';
import { collectionUrl, textModeUrl } from '../ext/source';
import { NumberField } from './fields';
import { api } from './useBook';

/** 現在の設定で1コマを整形した結果を、保存前に確認できるようにする。 */
export function PreviewPanel(props: {
  book: BookInfo;
  settings: Settings;
  koma: number;
  onKoma: (k: number) => void;
  currentKoma?: number;
  detected: OffsetDetection | null;
}) {
  const { book, settings, koma, onKoma, currentKoma, detected } = props;
  const [state, setState] = useState<{ loading: boolean; text: string; pages: number; error?: string }>({
    loading: true,
    text: '',
    pages: 0,
  });
  const ctx = useMemo(() => makeContext(book, settings, detected), [book, settings, detected]);
  const valid = Number.isInteger(koma) && koma >= 1 && koma <= book.totalKoma;
  const dataKoma = koma + ctx.offset;
  const dataValid = dataKoma >= 1 && dataKoma <= book.totalKoma;

  useEffect(() => {
    if (!valid) return;
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    const t = setTimeout(() => {
      processKoma(ctx, koma, api, ac.signal)
        .then((r) => setState({ loading: false, text: renderPages(r.pages, settings), pages: r.pages.length }))
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          setState({ loading: false, text: '', pages: 0, error: e instanceof Error ? e.message : String(e) });
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [ctx, koma, settings, valid]);

  return (
    <Stack spacing={1.5} sx={{ minHeight: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Button variant="outlined" size="small" disabled={!valid || koma <= 1} onClick={() => onKoma(koma - 1)} sx={{ minWidth: 40, height: 40 }}>
          ◀
        </Button>
        <NumberField
          label="コマ"
          value={koma}
          min={1}
          max={book.totalKoma}
          error={!valid}
          help={valid ? undefined : `1〜${book.totalKoma}`}
          onChange={onKoma}
        />
        <Button variant="outlined" size="small" disabled={!valid || koma >= book.totalKoma} onClick={() => onKoma(koma + 1)} sx={{ minWidth: 40, height: 40 }}>
          ▶
        </Button>
      </Stack>
      {currentKoma !== undefined && currentKoma !== koma && (
        <Button size="small" onClick={() => onKoma(currentKoma)} sx={{ alignSelf: 'flex-start' }}>
          閲覧中の{currentKoma}コマを表示
        </Button>
      )}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        <Button
          size="small"
          variant="outlined"
          component="a"
          href={textModeUrl(book.pid, dataKoma)}
          target="_blank"
          rel="noopener noreferrer"
          disabled={!valid || !dataValid}
          title={`次世代デジタルライブラリー（テキストモード）の ${dataKoma} コマを新しいタブで開く`}
        >
          テキストモードで開く ↗
        </Button>
        <Button
          size="small"
          variant="outlined"
          component="a"
          href={collectionUrl(book.pid, koma)}
          target="_blank"
          rel="noopener noreferrer"
          disabled={!valid}
          title={`国立国会図書館デジタルコレクションの ${koma} コマ（画像）を新しいタブで開く`}
        >
          デジタルコレクションで開く ↗
        </Button>
      </Stack>
      {valid && ctx.offset !== 0 && (
        <Typography variant="caption" color="text.secondary">
          テキストモードはOCRデータ側のコマ番号（{dataKoma}）で開きます。
        </Typography>
      )}
      {state.error && <Alert severity="error">{state.error}</Alert>}
      <Typography variant="caption" color="text.secondary">
        {state.loading ? (
          <>
            <CircularProgress size={10} sx={{ mr: 0.75 }} />
            取得中…
          </>
        ) : (
          `${state.pages} 頁分 / ${state.text.length} 文字${ctx.offset !== 0 ? ` ・ OCRデータは${koma + ctx.offset}コマ（ずれ${ctx.offset > 0 ? '+' : ''}${ctx.offset}）` : ''}`
        )}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: '"BIZ UDMincho","Yu Mincho","Noto Serif JP",serif',
          fontSize: 13,
          lineHeight: 1.7,
          opacity: state.loading ? 0.5 : 1,
          minHeight: 160,
        }}
      >
        {state.text || (state.loading ? '' : '（このコマには、現在の設定で出力される本文がありません）')}
      </Box>
    </Stack>
  );
}
