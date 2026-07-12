import "server-only";

import { createClient } from "@supabase/supabase-js";

// service_role キーを使う管理用クライアント（RLSを通らない）。
// 職員の招待などサーバー側の管理操作にのみ使用し、絶対にクライアントへ渡さない。
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
