import { EMPTY_METADATA, type BookMetadata, type Page, type PageKind } from '../types';

/** 使用者手動指定優先於模型判定。 */
export function effectiveKind(page: Page): PageKind {
  return page.kindOverride ?? page.result?.kind ?? 'body';
}

const FRONT_MATTER: PageKind[] = ['cover', 'title_page', 'copyright_page'];

export function isFrontMatter(page: Page): boolean {
  return FRONT_MATTER.includes(effectiveKind(page));
}

/** 只有正文與目錄會併進書稿。封面、書名頁、版權頁、空白頁都排除。 */
export function isBodyPage(page: Page): boolean {
  const kind = effectiveKind(page);
  return kind === 'body' || kind === 'toc';
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t && t !== 'null' && t !== 'N/A' ? t : null;
};

/** 抓四位數西元年。模型已被要求把民國年換算過，這裡只做最後把關。 */
function normaliseYear(v: string | null): string | null {
  const t = clean(v);
  if (!t) return null;
  const m = t.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return m ? m[1] : null;
}

function normaliseIsbn(v: string | null): string | null {
  const t = clean(v);
  if (!t) return null;
  const digits = t.replace(/[^0-9Xx]/g, '').toUpperCase();
  return digits.length === 10 || digits.length === 13 ? digits : null;
}

function normaliseNames(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    const name = clean(typeof raw === 'string' ? raw : null);
    // 「作者：」「著」「譯」這類標籤常被一起抓進來
    const stripped = name?.replace(/^(作者|著者|編者|譯者|作|著|編|譯)[：:　\s]*/, '').replace(/[著編譯]$/, '').trim();
    if (stripped && !out.includes(stripped)) out.push(stripped);
  }
  return out;
}

export function normaliseMetadata(raw: Partial<BookMetadata> | null | undefined): BookMetadata {
  if (!raw) return { ...EMPTY_METADATA };
  return {
    title: clean(raw.title),
    subtitle: clean(raw.subtitle),
    authors: normaliseNames(raw.authors),
    translators: normaliseNames(raw.translators),
    publisher: clean(raw.publisher),
    year: normaliseYear(raw.year ?? null),
    edition: clean(raw.edition),
    isbn: normaliseIsbn(raw.isbn ?? null),
    series: clean(raw.series),
    originalTitle: clean(raw.originalTitle),
  };
}

/**
 * 把多張前置頁的資訊併成一份。
 *
 * 優先序不是隨便定的：
 * - 書名、作者 → 書名頁最完整（封面常省略副標與譯者）
 * - 出版社、年份、版次、ISBN → 版權頁才是權威來源，封面上的通常是舊資訊
 */
export function mergeMetadata(pages: Page[]): BookMetadata {
  const byKind = (kind: PageKind): BookMetadata[] =>
    pages
      .filter((p) => effectiveKind(p) === kind && p.result?.metadata)
      .map((p) => normaliseMetadata(p.result!.metadata));

  const covers = byKind('cover');
  const titlePages = byKind('title_page');
  const copyrightPages = byKind('copyright_page');

  const titleFirst = [...titlePages, ...covers, ...copyrightPages];
  const imprintFirst = [...copyrightPages, ...titlePages, ...covers];

  const pick = <K extends keyof BookMetadata>(sources: BookMetadata[], key: K): BookMetadata[K] => {
    for (const source of sources) {
      const value = source[key];
      if (Array.isArray(value) ? value.length : value) return value;
    }
    return EMPTY_METADATA[key];
  };

  return {
    title: pick(titleFirst, 'title'),
    subtitle: pick(titleFirst, 'subtitle'),
    authors: pick(titleFirst, 'authors'),
    translators: pick(titleFirst, 'translators'),
    series: pick(titleFirst, 'series'),
    originalTitle: pick(titleFirst, 'originalTitle'),
    publisher: pick(imprintFirst, 'publisher'),
    year: pick(imprintFirst, 'year'),
    edition: pick(imprintFirst, 'edition'),
    isbn: pick(imprintFirst, 'isbn'),
  };
}

export function hasMetadata(m: BookMetadata): boolean {
  return Boolean(
    m.title || m.subtitle || m.publisher || m.year || m.isbn || m.edition ||
    m.series || m.originalTitle || m.authors.length || m.translators.length,
  );
}

/** 單行書目，用在成品的版權標示與匯出檔案的表頭。 */
export function imprintLine(m: BookMetadata): string {
  const parts = [
    m.publisher,
    m.edition,
    m.year ? m.year + ' 年' : null,
    m.isbn ? 'ISBN ' + m.isbn : null,
  ].filter(Boolean);
  return parts.join('・');
}

export function bylineLine(m: BookMetadata): string {
  const parts: string[] = [];
  if (m.authors.length) parts.push(m.authors.join('、') + ' 著');
  if (m.translators.length) parts.push(m.translators.join('、') + ' 譯');
  return parts.join('　');
}
