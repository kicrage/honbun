/** layout XML の1行 (<LINE>)。座標は画像ピクセル。 */
export interface Line {
  type: string;
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  order: number;
}

/** 1つのテキストブロック（<TEXTBLOCK> もしくは PAGE 直下の <LINE> 1本）。 */
export interface Block {
  lines: Line[];
}

/** layout XML の <BLOCK>（ノンブル・柱・ルビなど。本文の行ではない領域）。 */
export interface Region {
  type: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface PageLayout {
  width: number;
  height: number;
  blocks: Block[];
  regions: Region[];
}

/** analyze API の文字単位OCR（1要素は1文字、または数文字の語）。座標は画像ピクセル。 */
export interface Token {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface AnalyzeData {
  /** 見開きの綴じ位置（画像幅に対する比）。無ければ null */
  divide: number | null;
  /** 文字OCRの全文（旧字体。トークン列と同じ並び） */
  contents: string;
  tokens: Token[];
}

export interface IndexEntry {
  title: string;
  /** 書誌 index に印刷頁が書かれていない項目（標題・目次・附録など）は null */
  page: number | null;
  koma: number;
}

export interface BookInfo {
  pid: string;
  title: string;
  volume: string;
  totalKoma: number;
  /** true=左開き(横書き)。false=右開き(縦書き)。 */
  leftOpen: boolean;
  index: IndexEntry[];
}

export type Side = 'right' | 'left' | 'whole';

/** 見開きを分割した後の「1頁分」の行。 */
export interface PageLines {
  side: Side;
  blocks: Block[];
}

export type BlockKind = 'title' | 'body' | 'note' | 'caption';

export interface FormattedBlock {
  kind: BlockKind;
  lines: string[];
  /** cont[i] = lines[i] が次の行へ流れ続ける（行連結モードで同じ段落にする）。省略時は全行が連続。 */
  cont?: boolean[];
}

/** 形式(TXT/MD)非依存の中間表現。1頁 = 1要素。 */
export interface PageSection {
  koma: number;
  side: Side;
  /** 印刷頁番号。算出できなければ null */
  pageNo: number | null;
  /** テンプレートから生成済みのラベル文字列（なし設定でも生成する。出力側で位置を制御） */
  label: string;
  blocks: FormattedBlock[];
}
