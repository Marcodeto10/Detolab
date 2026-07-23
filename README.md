# DETOLAB

Studio de generación y edición de imágenes sobre la Gemini API (Nano Banana).
Frontend puro: sin backend, sin base de datos, sin credenciales propias.

## Seguridad

La app es **BYOK** (bring your own key). No incluye ni requiere una API key:
cada usuario ingresa la suya y queda en el `localStorage` de su navegador.

`vite.config.ts` **no debe** volver a tener un bloque `define` que inyecte
`GEMINI_API_KEY` o `API_KEY`. Vite reemplaza eso en tiempo de build y la key
termina en texto plano dentro del JS público del sitio.

```bash
npm run check:secrets   # correr antes de cada deploy
```

## Galería

Vive en **IndexedDB**, en el navegador de cada usuario. Consecuencias:

- Cada persona ve solamente sus propias imágenes.
- No viaja nada a ningún servidor.
- Es por navegador y por dispositivo: no sincroniza entre tu compu y tu celular.
- Si borrás los datos del sitio, se va. Por eso está el botón "Exportar todo".

Las imágenes se guardan como Blob, no como base64. Un PNG en 4K pesa bastante
y base64 le suma ~33% encima.

La app pide `navigator.storage.persist()` al arrancar para que el navegador no
desaloje la galería cuando le falte espacio.

## Modelos

| Engine             | Model ID                      |
|--------------------|-------------------------------|
| Pro                | `gemini-3-pro-image`          |
| Nano Banana 2      | `gemini-3.1-flash-image`      |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` |
| Legacy             | `gemini-2.5-flash-image`      |
| Texto (improver)   | `gemini-3.6-flash`            |

Todo en `src/lib/models.ts`. Para actualizar un modelo se toca ese archivo solo.

## Formato ORIGINAL FOTO

Mide la imagen base que subís, pide la generación en el ratio soportado más
cercano, y recorta el resultado a los píxeles exactos del original. Lo que baja
tiene el mismo tamaño que lo que subiste. Ver `src/lib/originalFormat.ts`.

## Correr local

```bash
npm install
npm run dev
```

## Deploy

Vercel detecta el `vercel.json` incluido. Build `vite build`, output `dist`.
No hay variables de entorno que configurar.

Con el repo conectado a Vercel, cada push a `main` deploya solo:

```bash
npm run ship "lo que cambié"
```
