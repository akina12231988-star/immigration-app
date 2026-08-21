// 「許可が降りた」ときに申請へ入れる内容。
//
// 申請詳細の許可の欄と、一覧・通知書受付からのワンタップ操作で同じ内容にするため、
// ここにまとめる。許可日は、通知書に書かれた日が分かればその日、無ければ今日。

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
