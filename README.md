# DETOLAB

Estudio de generación y edición de imágenes sobre la Gemini API (Nano Banana).
Frontend puro: sin backend, sin base de datos, sin credenciales propias.

## Cómo funciona

Tres vistas: **Inicio**, **Estudio** y **Galería**.

El estudio junta todas las herramientas en un solo lugar (Crear, Editar,
Mockup, Producto y Lote). Cada herramienta tiene sus propias imágenes de
entrada, así no se mezclan entre sí. El resultado queda en el centro con:

- Descargar, "Editar esta imagen" y "Usar en…" para mandarlo a otra herramienta.
- Antes / después cuando hay una foto base.
- Variantes: de 1 a 4 imágenes por pedido.
- Cancelar de verdad (corta el pedido y no guarda el resultado).

Las imágenes se pueden subir, arrastrar, pegar con Cmd/Ctrl+V, traer desde un
link o elegir de la galería. Cmd/Ctrl+Enter genera.

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/lib/tools.ts` | Definición de cada herramienta: imágenes que pide, instrucciones fijas, carpeta |
| `src/lib/generate.ts` | Pedidos a Gemini, cancelación, mensajes de error en castellano |
| `src/lib/settings.ts` | Key, nombre y preferencias guardadas en el navegador |
| `src/lib/gallery.ts` | Galería en IndexedDB, export a .zip, deshacer borrado |
| `src/lib/galleryContext.tsx` | Estado compartido de la galería |
| `src/components/studio/` | Estudio: panel de controles, resultado, slots de imagen |
| `src/components/gallery/` | Galería, visor de imágenes y selector |
| `src/components/ui/` | Botones, avisos (toasts) y diálogos |

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
- Es por navegador, por dispositivo y por dirección: `localhost` y
  `detolab-five.vercel.app` tienen galerías separadas.
- Si borrás los datos del sitio, se va. Por eso está "Descargar todo (.zip)".

Las imágenes se guardan como Blob, no como base64. Un PNG en 4K pesa bastante
y base64 le suma ~33% encima.

La app pide `navigator.storage.persist()` al arrancar para que el navegador no
desaloje la galería cuando le falte espacio.

## Modelos

En la interfaz se eligen por calidad, no por nombre:

| Calidad     | Model ID                      |
|-------------|-------------------------------|
| Rápido      | `gemini-3.1-flash-lite-image` |
| Equilibrado | `gemini-3.1-flash-image`      |
| Máxima      | `gemini-3-pro-image`          |
| Texto (mejorar prompt) | `gemini-3.6-flash` |

Todo en `src/lib/models.ts`. Para actualizar un modelo se toca ese archivo solo.

## Formato "Igual a la foto"

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
