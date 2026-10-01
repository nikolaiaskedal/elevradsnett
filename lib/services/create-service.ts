import { createSupabaseBrowserClient, readSupabaseConfig } from '@/lib/supabase/client';
import type { ElevradsnettService } from './contracts';
import { DemoElevradsnettService } from './demo-service';
import { SupabaseElevradsnettService } from './supabase-service';

/** Supabase når VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY er satt, ellers demodata. */
export function createService(env?:Parameters<typeof readSupabaseConfig>[0]):ElevradsnettService {
  const config = readSupabaseConfig(env);
  return config ? new SupabaseElevradsnettService(createSupabaseBrowserClient(config)) : new DemoElevradsnettService();
}
