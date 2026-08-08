// 対象月の時点で有効だった在留許可を、申請の履歴から割り出す。
//
// workers.residence_permit_date は「現在の在留資格の許可日」しか持たないため、
// 更新許可が下りて日付が進むと、その人が過去の月の名簿から消えてしまう。
// 「7月分を作る前に8月の更新許可を登録したら7月分が抜けた」を防ぐためのもの。

import { monthEnd, monthStart } from "@/lib/sales";
import type { GrantedPermit } from "@/lib/supabase/queries/applications";

export interface EffectivePermit {
  permitDate: string; // その月の時点で有効だった在留許可日
  visa: string; // そのときの在留資格（分からなければ空）
}

// 在留期間の更新許可か（在留資格は変わらず、期間だけ延びる申請）
function isRenewal(content: string): boolean {
  return content.includes("更新");
}

// その月の時点で有効だった在留許可。分からなければ null（現在の値をそのまま使う）
export function effectivePermitForMonth(
  permits: GrantedPermit[],
  month: string,
): EffectivePermit | null {
  const to = monthEnd(`${month}-01`);

  // ①その月までに下りている許可のうち、いちばん新しいもの
  const granted = permits
    .filter((p) => p.permitDate <= to)
    .sort((a, b) => b.permitDate.localeCompare(a.permitDate));
  if (granted[0]) return { permitDate: granted[0].permitDate, visa: granted[0].visa };

  // ②その月までの許可が記録に無くても、あとから下りたのが更新許可なら、
  //   その月にはすでに同じ在留資格で在籍していたことになる。
  //   （在留資格の変更許可は「その月にはまだ移行していない」ので対象にしない）
  const laterRenewal = permits
    .filter((p) => p.permitDate > to && isRenewal(p.content))
    .sort((a, b) => a.permitDate.localeCompare(b.permitDate))[0];
  if (laterRenewal) {
    // 元の許可日は分からないので、その月はまるごと在籍していたものとして扱う。
    // 更新許可では在留資格は変わらないため、在留資格は外国人の現在の値のまま
    // （申請の「許可時の在留資格」は入力の揺れがあり、名簿にそのまま出したくない）
    return { permitDate: monthStart(`${month}-01`), visa: "" };
  }

  return null;
}
