import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listSeals } from "@/lib/supabase/queries/seals";
import { listWorkersForResignation } from "@/lib/supabase/queries/workers";
import { SealsClient } from "./SealsClient";

export const dynamic = "force-dynamic";

// 印鑑BOX: 外国人用に作った印鑑の保管と譲渡の記録
export default async function SealsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [seals, workers] = await Promise.all([
    // 0162 未適用なら空にして、画面で案内する
    listSeals(supabase).then(
      (rows) => ({ rows, error: null as string | null }),
      (e: unknown) => ({ rows: [], error: e instanceof Error ? e.message : "印鑑の取得に失敗しました" }),
    ),
    listWorkersForResignation(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="印鑑BOX" backHref="/" />
      <SealsClient
        initialSeals={seals.rows}
        loadError={seals.error}
        workers={workers.map((w) => ({ id: w.id, name: w.name, kana: w.kana }))}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
