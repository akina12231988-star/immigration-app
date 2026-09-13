import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, MessageCircle, NotebookPen, UserRound } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { ApplicationPrepChecklist } from "@/components/workers/ApplicationPrepChecklist";
import { messengerWebUrl } from "@/lib/messenger-link";
import { notionAppUrl } from "@/lib/notion-link";

// 見出しの右側に出す小さなリンク（白い枠。押しやすいよう高さ36px）
const HEADER_LINK =
  "inline-flex min-h-[36px] items-center gap-1 rounded-full border border-brand-foreground/60 px-3 text-xs font-bold text-brand-foreground hover:bg-brand-foreground/10";

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
    .select(
      "id, name, photo_path, health_check_on, messenger_link, notion_link, application_prep_organization_id, current_organization_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const worker = data as {
    id: string;
    name: string;
    photo_path: string | null;
    health_check_on: string | null;
    messenger_link: string | null;
    notion_link: string | null;
    application_prep_organization_id: string | null;
    current_organization_id: string | null;
  };

  // 準備中の所属機関（転職先。無ければ現在の所属機関）。見出しの右側からすぐ開けるようにする
  const prepOrgId = worker.application_prep_organization_id ?? worker.current_organization_id ?? null;
  let prepOrgName = "";
  if (prepOrgId) {
    const { data: o } = await supabase.from("organizations").select("name").eq("id", prepOrgId).maybeSingle();
    prepOrgName = (o as { name: string } | null)?.name ?? "";
  }

  const headerLinks = (
    <>
      {worker.messenger_link && (
        <a href={messengerWebUrl(worker.messenger_link)} target="_blank" rel="noopener noreferrer" className={HEADER_LINK}>
          <MessageCircle size={14} />
          Messenger
        </a>
      )}
      {worker.notion_link && (
        <a href={notionAppUrl(worker.notion_link)} className={HEADER_LINK}>
          <NotebookPen size={14} />
          Notion
        </a>
      )}
      <Link href={`/workers/${worker.id}`} className={HEADER_LINK}>
        <UserRound size={14} />
        外国人詳細
      </Link>
      {prepOrgId && (
        <Link href={`/organizations/${prepOrgId}`} className={HEADER_LINK} title={prepOrgName}>
          <Building2 size={14} />
          <span className="max-w-[10rem] truncate">{prepOrgName || "所属機関"}</span>
        </Link>
      )}
    </>
  );

  return (
    <>
      {/* 直前の画面（TODO一覧・申請一覧・外国人詳細）へ戻る。直接開いたときは申請準備の一覧へ。
          右側に Messenger・Notion・外国人詳細・準備中の所属機関へのリンクを置く */}
      <AppHeader title={`${worker.name}｜申請準備`} backHref="/workers/renewals" right={headerLinks} />
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
