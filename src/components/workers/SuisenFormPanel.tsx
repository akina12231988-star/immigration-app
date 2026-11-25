"use client";

import { useEffect, useState } from "react";
import { Eye, Loader2, Printer } from "lucide-react";
import { RefFormRowBar, RefFormTemplatesDialog, refFormHref, useRefFormTemplates } from "@/components/ref-forms/RefFormPanel";
import { languageForNationality, pickRefFormTemplate, refFormName, SUISEN_REF_FORM_KEY } from "@/lib/ref-form";
import { blobToPdfPart, mergePdfParts, rasterizePdfInBrowser, type PdfPart } from "@/lib/pdf-merge";
import { getPassportFilePreviewUrl } from "@/app/(app)/workers/passport-file-actions";
import { getOnboardingDocDownloadUrl } from "@/app/(app)/onboarding/actions";

// 推薦状の発行に出す書類で一緒に印刷するパスポートの画像・PDF
export interface SuisenPassportFile {
  id: string;
  source: "passport" | "doc"; // passport = 出入国の記録のパスポート（スタンプページなど）／doc = 入社書類のパスポートの写し
  label: string;
  date: string; // 添付した日（YYYY-MM-DD）
}

const STORE_KEY = (workerId: string) => `suisen-passport-pick:${workerId}`;

// 申請準備の詳細の「推薦状」の行に出す欄。
//  ・推薦状の発行に必要な書類（大使館・送り出し機関に出す申請書など）の PDF をひな形として登録し、
//    どこに何の情報を書くか（記入位置）を置いておくと、この人の情報を書き込んだ PDF を作れる（参考様式と同じ仕組み）
//  ・パスポートの画像（出入国の記録・入社書類で添付したもの）から印刷するものを選び、書類と一緒に1つの PDF にして印刷する
export function SuisenFormPanel({
  workerId,
  nationality,
  orgId,
  orgName,
  todoNo,
  canEdit,
  passportFiles,
}: {
  workerId: string;
  nationality: string;
  orgId: string | null;
  orgName: string;
  todoNo: string;
  canEdit: boolean;
  passportFiles: SuisenPassportFile[];
}) {
  const refForms = useRefFormTemplates();
  const [managing, setManaging] = useState(false);
  const [off, setOff] = useState<string[]>([]);
  // 印刷するパスポート（選んだものは次に開いたときも同じにする。最初は全部）
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<null | "all" | "passport">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY(workerId));
      // 保存した選択を読み込むだけ（外部の保存場所と同期する）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setPicked(JSON.parse(raw) as string[]);
    } catch {
      // 読めなければ最初の状態（全部）のまま
    }
  }, [workerId]);
  const pickedIds = picked ?? passportFiles.map((f) => f.id);
  const setPick = (next: string[]) => {
    setPicked(next);
    try {
      window.localStorage.setItem(STORE_KEY(workerId), JSON.stringify(next));
    } catch {
      // 覚えておけなくても印刷はできる
    }
  };

  const template = pickRefFormTemplate(refForms.templates, SUISEN_REF_FORM_KEY, nationality, orgId);
  const chosen = passportFiles.filter((f) => pickedIds.includes(f.id));

  const fileUrl = async (f: SuisenPassportFile): Promise<{ url: string; name: string }> => {
    if (f.source === "passport") {
      const res = await getPassportFilePreviewUrl(f.id);
      if (!res.ok) throw new Error(`${f.label}: ${res.message}`);
      return { url: res.url, name: f.label };
    }
    const res = await getOnboardingDocDownloadUrl(f.id);
    if (!res.ok) throw new Error(`${f.label}: ${res.message}`);
    return { url: res.url, name: res.fileName || f.label };
  };

  const preview = async (f: SuisenPassportFile) => {
    setError(null);
    try {
      window.open((await fileUrl(f)).url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "開けませんでした");
    }
  };

  // 書類（記入済み）＋選んだパスポート（mode=passport はパスポートだけ）を1つの PDF にして新しいタブで開く
  const print = async (mode: "all" | "passport") => {
    setError(null);
    const w = window.open("", "_blank");
    if (!w) {
      setError("新しいタブを開けませんでした。ブラウザのポップアップの許可をご確認ください。");
      return;
    }
    w.document.write("<p style='font-family:sans-serif;padding:24px'>印刷する PDF を作っています…</p>");
    setBusy(mode);
    try {
      const parts: PdfPart[] = [];
      if (mode === "all" && template) {
        const res = await fetch(refFormHref(workerId, [SUISEN_REF_FORM_KEY], "all", off, todoNo));
        if (!res.ok) throw new Error(`${refFormName(SUISEN_REF_FORM_KEY)}を作れませんでした`);
        parts.push({ kind: "pdf", bytes: await res.arrayBuffer(), name: refFormName(SUISEN_REF_FORM_KEY) });
      }
      for (const f of chosen) {
        const { url, name } = await fileUrl(f);
        const part = await blobToPdfPart(await (await fetch(url)).blob(), name);
        if (!part) throw new Error(`${f.label} は画像・PDF ではないので入れられません`);
        parts.push(part);
      }
      if (parts.length === 0) throw new Error("印刷するものがありません（ひな形を登録するか、パスポートを選んでください）");
      const bytes = await mergePdfParts(parts, { rasterize: rasterizePdfInBrowser });
      w.location.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    } catch (err) {
      w.close();
      setError(err instanceof Error ? err.message : "PDF を作れませんでした");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ml-[18px] mt-2 space-y-2 rounded-lg border border-brand/30 bg-brand/5 p-2 text-[11px]">
      <p className="font-bold text-brand">推薦状の発行に出す書類（ひな形に情報を書き込んで、パスポートと一緒に印刷）</p>
      <RefFormRowBar
        formKey={SUISEN_REF_FORM_KEY}
        workerId={workerId}
        nationality={nationality}
        orgId={orgId}
        orgName={orgName}
        templates={refForms.templates}
        canEdit={canEdit}
        onManage={() => setManaging(true)}
        off={off}
        onOffChange={setOff}
        todoNo={todoNo}
      />
      {refForms.error && <p className="text-seal">{refForms.error}</p>}
      {!template && (
        <p className="text-muted">
          「ひな形・記入位置」から、推薦状の発行に必要な書類の PDF を登録し、名前・生年月日・パスポート番号などを書く位置を置いてください（国籍の言語ごとに登録できます）。
        </p>
      )}

      <div className="rounded-md border border-border bg-background p-2">
        <p className="mb-1 font-bold">一緒に印刷するパスポート（{chosen.length}/{passportFiles.length}）</p>
        {passportFiles.length === 0 ? (
          <p className="text-muted">パスポートの画像がまだありません。この画面の「パスポート」の行か、外国人詳細の出入国の記録で添付してください。</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {passportFiles.map((f) => (
              <li key={`${f.source}:${f.id}`} className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-[32px] flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={pickedIds.includes(f.id)}
                    onChange={(e) => setPick(e.target.checked ? [...pickedIds, f.id] : pickedIds.filter((x) => x !== f.id))}
                  />
                  <span className="font-bold">{f.label}</span>
                  {f.date && <span className="text-muted">{f.date}</span>}
                </label>
                <button type="button" onClick={() => void preview(f)} className="inline-flex items-center gap-1 font-bold text-brand">
                  <Eye size={12} />
                  見る
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void print("all")}
          disabled={busy != null || (!template && chosen.length === 0)}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-brand px-3 font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy === "all" ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
          {template ? "書類＋選んだパスポートを印刷" : "選んだパスポートを印刷"}
        </button>
        {template && (
          <button
            type="button"
            onClick={() => void print("passport")}
            disabled={busy != null || chosen.length === 0}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-brand bg-surface px-3 font-bold text-brand disabled:opacity-50"
          >
            {busy === "passport" ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
            パスポートだけ印刷
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="font-bold text-seal">
          {error}
        </p>
      )}

      {managing && (
        <RefFormTemplatesDialog
          formKey={SUISEN_REF_FORM_KEY}
          formLabel={refFormName(SUISEN_REF_FORM_KEY)}
          templates={refForms.templates}
          defaultLanguage={languageForNationality(nationality) || "日本語"}
          orgId={orgId}
          orgName={orgName}
          onClose={() => setManaging(false)}
          onChanged={refForms.reload}
        />
      )}
    </div>
  );
}
