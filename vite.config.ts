import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {GET as fetchImage} from './api/fetch-image';

// En desarrollo, sirve la función /api/fetch-image igual que Vercel en producción.
const devApi = (): Plugin => ({
  name: 'detolab-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/fetch-image', async (req, res) => {
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(key, value);
        }
        const url = `http://localhost${(req as any).originalUrl ?? req.url}`;
        const response = await fetchImage(new Request(url, {headers}));
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.statusCode = 500;
        res.end(JSON.stringify({error: 'Dev API error'}));
      }
    });
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
