import Link from "next/link";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { wageText } from "@/lib/wage";
import type { OrgRosterWorker } from "@/lib/supabase/queries/organizations";

// 所属機関に今いる人と、過去にいた人の一覧。
// 「誰がいつからいて、誰がいつ辞めて今どこにいるか」をこの機関の画面だけで追えるようにする
export function OrganizationRoster({
  current,
  past,
  error = null,
}: {
  current: OrgRosterWorker[];
  past: OrgRosterWorker[];
  error?: string | null; // 取得に失敗したとき（0名と区別できるように出す）
}) {
  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Users size={16} />
        在籍者・過去の在籍者
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        在籍中は今この機関に紐づいている方、過去に在籍は退職記録・機関別の雇用開始日が残っている方です。
        転職された方は、今どちらにいるかも出します。
        賃金は外国人詳細の「賃金（時給・月給）」に入れた現在の金額です（未登録は「未登録」と出ます）。
        雇用開始日は外国人詳細の「所属機関別の雇用開始日」で入れられます。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          在籍者を取得できませんでした（{error}）。0名という意味ではありません。
        </p>
      )}

      <Section
        title="在籍中"
        countLabel={`${current.length}名`}
        rows={current}
        emptyText="在籍中の方はいません。"
        showLeaving={false}
      />
      <div className="mt-4">
        <Section
          title="過去に在籍"
          countLabel={`${past.length}名`}
          rows={past}
          emptyText="過去に在籍された方の記録はありません。"
          showLeaving
        />
      </div>
    </Card>
  );
}

function Section({
  title,
  countLabel,
  rows,
  emptyText,
  showLeaving,
}: {
  title: string;
  countLabel: string;
  rows: OrgRosterWorker[];
  emptyText: string;
  showLeaving: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold">
        {title} <span className="text-muted">（{countLabel}）</span>
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-background p-3 text-xs text-muted">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-1.5 pr-2 font-bold">氏名</th>
                <th className="py-1.5 pr-2 font-bold">国籍</th>
                <th className="py-1.5 pr-2 font-bold">在留資格</th>
                <th className="py-1.5 pr-2 font-bold">雇用開始</th>
                <th className="py-1.5 pr-2 font-bold">賃金</th>
                {showLeaving ? (
                  <>
                    <th className="py-1.5 pr-2 font-bold">退職日</th>
                    <th className="py-1.5 pr-2 font-bold">現在の所属</th>
                  </>
                ) : (
                  <>
                    <th className="py-1.5 pr-2 font-bold">在留期限</th>
                    <th className="py-1.5 pr-2 font-bold">支援区分</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-b border-border/60">
                  <td className="py-1.5 pr-2">
                    <Link
                      href={`/workers/${w.id}`}
                      className="font-bold underline-offset-2 hover:text-brand hover:underline"
                    >
                      {w.name}
                    </Link>
                    {w.kana && <span className="block text-[10px] text-muted">{w.kana}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-muted">{w.nationality || "—"}</td>
                  <td className="py-1.5 pr-2 text-muted">{w.residenceStatus || "—"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {w.startOn ?? <span className="text-seal">未登録</span>}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {w.wageAmount ? (
                      <>
                        {wageText(w.wageKind ?? "", w.wageAmount)}
                        {w.wageStartedOn && (
                          <span className="block text-[10px] text-muted">
                            {w.wageStartedOn}から
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-seal">未登録</span>
                    )}
                  </td>
                  {showLeaving ? (
                    <>
                      <td className="py-1.5 pr-2 tabular-nums">{w.leavingOn ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-muted">
                        {w.currentOrgName ?? (w.status === "退職" ? "退職" : "—")}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2 tabular-nums">{w.residenceExpiryDate ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-muted">{w.support}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
