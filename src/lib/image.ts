import { MAX_EDGE, JPEG_QUALITY } from '../config';

export interface Normalized {
  dataUrl: string;
  w: number;
  h: number;
}

async function toBitmap(src: File | string): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof src !== 'string') {
    try {
      return await createImageBitmap(src);
    } catch {
      /* 某些格式 createImageBitmap 不支援，退回 <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      reject(new Error('瀏覽器讀不了這個檔案'));
    };
    img.src = url;
  });
}

function dims(b: HTMLImageElement | ImageBitmap) {
  const w = 'naturalWidth' in b ? b.naturalWidth : b.width;
  const h = 'naturalHeight' in b ? b.naturalHeight : b.height;
  return { w, h };
}

function draw(
  b: HTMLImageElement | ImageBitmap,
  sx: number, sy: number, sw: number, sh: number,
  dw: number, dh: number,
  enhance: boolean,
): string {
  const c = document.createElement('canvas');
  c.width = dw;
  c.height = dh;
  const ctx = c.getContext('2d')!;
  // 灰階 + 拉對比，對泛黃紙張與偏暗照片的辨識率有明顯幫助
  if (enhance) ctx.filter = 'grayscale(1) contrast(1.28) brightness(1.06)';
  ctx.drawImage(b as CanvasImageSource, sx, sy, sw, sh, 0, 0, dw, dh);
  return c.toDataURL('image/jpeg', JPEG_QUALITY);
}

/** 縮到長邊 MAX_EDGE 並重新編碼，控制 token 成本與上傳延遲。 */
export async function normalizeImage(file: File, enhance: boolean): Promise<Normalized> {
  const bmp = await toBitmap(file);
  const { w: w0, h: h0 } = dims(bmp);
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const dataUrl = draw(bmp, 0, 0, w0, h0, w, h, enhance);
  if ('close' in bmp) bmp.close();
  return { dataUrl, w, h };
}

/** 把一張攤開的跨頁照片切成左右兩張。 */
export async function splitSpread(dataUrl: string): Promise<[Normalized, Normalized]> {
  const bmp = await toBitmap(dataUrl);
  const { w: w0, h: h0 } = dims(bmp);
  const half = Math.floor(w0 / 2);
  const scale = Math.min(1, MAX_EDGE / Math.max(half, h0));
  const w = Math.max(1, Math.round(half * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const left = draw(bmp, 0, 0, half, h0, w, h, false);
  const right = draw(bmp, half, 0, w0 - half, h0, w, h, false);
  if ('close' in bmp) bmp.close();
  return [
    { dataUrl: left, w, h },
    { dataUrl: right, w, h },
  ];
}

/** 順時針旋轉 90 度。手機直拍書本常見的方向問題。 */
export async function rotate90(dataUrl: string): Promise<Normalized> {
  const bmp = await toBitmap(dataUrl);
  const { w: w0, h: h0 } = dims(bmp);
  const c = document.createElement('canvas');
  c.width = h0;
  c.height = w0;
  const ctx = c.getContext('2d')!;
  ctx.translate(h0 / 2, w0 / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bmp as CanvasImageSource, -w0 / 2, -h0 / 2);
  if ('close' in bmp) bmp.close();
  return { dataUrl: c.toDataURL('image/jpeg', JPEG_QUALITY), w: h0, h: w0 };
}

export function stripDataUrl(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
