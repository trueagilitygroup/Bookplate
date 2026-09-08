import { useEffect, useMemo, useState } from 'react';
import { countWords, extractToc, mdToHtml } from '../lib/markdown';
import { Toc } from './Toc';
import { ExportPanel } from './ExportPanel';
import { SummaryPanel } from './SummaryPanel';
import { MetadataPanel } from './MetadataPanel';
import { bylineLine, imprintLine } from '../lib/metadata';
import type { BookMetadata, SummaryMode } from '../types';

interface Props {
  title: string;
  author: string;
  markdown: string;
  summary: string;
  summaryState: 'idle' | 'running' | 'done' | 'error';
  summaryNote: string;
  summaryMode: SummaryMode;
  includeSummary: boolean;
  pageCount: number;
  metadata: BookMetadata;
  metadataSourcePages: number;
  onTitle: (v: string) => void;
  onAuthor: (v: string) => void;
  onMarkdown: (v: string) => void;
  onSummaryMode: (m: SummaryMode) => void;
  onIncludeSummary: (v: boolean) => void;
  onRunSummary: () => void;
  onNotice: (msg: string) => void;
  onMetadata: (patch: Partial<BookMetadata>) => void;
}

export function ReadStage(props: Props) {
  const { title, author, markdown, pageCount, metadata } = props;
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const headings = useMemo(() => extractToc(markdown), [markdown]);
  const html = useMemo(() => mdToHtml(markdown, { anchors: true }), [markdown]);
  const words = useMemo(() => countWords(markdown), [markdown]);

  // 捲動時標示目前所在章節
  useEffect(() => {
    if (editing || !headings.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -70% 0px', threshold: 0 },
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headings, editing, html]);

  return (
    <main className="read">
      <Toc headings={headings} activeId={activeId} />

      <article className="doc">
        <div className="doc__title">
          <input className="ti" value={title} onChange={(e) => props.onTitle(e.target.value)} aria-label="書名" placeholder="書名" />
          {metadata.subtitle && <p className="doc__sub">{metadata.subtitle}</p>}
          <input className="ti ti--sub" value={author} onChange={(e) => props.onAuthor(e.target.value)} aria-label="作者" placeholder="作者（選填）" />
          {(bylineLine(metadata) || imprintLine(metadata)) && (
            <p className="doc__imprint">{[bylineLine(metadata), imprintLine(metadata)].filter(Boolean).join('　·　')}</p>
          )}
          <p className="doc__meta">{words.toLocaleString()} 字・由 {pageCount} 頁正文照片組成</p>
        </div>

        {editing ? (
          <textarea
            className="raw"
            value={markdown}
            onChange={(e) => props.onMarkdown(e.target.value)}
            spellCheck={false}
            aria-label="Markdown 原文"
          />
        ) : (
          <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
        )}

        <div className="doc__tools">
          <button className="btn btn--ghost btn--sm" onClick={() => setEditing((v) => !v)}>
            {editing ? '回到閱讀檢視' : '編輯原文'}
          </button>
          <span className="hint">辨識不會百分之百正確。專有名詞和數字值得再看一眼。</span>
        </div>
      </article>

      <aside className="side">
        <MetadataPanel
          metadata={metadata}
          sourcePages={props.metadataSourcePages}
          onChange={props.onMetadata}
        />
        <ExportPanel
          meta={{ title, author, markdown, book: metadata, summary: props.summary }}
          hasSummary={props.summaryState === 'done'}
          includeSummary={props.includeSummary}
          onIncludeSummary={props.onIncludeSummary}
          onFail={props.onNotice}
        />
        <SummaryPanel
          markdown={markdown}
          summary={props.summary}
          state={props.summaryState}
          note={props.summaryNote}
          mode={props.summaryMode}
          title={title}
          onMode={props.onSummaryMode}
          onRun={props.onRunSummary}
        />
      </aside>
    </main>
  );
}
