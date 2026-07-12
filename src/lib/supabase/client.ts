"use client";

import { createBrowserClient } from "@supabase/ssr";

// ブラウザ用クライアント。RLS（profiles.role による権限制御）が適用される
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
