export type OutputFormat = 'txt' | 'md';
export type Numerals = 'arabic' | 'fullwidth' | 'kanji';
export type LabelPosition = 'before' | 'after' | 'none';
export type PageSeparator = 'blank' | 'rule' | 'formfeed' | 'none';
export type GaijiMode = 'keep' | 'replace' | 'remove';
export type LineJoin = 'auto' | 'keep' | 'join';
/** OCR行内の空白: keep=そのまま / punct=句読点・括弧まわりのみ除去 / all=CJK文字間をすべて除去 */
export type CjkSpaces = 'keep' | 'punct' | 'all';
export type MdLabelStyle = 'rule' | 'heading' | 'comment';
export type OutputUnit = 'single' | 'zip';

export interface Settings {
  /** OCRデータの取り扱い（コマずれの補正と、レイアウトに載らなかった文字の補完） */
  ocr: {
    /**
     * データのコマ = 画像のコマ + offset。登録時の不備で OCR が画像より先（offset=-1）などにずれた書籍がある。
     * auto: 目次の見出しの位置から自動検出 / manual: 手動指定 / off: ずれなし
     */
    offsetMode: 'auto' | 'manual' | 'off';
    offsetManual: number;
    /** テキストモードのレイアウトに載らなかった文字を、文字単位OCRから補う */
    recover: boolean;
    /** 補った文字の字体: contents=レイアウトと同じ旧字体にそろえる / ocr=文字OCRの新字体のまま */
    recoverGlyphs: 'contents' | 'ocr';
    /** 柱（欄外の書名・章名）も補う */
    includeRunningHead: boolean;
  };
  split: {
    /** 見開きを右頁・左頁に分割する */
    enabled: boolean;
    /** auto: analyze API の divide を使う / half: 画像幅の50% */
    gutter: 'auto' | 'half';
    /** auto: 書誌の leftopen に従う */
    readingOrder: 'auto' | 'rtl' | 'ltr';
  };
  numbering: {
    /** auto: 書誌 index から算出 / manual: 基準を手動指定 / off: 印刷頁を使わない */
    mode: 'auto' | 'manual' | 'off';
    manualKoma: number;
    manualPage: number;
    /** manualPage が見開きのどちら側の頁番号か */
    manualSide: 'right' | 'left';
  };
  label: {
    template: string;
    /** 印刷頁を算出できないとき（凡例・図版等）の書式 */
    fallbackTemplate: string;
    numerals: Numerals;
    position: LabelPosition;
    separator: PageSeparator;
  };
  content: {
    types: { body: boolean; title: boolean; note: boolean; caption: boolean };
    gaiji: GaijiMode;
    gaijiReplacement: string;
    cjkSpaces: CjkSpaces;
    lineJoin: LineJoin;
    /** ブロック間の空行数 */
    blockGap: number;
    /** 行のない頁（図版・白紙）も出力するか */
    emptyPages: 'skip' | 'keep';
    /** 頁番号（ノンブル）だけの行を除く。目次から算出した印刷頁と同じ数字のときだけ除く */
    dropPageNumbers: boolean;
  };
  output: {
    format: OutputFormat;
    md: {
      titleLevel: number;
      labelStyle: MdLabelStyle;
      labelHeadingLevel: number;
      /** 行末2スペースでOCR行の改行を保持する */
      hardBreak: boolean;
    };
    unit: OutputUnit;
    fileNameTemplate: string;
    subfolder: string;
    saveAs: boolean;
    bom: boolean;
    newline: 'lf' | 'crlf';
  };
  fetch: { concurrency: number };
}

export const DEFAULT_SETTINGS: Settings = {
  ocr: { offsetMode: 'auto', offsetManual: 0, recover: true, recoverGlyphs: 'contents', includeRunningHead: false },
  split: { enabled: true, gutter: 'auto', readingOrder: 'auto' },
  numbering: { mode: 'auto', manualKoma: 1, manualPage: 1, manualSide: 'left' },
  label: {
    template: '{page}頁',
    fallbackTemplate: '{koma}コマ{side}',
    numerals: 'arabic',
    position: 'before',
    separator: 'blank',
  },
  content: {
    types: { body: true, title: true, note: false, caption: false },
    gaiji: 'keep',
    gaijiReplacement: '■',
    cjkSpaces: 'punct',
    lineJoin: 'auto',
    blockGap: 1,
    emptyPages: 'skip',
    dropPageNumbers: true,
  },
  output: {
    format: 'txt',
    md: { titleLevel: 2, labelStyle: 'rule', labelHeadingLevel: 3, hardBreak: false },
    unit: 'single',
    fileNameTemplate: '{title}_{from}-{to}',
    subfolder: '',
    saveAs: false,
    bom: false,
    newline: 'lf',
  },
  fetch: { concurrency: 4 },
};

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 保存済み設定と既定値をマージする。キーの追加・削除に強く、型が違う値は既定値に戻す。 */
export function mergeSettings<T>(defaults: T, saved: unknown): T {
  if (!isPlain(defaults)) return (saved !== undefined && typeof saved === typeof defaults ? saved : defaults) as T;
  const out: Plain = {};
  const src = isPlain(saved) ? saved : {};
  for (const key of Object.keys(defaults)) {
    out[key] = mergeSettings((defaults as Plain)[key], src[key]);
  }
  return out as T;
}
