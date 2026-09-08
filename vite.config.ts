import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';

/**
 * 開發用的 Anthropic 代理。
 * API key 只存在 Node 端，永遠不會進入前端 bundle。
 */
function anthropicProxy(apiKey: string): Plugin {
  return {
    name: 'anthropic-proxy',
    configureServer(server) {
      server.middlewares.use('/api/anthropic', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader('content-type', 'application/json');
        if (!apiKey) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: { message: '找不到 ANTHROPIC_API_KEY。請複製 .env.example 成 .env 並填入金鑰，然後重啟 npm run dev。' } }));
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
          const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: Buffer.concat(chunks),
          });
          res.statusCode = upstream.status;
          res.end(await upstream.text());
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: { message: '無法連線到 Anthropic：' + (err as Error).message } }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), anthropicProxy(env.ANTHROPIC_API_KEY)],
    server: { port: 5173 },
  };
});
