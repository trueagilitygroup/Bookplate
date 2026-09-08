export interface Heading {
  level: number;
  text: string;
  id: string;
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(text: string, index: number): string {
  return 'sec-' + index + '-' + text.replace(/[^\w\u4e00-\u9fff]+/g, '-').slice(0, 24);
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/** 極簡 Markdown → HTML。只支援本專案會產出的語法，不引入第三方套件。 */
export function mdToHtml(md: string, opts: { anchors?: boolean } = {}): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];
  let headingIndex = 0;

  const flushPara = () => {
    if (para.length) {
      html.push('<p>' + inline(para.join(' ')) + '</p>');
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      html.push('<ul>' + list.map((l) => '<li>' + inline(l) + '</li>').join('') + '</ul>');
      list = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      html.push('<blockquote>' + inline(quote.join(' ')) + '</blockquote>');
      quote = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const id = opts.anchors ? ' id="' + slugify(heading[2], headingIndex) + '"' : '';
      headingIndex++;
      html.push('<h' + level + id + '>' + inline(heading[2]) + '</h' + level + '>');
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      flushQuote();
      list.push(line.replace(/^\s*[-*]\s+/, ''));
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      flushList();
      quote.push(line.replace(/^\s*>\s?/, ''));
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushAll();
      html.push('<hr/>');
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    flushList();
    flushQuote();
    para.push(line);
  }
  flushAll();
  return html.join('\n');
}

export function extractToc(md: string): Heading[] {
  const found: { level: number; text: string }[] = [];
  md.split('\n').forEach((line) => {
    const m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m) found.push({ level: m[1].length, text: m[2].trim() });
  });
  return found.map((h, i) => ({ ...h, id: slugify(h.text, i) }));
}

/** 中文算字、英文算詞。混排書稿兩者相加。 */
export function countWords(md: string): number {
  const text = md.replace(/^#{1,6}\s+/gm, '').replace(/[*_>`-]/g, '');
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).length;
  return cjk + latin;
}

/** 依 h1 切章。沒有 h1 時整份視為一章。 */
export function splitChapters(md: string, fallbackTitle: string): { title: string; body: string }[] {
  const lines = md.split('\n');
  const chapters: { title: string; body: string }[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const m = line.match(/^#\s+(.*)$/);
    if (m) {
      if (current) chapters.push({ title: current.title, body: current.body.join('\n') });
      current = { title: m[1].trim(), body: [line] };
    } else if (current) {
      current.body.push(line);
    } else {
      current = { title: fallbackTitle, body: [line] };
    }
  }
  if (current) chapters.push({ title: current.title, body: current.body.join('\n') });
  return chapters.filter((c) => c.body.trim());
}
