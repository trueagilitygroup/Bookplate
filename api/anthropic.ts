/**
 * Vercel Serverless Function（選用）。
 * 只有要把這個工具部署到網路上時才需要，本機 npm run dev 是走 vite.config.ts 裡的代理。
 * 部署前記得在 Vercel 專案設定裡加上 ANTHROPIC_API_KEY。
 */

interface Req {
  method?: string;
  body?: unknown;
}

interface Res {
  status: (code: number) => Res;
  setHeader: (key: string, value: string) => void;
  send: (body: string) => void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).send(JSON.stringify({ error: { message: 'Method not allowed' } }));
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  res.setHeader('content-type', 'application/json');

  if (!apiKey) {
    res.status(500).send(JSON.stringify({ error: { message: '伺服器未設定 ANTHROPIC_API_KEY。' } }));
    return;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    res.status(upstream.status).send(await upstream.text());
  } catch (err) {
    res.status(502).send(JSON.stringify({ error: { message: (err as Error).message } }));
  }
}
