// Función del servidor (Vercel): trae una imagen desde un link.
//
// El navegador no puede bajar imágenes de muchos sitios (bloquean CORS), así
// que la pedimos desde acá. Si el link es una página (Pinterest, un artículo),
// buscamos su imagen principal (og:image).
//
// Seguridad:
// - Solo usuarios logueados (se verifica el token de Supabase).
// - Solo http/https y nunca direcciones internas, tampoco vía redirecciones.
// - Límite de tamaño y de tiempo.

// Mismos datos públicos que src/lib/config.ts. Van copiados porque en Vercel
// la función corre sola y no puede importar archivos de la app.
const SUPABASE_URL = 'https://bkqhedahpcoywvdguyry.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ox8TG0tsH0q81K9aRHLTIQ_7jVmITQ6';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

class ProxyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const isPrivateHost = (hostname: string) => {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(0|10|127)\.\d+\.\d+\.\d+$/.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h)) return true;
  const private172 = h.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(h)) return true;
  if (h.includes(':') && (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:'))) return true;
  return false;
};

const verifyUser = async (request: Request) => {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: auth },
  });
  return res.ok;
};

/** fetch que revisa cada salto de redirección para no terminar en una dirección interna. */
const safeFetch = async (rawUrl: string, accept: string): Promise<{ res: Response; url: string }> => {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = new URL(current);
    if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) {
      throw new ProxyError(400, "That link isn't allowed.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { 'User-Agent': BROWSER_UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    return { res, url: url.toString() };
  }
  throw new ProxyError(502, 'That link redirects too many times.');
};

const readLimited = async (res: Response, max: number, tooBig: string): Promise<Uint8Array> => {
  if (Number(res.headers.get('content-length') || 0) > max) throw new ProxyError(413, tooBig);
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new ProxyError(413, tooBig);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

/** Imagen principal de una página: og:image, twitter:image o image_src. */
const findPageImage = (html: string, base: string): string | null => {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image:secure_url|og:image|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image:secure_url|og:image|twitter:image(?::src)?)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    try {
      return new URL(match[1].replace(/&amp;/g, '&'), base).toString();
    } catch {
      // probamos el siguiente
    }
  }
  return null;
};

/** Algunos servidores no dicen el tipo: lo deducimos por los primeros bytes. */
const sniffImageType = (b: Uint8Array): string | null => {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 12))) return 'image/avif';
  return null;
};

const contentType = (res: Response) => (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

/** Trae la imagen de un link (o de la página a la que apunta). */
export const fetchRemoteImage = async (link: string): Promise<{ bytes: Uint8Array; type: string }> => {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    throw new ProxyError(400, "That doesn't look like a valid link.");
  }

  let { res, url } = await safeFetch(parsed.toString(), 'image/avif,image/webp,image/*,text/html;q=0.8,*/*;q=0.5');
  if (!res.ok) throw new ProxyError(502, `The site answered with an error (${res.status}).`);

  if (contentType(res).startsWith('text/html')) {
    const html = new TextDecoder().decode(await readLimited(res, MAX_PAGE_BYTES, 'That page is too large.'));
    const image = findPageImage(html, url);
    if (!image) throw new ProxyError(422, "That page doesn't have an image we can use. Try the direct image link.");
    ({ res, url } = await safeFetch(image, 'image/avif,image/webp,image/*,*/*;q=0.5'));
    if (!res.ok) throw new ProxyError(502, `The site answered with an error (${res.status}).`);
  }

  const bytes = await readLimited(res, MAX_IMAGE_BYTES, 'That image is too large (max 25 MB).');
  const declared = contentType(res);
  const type = declared.startsWith('image/') ? declared : sniffImageType(bytes);
  if (!type) throw new ProxyError(415, "That link isn't an image.");
  return { bytes, type };
};

export async function GET(request: Request): Promise<Response> {
  try {
    if (!(await verifyUser(request))) return jsonError(401, 'Sign in again to use image links.');
    const link = new URL(request.url).searchParams.get('url');
    if (!link) return jsonError(400, 'Missing link.');

    const { bytes, type } = await fetchRemoteImage(link);
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    if (err instanceof ProxyError) return jsonError(err.status, err.message);
    if (err instanceof Error && err.name === 'AbortError') return jsonError(504, 'The site took too long to respond.');
    return jsonError(502, "Couldn't reach that site. Check the link and try again.");
  }
}
