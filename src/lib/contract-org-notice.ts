// 契約機関に関する届出（参考様式1の5・新たな契約の締結）が要るか。
// 特定技能1号の在留期間の更新許可は、所属機関（契約機関）が変わらないので届出は要らない。
// いちばん新しい申請（取下げを除く）が「在留期間の更新許可」で、在留資格が特定技能1号なら「要らない」とする。

import type { Application } from "@/types/application";

export function isSsw1Renewal(
  applications: Pick<Application, "applicationContent" | "status" | "withdrawnOn" | "visaAtGrant">[],
  residenceStatus: string | null | undefined,
): boolean {
  const latest = applications.find((a) => a.status !== "取下げ" && !a.withdrawnOn);
  if (!latest || latest.applicationContent !== "在留期間の更新許可") return false;
  const visa = (latest.visaAtGrant || residenceStatus || "").normalize("NFKC").replace(/\s/g, "");
  return visa.includes("特定技能1号");
}
