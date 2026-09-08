import { callClaude } from './anthropic';
import { SUMMARY_MAX_TOKENS, SUMMARY_CHUNK } from '../config';
import { splitChapters } from './markdown';
import type { SummaryMode, Usage } from '../types';

const SHARED = `Write in the dominant language of the source text (Chinese source → Traditional Chinese; English source → English).
Ground every claim in the supplied text. If the text is fragmentary, say so rather than filling the gap.
No preamble, no closing remarks.`;

const SYSTEM: Record<SummaryMode, string> = {
  brief: `You are a rigorous book editor. Produce a short briefing in Markdown:

## 一句話總結
## 五個要點

${SHARED}`,
  standard: `You are a rigorous book editor writing a briefing for someone who has not read the text. Use this exact Markdown structure:

## 一句話總結
## 核心論點
## 內容脈絡
## 關鍵概念
## 值得追問的地方

${SHARED}`,
  chapter: `You are a rigorous book editor. Summarise this single chapter in Markdown:

## 本章重點
## 主要內容
## 關鍵詞

${SHARED}`,
};

const NOTE_TAKER = 'You take precise, factual reading notes. Never invent detail.';

export interface SummaryOutput {
  markdown: string;
  usage: Usage;
}

const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, output: a.output + b.output });

export async function summarise(
  md: string,
  mode: SummaryMode,
  onProgress: (note: string) => void,
  signal?: AbortSignal,
): Promise<SummaryOutput> {
  const text = md.trim();
  let usage: Usage = { input: 0, output: 0 };

  // 逐章模式：每章各自摘要後串起來，適合翻閱式閱讀
  if (mode === 'chapter') {
    const chapters = splitChapters(text, '全文');
    const parts: string[] = [];
    for (let i = 0; i < chapters.length; i++) {
      onProgress('摘要第 ' + (i + 1) + ' / ' + chapters.length + ' 章…');
      const res = await callClaude(
        [{ role: 'user', content: chapters[i].body.slice(0, SUMMARY_CHUNK) }],
        { system: SYSTEM.chapter, maxTokens: SUMMARY_MAX_TOKENS, signal },
      );
      usage = addUsage(usage, res.usage);
      parts.push('# ' + chapters[i].title + '\n\n' + res.text.trim());
    }
    return { markdown: parts.join('\n\n---\n\n'), usage };
  }

  // 單次可容納
  if (text.length <= SUMMARY_CHUNK) {
    onProgress('分析全文…');
    const res = await callClaude([{ role: 'user', content: 'Source text:\n\n' + text }], {
      system: SYSTEM[mode],
      maxTokens: SUMMARY_MAX_TOKENS,
      signal,
    });
    return { markdown: res.text.trim(), usage: res.usage };
  }

  // map-reduce
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += SUMMARY_CHUNK) chunks.push(text.slice(i, i + SUMMARY_CHUNK));

  const notes: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress('閱讀第 ' + (i + 1) + ' / ' + chunks.length + ' 段…');
    const res = await callClaude(
      [
        {
          role: 'user',
          content:
            'Condense this section of a book into about 200 words of dense notes. Keep names, claims, numbers and the line of argument. No headings.\n\n' +
            chunks[i],
        },
      ],
      { system: NOTE_TAKER, maxTokens: SUMMARY_MAX_TOKENS, signal },
    );
    usage = addUsage(usage, res.usage);
    notes.push('[Section ' + (i + 1) + ']\n' + res.text.trim());
  }

  onProgress('整合全書摘要…');
  const final = await callClaude(
    [{ role: 'user', content: 'Section notes from one book, in order:\n\n' + notes.join('\n\n') }],
    { system: SYSTEM[mode], maxTokens: SUMMARY_MAX_TOKENS, signal },
  );
  return { markdown: final.text.trim(), usage: addUsage(usage, final.usage) };
}
