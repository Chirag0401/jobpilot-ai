"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Public, browser-safe Supabase credentials only.
 * Database access is restricted by Supabase RLS on saved_jobs.
 * Never use a service_role or sb_secret key in NEXT_PUBLIC_ variables.
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Legacy projects
  if (!url || !publishableKey) return null;
  if (!cached) {
    cached = createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return cached;
}
