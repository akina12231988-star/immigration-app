import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { ApplicationPrepChecklist } from "@/components/workers/ApplicationPrepChecklist";

export const dynamic = "force-dynamic";

// 申請準備の詳細（書類チェックリスト）のページ。
// 以前はTODO一覧・申請一覧のモーダルで開いていたが、項目が多く縦に長いため
// 1ページとして開き、左上の「←」で元の画面へ戻れるようにしている
export default async function ApplicationPrepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("workers")
    .select("id, name, photo_path, health_check_on")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const worker = data as {
    id: string;
    name: string;
    photo_path: string | null;
    health_check_on: string | null;
  };

  return (
    <>
      {/* 直前の画面（TODO一覧・申請一覧・外国人詳細）へ戻る。直接開いたときは申請準備の一覧へ */}
      <AppHeader title={`${worker.name}｜申請準備`} backHref="/workers/renewals" />
      <div className="px-4 pb-10 pt-4 md:px-8">
        <ApplicationPrepChecklist
          workerId={worker.id}
          canEdit={me.role !== "viewer"}
          photoPath={worker.photo_path}
          healthCheckOn={worker.health_check_on}
          embedEmployment
        />
      </div>
    </>
  );
}
