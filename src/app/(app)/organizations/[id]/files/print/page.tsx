import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { listOrganizationFiles } from "@/lib/supabase/queries/organization-files";
import { isImageFile, latestOrgFiles, parsePrintKinds } from "@/lib/org-attachments";
import { OrgFilesPrintView, type OrgPrintFile, type OrgPrintSection } from "./OrgFilesPrintView";

export const dynamic = "force-dynamic";

// 署名付きURLの有効時間（印刷している間だけ見られればよい）
const BUCKET = "app-files";
const TTL = 60 * 60;

// 所属機関の添付ファイル（農業特定技能加入通知書・年間カレンダー・労使協定書）を
// A4縦で1枚に1画像ずつ印刷するページ。申請準備の「印刷（A4縦）」から別タブで開く。
//   ?kind=年間カレンダー,労使協定書（種類はカンマ区切りで複数まとめられる）
// それぞれ最新版（いちばん新しいアップロード日の分）だけを出す。
export default async function OrgFilesPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const { kind } = await searchParams;
  const kinds = parsePrintKinds(kind);
  if (kinds.length === 0) notFound();

  const supabase = await createClient();
  const org = await getOrganization(supabase, id);
  if (!org) notFound();

  const files = await listOrganizationFiles(supabase, id).catch(() => []);
  const admin = createAdminClient();

  // 画像は署名付きURLを付けてそのまま紙に出す。PDF は印刷ページに埋め込めないので開くリンクにする
  const sections: OrgPrintSection[] = await Promise.all(
    kinds.map(async (k) => {
      const latest = latestOrgFiles(files, k);
      const rows: OrgPrintFile[] = await Promise.all(
        (latest?.files ?? []).map(async (f) => {
          let url = "";
          if (admin) {
            const { data } = await admin.storage.from(BUCKET).createSignedUrl(f.storage_path, TTL);
            url = data?.signedUrl ?? "";
          }
          return { id: f.id, fileName: f.file_name, isImage: isImageFile(f), url };
        }),
      );
      return { kind: k, uploadedOn: latest?.uploadedOn ?? "", files: rows };
    }),
  );

  return <OrgFilesPrintView orgId={org.id} orgName={org.name} sections={sections} />;
}
