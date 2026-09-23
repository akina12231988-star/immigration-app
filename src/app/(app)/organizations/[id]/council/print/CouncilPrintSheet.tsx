"use client";

import { useState } from "react";
import { Languages, Loader2, Printer, Save } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { createClient } from "@/lib/supabase/client";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import {
  COUNCIL_DICT,
  COUNCIL_LANGS,
  councilDate,
  councilListRows,
  normalizeCouncilTranslations,
  translateBranch,
  translateCity,
  translateMethod,
  untranslatedTexts,
  type CouncilLang,
  type CouncilListRow,
  type CouncilTranslations,
} from "@/lib/council-list";
import type { OrganizationIntake } from "@/types/db";

type Form = "3v" | "1-17";

const JA = {
  office: "支援対象者が活動する事業所の所在地",
  residence: "支援対象者の住居地",
  branch: "営業所名",
  city: "市区町村",
  date: "提出年月日",
  method: "確認方法",
};

// 協力確認書の提出先の一覧表（プレビュー → 印刷・PDF保存）。
// 3 V（別紙）は日本語だけで A4縦1枚、1-17号（別紙）は訳つきで A4横（事業所の所在地1枚・住居地1枚）。
// 1-17号の営業所名・市区町村の訳は自動翻訳でき、手で直して所属機関に保存できる（次から使い回す）
export function CouncilPrintSheet({
  orgId,
  orgName,
  intake,
  initialForm,
  initialLang,
  canEdit,
}: {
  orgId: string;
  orgName: string;
  intake: OrganizationIntake;
  initialForm: Form;
  initialLang: CouncilLang;
  canEdit: boolean;
}) {
  const [form, setForm] = useState<Form>(initialForm);
  const [lang, setLang] = useState<CouncilLang>(initialLang);
  const [saved, setSaved] = useState<CouncilTranslations>(() => normalizeCouncilTranslations(intake.council_i18n));
  const [draft, setDraft] = useState<CouncilTranslations>(() => normalizeCouncilTranslations(intake.council_i18n));
  const [busy, setBusy] = useState<"translate" | "save" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const office = councilListRows(intake.council_office_submissions);
  const residence = councilListRows(intake.council_residence_submissions);
  const allRows = [...office, ...residence];
  // 訳を確認・修正する文（営業所名・市区町村・その他の確認方法。本社・メールなど辞書で訳す語は除く）
  const sources = Array.from(
    new Set(
      allRows.flatMap((r) => [
        r.branch && r.branch !== "本社" ? r.branch : "",
        r.city,
        r.method && r.method !== "メール" && r.method !== "提出した書面の控え" ? r.method : "",
      ]),
    ),
  ).filter(Boolean);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const setDraftText = (src: string, text: string) =>
    setDraft((d) => ({ ...d, [lang]: { ...(d[lang] ?? {}), [src]: text } }));

  const autoTranslate = async () => {
    const texts = untranslatedTexts(allRows, lang, draft);
    if (texts.length === 0) {
      setMessage({ ok: true, text: "訳が無い項目はありません。" });
      return;
    }
    setBusy("translate");
    setMessage(null);
    try {
      const res = await fetch("/api/council-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, texts }),
      });
      const json = (await res.json()) as { translations?: Record<string, string>; error?: string };
      if (!res.ok) throw new Error(json.error ?? "翻訳に失敗しました");
      setDraft((d) => ({ ...d, [lang]: { ...(d[lang] ?? {}), ...(json.translations ?? {}) } }));
      setMessage({ ok: true, text: "自動翻訳しました。内容を確認して「訳を保存」を押してください。" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "翻訳に失敗しました" });
    } finally {
      setBusy(null);
    }
  };

  const saveTranslations = async () => {
    setBusy("save");
    setMessage(null);
    try {
      const clean = normalizeCouncilTranslations(draft);
      await updateOrganization(createClient(), orgId, { intake: { ...intake, council_i18n: clean } });
      setSaved(clean);
      setDraft(clean);
      setMessage({ ok: true, text: "訳を保存しました（次からこの会社の一覧表で使われます）。" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "保存に失敗しました" });
    } finally {
      setBusy(null);
    }
  };

  const printSheet = () => {
    const original = document.title;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    document.title = `${orgName}_協力確認書_${form === "3v" ? "3V別紙" : `1-17号別紙_${COUNCIL_LANGS.find((l) => l.code === lang)?.name ?? ""}`}`;
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const tab = (f: Form, label: string) => (
    <button
      type="button"
      onClick={() => setForm(f)}
      className={`rounded-lg border px-3 py-2 text-sm font-bold ${
        form === f ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <style>
        {form === "3v"
          ? "@media print{@page{size:A4 portrait;margin:12mm} body{background:#fff}}"
          : "@media print{@page{size:A4 landscape;margin:10mm} body{background:#fff}}"}
      </style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref={`/organizations/${orgId}`} />
          <h1 className="flex-1 text-lg font-bold">協力確認書の提出先の一覧表（{orgName}）</h1>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            所属機関の「協力確認書の提出」（事業所の所在地・住居地）から作った一覧表です。提出先の「（本社）長崎県雲仙市」のように括弧で書いた部分を営業所名にしています。
            提出先を直すときは所属機関の画面で編集して保存してから開き直してください。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {tab("3v", "所属機関等作成用3 V（別紙）A4縦・翻訳なし")}
            {tab("1-17", "参考様式1-17号（別紙）A4横・翻訳つき")}
            {form === "1-17" && (
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as CouncilLang)}
                className="min-h-[40px] rounded-lg border border-border bg-background px-2 text-sm"
              >
                {COUNCIL_LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {form === "1-17" && sources.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="flex-1 text-xs font-bold text-muted">
                  営業所名・市区町村の訳（{COUNCIL_LANGS.find((l) => l.code === lang)?.name}）
                </p>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => void autoTranslate()}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-lg border border-brand px-3 py-1.5 text-xs font-bold text-brand disabled:opacity-50"
                    >
                      {busy === "translate" ? <Loader2 size={13} className="animate-spin" /> : <Languages size={13} />}
                      訳が無い項目を自動翻訳
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTranslations()}
                      disabled={busy !== null || !dirty}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
                    >
                      <Save size={13} />
                      訳を保存
                    </button>
                  </>
                )}
              </div>
              {message && (
                <p className={`mb-2 rounded-lg px-2.5 py-1.5 text-xs ${message.ok ? "bg-status-reported-bg text-status-reported-fg" : "bg-seal/10 text-seal"}`}>
                  {message.text}
                </p>
              )}
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {sources.map((src) => (
                  <label key={src} className="flex items-center gap-2 text-xs">
                    <span className="w-40 shrink-0 truncate font-bold" title={src}>
                      {src}
                    </span>
                    <input
                      value={draft[lang]?.[src] ?? ""}
                      onChange={(e) => setDraftText(src, e.target.value)}
                      placeholder={translateCity(src, lang, {})}
                      disabled={!canEdit}
                      className="min-h-[34px] flex-1 rounded-lg border border-border bg-background px-2 text-sm"
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                空欄のままの項目は、表では目安（都道府県だけローマ字）で表示します。本社・メール・提出した書面の控えは自動で訳します。
              </p>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={printSheet}
              disabled={allRows.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              <Printer size={18} />
              印刷・PDF保存（{form === "3v" ? "A4縦" : "A4横"}）
            </button>
          </div>
          <p className="text-xs font-bold text-muted">プレビュー</p>
        </div>
      </div>

      {/* ここから下が印刷される部分 */}
      <div className="mx-auto bg-white px-4 pb-10 text-black print:p-0 lg:px-6 lg:py-6" style={{ maxWidth: form === "3v" ? "186mm" : "277mm" }}>
        {allRows.length === 0 ? (
          <p className="text-center text-sm">協力確認書の提出が登録されていません。</p>
        ) : form === "3v" ? (
          <ThreeVSheet office={office} residence={residence} />
        ) : (
          <>
            {office.length > 0 && (
              <Sheet117
                title={JA.office}
                titleTr={COUNCIL_DICT[lang].office}
                rows={office}
                lang={lang}
                tr={draft}
                breakAfter={residence.length > 0}
              />
            )}
            {residence.length > 0 && (
              <Sheet117 title={JA.residence} titleTr={COUNCIL_DICT[lang].residence} rows={residence} lang={lang} tr={draft} />
            )}
          </>
        )}
      </div>
    </>
  );
}

const PRINT_EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;

// 行数が多いときは文字と行の高さを縮めて1ページに収める。
// rows = 表の行数（見出し行を含む）、tables = 表の数（題名の高さ）、pageMm = 印刷できる高さ（mm）
function sizing(rows: number, tables: number, pageMm: number): { font: string; pad: string } {
  let font = 11;
  let pad = 2.2;
  const PT = 0.3528; // 1pt = 0.3528mm
  const height = () => rows * (font * PT * 1.5 + pad * 2 + 0.3) + tables * ((font + 2) * PT * 1.6 + 6) + 12;
  while (height() > pageMm && font > 7) {
    font -= 0.25;
    pad = Math.max(0.5, pad - 0.1);
  }
  return { font: `${font.toFixed(2)}pt`, pad: `${pad.toFixed(1)}mm` };
}

function ListTable({
  title,
  head,
  rows,
  font,
  pad,
  headBg,
}: {
  title: string;
  head: [string, string, string, string];
  rows: string[][];
  font: string;
  pad: string;
  headBg: string;
}) {
  const cell = "border border-[#999] px-2 text-center";
  return (
    <div className="mb-4 break-inside-avoid">
      <p className="mb-1.5 text-center" style={{ fontSize: `calc(${font} + 2pt)` }}>
        {title}
      </p>
      <table className="w-full border-collapse" style={{ fontSize: font, ...PRINT_EXACT }}>
        <thead>
          <tr style={{ background: headBg, color: headBg === "#1ea0f0" ? "#fff" : undefined }}>
            <th className={`${cell} w-[7%]`} style={{ paddingTop: pad, paddingBottom: pad }} />
            {head.map((h, i) => (
              <th key={i} className={`${cell} font-bold`} style={{ paddingTop: pad, paddingBottom: pad }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className={`${cell} bg-[#e6e6e6] font-bold`} style={{ paddingTop: pad, paddingBottom: pad }}>
                {i + 1}
              </td>
              {r.map((v, j) => (
                <td key={j} className={cell} style={{ paddingTop: pad, paddingBottom: pad }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const jaRow = (r: CouncilListRow) => [r.branch, r.city, councilDate(r.on, "ja"), r.method];

// 所属機関等作成用3 V（別紙）: 日本語だけ・A4縦1枚に事業所の所在地と住居地
function ThreeVSheet({ office, residence }: { office: CouncilListRow[]; residence: CouncilListRow[] }) {
  // A4縦（余白12mm）で印刷できる高さは約270mm
  const tables = (office.length > 0 ? 1 : 0) + (residence.length > 0 ? 1 : 0);
  const { font, pad } = sizing(office.length + residence.length + tables, tables, 265);
  const head: [string, string, string, string] = [JA.branch, JA.city, JA.date, JA.method];
  return (
    <section>
      {office.length > 0 && <ListTable title={JA.office} head={head} rows={office.map(jaRow)} font={font} pad={pad} headBg="#c8c8c8" />}
      {residence.length > 0 && (
        <ListTable title={JA.residence} head={head} rows={residence.map(jaRow)} font={font} pad={pad} headBg="#c8c8c8" />
      )}
    </section>
  );
}

// 参考様式1-17号（別紙）: A4横1枚に日本語の表と訳の表
function Sheet117({
  title,
  titleTr,
  rows,
  lang,
  tr,
  breakAfter = false,
}: {
  title: string;
  titleTr: string;
  rows: CouncilListRow[];
  lang: CouncilLang;
  tr: CouncilTranslations;
  breakAfter?: boolean;
}) {
  // A4横（余白10mm）で印刷できる高さは約190mm。日本語の表と訳の表の2つ＋「1-17号（別紙）」の行
  const { font, pad } = sizing(rows.length * 2 + 2, 2, 178);
  const d = COUNCIL_DICT[lang];
  return (
    <section className={breakAfter ? "mb-8 break-after-page print:mb-0" : ""}>
      <p className="mb-2" style={{ fontSize: "12pt" }}>
        1-17号（別紙）
      </p>
      <ListTable
        title={title}
        head={[JA.branch, JA.city, JA.date, JA.method]}
        rows={rows.map(jaRow)}
        font={font}
        pad={pad}
        headBg="#1ea0f0"
      />
      <ListTable
        title={titleTr}
        head={[d.branch, d.city, d.date, d.method]}
        rows={rows.map((r) => [
          translateBranch(r.branch, lang, tr),
          translateCity(r.city, lang, tr),
          councilDate(r.on, lang),
          translateMethod(r.method, lang, tr),
        ])}
        font={font}
        pad={pad}
        headBg="#1ea0f0"
      />
    </section>
  );
}
