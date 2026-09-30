// Conexión con Etsy vista desde el navegador.
// Acá no hay claves ni tokens: todo lo resuelve el servidor en /api/etsy.

import { supabase } from './supabase';

export interface EtsyStatus {
  /** La sección es solo para el dueño de la tienda */
  allowed: boolean;
  connected: boolean;
  shopId?: string | null;
  shopName?: string | null;
  etsyUserId?: string | null;
  activeListings?: number | null;
  /** El permiso venció: hay que conectar de nuevo */
  needsReconnect?: boolean;
  /** Etsy respondió algo raro al preguntar por la tienda */
  shopError?: string;
  /** Variables que faltan cargar en Vercel */
  setupMissing?: string[];
}

const call = async <T>(action: 'status' | 'connect' | 'disconnect'): Promise<T> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again.');

  const res = await fetch(`/api/etsy/session?action=${action}`, {
    method: action === 'disconnect' ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error ?? "Couldn't reach Etsy.");
  return body;
};

export const etsyStatus = () => call<EtsyStatus>('status');

export const etsyConnectUrl = async () => (await call<{ url: string }>('connect')).url;

export const etsyDisconnect = () => call<EtsyStatus>('disconnect');
