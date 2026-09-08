import { useCallback, useEffect, useRef, useState } from 'react';
import { useScanner } from './hooks/useScanner';
import { TopBar } from './components/TopBar';
import { Notice } from './components/Notice';
import { LoadStage } from './components/LoadStage';
import { ScanStage } from './components/ScanStage';
import { ReadStage } from './components/ReadStage';
import { summarise } from './lib/summarise';
import { clearDraft, loadDraft, saveDraft } from './lib/draft';
import { MAX_PAGES } from './config';
import { isFrontMatter } from './lib/metadata';
import type { BookMetadata, Draft, ScanOptions, SummaryMode } from './types';

export default function App() {
  const s = useScanner();
  const [title, setTitle] = useState('未命名書稿');
  const [author, setAuthor] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryState, setSummaryState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [summaryNote, setSummaryNote] = useState('');
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('standard');
  const [includeSummary, setIncludeSummary] = useState(false);
  const [restorable, setRestorable] = useState<Draft | null>(null);
  const [metaEdits, setMetaEdits] = useState<Partial<BookMetadata>>({});
  const restored = useRef(false);
  // 使用者自己改過書名／作者之後，就不再讓辨識結果覆蓋
  const titleTouched = useRef(false);
  const authorTouched = useRef(false);

  // 手動修改優先於辨識結果
  const metadata: BookMetadata = { ...s.metadata, ...metaEdits };
  const metadataSourcePages = s.pages.filter((p) => p.status === 'done' && isFrontMatter(p)).length;

  /* ------------------------------------ 封面資訊自動帶入書名與作者 */
  useEffect(() => {
    if (!titleTouched.current && metadata.title) setTitle(metadata.title);
    if (!authorTouched.current && metadata.authors.length) setAuthor(metadata.authors.join('、'));
  }, [metadata.title, metadata.authors.join('、')]);

  /* ---------------------------------------------- 草稿：別讓已付費的 OCR 白跑 */
  useEffect(() => {
    void loadDraft().then((draft) => {
      if (draft && draft.pages.length && draft.pages.some((p) => p.status === 'done')) {
        setRestorable(draft);
      }
    });
  }, []);

  useEffect(() => {
    if (!s.pages.length && !s.markdown) return;
    const timer = setTimeout(() => {
      void saveDraft({
        savedAt: Date.now(),
        title, author,
        pages: s.pages,
        markdown: s.markdown,
        metadata,
        options: s.options,
        stage: s.stage,
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [s.pages, s.markdown, s.options, s.stage, title, author]);

  const restore = () => {
    if (!restorable || restored.current) return;
    restored.current = true;
    // 上次可能是在掃描中途關掉的，排隊狀態要歸零，否則畫面會卡住
    s.setPages(
      restorable.pages.map((p) =>
        p.status === 'queued' || p.status === 'scanning' ? { ...p, status: 'ready' as const } : p,
      ),
    );
    s.setOptions(restorable.options);
    s.setMarkdown(restorable.markdown);
    setMetaEdits(restorable.metadata ?? {});
    setTitle(restorable.title);
    setAuthor(restorable.author);
    titleTouched.current = true;
    authorTouched.current = true;
    s.setStage(restorable.stage === 'read' ? 'read' : 'load');
    setRestorable(null);
  };

  const discard = () => {
    void clearDraft();
    setRestorable(null);
  };

  /* ---------------------------------------------------------------- 貼上匯入 */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (s.stage !== 'load') return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) void s.addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [s.stage, s.addFiles]);

  /* ------------------------------------------------------------------ 摘要 */
  const runSummary = useCallback(async () => {
    setSummaryState('running');
    setSummary('');
    setSummaryNote('準備中…');
    try {
      const out = await summarise(s.markdown, summaryMode, setSummaryNote);
      setSummary(out.markdown);
      setSummaryState('done');
    } catch (err) {
      setSummaryNote((err as Error).message || '摘要失敗');
      setSummaryState('error');
    }
  }, [s.markdown, summaryMode]);

  const startOver = () => {
    void clearDraft();
    setSummary('');
    setSummaryState('idle');
    setIncludeSummary(false);
    setTitle('未命名書稿');
    setAuthor('');
    setMetaEdits({});
    titleTouched.current = false;
    authorTouched.current = false;
    s.reset();
  };

  const readout =
    s.stage === 'load'
      ? s.pages.length ? '<b>' + s.pages.length + '</b> / ' + MAX_PAGES + ' 頁待掃' : ''
      : s.stage === 'scan'
        ? '<b>' + s.stats.done + '</b> / ' + s.stats.total + ' 頁完成' + (s.stats.failed ? '・' + s.stats.failed + ' 頁失敗' : '')
        : '<b>' + s.pages.length + '</b> 頁・約 US$' + s.stats.cost.toFixed(3);

  return (
    <div className={'bp bp--' + s.stage}>
      <TopBar stage={s.stage} readout={readout} onReset={startOver} />

      {restorable && (
        <div className="notice notice--restore">
          <span>
            上次有一份未完成的工作（{restorable.pages.length} 頁，
            {new Date(restorable.savedAt).toLocaleString('zh-TW')}）。要接續嗎？
          </span>
          <button className="btn btn--ghost btn--sm" onClick={restore}>接續</button>
          <button className="btn btn--ghost btn--sm" onClick={discard}>不用了</button>
        </div>
      )}

      {s.notice && <Notice text={s.notice} onClose={() => s.setNotice(null)} />}

      {s.stage === 'load' && (
        <LoadStage
          pages={s.pages}
          options={s.options}
          spreads={s.stats.spreads}
          busy={s.busy}
          onOptions={(patch: Partial<ScanOptions>) => s.setOptions((prev) => ({ ...prev, ...patch }))}
          onAdd={(files) => void s.addFiles(files)}
          onMove={s.movePage}
          onRemove={s.removePage}
          onRotate={(id) => void s.rotatePage(id)}
          onSplit={(id) => void s.splitPage(id)}
          onSplitAll={() => void s.splitAllSpreads()}
          onScan={() => void s.runScan()}
        />
      )}

      {s.stage === 'scan' && (
        <ScanStage
          pages={s.pages}
          stats={s.stats}
          busy={s.busy}
          onSetKind={s.setPageKind}
          onRetryFailed={() => void s.retryFailed()}
          onCancel={s.cancelScan}
          onBack={() => s.setStage('load')}
          onCompose={s.compose}
        />
      )}

      {s.stage === 'read' && (
        <ReadStage
          title={title}
          author={author}
          markdown={s.markdown}
          summary={summary}
          summaryState={summaryState}
          summaryNote={summaryNote}
          summaryMode={summaryMode}
          includeSummary={includeSummary}
          pageCount={s.stats.bodyPages}
          metadata={metadata}
          metadataSourcePages={metadataSourcePages}
          onTitle={(v) => { titleTouched.current = true; setTitle(v); }}
          onAuthor={(v) => { authorTouched.current = true; setAuthor(v); }}
          onMetadata={(patch) => setMetaEdits((prev) => ({ ...prev, ...patch }))}
          onMarkdown={s.setMarkdown}
          onSummaryMode={setSummaryMode}
          onIncludeSummary={setIncludeSummary}
          onRunSummary={() => void runSummary()}
          onNotice={s.setNotice}
        />
      )}
    </div>
  );
}
