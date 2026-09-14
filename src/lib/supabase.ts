// Conexión a Supabase: login con Google, galería online y registro de uso.
// Las reglas de seguridad de la base están en supabase/schema.sql.

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export { GOOGLE_CLIENT_ID, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export const GALLERY_BUCKET = 'gallery';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
