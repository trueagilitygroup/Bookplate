import { useRef, useState } from 'react';
import { MAX_PAGES } from '../config';
import { PageCard } from './PageCard';
import type { Page, ScanOptions, Script } from '../types';

interface Props {
  pages: Page[];
  options: ScanOptions;
  spreads: number;
  busy: boolean;
  onOptions: (patch: Partial<ScanOptions>) => void;
  onAdd: (files: FileList | File[]) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
  onSplit: (id: string) => void;
  onSplitAll: () => void;
  onScan: () => void;
}

const SCRIPTS: { value: Script; label: string }[] = [
  { value: 'auto', label: '自動判斷' },
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'zh-Hans', label: '簡體中文' },
  { value: 'en', label: 'English' },
];

export function LoadStage({
  pages, options, spreads, busy, onOptions, onAdd, onMove, onRemove,
  onRotate, onSplit, onSplitAll, onScan,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState(false);
  const [settings, setSettings] = useState(false);

  const scannable = pages.filter((p) => p.dataUrl).length;

  return (
    <main className="load">
      <section className="load__intro">
        <h1>把書拍下來，拿回可以讀、可以搜、可以帶走的版本。</h1>
        <p>
          一次放進 {MAX_PAGES} 張書頁照片。系統會辨識中英文內容、還原標題層級、
          把跨頁被切斷的段落接回去，最後輸出 Markdown、Word、PDF 或 EPUB。
        </p>
        <ol className="steps">
          <li><span>01</span> 放入照片，調整頁序</li>
          <li><span>02</span> 開始掃描，逐頁辨識</li>
          <li><span>03</span> 校對、匯出、生成摘要</li>
        </ol>

        <button className="disclose" onClick={() => setSettings((v) => !v)} aria-expanded={settings}>
          辨識設定 {settings ? '−' : '+'}
        </button>

        {settings && (
          <div className="settings">
            <label className="field">
              <span>書的文字</span>
              <select value={options.script} onChange={(e) => onOptions({ script: e.target.value as Script })}>
                {SCRIPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <em>指定後不會發生繁簡互轉。</em>
            </label>

            <label className="field">
              <span>專有名詞</span>
              <textarea
                rows={3}
                value={options.glossary}
                placeholder={'一行一個，例如：\n熊彼得\nSchumpeter\n創造性破壞'}
                onChange={(e) => onOptions({ glossary: e.target.value })}
              />
              <em>人名地名容易每頁寫法不同。先寫在這裡，全書就會一致。</em>
            </label>

            <label className="check">
              <input type="checkbox" checked={options.enhance} onChange={(e) => onOptions({ enhance: e.target.checked })} />
              <span>強化對比<em>泛黃紙張或光線不足時再開。之後匯入的照片才會套用。</em></span>
            </label>

            <label className="check">
              <input type="checkbox" checked={options.detectFrontMatter} onChange={(e) => onOptions({ detectFrontMatter: e.target.checked })} />
              <span>辨識封面與版權頁<em>自動抓出書名、作者、出版社、年份與 ISBN，並且不讓這些文字混進正文。</em></span>
            </label>

            <label className="check">
              <input type="checkbox" checked={options.normalizeHeadings} onChange={(e) => onOptions({ normalizeHeadings: e.target.checked })} />
              <span>自動修正標題層級<em>只拍了中間幾章、全書沒有 h1 時，把 h2 提升為第一層。</em></span>
            </label>
          </div>
        )}
      </section>

      <section
        className={'sheet' + (over ? ' sheet--over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onAdd(e.dataTransfer.files); }}
      >
        {pages.length === 0 ? (
          <div className="empty">
            <div className="frames" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="frame" key={i}><i /><i /><i /><i /></div>
              ))}
            </div>
            <p className="empty__lead">{busy ? '處理照片中…' : '把書頁照片拖到這裡'}</p>
            <p className="empty__sub">也可以直接貼上，或</p>
            <button className="btn btn--solid" onClick={() => input.current?.click()}>選擇檔案</button>
            <p className="empty__fine">JPG・PNG・WEBP　單批上限 {MAX_PAGES} 頁</p>
          </div>
        ) : (
          <>
            {spreads > 0 && (
              <div className="tipbar">
                <span>有 {spreads} 張看起來是攤開的跨頁。拆開後辨識率和段落判斷都會更好。</span>
                <button className="btn btn--ghost btn--sm" onClick={onSplitAll} disabled={busy}>全部拆成兩頁</button>
              </div>
            )}

            <div className="grid">
              {pages.map((page, i) => (
                <PageCard
                  key={page.id}
                  page={page}
                  index={i}
                  total={pages.length}
                  onMove={onMove}
                  onRemove={onRemove}
                  onRotate={onRotate}
                  onSplit={onSplit}
                  onDragStart={(from) => (dragFrom.current = from)}
                  onDropAt={(to) => {
                    if (dragFrom.current !== null) onMove(dragFrom.current, to);
                    dragFrom.current = null;
                  }}
                />
              ))}
              {pages.length < MAX_PAGES && (
                <button className="card card--add" onClick={() => input.current?.click()}>
                  <span>＋</span>再加幾頁
                </button>
              )}
            </div>

            <div className="sheet__foot">
              <p>頁序就是輸出順序。拖曳卡片可以調整。</p>
              <button className="btn btn--solid btn--lg" onClick={onScan} disabled={busy || !scannable}>
                掃描 {scannable} 頁
              </button>
            </div>
          </>
        )}

        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { onAdd(e.target.files ?? []); e.target.value = ''; }}
        />
      </section>
    </main>
  );
}
