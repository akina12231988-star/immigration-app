// 「許可が降りた」ときに申請へ入れる内容。
//
// 申請詳細の許可の欄と、一覧・通知書受付からのワンタップ操作で同じ内容にするため、
// ここにまとめる。許可日は、通知書に書かれた日が分かればその日、無ければ今日。

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWorkerSituationInfo, updateWorker } from "@/lib/supabase/queries/workers";
import { situationAfterApproval } from "@/lib/worker-situation";
import type { Application } from "@/types/application";

export function approvalPatch(today: string, permitDate?: string | null): Partial<Application> {
  return {
    approved: true,
    approvalDate: today,
    status: "許可済",
    grantedPermitDate: (permitDate ?? "").trim() || today,
  };
}

// その申請を「許可が降りた」にできるか。
// すでに許可済み・取下げ・まだ申請していないものは対象外
export function canMarkApproved(
  app: Pick<Application, "approved" | "status">,
): boolean {
  if (app.approved) return false;
  return app.status !== "取下げ" && app.status !== "申請前";
}

// 許可がおりたら、外国人の「只今の状況」も進める。
// 特定技能の更新（特定技能更新許可の審査中）の許可なら「更新」に変える
// （＜支援委託中＞の併記は残す。例: 特定技能1号＜支援委託中＞・更新）。
// 只今の状況の更新だけの失敗は、許可の操作そのものを止めない
export async function advanceSituationOnApproval(
  supabase: SupabaseClient,
  workerId: string | null | undefined,
): Promise<void> {
  if (!workerId) return;
  try {
    const info = await fetchWorkerSituationInfo(supabase, workerId);
    const next = situationAfterApproval(info.current_situation);
    if (next !== null && next !== info.current_situation) {
      await updateWorker(supabase, workerId, { current_situation: next });
    }
  } catch {
    /* 0093未適用などで只今の状況を更新できなくても、許可の操作は成立させる */
  }
}
