import { mdToHtml, escapeHtml } from './markdown';
import { bylineLine, imprintLine } from './metadata';
import { EMPTY_METADATA, type BookMetadata } from '../types';

export interface BookMeta {
  title: string;
  author: string;
  markdown: string;
  /** 從封面與版權頁抓到的出版資訊 */
  book?: BookMetadata;
  summary?: string;
  includeSummary?: boolean;
}

const bookOf = (meta: BookMeta): BookMetadata => meta.book ?? EMPTY_METADATA;

/** YAML front matter。只寫有值的欄位，不留一排空鍵。 */
function frontMatter(meta: BookMeta): string {
  const b = bookOf(meta);
  const q = (v: string) => (/[:#\-\[\]{},&*?|<>=!%@`"']/.test(v) ? JSON.stringify(v) : v);
  const lines: string[] = ['title: ' + q(meta.title)];
  const push = (key: string, value: string | null) => {
    if (value) lines.push(key + ': ' + q(value));
  };
  push('subtitle', b.subtitle);
  if (b.authors.length) lines.push('authors: [' + b.authors.map(q).join(', ') + ']');
  else if (meta.author.trim()) lines.push('authors: [' + q(meta.author.trim()) + ']');
  if (b.translators.length) lines.push('translators: [' + b.translators.map(q).join(', ') + ']');
  push('publisher', b.publisher);
  push('year', b.year);
  push('edition', b.edition);
  push('isbn', b.isbn);
  push('series', b.series);
  push('original_title', b.originalTitle);
  lines.push('source: 由書頁照片辨識產生');
  lines.push('digitised: ' + new Date().toISOString().slice(0, 10));
  return '---\n' + lines.join('\n') + '\n---\n\n';
}

/** 給 Word 與 PDF 用的書名頁區塊。 */
function titleBlockHtml(meta: BookMeta): string {
  const b = bookOf(meta);
  const byline = bylineLine(b) || meta.author.trim();
  const imprint = imprintLine(b);
  return [
    '<h1>' + escapeHtml(meta.title) + '</h1>',
    b.subtitle ? '<p class="sub">' + escapeHtml(b.subtitle) + '</p>' : '',
    byline ? '<p>' + escapeHtml(byline) + '</p>' : '',
    b.originalTitle ? '<p class="fine">原書名　' + escapeHtml(b.originalTitle) + '</p>' : '',
    imprint ? '<p class="fine">' + escapeHtml(imprint) + '</p>' : '',
  ].filter(Boolean).join('\n');
}

function safeName(title: string): string {
  return (title.trim() || 'book').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
}

export function download(content: string | Blob, filename: string, mime: string): void {
  const blob = content instanceof Blob ? content : new Blob(['\ufeff' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function composed({ markdown, summary, includeSummary }: BookMeta): string {
  const head = includeSummary && summary ? '# 摘要\n\n' + summary + '\n\n---\n\n' : '';
  return head + markdown;
}

export function exportMarkdown(meta: BookMeta): void {
  download(frontMatter(meta) + composed(meta), safeName(meta.title) + '.md', 'text/markdown;charset=utf-8');
}

const PRINT_CSS = `
@page { margin: 22mm 20mm; }
body { font-family:"Songti TC","Noto Serif CJK TC","Source Han Serif TC",Georgia,"Times New Roman",serif;
  color:#171A1F; line-height:1.75; font-size:11.5pt; max-width:40em; margin:0 auto; }
h1 { font-size:20pt; line-height:1.3; margin:2.2em 0 .8em; page-break-before:always; page-break-after:avoid; }
h1:first-of-type { page-break-before:avoid; }
h2 { font-size:15pt; margin:1.8em 0 .6em; page-break-after:avoid; }
h3 { font-size:12.5pt; margin:1.4em 0 .5em; page-break-after:avoid; }
p { margin:0 0 .9em; text-align:justify; }
blockquote { margin:1.2em 0 1.2em 1.5em; padding-left:1em; border-left:2px solid #C9CCD4; color:#3D434E; }
ul { margin:0 0 1em 1.2em; } li { margin:.25em 0; }
.tp { text-align:center; margin:14vh 0 0; page-break-after:always; }
.tp h1 { font-size:26pt; page-break-before:avoid; margin:0 0 .6em; }
.tp p { text-align:center; color:#5A606B; }
.tp .sub { font-size:13pt; color:#3D434E; margin-top:-.4em; }
.tp .fine { font-size:9.5pt; color:#6E727C; margin-top:1.6em; line-height:1.6; }
`;

export function printableHtml(meta: BookMeta): string {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeHtml(
    meta.title,
  )}</title><style>${PRINT_CSS}</style></head><body>
<div class="tp">${titleBlockHtml(meta)}</div>
${mdToHtml(composed(meta))}
</body></html>`;
}

/**
 * Word 走 HTML + MSO namespace，不走 docx 產生器：
 * 中文字型不需要嵌入，Word 用系統字型渲染，不會缺字，而且完全可續編。
 */
export function exportWord(meta: BookMeta): void {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title>
<style>
body { font-family:"Songti TC",serif; font-size:12pt; line-height:1.7; }
h1 { font-size:19pt; } h2 { font-size:15pt; } h3 { font-size:13pt; }
blockquote { margin-left:24pt; color:#3D434E; }
.sub { font-size:13pt; color:#3D434E; }
.fine { font-size:9.5pt; color:#6E727C; }
</style></head><body>
${titleBlockHtml(meta)}<hr/>
${mdToHtml(composed(meta))}
</body></html>`;
  download(new Blob(['\ufeff' + html], { type: 'application/msword' }), safeName(meta.title) + '.doc', '');
}

/** 用系統列印引擎產 PDF：中文排版交給 OS 字型，不會缺字。 */
export function exportPdf(meta: BookMeta, onFail: () => void): void {
  try {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    frame.srcdoc = printableHtml(meta);
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        onFail();
      }
      setTimeout(() => frame.remove(), 60000);
    };
  } catch {
    onFail();
  }
}

export function exportPrintableHtml(meta: BookMeta): void {
  download(printableHtml(meta), safeName(meta.title) + '_print.html', 'text/html;charset=utf-8');
}

export { safeName };
