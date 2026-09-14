// Botón "Sign in with Google" de Google Identity Services.
//
// Con este botón Google muestra la dirección de Detolab (localhost o
// detolab-five.vercel.app) en vez de la dirección técnica de Supabase.
// El token que devuelve Google se canjea en Supabase con signInWithIdToken.

declare global {
  interface Window {
    google?: any;
  }
}

let loading: Promise<void> | null = null;

export const loadGoogleIdentity = (): Promise<void> => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Google sign-in.'));
    };
    document.head.appendChild(script);
  });
  return loading;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Nonce contra reuso de tokens: Google recibe el hash y Supabase el valor
 * original, así Supabase puede comprobar que el token es de este intento.
 */
export const makeNonce = async () => {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const hashed = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return { raw, hashed };
};
