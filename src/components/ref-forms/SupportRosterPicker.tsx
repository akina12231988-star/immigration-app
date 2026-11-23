"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { supportSystemPrintPeople } from "@/lib/support-system-print";
import { todayJst } from "@/lib/jst-date";
import type { Employee } from "@/types/db";

// 参考様式第1-17号の最後のページ（支援業務を行う体制についての説明）に載せる支援責任者・支援担当者を選ぶ。
// 選ぶと所属機関の「支援責任者・支援担当者」に保存し（所属機関の画面と同じもの）、onChanged で様式を作り直す
export function SupportRosterPicker({
  orgId,
  orgName,
  onChanged,
}: {
  orgId: string;
  orgName: string;
  onChanged: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [intake, setIntake] = useState<ReturnType<typeof normalizeOrganizationIntake> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const [emps, { data }] = await Promise.all([
          listEmployees(supabase),
          supabase.from("organizations").select("intake").eq("id", orgId).maybeSingle(),
        ]);
        if (cancelled) return;
        setEmployees(emps);
        setIntake(normalizeOrganizationIntake((data as { intake: unknown } | null)?.intake));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "読み込めませんでした");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (error) return <p className="text-xs text-seal">{error}</p>;
  if (!employees || !intake) return <p className="text-xs text-muted">読み込み中…</p>;

  const people = supportSystemPrintPeople(employees, todayJst(), intake);
  const selectedNames = (list: { name: string; selected: boolean }[]) => list.filter((p) => p.selected).map((p) => p.name);

  // 支援責任者・支援担当者を選び直して所属機関に保存する
  const toggle = async (kind: "support_managers" | "support_staff", name: string, on: boolean) => {
    const current = selectedNames(kind === "support_managers" ? people.managers : people.staff);
    const next = on ? [...new Set([...current, name])] : current.filter((n) => n !== name);
    const nextIntake = { ...intake, [kind]: next };
    setBusy(true);
    setError(null);
    try {
      await updateOrganization(createClient(), orgId, { intake: nextIntake });
      setIntake(nextIntake);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const group = (title: string, kind: "support_managers" | "support_staff", list: { id: string; name: string; selected: boolean }[]) => (
    <div>
      <p className="mb-0.5 text-[11px] font-bold text-muted">{title}</p>
      {list.length === 0 ? (
        <p className="text-[11px] text-muted">職員の登録で「{title}」にしている人がいません。</p>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {list.map((p) => (
            <label key={p.id} className="inline-flex min-h-[28px] items-center gap-1 text-xs">
              <input type="checkbox" checked={p.selected} disabled={busy} onChange={(e) => void toggle(kind, p.name, e.target.checked)} />
              {p.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <h2 className="flex items-center gap-1 text-sm font-bold">
        最後のページ（支援業務を行う体制についての説明）
        {busy && <Loader2 size={13} className="animate-spin" />}
      </h2>
      <p className="text-[11px] leading-relaxed text-muted">
        名簿に載せる人を選ぶと、{orgName || "この所属機関"}の「支援責任者・支援担当者」に保存され、様式の最後のページが作り直されます（所属機関の画面と同じものです）。
        上の説明の文章は、メニューの「登録支援機関」で直せます。
      </p>
      {group("支援責任者", "support_managers", people.managers)}
      {group("支援担当者", "support_staff", people.staff)}
      <Link href={`/organizations/${orgId}`} target="_blank" className="text-xs font-bold text-brand underline">
        所属機関の画面を開く →
      </Link>
    </section>
  );
}
