import { exportMarkdown, exportPdf, exportPrintableHtml, exportWord, type BookMeta } from '../lib/exporters';
import { exportEpub } from '../lib/epub';

interface Props {
  meta: BookMeta;
  hasSummary: boolean;
  includeSummary: boolean;
  onIncludeSummary: (v: boolean) => void;
  onFail: (msg: string) => void;
}

export function ExportPanel({ meta, hasSummary, includeSummary, onIncludeSummary, onFail }: Props) {
  const payload: BookMeta = { ...meta, includeSummary };

  return (
    <section className="panel">
      <h3>匯出</h3>
      <div className="exports">
        <button className="ex" onClick={() => exportMarkdown(payload)}>
          <b>Markdown</b><span>.md — 給 Obsidian、Notion</span>
        </button>
        <button className="ex" onClick={() => void exportEpub(payload).catch(() => onFail('EPUB 產生失敗。'))}>
          <b>EPUB</b><span>.epub — 可在電子書閱讀器重新排版</span>
        </button>
        <button className="ex" onClick={() => exportWord(payload)}>
          <b>Word</b><span>.doc — 可繼續編輯</span>
        </button>
        <button
          className="ex"
          onClick={() => exportPdf(payload, () => onFail('瀏覽器擋下了列印視窗。改用下面的「列印版網頁」，開啟後按 Ctrl/Cmd+P 存成 PDF。'))}
        >
          <b>PDF</b><span>透過系統列印，可選紙張與邊界</span>
        </button>
        <button className="ex ex--alt" onClick={() => exportPrintableHtml(payload)}>
          <b>列印版網頁</b><span>.html — PDF 的備援方案</span>
        </button>
      </div>

      {hasSummary && (
        <label className="check check--tight">
          <input type="checkbox" checked={includeSummary} onChange={(e) => onIncludeSummary(e.target.checked)} />
          <span>把摘要放在檔案最前面</span>
        </label>
      )}
    </section>
  );
}
