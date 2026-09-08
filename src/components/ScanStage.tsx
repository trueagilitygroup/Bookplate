import { POOL } from '../config';
import { effectiveKind } from '../lib/metadata';
import { PAGE_KIND_LABEL, type Page, type PageKind } from '../types';

const KIND_OPTIONS: PageKind[] = ['cover', 'title_page', 'copyright_page', 'toc', 'body', 'blank'];

interface Stats {
  done: number;
  failed: number;
  pending: number;
  truncated: number;
  frontMatter: number;
  bodyPages: number;
  total: number;
  usage: { input: number; output: number };
  cost: number;
}

interface Props {
  pages: Page[];
  stats: Stats;
  busy: boolean;
  onSetKind: (id: string, kind: PageKind | null) => void;
  onRetryFailed: () => void;
  onCancel: () => void;
  onBack: () => void;
  onCompose: () => void;
}

export function ScanStage({ pages, stats, busy, onSetKind, onRetryFailed, onCancel, onBack, onCompose }: Props) {
  const pct = stats.total ? (stats.done / stats.total) * 100 : 0;

  const note = busy
    ? '同時處理 ' + Math.min(POOL, stats.pending || 1) + ' 頁，還有 ' + stats.pending + ' 頁排隊中。'
    : stats.failed
      ? '有 ' + stats.failed + ' 頁沒過。可以重試，或直接用已完成的頁面組稿。'
      : '全部完成。';

  return (
    <main className="scan">
      <div className="scan__head">
        <h2>正在辨識</h2>
        <div className="meter" role="progressbar" aria-valuenow={stats.done} aria-valuemin={0} aria-valuemax={stats.total}>
          <span style={{ width: pct + '%' }} />
        </div>
        <p className="scan__note">{note}</p>
        {stats.usage.output > 0 && (
          <p className="scan__cost">
            已用 {(stats.usage.input / 1000).toFixed(1)}k 輸入 ／ {(stats.usage.output / 1000).toFixed(1)}k 輸出 token
            <span> ≈ US${stats.cost.toFixed(3)}</span>
          </p>
        )}
      </div>

      <ul className="rows">
        {pages.map((page, i) => (
          <li key={page.id} className={'row row--' + page.status}>
            <span className="row__n">{String(i + 1).padStart(2, '0')}</span>
            <span className="row__thumb">{page.dataUrl && <img src={page.dataUrl} alt="" />}</span>
            <span className="row__body">
              <span className="row__name">{page.name}</span>
              <span className="row__detail">
                {page.status === 'done' && page.result && [
                  page.result.blocks.length + ' 段',
                  page.result.page_label ? '書頁 ' + page.result.page_label : null,
                  (page.result.ms / 1000).toFixed(1) + ' 秒',
                  page.result.truncated ? '內容可能被截斷' : null,
                ].filter(Boolean).join('・')}
                {page.status === 'scanning' && '辨識中…'}
                {page.status === 'queued' && '排隊中'}
                {page.status === 'ready' && '已取消'}
                {page.status === 'failed' && (page.error ?? '失敗')}
              </span>
            </span>
            <span className="row__act">
              {page.status === 'done' && (
                <select
                  className={'kind' + (effectiveKind(page) !== 'body' ? ' kind--flag' : '')}
                  value={effectiveKind(page)}
                  onChange={(e) => onSetKind(page.id, e.target.value as PageKind)}
                  aria-label={'第 ' + (i + 1) + ' 頁的角色'}
                  title="這一頁在書裡的角色。封面與版權頁不會併進正文。"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>{PAGE_KIND_LABEL[k]}</option>
                  ))}
                </select>
              )}
              {page.status === 'done' && <span className="tick" aria-label="完成">✓</span>}
              {(page.status === 'scanning' || page.status === 'queued') && <span className="pulse" aria-hidden="true" />}
            </span>
          </li>
        ))}
      </ul>

      {stats.frontMatter > 0 && !busy && (
        <p className="note">
          有 {stats.frontMatter} 頁判定為封面／書名頁／版權頁，出版資訊已抓出來，這些頁的文字不會併進正文。
          判斷錯了可以在右邊改。
        </p>
      )}

      {stats.truncated > 0 && !busy && (
        <p className="warn">
          有 {stats.truncated} 頁的輸出達到長度上限，內容可能不完整。
          若該頁字很多，可以在 src/config.ts 調高 OCR_MAX_TOKENS 後重試。
        </p>
      )}

      <div className="scan__foot">
        {busy
          ? <button className="btn btn--ghost" onClick={onCancel}>停止掃描</button>
          : <button className="btn btn--ghost" onClick={onBack}>回到頁面整理</button>}
        {!busy && stats.failed > 0 && (
          <button className="btn btn--ghost" onClick={onRetryFailed}>重試失敗的 {stats.failed} 頁</button>
        )}
        <button className="btn btn--solid btn--lg" onClick={onCompose} disabled={stats.bodyPages === 0}>
          組成書稿{stats.bodyPages ? '（' + stats.bodyPages + ' 頁正文）' : ''}
        </button>
      </div>
    </main>
  );
}
