"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, PenLine } from "lucide-react";
import {
  languageForNationality,
  refFormName,
  refFormPrepCell,
  refFormPrepKeys,
  isOrgSpecificRefForm,
  EXTRA_REF_FORMS,
  REF_FORM_ITEMS,
} from "@/lib/ref-form";
import { RefFormTemplatesDialog, useRefFormTemplates } from "@/components/ref-forms/RefFormPanel";

export interface OrgRefFormPerson {
  id: string;
  name: string;
  nationality: string;
  preparing: boolean; // この所属機関への申請を準備中（まだ在籍していない）
}

// 様式の書類名（提出書類一覧表の名前。本人に署名してもらう書類はその名前）
function formLabelOf(key: string): string {
  return REF_FORM_ITEMS.find((i) => i.key === key)?.label ?? EXTRA_REF_FORMS[key] ?? "";
}

// 所属機関の参考様式の準備。所属機関別の様式（1-4・1-5・1-6・1-6別紙・1-17・11-1）は、その所属機関の版を言語ごとに登録して記入位置を置く。
// ほかの様式は全員共通の版を使う（足りない言語は共通の版を登録する）
export function OrgRefFormsChecklist({
  orgId,
  orgName,
  people,
}: {
  orgId: string;
  orgName: string;
  people: OrgRefFormPerson[];
}) {
  const refForms = useRefFormTemplates();
  const [managing, setManaging] = useState<{ key: string; language: string } | null>(null);

  // 言語: この所属機関の人の国籍の言語（人数の多い順）＋日本語（国籍の言語の版が無いときに使う）
  const byLang = new Map<string, OrgRefFormPerson[]>();
  for (const p of people) {
    const l = languageForNationality(p.nationality) || "日本語";
    byLang.set(l, [...(byLang.get(l) ?? []), p]);
  }
  const languages = [...byLang.keys()].filter((l) => l !== "日本語").sort((a, b) => byLang.get(b)!.length - byLang.get(a)!.length);
  languages.push("日本語");

  const keys = refFormPrepKeys();
  const orgKeys = keys.filter(isOrgSpecificRefForm);
  const commonKeys = keys.filter((k) => !isOrgSpecificRefForm(k));
  // 所属機関がわでやること: 所属機関別の様式 × 国籍の言語（日本語は人がいる言語に無いときだけ）で、未登録・記入位置なし
  const todoLangs = languages.filter((l) => l !== "日本語" || byLang.has("日本語") || languages.length === 1);
  const todos = orgKeys.flatMap((k) =>
    todoLangs
      .map((l) => ({ key: k, language: l, cell: refFormPrepCell(refForms.templates, k, l, orgId) }))
      .filter((t) => t.cell.status !== "ok"),
  );

  const cellView = (key: string, language: string) => {
    const c = refFormPrepCell(refForms.templates, key, language, orgId);
    if (c.status === "ok") {
      const n = Array.isArray(c.template?.layout) ? c.template.layout.length : 0;
      return (
        <span className="inline-flex items-center gap-1 text-status-approved-fg">
          <CheckCircle2 size={13} />
          登録済み（項目 {n}）
        </span>
      );
    }
    if (c.status === "nolayout") {
      return <span className="font-bold text-status-notice-fg">PDF のみ・記入位置がまだ</span>;
    }
    return (
      <span className="text-seal">
        未登録
        <span className="block text-[10px] text-muted">
          {c.used
            ? `今は${c.used.organization_id ? "この所属機関" : "全員共通"}の${c.used.language}の版を使う`
            : "作れません"}
        </span>
      </span>
    );
  };

  const table = (title: string, note: string, list: string[]) => (
    <section className="mb-5">
      <h2 className="mb-1 text-sm font-bold">{title}</h2>
      <p className="mb-2 text-[11px] text-muted">{note}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-2 py-1.5">様式</th>
              {languages.map((l) => (
                <th key={l} className="px-2 py-1.5">
                  {l}
                  <span className="ml-1 font-normal">
                    {byLang.has(l) ? `（${byLang.get(l)!.length}人）` : "（予備）"}
                  </span>
                </th>
              ))}
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {list.map((k) => (
              <tr key={k} className="border-t border-border align-top">
                <td className="px-2 py-1.5">
                  <span className="font-bold">{refFormName(k)}</span>
                  <span className="block text-[10px] text-muted">{formLabelOf(k)}</span>
                </td>
                {languages.map((l) => (
                  <td key={l} className="px-2 py-1.5">
                    {cellView(k, l)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => setManaging({ key: k, language: languages[0] ?? "日本語" })}
                    className="inline-flex min-h-[30px] items-center gap-1 whitespace-nowrap rounded-md border border-border bg-surface px-2 font-bold text-brand"
                  >
                    <PenLine size={12} />
                    ひな形・記入位置
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-3 text-xs leading-relaxed text-muted">
        参考様式のうち、<b>1-4号・1-5号・1-6号・1-6号別紙・1-17号・分野参考様式第11-1号</b>は所属機関ごとに書式・中身が違うので、{orgName}の版（PDF）を登録して記入位置を置きます。
        ほかの様式は全員共通の版を使います。どちらも、本人の国籍の言語の版 → 日本語の版の順に使います。
      </p>

      {/* この所属機関の人と言語 */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-3 text-xs">
        <p className="mb-1 font-bold">この所属機関の人（在籍中・申請準備中）と言語</p>
        {people.length === 0 ? (
          <p className="text-muted">まだいません（日本語の版だけを見ます）。</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {[...byLang.entries()].map(([l, ps]) => (
              <li key={l}>
                <b>{l}</b>：
                {ps.map((p) => `${p.name}${p.preparing ? "（申請準備中）" : ""}`).join("、")}
              </li>
            ))}
          </ul>
        )}
      </div>

      {refForms.error && <p className="mb-3 rounded bg-seal/10 p-2 text-xs text-seal">{refForms.error}</p>}

      {/* 所属機関がわでやること */}
      <section className="mb-5 rounded-xl border-2 border-brand/40 bg-brand/5 p-3">
        <h2 className="mb-1 flex items-center gap-1 text-sm font-bold text-brand">
          <CircleAlert size={15} />
          {orgName}で用意すること（{todos.length}件）
        </h2>
        {todos.length === 0 ? (
          <p className="text-xs text-status-approved-fg">所属機関別の様式は、この所属機関の人の言語の版がそろっています。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {todos.map((t) => (
              <li key={`${t.key}:${t.language}`} className="flex flex-wrap items-center gap-2">
                <span>
                  <b>{refFormName(t.key)}</b>（{formLabelOf(t.key)}）の<b>{t.language}</b>の版：
                  {t.cell.status === "missing" ? "PDF を登録して、記入位置を置く" : "記入位置を置く"}
                </span>
                <button
                  type="button"
                  onClick={() => setManaging({ key: t.key, language: t.language })}
                  className="inline-flex min-h-[28px] items-center gap-1 rounded-md bg-brand px-2 font-bold text-brand-foreground"
                >
                  <PenLine size={12} />
                  {t.cell.status === "missing" ? "登録する" : "記入位置を置く"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {table(
        `所属機関別の様式（${orgName}の版）`,
        `${orgName}だけの版を見ます。未登録の言語は、今は全員共通の版（あれば）で作ります。`,
        orgKeys,
      )}
      {table("全員共通の様式", "全員共通の版を見ます（ほかの所属機関とも同じ版を使います）。", commonKeys)}

      {managing && (
        <RefFormTemplatesDialog
          formKey={managing.key}
          formLabel={formLabelOf(managing.key)}
          templates={refForms.templates}
          defaultLanguage={managing.language}
          defaultScope={isOrgSpecificRefForm(managing.key) ? "org" : "common"}
          orgId={orgId}
          orgName={orgName}
          onClose={() => setManaging(null)}
          onChanged={() => refForms.reload()}
        />
      )}
    </div>
  );
}
