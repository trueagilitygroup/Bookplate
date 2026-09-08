import type { Block, Page } from '../types';

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/**
 * 找出頁眉／頁尾。
 * OCR prompt 已經要求把頁眉放進 page_label，這是模型漏判時的安全網。
 *
 * 規則刻意保守：只看每頁的第一個和最後一個區塊、只處理 caption 與 p、
 * 長度 30 字以內、且在兩頁以上重複出現。
 * 標題型別一律不動 —— 很多書每章都有「本章摘要」這種同名小節，
 * 誤刪真標題的代價遠高於留下幾行頁眉。
 */
function findRunningHeads(pages: Page[]): Set<string> {
  const tally = new Map<string, number>();

  for (const page of pages) {
    const blocks = page.result?.blocks ?? [];
    if (blocks.length === 0) continue;
    const edges = blocks.length === 1 ? [blocks[0]] : [blocks[0], blocks[blocks.length - 1]];
    const seenOnThisPage = new Set<string>();
    for (const block of edges) {
      if (block.type !== 'caption' && block.type !== 'p') continue;
      const text = block.text.trim();
      if (!text || text.length > 30) continue;
      if (seenOnThisPage.has(text)) continue;
      seenOnThisPage.add(text);
      tally.set(text, (tally.get(text) ?? 0) + 1);
    }
  }

  const heads = new Set<string>();
  tally.forEach((count, text) => {
    if (count >= 2) heads.add(text);
  });
  return heads;
}

/**
 * 跨頁縫合。刻意不用 LLM：純邏輯，零成本、零延遲、結果可重現。
 * 前一頁句子沒結束 + 這一頁從半句開始 → 把兩個段落接回同一段。
 */
export function stitchPages(pages: Page[]): Block[] {
  const runningHeads = findRunningHeads(pages);
  const out: Block[] = [];
  let prevEndsMid = false;

  for (const page of pages) {
    const result = page.result;
    if (!result || !result.blocks.length) continue;

    const blocks = result.blocks
      .map((b) => ({ ...b, text: b.text.trim() }))
      .filter((b, i, arr) => {
        if (!b.text) return false;
        // 只在頁首／頁尾的位置剔除頁眉，中間出現同樣文字的視為正文
        const atEdge = i === 0 || i === arr.length - 1;
        return !(atEdge && (b.type === 'caption' || b.type === 'p') && runningHeads.has(b.text));
      });

    if (!blocks.length) continue;

    const prev = out[out.length - 1];
    const canJoin =
      prev && prev.type === 'p' && blocks[0].type === 'p' && prevEndsMid && result.starts_mid_sentence;

    if (canJoin) {
      const tail = prev.text.slice(-1);
      const head = blocks[0].text.slice(0, 1);
      const glue = CJK.test(tail) || CJK.test(head) ? '' : ' ';
      prev.text = prev.text.replace(/\s+$/, '') + glue + blocks[0].text.replace(/^\s+/, '');
      blocks.shift();
    }

    for (const block of blocks) {
      const last = out[out.length - 1];
      if (last && last.type === block.type && last.text === block.text) continue;
      out.push(block);
    }

    prevEndsMid = result.ends_mid_sentence;
  }

  return out;
}

/**
 * 只拍了中間幾章時，全書可能只有 h2 / h3 沒有 h1，
 * 目錄會整層空掉。整體往上提一級。
 */
export function normalizeHeadingLevels(blocks: Block[]): Block[] {
  const hasH1 = blocks.some((b) => b.type === 'h1');
  const hasH2 = blocks.some((b) => b.type === 'h2');
  if (hasH1 || !hasH2) return blocks;
  return blocks.map((b) => {
    if (b.type === 'h2') return { ...b, type: 'h1' as const };
    if (b.type === 'h3') return { ...b, type: 'h2' as const };
    return b;
  });
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      const t = b.text.trim();
      switch (b.type) {
        case 'h1':
          return '# ' + t;
        case 'h2':
          return '## ' + t;
        case 'h3':
          return '### ' + t;
        case 'quote':
          return t.split('\n').map((l) => '> ' + l).join('\n');
        case 'list':
          return t
            .split('\n')
            .filter(Boolean)
            .map((l) => '- ' + l.replace(/^[-•·*]\s*/, ''))
            .join('\n');
        case 'caption':
          return '*' + t + '*';
        default:
          return t;
      }
    })
    .join('\n\n');
}
