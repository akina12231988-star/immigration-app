import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import type { FuyoRosterWorker } from "@/lib/fuyo-roster";
import { DependentsFormsClient } from "./DependentsFormsClient";

export const dynamic = "force-dynamic";

// 扶養控除等申告書（年末調整）: 扶養家族を登録している外国人の一覧。
// 対象年の送金が目標額に達した扶養親族がいる人を抽出し、そこから申告書を作る
export default async function DependentsFormsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [{ data: workers }, { data: orgs }] = await Promise.all([
    supabase
      .from("workers")
      .select("id, name, kana, birth, address, my_number, has_spouse, status, current_organization_id, dependents")
      .order("name"),
    supabase.from("organizations").select("id, name").order("name"),
  ]);

  return (
    <>
      <AppHeader title="扶養控除等申告書（年末調整）" backHref="/workers" />
      <DependentsFormsClient
        workers={((workers as FuyoRosterWorker[] | null) ?? []).filter(
          (w) => Array.isArray(w.dependents) && w.dependents.length > 0,
        )}
        organizations={(orgs as { id: string; name: string }[] | null) ?? []}
      />
    </>
  );
}
