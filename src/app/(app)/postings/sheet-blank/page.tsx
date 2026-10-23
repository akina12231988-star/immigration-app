import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { emptyPostingSheet } from "@/lib/posting-sheet";
import { PostingSheetPrint } from "../[id]/sheet/PostingSheetPrint";

export const dynamic = "force-dynamic";

// 白紙の特定技能1号 求人票。何も入っていない今の様式をそのまま印刷する（会社に手書きしてもらう用）。
// 画面で書き込めるが保存はしない（求人に紐づかないため）
export default async function BlankPostingSheetPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  // 既定で選ばれている項目（変更なし・期間の定めあり・社会保険の適用・口座振込）も空にして、全部を白紙にする
  const sheet = {
    ...emptyPostingSheet(),
    work_location_change: "",
    contract_term_kind: "",
    social_insurance: "",
    employment_insurance: "",
    pay_method: "",
  };

  return (
    <PostingSheetPrint
      posting={{
        id: "",
        received_on: "",
        acceptance_no: "",
        job_type: "",
        openings: null,
        work_location: "",
        wage_kind: "" as never,
        wage_amount: null,
      }}
      sheet={sheet}
      orgName=""
      orgAddress=""
      orgContact=""
      canEdit
      blank
    />
  );
}
