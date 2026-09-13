"use client";

import { useState } from "react";
import { Building2, Loader2, Pencil, Save, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setAppSetting } from "@/lib/supabase/queries/app-settings";
import { dbErrorMessage } from "@/lib/errors";
import { CUSTODIAN_SETTING_KEY, type CustodianInfo } from "@/lib/custody";
import { SUPPORT_ORG_FIELD_GROUPS } from "@/lib/support-org-info";
import { formatYmdJa } from "@/lib/support-plan-dates";

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

// 登録支援機関（当社）の情報。ふだんは登録内容を表示し、「編集」で全部の欄を直して保存する。
// 保存先は app_settings（全員共通）。申請準備の「申請書に貼る情報」にもすぐ反映される
export function SupportOrgInfoForm({
  initial,
  canEdit,
}: {
  initial: CustodianInfo;
  canEdit: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const startEdit = () => {
    setDraft(saved);
    setNotice(null);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(saved);
    setEditing(false);
  };

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const next = Object.fromEntries(
        Object.entries(draft).map(([k, v]) => [k, (v ?? "").trim()]),
      ) as CustodianInfo;
      await setAppSetting(createClient(), CUSTODIAN_SETTING_KEY, next);
      setSaved(next);
      setDraft(next);
      setEditing(false);
      setNotice({ ok: true, message: "登録支援機関の情報を保存しました。申請準備の「申請書に貼る情報」にも反映されます。" });
    } catch (err) {
      setNotice({ ok: false, message: dbErrorMessage(err, "0149_app_settings.sql") });
    } finally {
      setBusy(false);
    }
  };

  const display = (key: keyof CustodianInfo, kind?: "text" | "date") => {
    const v = saved[key];
    if (!v) return "";
    return kind === "date" ? formatYmdJa(v) : v;
  };

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <Building2 size={15} className="text-brand" />
          登録支援機関の情報
        </h2>
        {canEdit && !editing && (
          <Button type="button" variant="secondary" className="min-h-[40px] px-4 py-2 text-sm" icon={<Pencil size={14} />} onClick={startEdit}>
            編集
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        申請書の「所属機関等作成用 4（登録支援機関）」や預かり証に書く当社の情報です。ここで直した内容は全員共通で、申請準備の「申請書に貼る情報」にもすぐ反映されます。
      </p>
      {notice && (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"}`}
        >
          {notice.message}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {SUPPORT_ORG_FIELD_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 text-xs font-bold text-muted">{g.title}</p>
            {editing ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-muted">{f.label}</span>
                    <input
                      type={f.kind === "date" ? "date" : "text"}
                      value={draft[f.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className={INPUT_CLASS}
                    />
                    {f.hint && <span className="text-[11px] leading-relaxed text-muted">{f.hint}</span>}
                  </label>
                ))}
              </div>
            ) : (
              <dl className="overflow-hidden rounded-xl border border-border">
                {g.fields.map((f) => (
                  <div
                    key={f.key}
                    className="flex flex-col gap-0.5 border-b border-border bg-background px-3 py-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <dt className="shrink-0 text-xs text-muted sm:w-64">{f.label}</dt>
                    <dd className="min-w-0 flex-1 break-words font-bold">
                      {display(f.key, f.kind) || <span className="font-normal text-muted">未登録</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} disabled={busy} onClick={() => void save()}>
            保存
          </Button>
          <Button type="button" variant="secondary" icon={<X size={14} />} disabled={busy} onClick={cancel}>
            やめる
          </Button>
        </div>
      )}
    </Card>
  );
}
