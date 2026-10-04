import { Alert, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { parseSource, type SourceKind } from '../ext/source';
import type { BookState } from './useBook';

const KIND_LABEL: Record<SourceKind, string> = {
  'text-mode': 'テキストモードから検出',
  collection: 'デジタルコレクションから検出',
  input: '入力した PID',
};

/** 対象資料の表示と、無関係なページで使う PID 入力欄。 */
export function SourceCard(props: {
  state: BookState;
  tabKind?: SourceKind;
  tabChecked: boolean;
  lastPid: string;
  /** koma: 入力した URL に含まれていたコマ番号（範囲の開始に使う） */
  onLoad: (pid: string, koma?: number, kind?: SourceKind) => void;
}) {
  const { state, tabKind, tabChecked, lastPid, onLoad } = props;
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    if (input === '' && lastPid) setInput(lastPid);
  }, [lastPid, input]);

  const submit = () => {
    const src = parseSource(input);
    if (!src) {
      setInputError(
        /^\d{12}$/.test(input.trim())
          ? '12桁の数字は書誌IDです。資料の PID（永続的識別子。例: 1234567）を入力してください。'
          : 'PID を認識できません。数字のPID、または資料の URL（dl.ndl.go.jp / lab.ndl.go.jp）を入力してください。',
      );
      return;
    }
    setInputError(null);
    setEditing(false);
    onLoad(src.pid, src.koma, src.kind);
  };

  const showInput = editing || state.status === 'idle' || state.status === 'error';

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      {state.status === 'ready' && !editing && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Stack sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap title={state.book.title} sx={{ fontWeight: 700 }}>
              {state.book.title}
              {state.book.volume ? ` ${state.book.volume}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              PID {state.book.pid} ・ 全{state.book.totalKoma}コマ ・ {state.book.leftOpen ? '左開き' : '右開き'}
            </Typography>
          </Stack>
          {tabKind && <Chip size="small" label={KIND_LABEL[tabKind]} />}
          <Button size="small" onClick={() => setEditing(true)}>
            変更
          </Button>
        </Stack>
      )}
      {state.status === 'loading' && <Typography color="text.secondary">PID {state.pid} を読み込み中…</Typography>}

      {showInput && state.status !== 'loading' && (
        <Stack spacing={1}>
          {!tabChecked ? null : (
            <Typography variant="body2" color="text.secondary">
              {state.status === 'ready'
                ? '別の資料を指定します。'
                : 'このページから資料を特定できません。PID（永続的識別子）または資料の URL を入力してください。'}
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            <TextField
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              label="PID または URL"
              placeholder="例: 1234567"
              error={!!inputError}
            />
            <Button variant="contained" onClick={submit} sx={{ whiteSpace: 'nowrap', px: 2.5 }}>
              読み込む
            </Button>
            {editing && (
              <Button onClick={() => setEditing(false)} sx={{ whiteSpace: 'nowrap' }}>
                戻る
              </Button>
            )}
          </Stack>
          {inputError && <Alert severity="error" sx={{ py: 0 }}>{inputError}</Alert>}
          {state.status === 'error' && <Alert severity="error" sx={{ py: 0 }}>{state.message}</Alert>}
        </Stack>
      )}
    </Paper>
  );
}
