import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
