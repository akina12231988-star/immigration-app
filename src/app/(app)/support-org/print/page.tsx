import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { todayStr } from "@/lib/application-alerts";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { SUPPORT_ORG_LISTING_FILE_KIND } from "@/lib/support-org-info";
import { supportSystemPrintPeople } from "@/lib/support-system-print";
import { SupportSystemPrintSheet, type ListingImage } from "./SupportSystemPrintSheet";

export const dynamic = "force-dynamic";

const BUCKET = "app-files";
const TTL = 60 * 60;

// 「支援業務を行う体制についての説明」をA4縦で印刷するページ。
// 登録支援機関の画面と申請準備の「支援体制を印刷（A4）」から開く。
//   ?org=所属機関ID … その機関の支援責任者・支援担当者だけを最初から選んだ状態にし、機関名も出す
// 説明文・登録支援機関名・支援責任者・支援担当者一覧に加えて、
// 人材サービス総合サイトの掲載画面（最新版の画像）を別ページで印刷する
export default async function SupportSystemPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { org: orgId } = await searchParams;

  const supabase = await createClient();
  const [setting, employees, org] = await Promise.all([
    getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
    listEmployees(supabase).catch(() => []),
    orgId ? getOrganization(supabase, orgId).catch(() => null) : Promise.resolve(null),
  ]);
  const info = mergeCustodianInfo(setting);
  const people = supportSystemPrintPeople(employees, todayStr(), org?.intake ?? null);

  // 人材サービス総合サイトの掲載画面（最新版 = いちばん新しいアップロード日の分）の画像に署名付きURLを付ける
  let listingImages: ListingImage[] = [];
  const admin = createAdminClient();
  if (admin) {
    const { data } = await admin
      .from("support_org_files")
      .select("id, file_name, mime_type, storage_path, created_at")
      .eq("kind", SUPPORT_ORG_LISTING_FILE_KIND)
      .order("created_at", { ascending: false });
    const rows = (data as { id: string; file_name: string; mime_type: string; storage_path: string; created_at: string }[] | null) ?? [];
    const newestDay = rows[0]?.created_at.slice(0, 10) ?? "";
    const latest = rows.filter((r) => r.created_at.slice(0, 10) === newestDay).reverse();
    listingImages = await Promise.all(
      latest.map(async (r) => {
        const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(r.storage_path, TTL);
        return {
          id: r.id,
          fileName: r.file_name,
          isImage: r.mime_type.startsWith("image/"),
          url: signed?.signedUrl ?? "",
          uploadedOn: newestDay,
        };
      }),
    );
  }

  return (
    <SupportSystemPrintSheet
      info={info}
      people={people}
      orgId={org?.id ?? ""}
      orgName={org?.name ?? ""}
      listingImages={listingImages}
    />
  );
}
