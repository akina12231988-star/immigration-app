"use client";

import { useState } from "react";
import { RefFormRowBar, RefFormTemplatesDialog, useRefFormTemplates } from "@/components/ref-forms/RefFormPanel";
import { languageForNationality, refFormName, TEIKI_REF_FORM_GROUPS } from "@/lib/ref-form";

// 定期報告書（定期届出）の添付書類の参考様式。
// ひな形（PDF）と記入位置を登録しておくと、所属機関・本人の情報を書き込んだ PDF を
// 「内容を確認して作る」から印刷できる（申請準備の参考様式と同じ仕組み）。
// 概要書・誓約書は所属機関の内容なので、だれを選んでも同じ内容になる。
// 報酬支払証明書（5-7号）などは本人の欄があるので、上の選択で人を変えて1人ずつ作る
export function PeriodicRefFormsSection({
  orgId,
  orgName,
  canEdit,
  workers,
}: {
  orgId: string;
  orgName: string;
  canEdit: boolean; // ひな形・記入位置を直せる人か（管理者・職員）
  workers: { id: string; name: string; nationality: string }[];
}) {
  const refForms = useRefFormTemplates();
  const [workerId, setWorkerId] = useState<string>(workers[0]?.id ?? "");
  const [managing, setManaging] = useState<string | null>(null);
  const [off, setOff] = useState<Record<string, string[]>>({});
  const worker = workers.find((w) => w.id === workerId) ?? workers[0];

  if (workers.length === 0) {
    return (
      <p className="text-xs text-muted">
        対象者がいないため、参考様式はまだ作れません（対象者を入れると、ここでひな形の登録と印刷ができます）。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        定期報告書の添付書類の参考様式です。「ひな形・記入位置」から様式の PDF を登録し、どこに何を書くかを置いておくと、
        「内容を確認して作る」で所属機関・本人の情報を書き込んだ PDF を印刷できます。
        概要書・誓約書は所属機関の内容なのでだれを選んでも同じです。報酬支払証明書（5-7号）は本人の欄があるので、人を変えて1人ずつ作ってください。
      </p>
      <label className="flex w-fit flex-col gap-0.5 text-[11px] font-bold text-muted">
        だれの情報で作るか（5-7号・理由書など本人の欄がある様式のため）
        <select value={worker?.id ?? ""} onChange={(e) => setWorkerId(e.target.value)} className="min-h-[32px] rounded-lg border border-border bg-surface px-1.5 text-sm">
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      {refForms.error && <p className="text-xs text-seal">{refForms.error}</p>}
      {TEIKI_REF_FORM_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-1.5">
          <p className="text-xs font-bold">{group.title}</p>
          {group.keys.map((key) => (
            <RefFormRowBar
              key={key}
              formKey={key}
              workerId={worker?.id ?? ""}
              nationality={worker?.nationality ?? ""}
              orgId={orgId}
              orgName={orgName}
              templates={refForms.templates}
              canEdit={canEdit}
              onManage={() => setManaging(key)}
              off={off[key] ?? []}
              onOffChange={(next) => setOff((cur) => ({ ...cur, [key]: next }))}
              todoNo=""
            />
          ))}
        </div>
      ))}
      {managing && (
        <RefFormTemplatesDialog
          formKey={managing}
          formLabel={refFormName(managing)}
          templates={refForms.templates}
          defaultLanguage={languageForNationality(worker?.nationality ?? "") || "日本語"}
          orgId={orgId}
          orgName={orgName}
          onClose={() => setManaging(null)}
          onChanged={refForms.reload}
        />
      )}
    </div>
  );
}
