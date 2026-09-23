import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { COUNCIL_LANGS, type CouncilLang } from "@/lib/council-list";
import { CouncilPrintSheet } from "./CouncilPrintSheet";

export const dynamic = "force-dynamic";

// 協力確認書の提出先の一覧表。所属機関の「協力確認書の提出」で提出先が2か所以上あるときに開く。
//   ?form=3v   … 所属機関等作成用3 V（別紙）: 翻訳なし・A4縦1枚に事業所の所在地と住居地
//   ?form=1-17 … 参考様式1-17号（別紙）: 訳つき・A4横で事業所の所在地1枚と住居地1枚（&lang=km など）
export default async function CouncilPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ form?: string; lang?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { id } = await params;
  const { form, lang } = await searchParams;
  const org = await getOrganization(await createClient(), id).catch(() => null);
  if (!org) notFound();
  const initialLang = (COUNCIL_LANGS.find((l) => l.code === lang)?.code ?? "en") as CouncilLang;
  return (
    <CouncilPrintSheet
      orgId={org.id}
      orgName={org.name}
      intake={normalizeOrganizationIntake(org.intake)}
      initialForm={form === "1-17" ? "1-17" : "3v"}
      initialLang={initialLang}
      canEdit={me.role !== "viewer"}
    />
  );
}
