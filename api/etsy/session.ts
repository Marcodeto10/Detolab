// Función del servidor (Vercel): conexión con la tienda de Etsy.
//
// Acciones: ?action=connect | status | disconnect.
// La clave de Etsy y los tokens viven solo acá: el navegador nunca los ve.
// El retorno del login de Etsy está aparte, en api/etsy/callback.ts, porque
// Etsy exige una URL fija y registrada.
//
// En Vercel cada función corre sola y no puede importar archivos de la app,
// así que los datos públicos y los ayudantes van copiados en los dos archivos.

const SUPABASE_URL = 'https://bkqhedahpcoywvdguyry.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ox8TG0tsH0q81K9aRHLTIQ_7jVmITQ6';

const ETSY_AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const ETSY_API = 'https://api.etsy.com/v3/application';
/** Leer y escribir anuncios, y leer los datos de la tienda. */
const ETSY_SCOPES = 'listings_r listings_w shops_r';
const DEFAULT_REDIRECT_URI = 'https://detolab-five.vercel.app/api/etsy/callback';
/** Renovamos el token si le queda menos de un minuto. */
const RENEW_MARGIN_MS = 60_000;

const env = (name: string) => process.env[name]?.trim() ?? '';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Qué falta configurar en Vercel. */
const missingSetup = () =>
  ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'ETSY_OWNER_USER_ID'].filter((name) => !env(name));

/** Quién está pidiendo esto, según el token de Supabase. */
const userIdFrom = async (request: Request): Promise<string | null> => {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: auth },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user.id ?? null;
};

/** Acceso a la base como servidor (solo así se leen estas tablas). */
const db = (path: string, init: RequestInit = {}) => {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  // La clave vieja (service_role) es un JWT y va también como Bearer.
  // Las nuevas (sb_secret_...) no lo son: van solo en apikey.
  if (key.startsWith('ey')) headers.Authorization = `Bearer ${key}`;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
};

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randomString = (bytes = 48) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

const challengeOf = async (verifier: string) =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

interface Account {
  etsy_user_id: string | null;
  shop_id: string | null;
  shop_name: string | null;
  scopes: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

const accountOf = async (userId: string): Promise<Account | null> => {
  const res = await db(`etsy_accounts?user_id=eq.${userId}&select=*`);
  // El detalle sirve para ver si la clave del servidor está bien cargada
  if (!res.ok) throw new Error(`Supabase answered ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const rows = (await res.json()) as Account[];
  return rows[0] ?? null;
};

/** Token vigente: si venció, lo renovamos con el refresh token. */
const freshToken = async (userId: string, account: Account): Promise<string> => {
  if (new Date(account.expires_at).getTime() - Date.now() > RENEW_MARGIN_MS) return account.access_token;

  const res = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env('ETSY_KEYSTRING'),
      refresh_token: account.refresh_token,
    }),
  });
  if (!res.ok) throw new Error('reconnect');

  const token = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  await db(`etsy_accounts?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  return token.access_token;
};

/** Etsy pide la clave y el secreto juntos: keystring:shared_secret */
const apiKeyHeader = () => {
  const keystring = env('ETSY_KEYSTRING');
  const secret = env('ETSY_SHARED_SECRET');
  return secret ? `${keystring}:${secret}` : keystring;
};

const etsyGet = (path: string, accessToken: string) =>
  fetch(`${ETSY_API}${path}`, {
    headers: { 'x-api-key': apiKeyHeader(), Authorization: `Bearer ${accessToken}` },
  });

const connect = async (userId: string) => {
  const verifier = randomString();
  const state = randomString(24);

  const saved = await db('etsy_oauth_states', {
    method: 'POST',
    body: JSON.stringify({ state, user_id: userId, code_verifier: verifier }),
  });
  if (!saved.ok) return json(500, { error: `Couldn't start the connection. Supabase answered ${saved.status}: ${(await saved.text()).slice(0, 160)}` });

  const url = new URL(ETSY_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env('ETSY_KEYSTRING'));
  url.searchParams.set('redirect_uri', env('ETSY_REDIRECT_URI') || DEFAULT_REDIRECT_URI);
  url.searchParams.set('scope', ETSY_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', await challengeOf(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return json(200, { url: url.toString() });
};

const status = async (userId: string) => {
  const account = await accountOf(userId);
  if (!account) return json(200, { allowed: true, connected: false });

  const base: Record<string, unknown> = {
    allowed: true,
    connected: true,
    shopId: account.shop_id,
    shopName: account.shop_name,
    etsyUserId: account.etsy_user_id,
    scopes: account.scopes,
  };

  const failed = async (res: Response, path: string) => {
    const detail = (await res.text()).slice(0, 220);
    // Solo el 401 significa que hay que volver a dar permiso; otros códigos suelen ser la cuenta
    return json(200, { ...base, needsReconnect: res.status === 401, shopError: `Etsy answered ${res.status} on ${path}. ${detail}` });
  };

  try {
    const token = await freshToken(userId, account);
    let shopId = account.shop_id;

    // Si todavía no sabemos cuál es la tienda, se la preguntamos a Etsy y la guardamos
    if (!shopId) {
      const meRes = await etsyGet('/users/me', token);
      if (!meRes.ok) return failed(meRes, '/users/me');
      const me = (await meRes.json()) as { user_id?: number; shop_id?: number };
      shopId = me.shop_id ? String(me.shop_id) : null;
      base.shopId = shopId;
      base.etsyUserId = me.user_id ? String(me.user_id) : null;
      await db(`etsy_accounts?user_id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ etsy_user_id: base.etsyUserId, shop_id: shopId, updated_at: new Date().toISOString() }),
      });
    }

    if (!shopId) return json(200, { ...base, shopError: 'That Etsy account does not have a shop yet.' });

    const res = await etsyGet(`/shops/${shopId}`, token);
    if (!res.ok) return failed(res, `/shops/${shopId}`);

    const shop = (await res.json()) as { shop_name?: string; listing_active_count?: number };
    if (shop.shop_name && shop.shop_name !== account.shop_name) {
      await db(`etsy_accounts?user_id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ shop_name: shop.shop_name, updated_at: new Date().toISOString() }),
      });
    }
    return json(200, { ...base, shopName: shop.shop_name ?? account.shop_name, activeListings: shop.listing_active_count ?? null });
  } catch (err) {
    if (err instanceof Error && err.message === 'reconnect') return json(200, { ...base, needsReconnect: true });
    return json(200, { ...base, shopError: "Couldn't reach Etsy right now." });
  }
};

const disconnect = async (userId: string) => {
  const res = await db(`etsy_accounts?user_id=eq.${userId}`, { method: 'DELETE' });
  if (!res.ok) return json(500, { error: "Couldn't disconnect. Try again." });
  return json(200, { connected: false, allowed: true });
};

const handle = async (request: Request): Promise<Response> => {
  const userId = await userIdFrom(request);
  if (!userId) return json(401, { error: 'Sign in again.' });

  const owner = env('ETSY_OWNER_USER_ID');
  if (!owner || owner !== userId) return json(200, { allowed: false, connected: false });

  const missing = missingSetup();
  if (missing.length) return json(200, { allowed: true, connected: false, setupMissing: missing });

  const action = new URL(request.url).searchParams.get('action') ?? 'status';
  try {
    if (action === 'connect') return await connect(userId);
    if (action === 'disconnect') return await disconnect(userId);
    if (action === 'status') return await status(userId);
    return json(400, { error: 'Unknown action.' });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'Etsy error.' });
  }
};

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
