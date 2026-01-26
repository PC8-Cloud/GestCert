import { createClient } from '@supabase/supabase-js';

// Credenziali da variabili d'ambiente (vedi .env)
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase: variabili VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY non configurate');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
