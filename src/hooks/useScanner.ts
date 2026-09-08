import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_PAGES, POOL, USD_PER_MTOK_IN, USD_PER_MTOK_OUT } from '../config';
import { normalizeImage, splitSpread, rotate90 } from '../lib/image';
import { ocrPage } from '../lib/ocr';
import { blocksToMarkdown, normalizeHeadingLevels, stitchPages } from '../lib/stitch';
import { mergeMetadata, isBodyPage, effectiveKind } from '../lib/metadata';
import type { BookMetadata, Page, PageKind, ScanOptions, Stage } from '../types';

const newId = () => Math.random().toString(36).slice(2, 10);
const SPREAD_RATIO = 1.15;

export const DEFAULT_OPTIONS: ScanOptions = {
  glossary: '',
  script: 'auto',
  enhance: false,
  normalizeHeadings: true,
  detectFrontMatter: true,
};

export function useScanner() {
  const [stage, setStage] = useState<Stage>('load');
  const [pages, setPages] = useState<Page[]>([]);
  const [options, setOptions] = useState<ScanOptions>(DEFAULT_OPTIONS);
  const [markdown, setMarkdown] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // 非同步流程需要讀到「當下」的頁面清單。在 state updater 裡做副作用
  // 在 StrictMode 會被呼叫兩次，所以改用 ref 鏡射。
  const pagesRef = useRef<Page[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  /* --------------------------------------------------------------- 匯入 */
  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList).filter(
        (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name),
      );
      if (!incoming.length) {
        setNotice('那些檔案不是圖片。支援 JPG、PNG、WEBP。');
        return;
      }

      const room = MAX_PAGES - pagesRef.current.length;
      if (room <= 0) {
        setNotice('一次最多 ' + MAX_PAGES + ' 頁。先把這批處理完再開下一批。');
        return;
      }

      setNotice(incoming.length > room ? '已加入 ' + room + ' 頁，達到單批上限。' : null);
      setBusy(true);

      const prepared: Page[] = [];
      for (const file of incoming.slice(0, room)) {
        try {
          const img = await normalizeImage(file, options.enhance);
          prepared.push({
            id: newId(),
            name: file.name,
            dataUrl: img.dataUrl,
            w: img.w,
            h: img.h,
            isSpread: img.w / img.h > SPREAD_RATIO,
            kindOverride: null,
            status: 'ready',
            result: null,
            error: null,
          });
        } catch {
          prepared.push({
            id: newId(),
            name: file.name,
            dataUrl: null,
            w: 0,
            h: 0,
            isSpread: false,
            kindOverride: null,
            status: 'failed',
            result: null,
            error: 'HEIC 之類的格式瀏覽器讀不了，請先轉成 JPG',
          });
        }
      }

      setPages((prev) => [...prev, ...prepared].slice(0, MAX_PAGES));
      setBusy(false);
    },
    [options.enhance],
  );

  const removePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const movePage = useCallback((from: number, to: number) => {
    setPages((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  /** 模型判錯時的手動覆蓋。設回 null 就交還給模型的判定。 */
  const setPageKind = useCallback((id: string, kind: PageKind | null) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, kindOverride: kind } : p)));
  }, []);

  const rotatePage = useCallback(async (id: string) => {
    const target = pagesRef.current.find((p) => p.id === id);
    if (!target?.dataUrl) return;
    const rotated = await rotate90(target.dataUrl);
    setPages((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, dataUrl: rotated.dataUrl, w: rotated.w, h: rotated.h, isSpread: rotated.w / rotated.h > SPREAD_RATIO }
          : p,
      ),
    );
  }, []);

  /** 攤開的跨頁照片拆成左右兩頁，OCR 的辨識率與段落判斷都會明顯變好。 */
  const splitMany = useCallback(async (ids: string[]) => {
    const targets = pagesRef.current.filter((p) => ids.includes(p.id) && p.dataUrl);
    if (!targets.length) return;
    setBusy(true);

    const halvesById = new Map<string, Page[]>();
    for (const target of targets) {
      try {
        const [left, right] = await splitSpread(target.dataUrl!);
        const base = target.name.replace(/\.[^.]+$/, '');
        halvesById.set(
          target.id,
          [left, right].map((half, i) => ({
            id: newId(),
            name: base + (i === 0 ? '（左）' : '（右）'),
            dataUrl: half.dataUrl,
            w: half.w,
            h: half.h,
            isSpread: false,
            kindOverride: null,
            status: 'ready' as const,
            result: null,
            error: null,
          })),
        );
      } catch {
        /* 拆不開就維持原樣 */
      }
    }

    // 全部算完再一次更新，避免中途讀到過期的清單
    setPages((prev) =>
      prev.flatMap((page) => halvesById.get(page.id) ?? [page]).slice(0, MAX_PAGES),
    );
    setBusy(false);
  }, []);

  const splitPage = useCallback((id: string) => splitMany([id]), [splitMany]);

  const splitAllSpreads = useCallback(
    () => splitMany(pagesRef.current.filter((p) => p.isSpread && p.dataUrl).map((p) => p.id)),
    [splitMany],
  );

  /* --------------------------------------------------------------- 掃描 */
  const scanPage = useCallback(
    async (page: Page, signal: AbortSignal) => {
      setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, status: 'scanning', error: null } : p)));
      try {
        const result = await ocrPage(page.dataUrl!, options, signal);
        setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, status: 'done', result } : p)));
      } catch (err) {
        const message = (err as Error).message || '辨識失敗';
        setPages((prev) =>
          prev.map((p) => (p.id === page.id ? { ...p, status: 'failed', error: message } : p)),
        );
      }
    },
    [options],
  );

  const runScan = useCallback(
    async (only?: string[]) => {
      const queue = pagesRef.current.filter((p) => p.dataUrl && (!only || only.includes(p.id)));
      if (!queue.length) {
        setNotice('沒有可以掃描的頁面。');
        return;
      }
      const queued = new Set(queue.map((p) => p.id));
      setPages((prev) => prev.map((p) => (queued.has(p.id) ? { ...p, status: 'queued', error: null } : p)));

      setStage('scan');
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);

      const pending = [...queue];
      const worker = async () => {
        while (pending.length) {
          if (controller.signal.aborted) return;
          const page = pending.shift()!;
          await scanPage(page, controller.signal);
        }
      };
      await Promise.all(Array.from({ length: Math.min(POOL, pending.length) }, worker));
      setBusy(false);
    },
    [scanPage],
  );

  const retryFailed = useCallback(async () => {
    const ids = pagesRef.current.filter((p) => p.status === 'failed' && p.dataUrl).map((p) => p.id);
    if (ids.length) await runScan(ids);
  }, [runScan]);

  const cancelScan = useCallback(() => {
    abort.current?.abort();
    setBusy(false);
    setPages((prev) =>
      prev.map((p) => (p.status === 'queued' || p.status === 'scanning' ? { ...p, status: 'ready' } : p)),
    );
  }, []);

  /* --------------------------------------------------------------- 組稿 */
  const compose = useCallback(() => {
    // 封面、書名頁、版權頁的文字不進正文，否則 ISBN 會出現在第一章開頭
    let blocks = stitchPages(pages.filter(isBodyPage));
    if (options.normalizeHeadings) blocks = normalizeHeadingLevels(blocks);
    setMarkdown(blocksToMarkdown(blocks));
    setStage('read');
  }, [pages, options.normalizeHeadings]);

  const reset = useCallback(() => {
    abort.current?.abort();
    setPages([]);
    setMarkdown('');
    setNotice(null);
    setStage('load');
  }, []);

  /* --------------------------------------------------------------- 統計 */
  const metadata: BookMetadata = useMemo(() => mergeMetadata(pages), [pages]);

  const stats = useMemo(() => {
    const done = pages.filter((p) => p.status === 'done').length;
    const failed = pages.filter((p) => p.status === 'failed').length;
    const pending = pages.filter((p) => p.status === 'queued' || p.status === 'scanning').length;
    const spreads = pages.filter((p) => p.isSpread).length;
    const usage = pages.reduce(
      (acc, p) => ({
        input: acc.input + (p.result?.usage.input ?? 0),
        output: acc.output + (p.result?.usage.output ?? 0),
      }),
      { input: 0, output: 0 },
    );
    const cost = (usage.input / 1e6) * USD_PER_MTOK_IN + (usage.output / 1e6) * USD_PER_MTOK_OUT;
    const truncated = pages.filter((p) => p.result?.truncated).length;
    const frontMatter = pages.filter((p) => p.status === 'done' && effectiveKind(p) !== 'body' && effectiveKind(p) !== 'toc').length;
    const bodyPages = pages.filter((p) => p.status === 'done' && isBodyPage(p)).length;
    return { done, failed, pending, spreads, usage, cost, truncated, frontMatter, bodyPages, total: pages.length };
  }, [pages]);

  return {
    stage, setStage,
    pages, setPages,
    options, setOptions,
    markdown, setMarkdown,
    notice, setNotice,
    busy, stats, metadata,
    addFiles, removePage, movePage, rotatePage, splitPage, splitAllSpreads, setPageKind,
    runScan, retryFailed, cancelScan, compose, reset,
  };
}
