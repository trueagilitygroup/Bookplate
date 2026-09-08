import { effectiveKind } from '../lib/metadata';
import { PAGE_KIND_LABEL, type Page } from '../types';

interface Props {
  page: Page;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
  onSplit: (id: string) => void;
  onDragStart: (index: number) => void;
  onDropAt: (index: number) => void;
}

export function PageCard({
  page, index, total, onMove, onRemove, onRotate, onSplit, onDragStart, onDropAt,
}: Props) {
  return (
    <figure
      className={'card' + (page.status === 'failed' ? ' card--bad' : '') + (page.isSpread ? ' card--wide' : '')}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDropAt(index); }}
    >
      <div className="card__img">
        {page.dataUrl
          ? <img src={page.dataUrl} alt={'第 ' + (index + 1) + ' 頁'} />
          : <div className="card__void">讀取失敗</div>}
        <span className="card__n">{String(index + 1).padStart(2, '0')}</span>
        {page.status === 'done' && effectiveKind(page) !== 'body' && (
          <span className="card__kind">{PAGE_KIND_LABEL[effectiveKind(page)]}</span>
        )}
        {page.isSpread && (
          <button className="card__spread" onClick={() => onSplit(page.id)}>
            看起來是跨頁 · 拆成兩頁
          </button>
        )}
      </div>
      <figcaption>
        <span className="card__meta">{page.w ? page.w + '×' + page.h : '—'}</span>
        <span className="card__ops">
          <button onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label="往前移一頁" title="往前移">‹</button>
          <button onClick={() => onMove(index, index + 1)} disabled={index === total - 1} aria-label="往後移一頁" title="往後移">›</button>
          <button onClick={() => onRotate(page.id)} disabled={!page.dataUrl} aria-label="旋轉 90 度" title="旋轉">⟳</button>
          <button onClick={() => onRemove(page.id)} aria-label="移除這一頁" title="移除">✕</button>
        </span>
      </figcaption>
      {page.error && <p className="card__err">{page.error}</p>}
    </figure>
  );
}
