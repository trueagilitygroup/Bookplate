export type BlockType = 'h1' | 'h2' | 'h3' | 'p' | 'quote' | 'list' | 'caption';

export interface Block {
  type: BlockType;
  text: string;
}

export interface Usage {
  input: number;
  output: number;
}

/** 這一頁在書裡扮演的角色。封面與版權頁不會併進正文。 */
export type PageKind = 'cover' | 'title_page' | 'copyright_page' | 'toc' | 'body' | 'blank';

export const PAGE_KIND_LABEL: Record<PageKind, string> = {
  cover: '封面',
  title_page: '書名頁',
  copyright_page: '版權頁',
  toc: '目錄',
  body: '內文',
  blank: '空白',
};

/** 出版資訊。全部欄位都是「照著印的抄」，沒印的就是 null。 */
export interface BookMetadata {
  title: string | null;
  subtitle: string | null;
  authors: string[];
  translators: string[];
  publisher: string | null;
  year: string | null;
  edition: string | null;
  isbn: string | null;
  series: string | null;
  originalTitle: string | null;
}

export const EMPTY_METADATA: BookMetadata = {
  title: null,
  subtitle: null,
  authors: [],
  translators: [],
  publisher: null,
  year: null,
  edition: null,
  isbn: null,
  series: null,
  originalTitle: null,
};

export interface PageResult {
  page_label: string | null;
  language: 'en' | 'zh' | 'mixed';
  kind: PageKind;
  metadata: BookMetadata | null;
  starts_mid_sentence: boolean;
  ends_mid_sentence: boolean;
  blocks: Block[];
  truncated: boolean;
  usage: Usage;
  ms: number;
}

export type PageStatus = 'ready' | 'queued' | 'scanning' | 'done' | 'failed';

export interface Page {
  id: string;
  name: string;
  dataUrl: string | null;
  w: number;
  h: number;
  /** 寬高比偏橫式，很可能是攤開的跨頁 */
  isSpread: boolean;
  /** 使用者手動指定的角色，優先於模型判定 */
  kindOverride: PageKind | null;
  status: PageStatus;
  result: PageResult | null;
  error: string | null;
}

export type Script = 'auto' | 'zh-Hant' | 'zh-Hans' | 'en';

export interface ScanOptions {
  /** 專有名詞提示，餵給 OCR 讓人名地名不會每頁寫法不同 */
  glossary: string;
  script: Script;
  /** 送出前轉灰階並拉對比，對泛黃紙張與低光照片有效 */
  enhance: boolean;
  /** 全書沒有 h1 時，把 h2 提升為 h1 */
  normalizeHeadings: boolean;
  /** 自動辨識封面／書名頁／版權頁，並把出版資訊帶進成品 */
  detectFrontMatter: boolean;
}

export type Stage = 'load' | 'scan' | 'read';

export type SummaryMode = 'brief' | 'standard' | 'chapter';

export interface Draft {
  savedAt: number;
  title: string;
  author: string;
  pages: Page[];
  markdown: string;
  metadata: BookMetadata;
  options: ScanOptions;
  stage: Stage;
}
