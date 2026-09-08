import JSZip from 'jszip';
import { mdToHtml, escapeHtml, splitChapters } from './markdown';
import { download, safeName, type BookMeta } from './exporters';
import { bylineLine, imprintLine } from './metadata';
import { EMPTY_METADATA } from '../types';

const CSS = `body{font-family:"Songti TC",serif;line-height:1.8;margin:0 6%;}
h1{font-size:1.5em;margin:1.6em 0 .7em;}h2{font-size:1.2em;margin:1.4em 0 .5em;}
h3{font-size:1.05em;margin:1.2em 0 .4em;}p{margin:0 0 .9em;text-indent:0;}
blockquote{margin:1.2em 1.5em;color:#444;}ul{margin:0 0 1em 1.2em;}`;

function xhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-Hant" lang="zh-Hant">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body></html>`;
}

/** 產出 EPUB 3。這是唯一能在 Kindle / Apple Books / Kobo 重新排版的格式。 */
export async function exportEpub(meta: BookMeta): Promise<void> {
  const zip = new JSZip();
  const book = meta.book ?? EMPTY_METADATA;
  // ISBN 是最穩定的識別碼，沒有才退回隨機 UUID
  const uid = book.isbn ? 'urn:isbn:' + book.isbn : 'urn:uuid:' + crypto.randomUUID();
  const title = (book.title ?? meta.title).trim() || '未命名書稿';
  const authors = book.authors.length ? book.authors : meta.author.trim() ? [meta.author.trim()] : [];
  // 純 ASCII 書名視為英文書，影響閱讀器的斷行與字型選擇
  const lang = /^[\x00-\x7F]+$/.test(title) ? 'en' : 'zh-Hant';

  // mimetype 必須是第一個項目且不可壓縮，否則多數閱讀器拒讀
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  const oebps = zip.folder('OEBPS')!;
  oebps.file('style.css', CSS);

  const chapters: { file: string; title: string }[] = [];
  let index = 0;

  const byline = bylineLine(book);
  const imprint = imprintLine(book);
  if (book.subtitle || byline || imprint || book.originalTitle) {
    index++;
    const file = 'ch' + index + '.xhtml';
    oebps.file(
      file,
      xhtml(
        title,
        [
          '<h1>' + escapeHtml(title) + '</h1>',
          book.subtitle ? '<p>' + escapeHtml(book.subtitle) + '</p>' : '',
          byline ? '<p>' + escapeHtml(byline) + '</p>' : '',
          book.originalTitle ? '<p>原書名　' + escapeHtml(book.originalTitle) + '</p>' : '',
          imprint ? '<p>' + escapeHtml(imprint) + '</p>' : '',
        ].filter(Boolean).join('\n'),
      ),
    );
    chapters.push({ file, title: '書名頁' });
  }

  if (meta.includeSummary && meta.summary) {
    index++;
    const file = 'ch' + index + '.xhtml';
    oebps.file(file, xhtml('摘要', '<h1>摘要</h1>' + mdToHtml(meta.summary)));
    chapters.push({ file, title: '摘要' });
  }

  for (const chapter of splitChapters(meta.markdown, title)) {
    index++;
    const file = 'ch' + index + '.xhtml';
    oebps.file(file, xhtml(chapter.title, mdToHtml(chapter.body)));
    chapters.push({ file, title: chapter.title });
  }

  oebps.file(
    'nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-Hant">
<head><meta charset="utf-8"/><title>目錄</title></head>
<body><nav epub:type="toc" id="toc"><h1>目錄</h1><ol>
${chapters.map((c) => '<li><a href="' + c.file + '">' + escapeHtml(c.title) + '</a></li>').join('\n')}
</ol></nav></body></html>`,
  );

  oebps.file(
    'content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uid}</dc:identifier>
    <dc:title>${escapeHtml(title)}</dc:title>
${authors.map((a) => '    <dc:creator>' + escapeHtml(a) + '</dc:creator>').join('\n')}
${book.translators.map((t) => '    <dc:contributor>' + escapeHtml(t) + '</dc:contributor>').join('\n')}
${book.publisher ? '    <dc:publisher>' + escapeHtml(book.publisher) + '</dc:publisher>' : ''}
${book.year ? '    <dc:date>' + escapeHtml(book.year) + '</dc:date>' : ''}
${book.series ? '    <dc:source>' + escapeHtml(book.series) + '</dc:source>' : ''}
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
${chapters.map((c, i) => '    <item id="c' + i + '" href="' + c.file + '" media-type="application/xhtml+xml"/>').join('\n')}
  </manifest>
  <spine>
${chapters.map((_, i) => '    <itemref idref="c' + i + '"/>').join('\n')}
  </spine>
</package>`,
  );

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  download(blob, safeName(title) + '.epub', 'application/epub+zip');
}
