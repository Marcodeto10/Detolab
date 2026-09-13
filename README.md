# DETOLAB

AI image generation and editing studio built on the Gemini API (Nano Banana).
Pure frontend: no backend, no database, no credentials of its own.

## How it works

Three views: **Home**, **Studio** and **Gallery**.

The studio puts every tool in one place (Create, Edit, Mockup, Product and
Bulk). Each tool keeps its own input images, so they never mix. The result
stays in the center with:

- Download, "Edit this image" and "Use in…" to send it to another tool.
- Before / after when there's a base photo.
- Variations: 1 to 4 images per request.
- Real cancel (stops the request and doesn't save the result).

Images can be uploaded, dropped, pasted with Cmd/Ctrl+V, fetched from a link
or picked from the gallery. Cmd/Ctrl+Enter generates.

In **Create**, uploaded images are numbered (Image 1, Image 2…) so the prompt
can refer to them: "put the person from image 1 on the beach from image 2".

## Structure

| File | What it does |
|---|---|
| `src/lib/tools.ts` | Each tool: the images it asks for, default prompts, target folder |
| `src/lib/generate.ts` | Gemini requests, cancellation, readable error messages |
| `src/lib/settings.ts` | Key, name and preferences stored in the browser |
| `src/lib/models.ts` | Available models and their options |
| `src/lib/gallery.ts` | IndexedDB gallery, .zip export, undo delete |
| `src/lib/galleryContext.tsx` | Shared gallery state |
| `src/components/studio/` | Studio: controls panel, result, image slots |
| `src/components/gallery/` | Gallery, image viewer and picker |
| `src/components/ui/` | Buttons, toasts and dialogs |

## Security

The app is **BYOK** (bring your own key). It doesn't ship or require an API
key: each user enters their own and it stays in their browser's `localStorage`.

`vite.config.ts` **must not** get a `define` block that injects
`GEMINI_API_KEY` or `API_KEY` again. Vite replaces that at build time and the
key ends up in plain text inside the site's public JS.

```bash
npm run check:secrets   # run before every deploy
```

## Gallery

Lives in **IndexedDB**, in each user's browser. That means:

- Each person only sees their own images.
- Nothing is sent to any server.
- It's per browser, per device and per address: `localhost` and
  `detolab-five.vercel.app` have separate galleries.
- Clearing the site's data deletes it. That's why "Download all (.zip)" exists.

Images are stored as Blobs, not base64. A 4K PNG is heavy and base64 adds
~33% on top.

The app calls `navigator.storage.persist()` on startup so the browser doesn't
evict the gallery when it runs low on space.

## Models

| Model              | Model ID                      |
|--------------------|-------------------------------|
| Nano Banana Pro    | `gemini-3-pro-image`          |
| Nano Banana 2      | `gemini-3.1-flash-image`      |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` |
| Nano Banana (legacy) | `gemini-2.5-flash-image`    |
| Text (improve prompt) | `gemini-3.6-flash`         |

All in `src/lib/models.ts`. To update a model, only touch that file.

## "Original photo" aspect ratio

Measures the base image you upload, requests the generation in the closest
supported ratio, and crops the result to the exact pixels of the original. The
download has the same size as what you uploaded. See `src/lib/originalFormat.ts`.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Vercel picks up the included `vercel.json`. Build `vite build`, output `dist`.
No environment variables to configure.

With the repo connected to Vercel, every push to `main` deploys automatically:

```bash
npm run ship "what I changed"
```
