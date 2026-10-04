import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, Checkbox, Chip, FormControlLabel, FormGroup, Slider, Stack, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { expandFileName, sanitizeSubfolder } from '../core/output';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import { OFFSET_CANDIDATES, type OffsetDetection } from '../core/offset';
import type { Anomaly } from '../core/pageNumber';
import type { BookInfo } from '../core/types';
import { NumberField, SelectField, SwitchField, ToggleField } from './fields';

export type Update = (fn: (s: Settings) => void) => void;

export interface Range {
  from: number;
  to: number;
}

function Section(props: { title: string; summary?: string; defaultExpanded?: boolean; children: ReactNode }) {
  return (
    <Accordion defaultExpanded={props.defaultExpanded}>
      <AccordionSummary expandIcon={<span aria-hidden>▾</span>}>
        <Typography sx={{ fontWeight: 600 }}>{props.title}</Typography>
        {props.summary && (
          <Typography color="text.secondary" sx={{ ml: 1.5 }} noWrap>
            {props.summary}
          </Typography>
        )}
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.75}>{props.children}</Stack>
      </AccordionDetails>
    </Accordion>
  );
}

// ---- 範囲 -------------------------------------------------------------------

export function validateRange(range: Range, total: number): string | null {
  const { from, to } = range;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return 'コマ番号を整数で入力してください';
  if (from < 1 || to < 1 || from > total || to > total) return `1〜${total} の範囲で指定してください`;
  if (from > to) return '開始は終了以前にしてください';
  return null;
}

function RangeSection(props: { book: BookInfo; range: Range; onRange: (r: Range) => void; currentKoma?: number }) {
  const { book, range, onRange, currentKoma } = props;
  const error = validateRange(range, book.totalKoma);
  const chapters = book.index;

  const pickChapter = (i: number) => {
    const e = chapters[i];
    // 次に koma が進む項目の位置までを終了とする（境界コマは前後の章が同居するため含める）
    const next = chapters.slice(i + 1).find((x) => x.koma > e.koma);
    onRange({ from: e.koma, to: next ? next.koma : book.totalKoma });
  };

  return (
    <Section
      title="範囲"
      summary={error ? '要修正' : `${range.from}〜${range.to} コマ（${range.to - range.from + 1}コマ）`}
      defaultExpanded
    >
      <Stack direction="row" spacing={1.5}>
        <NumberField label="開始コマ" value={range.from} min={1} max={book.totalKoma} error={!!error} onChange={(v) => onRange({ ...range, from: v })} />
        <NumberField label="終了コマ" value={range.to} min={1} max={book.totalKoma} error={!!error} onChange={(v) => onRange({ ...range, to: v })} />
      </Stack>
      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        {currentKoma !== undefined && (
          <Button size="small" variant="outlined" onClick={() => onRange({ ...range, from: currentKoma })}>
            開始＝現在の{currentKoma}コマ
          </Button>
        )}
        <Button size="small" variant="outlined" onClick={() => onRange({ from: 1, to: book.totalKoma })}>
          全体（1〜{book.totalKoma}）
        </Button>
        <Button size="small" variant="outlined" onClick={() => onRange({ ...range, to: book.totalKoma })}>
          終了＝最終
        </Button>
      </Stack>
      {chapters.length > 0 && (
        <SelectField
          label="目次から範囲を設定"
          value={-1}
          options={[
            { value: -1, label: '（選択して設定）' },
            ...chapters.map((e, i) => ({
              value: i,
              label: `${e.title}${e.page !== null ? `（p.${e.page}` : '（'}・${e.koma}コマ）`,
            })),
          ]}
          onChange={(i) => i >= 0 && pickChapter(i)}
          help="選んだ項目の開始コマから、次の項目の開始コマまでを設定します。"
        />
      )}
    </Section>
  );
}

// ---- OCRデータ（コマずれ・欠落の補完） ---------------------------------------

const fmtOffset = (n: number) => (n === 0 ? 'ずれなし' : n < 0 ? `OCRが画像より${-n}コマ先` : `OCRが画像より${n}コマ後`);

function OcrSection(props: { s: Settings; update: Update; detected: OffsetDetection | null; offset: number }) {
  const { s, update, detected, offset } = props;
  const o = s.ocr;
  const summary = `${fmtOffset(offset)} / 欠落の補完${o.recover ? 'あり' : 'なし'}`;
  return (
    <Section title="OCRデータ" summary={summary} defaultExpanded={offset !== 0 && o.offsetMode === 'auto'}>
      {offset !== 0 && (
        <Alert severity="info" sx={{ py: 0 }}>
          この資料は<b>{fmtOffset(offset)}</b>です。画像の N コマの文字を、データの {offset > 0 ? `N+${offset}` : `N${offset}`} コマから取得して補正します。
        </Alert>
      )}
      <SelectField
        label="OCRデータのコマずれ"
        value={o.offsetMode}
        options={[
          { value: 'auto', label: `自動検出（推奨）${detected ? ' ― 検出: ' + fmtOffset(detected.offset) : ''}` },
          { value: 'manual', label: '手動で指定' },
          { value: 'off', label: 'ずれなしとして扱う' },
        ]}
        onChange={(v) => update((d) => (d.ocr.offsetMode = v))}
        help="登録時の不備で、OCRが画像とずれている資料があります。目次の見出しが現れるコマから自動で判定します。"
      />
      {o.offsetMode === 'auto' && detected && (
        <Typography variant="caption" color="text.secondary">
          判定の根拠（目次{detected.entries}項目のうち見出しが一致した数）:{' '}
          {OFFSET_CANDIDATES.map((c) => `${c > 0 ? '+' : ''}${c}コマ=${detected.scores[c]}`).join(' / ')}
          {detected.confidence === 'unknown' && '（判断できず、ずれなしとしています）'}
        </Typography>
      )}
      {o.offsetMode === 'manual' && (
        <NumberField
          label="ずれ（データのコマ − 画像のコマ）"
          value={o.offsetManual}
          min={-5}
          max={5}
          onChange={(v) => update((d) => (d.ocr.offsetManual = Number.isFinite(v) ? v : 0))}
          help="OCRが画像より1コマ先にある資料は -1 です。プレビューで確認しながら調整できます。"
        />
      )}
      <SwitchField
        label="レイアウトに載らなかった文字を補う"
        checked={o.recover}
        onChange={(v) => update((d) => (d.ocr.recover = v))}
        help="テキストモードの行データから漏れた本文を、文字単位のOCRから拾い直します。"
      />
      {o.recover && (
        <Stack spacing={1.5} sx={{ pl: 1.5, borderLeft: 2, borderColor: 'divider' }}>
          <SelectField
            label="補った文字の字体"
            value={o.recoverGlyphs}
            options={[
              { value: 'contents', label: '旧字体にそろえる（推奨）' },
              { value: 'ocr', label: '文字OCRのまま（新字体）' },
            ]}
            onChange={(v) => update((d) => (d.ocr.recoverGlyphs = v))}
          />
          <SwitchField
            label="柱（欄外の書名・章名）も補う"
            checked={o.includeRunningHead}
            onChange={(v) => update((d) => (d.ocr.includeRunningHead = v))}
          />
        </Stack>
      )}
    </Section>
  );
}

// ---- 分割とラベル -----------------------------------------------------------

const LABEL_PRESETS = ['{page}頁', 'p.{page}', '【{page}頁】', '[{page}]', '{page}', '{koma}コマ'];

function SplitSection(props: { s: Settings; update: Update; anomalies: Anomaly[] }) {
  const { s, update, anomalies } = props;
  return (
    <Section title="分割とラベル" summary={`${s.split.enabled ? '右頁・左頁に分割' : '見開きのまま'} / ${s.label.template}`}>
      <SwitchField
        label="見開きを右頁・左頁に分割する"
        checked={s.split.enabled}
        onChange={(v) => update((d) => (d.split.enabled = v))}
        help="1コマ（見開き）は紙面2ページ分です。分割すると頁ごとにラベルを付けられます。"
      />
      {s.split.enabled && (
        <Stack direction="row" spacing={1.5}>
          <SelectField
            label="綴じ位置"
            value={s.split.gutter}
            options={[
              { value: 'auto', label: '自動（推奨）' },
              { value: 'half', label: '画像の中央' },
            ]}
            onChange={(v) => update((d) => (d.split.gutter = v))}
          />
          <SelectField
            label="読み順"
            value={s.split.readingOrder}
            options={[
              { value: 'auto', label: '書誌に従う' },
              { value: 'rtl', label: '右→左（縦書き）' },
              { value: 'ltr', label: '左→右（横書き）' },
            ]}
            onChange={(v) => update((d) => (d.split.readingOrder = v))}
          />
        </Stack>
      )}

      <SelectField
        label="印刷頁の番号"
        value={s.numbering.mode}
        options={[
          { value: 'auto', label: '書誌の目次から算出（推奨）' },
          { value: 'manual', label: '基準を手動で指定' },
          { value: 'off', label: '付けない（コマ番号のみ）' },
        ]}
        onChange={(v) => update((d) => (d.numbering.mode = v))}
      />
      {s.numbering.mode === 'manual' && (
        <Stack direction="row" spacing={1.5}>
          <NumberField label="基準コマ" value={s.numbering.manualKoma} min={1} onChange={(v) => update((d) => (d.numbering.manualKoma = v))} />
          <SelectField
            label="基準の側"
            value={s.numbering.manualSide}
            options={[
              { value: 'right', label: '右頁' },
              { value: 'left', label: '左頁' },
            ]}
            onChange={(v) => update((d) => (d.numbering.manualSide = v))}
          />
          <NumberField label="頁番号" value={s.numbering.manualPage} min={1} onChange={(v) => update((d) => (d.numbering.manualPage = v))} />
        </Stack>
      )}
      {s.numbering.mode === 'auto' && anomalies.length > 0 && (
        <Alert severity="warning" sx={{ py: 0 }}>
          目次の頁番号に不連続が {anomalies.length} 箇所あります（{anomalies.slice(0, 3).map((a) => `${a.koma}コマ`).join('・')}
          {anomalies.length > 3 ? ' ほか' : ''}）。挿図コマ等で頁がずれている可能性があります。
        </Alert>
      )}

      <TextField
        label="ラベルの書式"
        value={s.label.template}
        onChange={(e) => update((d) => (d.label.template = e.target.value))}
        helperText="使える記号: {page}印刷頁 {koma}コマ {side}右/左 {pid} {title}"
      />
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
        {LABEL_PRESETS.map((p) => (
          <Chip key={p} size="small" label={p} variant={s.label.template === p ? 'filled' : 'outlined'} color={s.label.template === p ? 'primary' : 'default'} onClick={() => update((d) => (d.label.template = p))} />
        ))}
      </Stack>
      <TextField
        label="頁番号が無い頁の書式"
        value={s.label.fallbackTemplate}
        onChange={(e) => update((d) => (d.label.fallbackTemplate = e.target.value))}
        helperText="凡例・目次・図版など、印刷頁を算出できない頁に使います。"
      />
      <ToggleField
        label="数字の表記"
        value={s.label.numerals}
        options={[
          { value: 'arabic', label: '10' },
          { value: 'fullwidth', label: '１０' },
          { value: 'kanji', label: '十' },
        ]}
        onChange={(v) => update((d) => (d.label.numerals = v))}
      />
      <Stack direction="row" spacing={1.5}>
        <SelectField
          label="ラベルの位置"
          value={s.label.position}
          options={[
            { value: 'before', label: '頁の先頭' },
            { value: 'after', label: '頁の末尾' },
            { value: 'none', label: '付けない' },
          ]}
          onChange={(v) => update((d) => (d.label.position = v))}
        />
        {s.output.format === 'txt' && (
          <SelectField
            label="頁の区切り"
            value={s.label.separator}
            options={[
              { value: 'blank', label: '空行' },
              { value: 'rule', label: '罫線' },
              { value: 'formfeed', label: '改頁文字' },
              { value: 'none', label: 'なし' },
            ]}
            onChange={(v) => update((d) => (d.label.separator = v))}
          />
        )}
      </Stack>
    </Section>
  );
}

// ---- テキスト整形 -----------------------------------------------------------

function ContentSection(props: { s: Settings; update: Update }) {
  const { s, update } = props;
  const t = s.content.types;
  const kinds: [keyof typeof t, string][] = [
    ['body', '本文'],
    ['title', 'タイトル本文'],
    ['note', '注'],
    ['caption', 'キャプション'],
  ];
  return (
    <Section title="テキスト整形" summary={kinds.filter(([k]) => t[k]).map(([, l]) => l).join('・')}>
      <div>
        <Typography variant="caption" color="text.secondary">
          取り込む行の種類
        </Typography>
        <FormGroup row>
          {kinds.map(([k, label]) => (
            <FormControlLabel
              key={k}
              label={label}
              control={<Checkbox size="small" checked={t[k]} onChange={(e) => update((d) => (d.content.types[k] = e.target.checked))} />}
            />
          ))}
        </FormGroup>
      </div>
      <Stack direction="row" spacing={1.5}>
        <SelectField
          label="外字「〓」"
          value={s.content.gaiji}
          options={[
            { value: 'keep', label: 'そのまま' },
            { value: 'replace', label: '置き換える' },
            { value: 'remove', label: '取り除く' },
          ]}
          onChange={(v) => update((d) => (d.content.gaiji = v))}
        />
        {s.content.gaiji === 'replace' && (
          <TextField label="置換文字" value={s.content.gaijiReplacement} onChange={(e) => update((d) => (d.content.gaijiReplacement = e.target.value))} />
        )}
      </Stack>
      <SelectField
        label="行内の空白（OCR区間の区切り）"
        value={s.content.cjkSpaces}
        options={[
          { value: 'keep', label: 'そのまま' },
          { value: 'punct', label: '句読点・括弧まわりのみ除去（推奨）' },
          { value: 'all', label: '日本語文字の間をすべて除去' },
        ]}
        onChange={(v) => update((d) => (d.content.cjkSpaces = v))}
      />
      <SelectField
        label="OCR行の扱い"
        value={s.content.lineJoin}
        options={[
          { value: 'auto', label: '自動（TXT=そのまま / MD=連結）' },
          { value: 'keep', label: 'そのまま（紙面の行ごとに改行）' },
          { value: 'join', label: 'ブロック内で連結（段落にする）' },
        ]}
        onChange={(v) => update((d) => (d.content.lineJoin = v))}
      />
      <Stack direction="row" spacing={1.5}>
        <NumberField label="ブロック間の空行" value={s.content.blockGap} min={0} max={5} onChange={(v) => update((d) => (d.content.blockGap = Number.isFinite(v) ? Math.max(0, Math.min(5, v)) : 1))} />
      </Stack>
      <SwitchField
        label="頁番号（ノンブル）だけの行を除く"
        checked={s.content.dropPageNumbers}
        onChange={(v) => update((d) => (d.content.dropPageNumbers = v))}
        help="目次から算出した印刷頁と同じ数字の行だけを除きます（表の数値は残ります）。"
      />
      <SwitchField
        label="本文のない頁も出力する"
        checked={s.content.emptyPages === 'keep'}
        onChange={(v) => update((d) => (d.content.emptyPages = v ? 'keep' : 'skip'))}
        help="図版・白紙など。頁ラベルだけが並びます。"
      />
    </Section>
  );
}

// ---- 出力 -------------------------------------------------------------------

function OutputSection(props: { s: Settings; update: Update; book: BookInfo; range: Range; onReset: () => void }) {
  const { s, update, book, range, onReset } = props;
  const o = s.output;
  const fileName = `${expandFileName(o.fileNameTemplate, { book, from: range.from, to: range.to })}.${o.unit === 'zip' ? 'zip' : o.format}`;
  const folder = sanitizeSubfolder(o.subfolder);
  return (
    <Section title="出力" summary={`${o.format === 'md' ? 'Markdown' : 'テキスト'} / ${o.unit === 'zip' ? 'zip' : '1ファイル'}`}>
      <ToggleField
        label="形式"
        value={o.format}
        options={[
          { value: 'txt', label: 'テキスト (.txt)' },
          { value: 'md', label: 'Markdown (.md)' },
        ]}
        onChange={(v) => update((d) => (d.output.format = v))}
      />
      {o.format === 'md' && (
        <Stack spacing={1.5} sx={{ pl: 1.5, borderLeft: 2, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1.5}>
            <SelectField
              label="タイトルの見出し"
              value={o.md.titleLevel}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${'#'.repeat(n)}（H${n}）` }))}
              onChange={(v) => update((d) => (d.output.md.titleLevel = v))}
            />
            <SelectField
              label="頁ラベルの書式"
              value={o.md.labelStyle}
              options={[
                { value: 'rule', label: '罫線＋太字' },
                { value: 'heading', label: '見出し' },
                { value: 'comment', label: 'HTMLコメント' },
              ]}
              onChange={(v) => update((d) => (d.output.md.labelStyle = v))}
            />
          </Stack>
          {o.md.labelStyle === 'heading' && (
            <SelectField
              label="頁ラベルの見出しレベル"
              value={o.md.labelHeadingLevel}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${'#'.repeat(n)}（H${n}）` }))}
              onChange={(v) => update((d) => (d.output.md.labelHeadingLevel = v))}
            />
          )}
          {s.content.lineJoin === 'keep' && (
            <SwitchField label="行末に2スペースを付けて改行を保持" checked={o.md.hardBreak} onChange={(v) => update((d) => (d.output.md.hardBreak = v))} />
          )}
        </Stack>
      )}
      <ToggleField
        label="ファイルのまとめ方"
        value={o.unit}
        options={[
          { value: 'single', label: '1つに結合' },
          { value: 'zip', label: 'コマごとに分けてzip' },
        ]}
        onChange={(v) => update((d) => (d.output.unit = v))}
      />
      <TextField
        label="ファイル名"
        value={o.fileNameTemplate}
        onChange={(e) => update((d) => (d.output.fileNameTemplate = e.target.value))}
        helperText={
          <>
            {'{title} {volume} {pid} {from} {to} {date} が使えます → '}
            <b>{fileName}</b>
          </>
        }
      />
      <TextField
        label="保存先のサブフォルダ"
        value={o.subfolder}
        onChange={(e) => update((d) => (d.output.subfolder = e.target.value))}
        placeholder="例: NDL/Honbun"
        helperText={`ブラウザのダウンロードフォルダの中に作成します${folder ? ` → ${folder}/${fileName}` : '（空欄なら直下）'}`}
      />
      <SwitchField
        label="保存時に保存先を選ぶ（名前を付けて保存）"
        checked={o.saveAs}
        onChange={(v) => update((d) => (d.output.saveAs = v))}
        help="ダウンロードフォルダ以外へ保存したいときはオンにします。"
      />
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <SelectField
          label="改行コード"
          value={o.newline}
          options={[
            { value: 'lf', label: 'LF' },
            { value: 'crlf', label: 'CRLF（Windows）' },
          ]}
          onChange={(v) => update((d) => (d.output.newline = v))}
        />
        <SwitchField label="BOM付き" checked={o.bom} onChange={(v) => update((d) => (d.output.bom = v))} />
      </Stack>
      <div>
        <Typography variant="caption" color="text.secondary">
          同時取得数: {s.fetch.concurrency}
        </Typography>
        <Slider size="small" min={1} max={8} step={1} marks value={s.fetch.concurrency} onChange={(_, v) => update((d) => (d.fetch.concurrency = v as number))} />
      </div>
      <Button size="small" color="inherit" onClick={onReset} sx={{ alignSelf: 'flex-start' }}>
        設定を既定値に戻す
      </Button>
    </Section>
  );
}

// ---- まとめ -----------------------------------------------------------------

export function SettingsPanel(props: {
  s: Settings;
  update: Update;
  book: BookInfo;
  range: Range;
  onRange: (r: Range) => void;
  currentKoma?: number;
  anomalies: Anomaly[];
  detected: OffsetDetection | null;
  offset: number;
}) {
  const { s, update, book, range, onRange, currentKoma, anomalies, detected, offset } = props;
  return (
    <Stack spacing={1}>
      <RangeSection book={book} range={range} onRange={onRange} currentKoma={currentKoma} />
      <OcrSection s={s} update={update} detected={detected} offset={offset} />
      <SplitSection s={s} update={update} anomalies={anomalies} />
      <ContentSection s={s} update={update} />
      <OutputSection s={s} update={update} book={book} range={range} onReset={() => update((d) => Object.assign(d, structuredClone(DEFAULT_SETTINGS)))} />
    </Stack>
  );
}
