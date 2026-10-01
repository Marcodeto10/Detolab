// Función del servidor (Vercel): acá vuelve Etsy después de que autorizás la app.
//
// Etsy manda ?code y ?state. Cambiamos ese código por los tokens, guardamos la
// conexión y te devolvemos a Detolab. Los tokens nunca pasan por el navegador.
//
// Esta URL tiene que estar registrada igual en la app de Etsy:
// https://detolab-five.vercel.app/api/etsy/callback

const SUPABASE_URL = 'https://bkqhedahpcoywvdguyry.supabase.co';

const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const ETSY_API = 'https://api.etsy.com/v3/application';
const DEFAULT_REDIRECT_URI = 'https://detolab-five.vercel.app/api/etsy/callback';

const env = (name: string) => process.env[name]?.trim() ?? '';

/** Volver a la app con el resultado a la vista. */
const backToApp = (request: Request, params: Record<string, string>) => {
  const url = new URL('/', new URL(request.url).origin);
  url.searchParams.set('view', 'etsy');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
};

/** Acceso a la base como servidor (las tablas de Etsy no se leen desde el navegador). */
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

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const error = query.get('error');
  if (error) return backToApp(request, { etsy: 'error', reason: query.get('error_description') || error });

  const code = query.get('code');
  const state = query.get('state');
  if (!code || !state) return backToApp(request, { etsy: 'error', reason: 'Etsy did not send the code.' });

  try {
    // El código de verificación que guardamos al empezar (PKCE)
    const stateRes = await db(`etsy_oauth_states?state=eq.${encodeURIComponent(state)}&select=*`);
    const rows = (await stateRes.json()) as { user_id: string; code_verifier: string; created_at: string }[];
    const pending = rows[0];
    await db(`etsy_oauth_states?state=eq.${encodeURIComponent(state)}`, { method: 'DELETE' });
    if (!pending) return backToApp(request, { etsy: 'error', reason: 'That link expired. Try connecting again.' });

    const tokenRes = await fetch(ETSY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env('ETSY_KEYSTRING'),
        redirect_uri: env('ETSY_REDIRECT_URI') || DEFAULT_REDIRECT_URI,
        code,
        code_verifier: pending.code_verifier,
      }),
    });
    if (!tokenRes.ok) {
      const detail = (await tokenRes.text()).slice(0, 200);
      return backToApp(request, { etsy: 'error', reason: `Etsy rejected the connection (${tokenRes.status}). ${detail}` });
    }

    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Quién sos en Etsy y cuál es tu tienda
    const meRes = await fetch(`${ETSY_API}/users/me`, {
      headers: { 'x-api-key': env('ETSY_KEYSTRING'), Authorization: `Bearer ${token.access_token}` },
    });
    const me = meRes.ok ? ((await meRes.json()) as { user_id?: number; shop_id?: number }) : {};

    let shopName: string | null = null;
    if (me.shop_id) {
      const shopRes = await fetch(`${ETSY_API}/shops/${me.shop_id}`, {
        headers: { 'x-api-key': env('ETSY_KEYSTRING'), Authorization: `Bearer ${token.access_token}` },
      });
      if (shopRes.ok) shopName = ((await shopRes.json()) as { shop_name?: string }).shop_name ?? null;
    }

    const saved = await db('etsy_accounts?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: pending.user_id,
        etsy_user_id: me.user_id ? String(me.user_id) : null,
        shop_id: me.shop_id ? String(me.shop_id) : null,
        shop_name: shopName,
        scopes: null,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!saved.ok) return backToApp(request, { etsy: 'error', reason: "Couldn't save the connection." });

    return backToApp(request, { etsy: 'connected' });
  } catch {
    return backToApp(request, { etsy: 'error', reason: "Couldn't finish the connection. Try again." });
  }
}
