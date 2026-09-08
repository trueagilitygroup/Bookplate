/** 全域設定。要調整成本 / 品質的旋鈕都在這裡。 */

export const MODEL = 'claude-sonnet-4-6';

/** 單頁 OCR 的輸出上限。中文滿版書頁約需 2000–4000 tokens，8000 留足餘裕。 */
export const OCR_MAX_TOKENS = 8000;
export const SUMMARY_MAX_TOKENS = 4000;

/** 單批頁數上限。自用可調高，但併發與記憶體會隨之上升。 */
export const MAX_PAGES = 25;

/** 同時進行的 OCR 請求數。太高容易撞 rate limit。 */
export const POOL = 3;

/** 影像長邊上限。1568px 是 vision token 的甜蜜點，再大不會提升辨識率。 */
export const MAX_EDGE = 1568;

/** JPEG 品質。0.85 對文字辨識足夠，再高只是浪費頻寬。 */
export const JPEG_QUALITY = 0.85;

/**
 * 用來估算花費。價格會變動，請自行對照
 * https://claude.com/pricing 更新這兩個數字（每百萬 token 的美元價）。
 */
export const USD_PER_MTOK_IN = 3;
export const USD_PER_MTOK_OUT = 15;

/** 摘要 map-reduce 的分段長度（字元）。 */
export const SUMMARY_CHUNK = 12000;
