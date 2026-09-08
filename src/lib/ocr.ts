import { callClaude } from './anthropic';
import { OCR_MAX_TOKENS } from '../config';
import type { Block, BlockType, BookMetadata, PageKind, PageResult, ScanOptions } from '../types';
import { normaliseMetadata } from './metadata';
import { stripDataUrl } from './image';

const SCRIPT_RULE: Record<ScanOptions['script'], string> = {
  auto: 'Preserve the original script exactly. Never convert between Traditional and Simplified Chinese.',
  'zh-Hant': 'The book is in Traditional Chinese. Output Traditional Chinese characters.',
  'zh-Hans': 'The book is in Simplified Chinese. Output Simplified Chinese characters.',
  en: 'The book is in English.',
};

const FRONT_MATTER_RULES = `
Classify the page with "page_kind":
- "cover": the outside front cover. Large display title, author name, often a publisher logo or artwork, and no running body text.
- "title_page": the title leaf inside the book. Title, subtitle, author, translator, publisher, set in plain type on an otherwise empty page.
- "copyright_page": the imprint page. ISBN, edition and printing history, publisher address, cataloguing data.
- "toc": a table of contents.
- "blank": no readable text at all.
- "body": anything else, including the first page of a chapter.

Fill "metadata" ONLY when page_kind is "cover", "title_page" or "copyright_page". Otherwise set it to null.

Metadata rules:
- Record only what is actually printed on this page. Never guess, complete or look up a title, author, publisher, year or ISBN that you cannot see.
- Set a field to null when it is not printed on this page. An empty array is correct when no names are printed.
- "authors" and "translators": names only. Drop role labels such as 作者、著、編、譯, "by" or "translated by".
- "year": the four-digit publication year of THIS edition. If the date uses the ROC calendar (民國 X 年), convert it to the Gregorian year by adding 1911, and output only the converted four-digit year.
- "edition": as printed, for example 初版、二版、修訂版、"First Edition", "3rd printing".
- "isbn": digits and X only, hyphens removed.
- "original_title": only on a translated work, where the source-language title is printed.
- Still transcribe the visible text into "blocks" as usual. The metadata is extracted in addition, not instead.`;

export function buildOcrSystem(options: ScanOptions): string {
  const glossary = options.glossary.trim();
  return `You are a precision OCR and document-structure engine for photographed book pages in English and Chinese.

Return ONLY a JSON object. No prose, no markdown fences.

{
  "page_label": string or null,
  "language": "en" | "zh" | "mixed",
  "page_kind": "cover" | "title_page" | "copyright_page" | "toc" | "body" | "blank",
  "metadata": null or {
    "title": string or null,
    "subtitle": string or null,
    "authors": [string],
    "translators": [string],
    "publisher": string or null,
    "year": string or null,
    "edition": string or null,
    "isbn": string or null,
    "series": string or null,
    "original_title": string or null
  },
  "starts_mid_sentence": boolean,
  "ends_mid_sentence": boolean,
  "blocks": [ { "type": "h1"|"h2"|"h3"|"p"|"quote"|"list"|"caption", "text": string } ]
}

Rules:
- Transcribe the page verbatim. Never translate, never summarise, never invent text.
- ${SCRIPT_RULE[options.script]}
- Infer heading levels from type size, weight and position: chapter title = h1, section = h2, sub-section = h3.
- Put running heads, folios and page numbers in "page_label", not in "blocks".
- Merge each visual paragraph into one block and drop the line breaks inside it.
- English: rejoin words broken by an end-of-line hyphen. Chinese: never insert spaces between characters.
- "list": one item per line inside the text, separated by \\n.
- "quote": indented or otherwise set-off extracts.
- "caption": figure and table captions.
- "starts_mid_sentence": true if the first block continues a sentence from the previous page.
- "ends_mid_sentence": true if the last block is cut off mid-sentence.
- If part of the page is illegible, transcribe what you can read and omit the rest.
- If the image has no readable body text, return an empty blocks array.
${options.detectFrontMatter ? FRONT_MATTER_RULES : '- Always set "page_kind" to "body" and "metadata" to null.'}${
    glossary ? `\n\nProper nouns appearing in this book. Use exactly these spellings:\n${glossary}` : ''
  }`;
}

const BLOCK_TYPES: BlockType[] = ['h1', 'h2', 'h3', 'p', 'quote', 'list', 'caption'];
const PAGE_KINDS: PageKind[] = ['cover', 'title_page', 'copyright_page', 'toc', 'body', 'blank'];

/** 模型的欄位是 snake_case，內部型別是 camelCase。 */
interface RawMetadata {
  title?: string | null;
  subtitle?: string | null;
  authors?: unknown;
  translators?: unknown;
  publisher?: string | null;
  year?: string | number | null;
  edition?: string | null;
  isbn?: string | null;
  series?: string | null;
  original_title?: string | null;
}

interface RawPage {
  page_label?: string | null;
  language?: PageResult['language'];
  page_kind?: string;
  metadata?: RawMetadata | null;
  starts_mid_sentence?: boolean;
  ends_mid_sentence?: boolean;
  blocks?: Block[];
}

function toMetadata(raw: RawMetadata | null | undefined): BookMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  return normaliseMetadata({
    title: raw.title ?? null,
    subtitle: raw.subtitle ?? null,
    authors: (Array.isArray(raw.authors) ? raw.authors : []) as string[],
    translators: (Array.isArray(raw.translators) ? raw.translators : []) as string[],
    publisher: raw.publisher ?? null,
    year: raw.year == null ? null : String(raw.year),
    edition: raw.edition ?? null,
    isbn: raw.isbn ?? null,
    series: raw.series ?? null,
    originalTitle: raw.original_title ?? null,
  });
}

/** 模型不保證輸出乾淨 JSON。三層防禦：剝 fence → 切首尾大括號 → 正則救援被截斷的內容。 */
export function parseOcrJson(raw: string): {
  blocks: Block[];
  meta: Partial<PageResult>;
  truncated: boolean;
} {
  let t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a !== -1 && b > a) t = t.slice(a, b + 1);

  try {
    const parsed = JSON.parse(t) as RawPage;
    const blocks = (parsed.blocks ?? []).filter(
      (bl): bl is Block => !!bl && typeof bl.text === 'string' && BLOCK_TYPES.includes(bl.type),
    );
    const kind = PAGE_KINDS.includes(parsed.page_kind as PageKind)
      ? (parsed.page_kind as PageKind)
      : 'body';
    return {
      blocks,
      meta: {
        page_label: parsed.page_label ?? null,
        language: parsed.language,
        kind,
        metadata: toMetadata(parsed.metadata),
        starts_mid_sentence: parsed.starts_mid_sentence,
        ends_mid_sentence: parsed.ends_mid_sentence,
      },
      truncated: false,
    };
  } catch {
    /* 落到救援路徑 */
  }

  const blocks: Block[] = [];
  const re = /\{\s*"type"\s*:\s*"(h1|h2|h3|p|quote|list|caption)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    try {
      blocks.push({ type: m[1] as BlockType, text: JSON.parse('"' + m[2] + '"') as string });
    } catch {
      /* 跳過壞掉的片段 */
    }
  }
  if (!blocks.length) throw new Error('無法解析辨識結果');
  return { blocks, meta: { ends_mid_sentence: true }, truncated: true };
}

export async function ocrPage(
  dataUrl: string,
  options: ScanOptions,
  signal?: AbortSignal,
): Promise<PageResult> {
  const started = performance.now();
  const { text, usage, stopReason } = await callClaude(
    [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: stripDataUrl(dataUrl) },
          },
          { type: 'text', text: 'Transcribe this book page. Return only the JSON object.' },
        ],
      },
    ],
    { system: buildOcrSystem(options), maxTokens: OCR_MAX_TOKENS, signal },
  );

  const { blocks, meta, truncated } = parseOcrJson(text);

  return {
    page_label: meta.page_label ?? null,
    language: meta.language ?? 'mixed',
    kind: meta.kind ?? 'body',
    metadata: meta.metadata ?? null,
    starts_mid_sentence: !!meta.starts_mid_sentence,
    ends_mid_sentence: !!meta.ends_mid_sentence,
    blocks,
    truncated: truncated || stopReason === 'max_tokens',
    usage,
    ms: Math.round(performance.now() - started),
  };
}
