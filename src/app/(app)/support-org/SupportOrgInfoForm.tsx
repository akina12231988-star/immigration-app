"use client";

import { useState } from "react";
import { Building2, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setAppSetting } from "@/lib/supabase/queries/app-settings";
import { dbErrorMessage } from "@/lib/errors";
import {
  CUSTODIAN_SETTING_KEY,
  supportOrgSettingValue,
  type CustodianInfo,
  type SupportOrgAgent,
  type SupportOrgInterpreter,
  type SupportOrgLists,
} from "@/lib/custody";
import {
  SUPPORT_ORG_AGENT_GROUP_TITLE,
  SUPPORT_ORG_FIELD_GROUPS,
  SUPPORT_ORG_INTERPRETER_TITLE,
  SUPPORT_ORG_LISTING_FILE_KIND,
} from "@/lib/support-org-info";
import { formatYmdJa } from "@/lib/support-plan-dates";
import { SupportOrgFileAttachments } from "./SupportOrgFileAttachments";

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
const SMALL_BUTTON = "min-h-[40px] px-4 py-2 text-sm";

interface Draft {
  info: CustodianInfo;
  lists: SupportOrgLists;
}

// 登録支援機関（当社）の情報。ふだんは登録内容を表示し、「編集」で全部の欄を直して保存する。
// 通訳者（対応可能言語ごと）と申請取次者は行を足して複数登録できる。
// 保存先は app_settings（全員共通）。申請準備の「申請書に貼る情報」にもすぐ反映される
export function SupportOrgInfoForm({
  initial,
  initialLists,
  canEdit,
}: {
  initial: CustodianInfo;
  initialLists: SupportOrgLists;
  canEdit: boolean;
}) {
  const [saved, setSaved] = useState<Draft>({ info: initial, lists: initialLists });
  const [draft, setDraft] = useState<Draft>(saved);
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

  const setInfo = (key: keyof CustodianInfo, v: string) =>
    setDraft((d) => ({ ...d, info: { ...d.info, [key]: v } }));
  const setInterpreter = (i: number, patch: Partial<SupportOrgInterpreter>) =>
    setDraft((d) => ({
      ...d,
      lists: { ...d.lists, interpreters: d.lists.interpreters.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) },
    }));
  const setAgent = (i: number, patch: Partial<SupportOrgAgent>) =>
    setDraft((d) => ({
      ...d,
      lists: { ...d.lists, agents: d.lists.agents.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) },
    }));

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const trim = (s: string) => (s ?? "").trim();
      const info = Object.fromEntries(Object.entries(draft.info).map(([k, v]) => [k, trim(v)])) as CustodianInfo;
      const lists: SupportOrgLists = {
        interpreters: draft.lists.interpreters
          .map((r) => ({ language: trim(r.language), name: trim(r.name) }))
          .filter((r) => r.language || r.name),
        agents: draft.lists.agents
          .map((r) => ({ name: trim(r.name), certNo: trim(r.certNo), certExpiry: trim(r.certExpiry) }))
          .filter((r) => r.name || r.certNo || r.certExpiry),
      };
      await setAppSetting(createClient(), CUSTODIAN_SETTING_KEY, supportOrgSettingValue(info, lists));
      const next = { info, lists };
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

  const display = (v: string, kind?: "text" | "date") => (v && kind === "date" ? formatYmdJa(v) : v);

  // 通訳者の一覧（対応可能言語の下に出す）
  const interpreterBlock = editing ? (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border p-2.5">
      <p className="text-xs font-bold text-muted">{SUPPORT_ORG_INTERPRETER_TITLE}</p>
      {draft.lists.interpreters.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">言語</span>
            <input value={r.language} onChange={(e) => setInterpreter(i, { language: e.target.value })} placeholder="例: ベトナム語" className={INPUT_CLASS} />
          </label>
          <label className="flex min-w-[8rem] flex-[2] flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">通訳者の氏名</span>
            <input value={r.name} onChange={(e) => setInterpreter(i, { name: e.target.value })} className={INPUT_CLASS} />
          </label>
          <button
            type="button"
            aria-label="この行を削除"
            onClick={() => setDraft((d) => ({ ...d, lists: { ...d.lists, interpreters: d.lists.interpreters.filter((_, idx) => idx !== i) } }))}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-seal"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setDraft((d) => ({ ...d, lists: { ...d.lists, interpreters: [...d.lists.interpreters, { language: "", name: "" }] } }))}
        className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand"
      >
        <Plus size={13} />
        通訳者を追加
      </button>
    </div>
  ) : (
    <div className="flex flex-col gap-0.5 border-b border-border bg-background px-3 py-2 text-sm last:border-b-0 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs text-muted sm:w-64">通訳者（言語ごと）</dt>
      <dd className="min-w-0 flex-1">
        {saved.lists.interpreters.length === 0 ? (
          <span className="text-muted">未登録</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {saved.lists.interpreters.map((r, i) => (
              <li key={i}>
                <span className="text-xs text-muted">{r.language || "言語未記入"}: </span>
                <span className="font-bold">{r.name || "氏名未記入"}</span>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <Building2 size={15} className="text-brand" />
          登録支援機関の情報
        </h2>
        {canEdit && !editing && (
          <Button type="button" variant="secondary" className={SMALL_BUTTON} icon={<Pencil size={14} />} onClick={startEdit}>
            編集
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        申請書の「所属機関等作成用 4（登録支援機関）」「職業紹介事業者（国内）」や預かり証・領収書に書く当社の情報です。ここで直した内容は全員共通で、申請準備の「申請書に貼る情報」にもすぐ反映されます。
      </p>
      {notice && (
        <p role="status" className={`mb-3 rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"}`}>
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
                  <label key={f.key} className={`flex flex-col gap-1 ${f.key === "languages" ? "sm:col-span-2" : ""}`}>
                    <span className="text-xs font-bold text-muted">{f.label}</span>
                    <input
                      type={f.kind === "date" ? "date" : "text"}
                      value={draft.info[f.key]}
                      onChange={(e) => setInfo(f.key, e.target.value)}
                      className={INPUT_CLASS}
                    />
                    {f.hint && <span className="text-[11px] leading-relaxed text-muted">{f.hint}</span>}
                  </label>
                ))}
                {g.hasInterpreters && <div className="sm:col-span-2">{interpreterBlock}</div>}
              </div>
            ) : (
              <dl className="overflow-hidden rounded-xl border border-border">
                {g.fields.map((f) => (
                  <div key={f.key} className="flex flex-col gap-0.5 border-b border-border bg-background px-3 py-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
                    <dt className="shrink-0 text-xs text-muted sm:w-64">{f.label}</dt>
                    <dd className="min-w-0 flex-1 break-words font-bold">
                      {display(saved.info[f.key], f.kind) || <span className="font-normal text-muted">未登録</span>}
                    </dd>
                  </div>
                ))}
                {g.hasInterpreters && interpreterBlock}
              </dl>
            )}
            {/* 職業紹介事業者: 人材サービス総合サイトに掲載している画面の画像（最新版を表示） */}
            {g.hasListingImage && (
              <div className="mt-2 rounded-xl border border-border p-2.5">
                <p className="mb-1.5 text-xs font-bold text-muted">{SUPPORT_ORG_LISTING_FILE_KIND}の掲載画面（最新版）</p>
                <SupportOrgFileAttachments
                  kind={SUPPORT_ORG_LISTING_FILE_KIND}
                  addLabel={`${SUPPORT_ORG_LISTING_FILE_KIND}の画像を追加（画像・PDF）`}
                  canEdit={canEdit}
                />
              </div>
            )}
          </div>
        ))}

        {/* 申請取次者（複数可） */}
        <div>
          <p className="mb-1.5 text-xs font-bold text-muted">{SUPPORT_ORG_AGENT_GROUP_TITLE}</p>
          {editing ? (
            <div className="flex flex-col gap-2">
              {draft.lists.agents.map((a, i) => (
                <div key={i} className="grid grid-cols-1 gap-2.5 rounded-xl border border-border p-2.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted">申請取次者の氏名</span>
                    <input value={a.name} onChange={(e) => setAgent(i, { name: e.target.value })} className={INPUT_CLASS} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted">届出済証明書の番号</span>
                    <input value={a.certNo} onChange={(e) => setAgent(i, { certNo: e.target.value })} placeholder="例: 受-222024800268" className={INPUT_CLASS} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted">届出済証明書の有効期限</span>
                    <input type="date" value={a.certExpiry} onChange={(e) => setAgent(i, { certExpiry: e.target.value })} className={INPUT_CLASS} />
                  </label>
                  <button
                    type="button"
                    aria-label="この申請取次者を削除"
                    onClick={() => setDraft((d) => ({ ...d, lists: { ...d.lists, agents: d.lists.agents.filter((_, idx) => idx !== i) } }))}
                    className="flex h-11 w-11 items-center justify-center self-end rounded-xl border border-border text-seal"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, lists: { ...d.lists, agents: [...d.lists.agents, { name: "", certNo: "", certExpiry: "" }] } }))}
                className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 py-2 text-xs font-bold text-brand"
              >
                <Plus size={13} />
                申請取次者を追加
              </button>
              <p className="text-[11px] leading-relaxed text-muted">1人目の申請取次者が預かり証などに使われます。</p>
            </div>
          ) : saved.lists.agents.length === 0 ? (
            <p className="rounded-xl bg-background px-3 py-2 text-sm text-muted">未登録</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {saved.lists.agents.map((a, i) => (
                <div key={i} className="flex flex-col gap-0.5 border-b border-border bg-background px-3 py-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
                  <dt className="shrink-0 text-xs text-muted sm:w-64">{i + 1}人目</dt>
                  <dd className="min-w-0 flex-1 break-words">
                    <span className="font-bold">{a.name || "氏名未記入"}</span>
                    {a.certNo && <span className="ml-2 text-xs text-muted">証明書番号 {a.certNo}</span>}
                    {a.certExpiry && <span className="ml-2 text-xs text-muted">有効期限 {formatYmdJa(a.certExpiry)}</span>}
                  </dd>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" className={SMALL_BUTTON} icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} disabled={busy} onClick={() => void save()}>
            保存
          </Button>
          <Button type="button" variant="secondary" className={SMALL_BUTTON} icon={<X size={14} />} disabled={busy} onClick={cancel}>
            やめる
          </Button>
        </div>
      )}
    </Card>
  );
}
