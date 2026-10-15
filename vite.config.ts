import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { seo } from './seo/plugin';

type ApiModule = { default: { fetch(request: Request): Promise<Response> } };

function vercelApi(): Plugin {
  const middleware =
    (load: (file: string) => Promise<ApiModule>): Connect.NextHandleFunction =>
    async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const name = url.pathname.match(/^\/api\/([\w-]+)$/)?.[1];
      const file = name && path.resolve(import.meta.dirname, 'api', `${name}.ts`);
      if (!file || !fs.existsSync(file)) return next();
      try {
        const response = await (await load(file)).default.fetch(new Request(url));
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
    };
  return {
    name: 'vercel-api',
    configureServer: (server) => void server.middlewares.use(middleware((f) => server.ssrLoadModule(f) as Promise<ApiModule>)),
    configurePreviewServer: (server) => void server.middlewares.use(middleware((f) => import(pathToFileURL(f).href) as Promise<ApiModule>)),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApi(), seo()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/](maplibre-gl|@maplibre)[\\/]/, priority: 20 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
