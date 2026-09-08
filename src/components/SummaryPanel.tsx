import { mdToHtml } from '../lib/markdown';
import { download } from '../lib/exporters';
import type { SummaryMode } from '../types';

interface Props {
  markdown: string;
  summary: string;
  state: 'idle' | 'running' | 'done' | 'error';
  note: string;
  mode: SummaryMode;
  title: string;
  onMode: (m: SummaryMode) => void;
  onRun: () => void;
}

const MODES: { value: SummaryMode; label: string; hint: string }[] = [
  { value: 'brief', label: '速覽', hint: '一句話加五個要點' },
  { value: 'standard', label: '標準', hint: '論點、脈絡、概念' },
  { value: 'chapter', label: '逐章', hint: '每一章各自摘要' },
];

export function SummaryPanel({ markdown, summary, state, note, mode, title, onMode, onRun }: Props) {
  return (
    <section className="panel">
      <h3>AI 摘要</h3>

      <div className="segs">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={'seg' + (mode === m.value ? ' is-on' : '')}
            onClick={() => onMode(m.value)}
            disabled={state === 'running'}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>

      {state === 'idle' && (
        <>
          <p className="panel__lead">先看重點，再決定要不要讀完。摘要只根據掃進來的內容，不會補充書外資訊。</p>
          <button className="btn btn--solid" onClick={onRun} disabled={!markdown.trim()}>生成摘要</button>
        </>
      )}

      {state === 'running' && (
        <p className="panel__lead"><span className="pulse" aria-hidden="true" /> {note}</p>
      )}

      {state === 'error' && (
        <>
          <p className="panel__lead">{note}</p>
          <button className="btn btn--ghost" onClick={onRun}>再試一次</button>
        </>
      )}

      {state === 'done' && (
        <>
          <div className="sum" dangerouslySetInnerHTML={{ __html: mdToHtml(summary) }} />
          <div className="sum__ops">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => download(summary, (title || 'book') + '_摘要.md', 'text/markdown;charset=utf-8')}
            >
              下載摘要
            </button>
            <button className="btn btn--ghost btn--sm" onClick={onRun}>重新生成</button>
          </div>
        </>
      )}
    </section>
  );
}
