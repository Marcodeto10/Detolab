// Conexión a Supabase: login con Google, galería online y registro de uso.
//
// Estos datos son públicos a propósito: la "publishable key" está hecha para
// ir en el navegador. Lo que protege los datos de cada usuario son las reglas
// de seguridad (RLS) de la base, definidas en supabase/schema.sql.

import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bkqhedahpcoywvdguyry.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ox8TG0tsH0q81K9aRHLTIQ_7jVmITQ6';

export const GALLERY_BUCKET = 'gallery';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
