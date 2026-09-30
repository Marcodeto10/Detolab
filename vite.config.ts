import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import {GET as fetchImage} from './api/fetch-image';
import {GET as etsyCallback} from './api/etsy/callback';
import {GET as etsySessionGet, POST as etsySessionPost} from './api/etsy/session';

type Handler = (request: Request) => Promise<Response>;

// En desarrollo, sirve las funciones de /api igual que Vercel en producción.
const devApi = (): Plugin => ({
  name: 'detolab-dev-api',
  configureServer(server) {
    // Las funciones leen sus claves de process.env, igual que en Vercel
    Object.assign(process.env, loadEnv('development', process.cwd(), ''));

    const routes: Record<string, {GET?: Handler; POST?: Handler}> = {
      '/api/fetch-image': {GET: fetchImage},
      '/api/etsy/session': {GET: etsySessionGet, POST: etsySessionPost},
      '/api/etsy/callback': {GET: etsyCallback},
    };

    for (const [route, handlers] of Object.entries(routes)) {
      server.middlewares.use(route, async (req, res) => {
        try {
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
          }
          const handler = handlers[(req.method ?? 'GET') === 'POST' ? 'POST' : 'GET'];
          if (!handler) {
            res.statusCode = 405;
            res.end(JSON.stringify({error: 'Method not allowed'}));
            return;
          }
          // Con el host real, las redirecciones vuelven al puerto correcto
          const host = req.headers.host ?? 'localhost';
          const url = `http://${host}${(req as any).originalUrl ?? req.url}`;
          const response = await handler(new Request(url, {headers}));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({error: 'Dev API error'}));
        }
      });
    }
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), devApi()],
    // NOTA DE SEGURIDAD:
    // Antes había un bloque `define` que inyectaba GEMINI_API_KEY / API_KEY
    // dentro del bundle del cliente. En un deploy publico eso deja la key
    // visible para cualquiera que abra el JS. Se eliminó a propósito.
    // La app ahora es BYOK: cada usuario pone su propia key y queda
    // únicamente en su localStorage.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
