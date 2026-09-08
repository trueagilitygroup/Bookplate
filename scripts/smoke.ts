import { stitchPages, blocksToMarkdown, normalizeHeadingLevels } from '../src/lib/stitch';
import { mergeMetadata, normaliseMetadata, isBodyPage, effectiveKind, imprintLine, bylineLine } from '../src/lib/metadata';
import { mdToHtml, extractToc, countWords, splitChapters } from '../src/lib/markdown';
import { parseOcrJson } from '../src/lib/ocr';
import type { BookMetadata, Page, PageKind, PageResult } from '../src/types';

let fails = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) fails++;
  console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra && !cond ? ' → ' + extra : ''));
};

const mkPage = (r: Partial<PageResult>, kindOverride: PageKind | null = null): Page => ({
  id: Math.random().toString(36).slice(2), name: 'p', dataUrl: 'x', w: 1, h: 1,
  isSpread: false, kindOverride, status: 'done', error: null,
  result: {
    page_label: null, language: 'mixed', kind: 'body', metadata: null,
    starts_mid_sentence: false, ends_mid_sentence: false,
    blocks: [], truncated: false, usage: { input: 0, output: 0 }, ms: 0, ...r,
  } as PageResult,
});

const meta = (m: Partial<BookMetadata>): BookMetadata => normaliseMetadata(m);

/* 1. 中文跨頁縫合：不應該出現空格 */
const zh = stitchPages([
  mkPage({ blocks: [{ type: 'p', text: '創新的本質在於重新組合既有的' }], ends_mid_sentence: true }),
  mkPage({ blocks: [{ type: 'p', text: '生產要素。' }], starts_mid_sentence: true }),
]);
ok('中文跨頁接回同一段', zh.length === 1, JSON.stringify(zh));
ok('中文接合不插入空格', zh[0].text === '創新的本質在於重新組合既有的生產要素。', zh[0].text);

/* 2. 英文跨頁縫合：應該補一個空格 */
const en = stitchPages([
  mkPage({ blocks: [{ type: 'p', text: 'The essence of innovation is the' }], ends_mid_sentence: true }),
  mkPage({ blocks: [{ type: 'p', text: 'recombination of existing factors.' }], starts_mid_sentence: true }),
]);
ok('英文接合補一個空格', en[0].text === 'The essence of innovation is the recombination of existing factors.', en[0].text);

/* 3. 句子有結束就不該亂接 */
const noJoin = stitchPages([
  mkPage({ blocks: [{ type: 'p', text: '第一段結束。' }], ends_mid_sentence: false }),
  mkPage({ blocks: [{ type: 'p', text: '第二段開始。' }], starts_mid_sentence: false }),
]);
ok('完整句子不會被誤接', noJoin.length === 2);

/* 4. 標題不會被當成續行接走 */
const headingBoundary = stitchPages([
  mkPage({ blocks: [{ type: 'p', text: '前一頁沒講完的' }], ends_mid_sentence: true }),
  mkPage({ blocks: [{ type: 'h2', text: '第二節' }, { type: 'p', text: '新內容' }], starts_mid_sentence: true }),
]);
ok('標題不會被縫進段落', headingBoundary.length === 3 && headingBoundary[1].type === 'h2');

/* 5. 重複頁眉去除 */
const dedup = stitchPages([
  mkPage({ blocks: [{ type: 'caption', text: '第一章　導論' }, { type: 'p', text: 'A' }] }),
  mkPage({ blocks: [{ type: 'caption', text: '第一章　導論' }, { type: 'p', text: 'B' }] }),
]);
ok('連續重複的頁眉被移除', !(dedup.filter((b) => b.text === '第一章　導論').length > 1), JSON.stringify(dedup));

/* 6. 標題層級正規化 */
const promoted = normalizeHeadingLevels([
  { type: 'h2', text: '節一' }, { type: 'h3', text: '小節' }, { type: 'p', text: '內文' },
]);
ok('無 h1 時整體提升一級', promoted[0].type === 'h1' && promoted[1].type === 'h2');

/* 7. markdown 產出與往返 */
const md = blocksToMarkdown([
  { type: 'h1', text: '第一章' },
  { type: 'p', text: '正文段落。' },
  { type: 'list', text: '甲\n乙' },
  { type: 'quote', text: '引文' },
]);
ok('list 轉成項目符號', md.includes('- 甲') && md.includes('- 乙'));
ok('quote 轉成引言', md.includes('> 引文'));
const html = mdToHtml(md, { anchors: true });
ok('h1 帶錨點', /<h1 id="sec-0-/.test(html), html.slice(0, 80));
ok('產出 ul/li', html.includes('<ul><li>甲</li><li>乙</li></ul>'), html);
ok('目錄抓到標題', extractToc(md).length === 1);

/* 8. HTML 逸出：辨識結果若含尖括號不可破版 */
ok('HTML 逸出', mdToHtml('a <script>x</script> b').includes('&lt;script&gt;'));

/* 9. 字數：中英分別計算 */
ok('中英混排字數', countWords('創新 innovation 的本質') === 6, String(countWords('創新 innovation 的本質')));

/* 10. 章節切分 */
ok('依 h1 切章', splitChapters('# A\n\n內文\n\n# B\n\n內文', 'x').length === 2);
ok('無 h1 視為單章', splitChapters('只有內文', 'x').length === 1);

/* 11. JSON 救援：被截斷的回應 */
const truncated = '{"page_label":"12","blocks":[{"type":"h2","text":"標題"},{"type":"p","text":"完整段落"},{"type":"p","text":"被切斷的';
const salvaged = parseOcrJson(truncated);
ok('截斷回應救回完整區塊', salvaged.blocks.length === 2 && salvaged.truncated, JSON.stringify(salvaged.blocks));

/* 12. JSON 剝 fence */
const fenced = '```json\n{"blocks":[{"type":"p","text":"內文"}],"ends_mid_sentence":true}\n```';
ok('剝除 markdown fence', parseOcrJson(fenced).blocks[0].text === '內文');

/* 13. 未知 block type 被過濾 */
const dirty = '{"blocks":[{"type":"footnote","text":"x"},{"type":"p","text":"y"}]}';
ok('過濾未知區塊型別', parseOcrJson(dirty).blocks.length === 1);


/* 14. 每章都有的同名小節不能被當成頁眉刪掉 */
const repeatedSection = stitchPages([
  mkPage({ blocks: [{ type: 'h2', text: '本章摘要' }, { type: 'p', text: '第一章的摘要內容' }] }),
  mkPage({ blocks: [{ type: 'h2', text: '本章摘要' }, { type: 'p', text: '第二章的摘要內容' }] }),
]);
ok('同名小節標題保留', repeatedSection.filter((b) => b.text === '本章摘要').length === 2, JSON.stringify(repeatedSection));

/* 15. 頁面中間出現的同樣文字不算頁眉 */
const midPage = stitchPages([
  mkPage({ blocks: [{ type: 'p', text: '導論' }, { type: 'p', text: 'A' }] }),
  mkPage({ blocks: [{ type: 'p', text: 'B' }, { type: 'p', text: '導論' }, { type: 'p', text: 'C' }] }),
]);
ok('頁中同文字視為正文', midPage.some((b) => b.text === '導論'), JSON.stringify(midPage));

/* ---------------------------------------------- 封面與出版資訊 */

/* 16. 封面與版權頁不進正文 */
const withCover = [
  mkPage({ kind: 'cover', blocks: [{ type: 'h1', text: '創新的本質' }], metadata: meta({ title: '創新的本質', authors: ['熊彼得'] }) }),
  mkPage({ kind: 'copyright_page', blocks: [{ type: 'p', text: 'ISBN 978-957-32-1234-5' }], metadata: meta({ publisher: '遠流', year: '2019', isbn: '9789573212345' }) }),
  mkPage({ kind: 'body', blocks: [{ type: 'h1', text: '第一章' }, { type: 'p', text: '正文開始。' }] }),
];
const bodyOnly = stitchPages(withCover.filter(isBodyPage));
ok('封面與版權頁排除在正文外', bodyOnly.length === 2 && bodyOnly[0].text === '第一章', JSON.stringify(bodyOnly));
ok('ISBN 沒有混進正文', !bodyOnly.some((b) => b.text.includes('ISBN')));
ok('目錄頁算正文', isBodyPage(mkPage({ kind: 'toc' })));

/* 17. 欄位優先序：版權頁的出版資訊勝過封面 */
const merged = mergeMetadata([
  mkPage({ kind: 'cover', metadata: meta({ title: '創新的本質', authors: ['熊彼得'], publisher: '舊出版社', year: '1995' }) }),
  mkPage({ kind: 'copyright_page', metadata: meta({ publisher: '遠流出版', year: '2019', isbn: '978-957-32-1234-5', edition: '二版' }) }),
]);
ok('書名取自封面', merged.title === '創新的本質');
ok('出版社以版權頁為準', merged.publisher === '遠流出版', String(merged.publisher));
ok('年份以版權頁為準', merged.year === '2019', String(merged.year));
ok('ISBN 去除連字號', merged.isbn === '9789573212345', String(merged.isbn));

/* 18. 書名頁的書名勝過封面（封面常省略副標） */
const twoSources = mergeMetadata([
  mkPage({ kind: 'cover', metadata: meta({ title: '簡短書名' }) }),
  mkPage({ kind: 'title_page', metadata: meta({ title: '完整書名', subtitle: '一個副標題', translators: ['某某'] }) }),
]);
ok('書名頁優先於封面', twoSources.title === '完整書名' && twoSources.subtitle === '一個副標題');
ok('譯者被帶出來', twoSources.translators.length === 1);

/* 19. 角色標籤被剝除 */
const labelled = normaliseMetadata({ authors: ['作者：彼得‧杜拉克', '王小明 著'], translators: ['譯者：李四'] });
ok('剝除作者標籤', labelled.authors[0] === '彼得‧杜拉克', JSON.stringify(labelled.authors));
ok('剝除書名頁的「著」', labelled.authors[1] === '王小明', JSON.stringify(labelled.authors));
ok('剝除譯者標籤', labelled.translators[0] === '李四');

/* 20. 民國年若漏轉，四位數規則不會誤抓 */
ok('抓出西元年', normaliseMetadata({ year: '2019 年 3 月初版' }).year === '2019');
ok('非年份不誤判', normaliseMetadata({ year: '初版' }).year === null);
ok('無效 ISBN 丟棄', normaliseMetadata({ isbn: '12345' }).isbn === null);

/* 21. 手動覆蓋優先於模型判定 */
const overridden = mkPage({ kind: 'body' }, 'cover');
ok('手動指定角色優先', effectiveKind(overridden) === 'cover');
ok('被手動標為封面就排除', !isBodyPage(overridden));

/* 22. 書目單行 */
const line = meta({ publisher: '遠流出版', edition: '二版', year: '2019', isbn: '9789573212345', authors: ['熊彼得'], translators: ['王小明'] });
ok('版權單行組合正確', imprintLine(line) === '遠流出版・二版・2019 年・ISBN 9789573212345', imprintLine(line));
ok('作者譯者單行組合正確', bylineLine(line) === '熊彼得 著　王小明 譯', bylineLine(line));
ok('沒有資料時單行為空', imprintLine(normaliseMetadata({})) === '');

/* 23. 沒有封面時不應該憑空生出欄位 */
const noFront = mergeMetadata([mkPage({ kind: 'body', blocks: [{ type: 'p', text: 'x' }] })]);
ok('沒有前置頁就沒有出版資訊', noFront.title === null && noFront.authors.length === 0);

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
if (fails > 0) process.exit(1);
