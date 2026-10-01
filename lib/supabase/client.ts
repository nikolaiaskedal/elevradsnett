import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type SupabaseConfig = { url:string; anonKey:string };

/** Offentlig Supabase-konfigurasjon fra Vite-miljøet, eller null når den mangler. */
export function readSupabaseConfig(env:Partial<Record<'VITE_SUPABASE_URL'|'VITE_SUPABASE_ANON_KEY',string>> = import.meta.env):SupabaseConfig|null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

/** Lastes dynamisk, så demobygget slipper å laste supabase-js. */
export async function createSupabaseBrowserClient(config:SupabaseConfig):Promise<SupabaseClient<Database>> {
  const { createClient } = await import('@supabase/supabase-js');
  // Innlogging med engangskode som skrives inn i appen, så økten kommer aldri via URL-en.
  return createClient<Database>(config.url, config.anonKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:false } });
}
