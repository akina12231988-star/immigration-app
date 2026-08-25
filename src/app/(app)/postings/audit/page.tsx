import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { todayStr } from "@/lib/application-alerts";
import { AuditDocsClient } from "./AuditDocsClient";

export const dynamic = "force-dynamic";

// 労働局の訪問指導（当日点検）で出す確認書類の一覧。
// 訪問通知文の【別紙】確認書類①〜⑨に合わせて、その場でダウンロードできるようにする
export default async function AuditDocsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  return <AuditDocsClient today={todayStr()} />;
}
