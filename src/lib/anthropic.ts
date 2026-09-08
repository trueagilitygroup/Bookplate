import { MODEL } from '../config';
import type { Usage } from '../types';

export interface CallOptions {
  system?: string;
  maxTokens: number;
  tries?: number;
  signal?: AbortSignal;
}

export interface CallResult {
  text: string;
  usage: Usage;
  stopReason: string | null;
}

interface ContentBlock {
  type: string;
  text?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 呼叫 Anthropic Messages API，經過本機 /api/anthropic 代理。
 * 429 與 5xx 會指數退避重試；4xx 直接拋出，重試也不會變好。
 */
export async function callClaude(
  messages: unknown[],
  { system, maxTokens, tries = 4, signal }: CallOptions,
): Promise<CallResult> {
  let last: Error | null = null;

  for (let attempt = 0; attempt <= tries; attempt++) {
    if (signal?.aborted) throw new Error('已取消');
    try {
      const body: Record<string, unknown> = { model: MODEL, max_tokens: maxTokens, messages };
      if (system) body.system = system;

      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      const raw = await res.text();

      if (res.status === 429 || res.status >= 500) {
        throw new Error(res.status === 429 ? '請求太頻繁' : '服務暫時忙碌 (' + res.status + ')');
      }
      if (!res.ok) {
        let msg = '請求失敗 (HTTP ' + res.status + ')';
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string } };
          if (parsed.error?.message) msg = parsed.error.message;
        } catch {
          /* 保留預設訊息 */
        }
        throw Object.assign(new Error(msg), { fatal: true });
      }

      const data = JSON.parse(raw) as {
        content?: ContentBlock[];
        usage?: { input_tokens?: number; output_tokens?: number };
        stop_reason?: string;
      };

      return {
        text: (data.content ?? [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('\n'),
        usage: {
          input: data.usage?.input_tokens ?? 0,
          output: data.usage?.output_tokens ?? 0,
        },
        stopReason: data.stop_reason ?? null,
      };
    } catch (err) {
      last = err as Error;
      if ((err as { fatal?: boolean }).fatal || signal?.aborted) throw err;
      if (attempt < tries) await sleep(700 * 2 ** attempt + Math.random() * 400);
    }
  }

  throw last ?? new Error('無法連線');
}
