"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, FileText, Loader2, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { clearOnboardingDocFile } from "@/app/(app)/onboarding/actions";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { todayJst } from "@/lib/jst-date";
import { useLockPageScroll } from "@/hooks/useLockPageScroll";
import {
  REASON_LETTER_DEFAULT_TITLE,
  REASON_LETTER_MIGRATION,
  REASON_LETTER_OPTION_LABELS,
  buildReasonLetterPdf,
  emptyReasonLetter,
  normalizeReasonLetterOptions,
  reasonLetterDocKey,
  reasonLetterFooterLines,
  reasonLetterFormKey,
  type ReasonLetter,
  type ReasonLetterOptions,
} from "@/lib/reason-letter";
import type { OnboardingDocumentRow } from "@/types/db";

// ---- 理由書（提出書類一覧表の行ごと。0233） ----

export interface ReasonLetterRecord extends ReasonLetter {
  id: string;
  rowKey: string;
  updatedAt: string;
}

type Row = {
  id: string;
  row_key: string;
  title: string;
  addressee: string;
  letter_date: string;
  body: string;
  options: unknown;
  updated_at: string;
};
const toRecord = (r: Row): ReasonLetterRecord => ({
  id: r.id,
  rowKey: r.row_key,
  title: r.title ?? "",
  addressee: r.addressee ?? "",
  letterDate: r.letter_date ?? "",
  body: r.body ?? "",
  options: normalizeReasonLetterOptions(r.options),
  updatedAt: r.updated_at,
});
const COLS = "id, row_key, title, addressee, letter_date, body, options, updated_at";

// この人・この申請（TODO番号）の理由書（行のキー → 記録）
export function useReasonLetters(workerId: string, todoNo: string) {
  const [records, setRecords] = useState<Record<string, ReasonLetterRecord>>({});
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error: err } = await createClient()
      .from("prep_reason_letters")
      .select(COLS)
      .eq("worker_id", workerId)
      .eq("todo_no", todoNo);
    if (err) {
      setError(dbErrorMessage(err, REASON_LETTER_MIGRATION, "理由書を読めませんでした"));
      return;
    }
    setError(null);
    setRecords(Object.fromEntries(((data as Row[] | null) ?? []).map((r) => [r.row_key, toRecord(r)])));
  }, [workerId, todoNo]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return { records, error, reload };
}

// 行の「理由書を添付する」。チェックすると理由書を作る画面が開く。作ってある理由書は見る・直す・外す
export function ReasonLetterControl({
  workerId,
  todoNo,
  rowKey,
  rowLabel,
  person,
  record,
  files,
  canEdit,
  onChanged,
  onPreview,
}: {
  workerId: string;
  todoNo: string;
  rowKey: string;
  rowLabel: string; // 例: 9 直近1年度分の…納税証明書
  person: { name: string; nationality: string; birth: string | null };
  record: ReasonLetterRecord | null;
  files: OnboardingDocumentRow[]; // この行の理由書として添付したファイル
  canEdit: boolean;
  onChanged: () => Promise<void> | void;
  onPreview: (f: OnboardingDocumentRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = !!record || files.length > 0;

  // チェックを外す: 理由書の記録と添付を消す
  const remove = async () => {
    if (!window.confirm(`「${rowLabel}」の理由書を外します（作った理由書と添付を消します）。よろしいですか？`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, reasonLetterDocKey(rowKey));
      if (!res.ok) throw new Error(res.message);
      if (record) {
        const { error: err } = await createClient().from("prep_reason_letters").delete().eq("id", record.id);
        if (err) throw err;
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "外せませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      <label className={`inline-flex items-center gap-1 ${has ? "font-bold text-brand" : "text-muted"}`}>
        <input
          type="checkbox"
          checked={has}
          disabled={!canEdit || busy}
          onChange={(e) => (e.target.checked ? setOpen(true) : void remove())}
        />
        理由書を添付する
      </label>
      {has && (
        <>
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPreview(f)}
              className="inline-flex items-center gap-1 rounded border border-brand/40 bg-surface px-1.5 py-0.5 font-bold text-brand"
              title="添付した理由書を開く"
            >
              <Eye size={11} />
              {f.file_name || "理由書.pdf"}
            </button>
          ))}
          {!files.length && <span className="text-seal">記録はありますが、まだ添付していません</span>}
          {canEdit && (
            <button type="button" onClick={() => setOpen(true)} className="font-bold text-brand underline">
              理由書を直す
            </button>
          )}
        </>
      )}
      {busy && <Loader2 size={12} className="animate-spin" />}
      {error && <span className="text-seal">{error}</span>}
      {open && (
        <ReasonLetterDialog
          workerId={workerId}
          todoNo={todoNo}
          rowKey={rowKey}
          rowLabel={rowLabel}
          person={person}
          record={record}
          onClose={() => setOpen(false)}
          onDone={async () => {
            setOpen(false);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

// 理由書を作る画面。題名・宛先・日付・本文と、最後に入れる項目を選び、作って添付する（内容は記録する）
function ReasonLetterDialog({
  workerId,
  todoNo,
  rowKey,
  rowLabel,
  person,
  record,
  onClose,
  onDone,
}: {
  workerId: string;
  todoNo: string;
  rowKey: string;
  rowLabel: string;
  person: { name: string; nationality: string; birth: string | null };
  record: ReasonLetterRecord | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  useLockPageScroll();
  const [letter, setLetter] = useState<ReasonLetter>(() =>
    record
      ? { title: record.title, addressee: record.addressee, letterDate: record.letterDate, body: record.body, options: record.options }
      : { ...emptyReasonLetter(todayJst()), title: "" },
  );
  const set = (patch: Partial<ReasonLetter>) => setLetter((l) => ({ ...l, ...patch }));
  const setOpt = (k: keyof ReasonLetterOptions, v: boolean) => setLetter((l) => ({ ...l, options: { ...l.options, [k]: v } }));
  const [supportOrgName, setSupportOrgName] = useState("");
  const [candidates, setCandidates] = useState<(ReasonLetterRecord & { workerName: string })[]>([]);
  const [busy, setBusy] = useState<null | "preview" | "attach">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    // 登録支援機関の名称（登録支援機関の情報）
    getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY)
      .then((v) => {
        if (!cancelled) setSupportOrgName(mergeCustodianInfo(v ?? null).officeName ?? "");
      })
      .catch(() => undefined);
    // 同じ書類でこれまでに作った理由書（新しい順・同じ本文は1つ）
    void supabase
      .from("prep_reason_letters")
      .select(`${COLS}, worker_id, todo_no, workers(name)`)
      .eq("form_key", reasonLetterFormKey(rowKey))
      .order("updated_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const list: (ReasonLetterRecord & { workerName: string })[] = [];
        for (const r of (data as (Row & { worker_id: string; todo_no: string; workers: { name: string } | null })[] | null) ?? []) {
          if (r.worker_id === workerId && r.todo_no === todoNo && r.row_key === rowKey) continue;
          const body = (r.body ?? "").trim();
          if (!body || seen.has(body)) continue;
          seen.add(body);
          list.push({ ...toRecord(r), workerName: r.workers?.name ?? "" });
        }
        setCandidates(list.slice(0, 20));
      });
    return () => {
      cancelled = true;
    };
  }, [workerId, todoNo, rowKey]);

  const makePdf = async (): Promise<Blob> => {
    const res = await fetch("/fonts/NotoSansJP-Regular.ttf");
    if (!res.ok) throw new Error("文字の形（フォント）を読み込めませんでした");
    const font = new Uint8Array(await res.arrayBuffer());
    const bytes = await buildReasonLetterPdf(
      font,
      { ...letter, title: letter.title.trim() || REASON_LETTER_DEFAULT_TITLE },
      reasonLetterFooterLines(letter.options, person, supportOrgName),
    );
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  };

  const preview = async () => {
    setBusy("preview");
    setError(null);
    const w = window.open("", "_blank");
    try {
      const url = URL.createObjectURL(await makePdf());
      if (w) w.location.href = url;
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      w?.close();
      setError(err instanceof Error ? err.message : "PDFを作れませんでした");
    } finally {
      setBusy(null);
    }
  };

  // 作って、その行に添付し、内容を記録する（前の理由書は差し替え）
  const attach = async () => {
    if (!letter.body.trim()) {
      setError("理由（本文）を入れてください。");
      return;
    }
    setBusy("attach");
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("prep_reason_letters").upsert(
        {
          worker_id: workerId,
          todo_no: todoNo,
          row_key: rowKey,
          form_key: reasonLetterFormKey(rowKey),
          title: letter.title.trim() || REASON_LETTER_DEFAULT_TITLE,
          addressee: letter.addressee,
          letter_date: letter.letterDate,
          body: letter.body,
          options: letter.options,
        },
        { onConflict: "worker_id,todo_no,row_key" },
      );
      if (err) throw new Error(dbErrorMessage(err, REASON_LETTER_MIGRATION, "理由書を記録できませんでした"));
      const blob = await makePdf();
      const title = letter.title.trim() || REASON_LETTER_DEFAULT_TITLE;
      const file = new File([blob], `${title}（${rowLabel.slice(0, 20)}）.pdf`, { type: "application/pdf" });
      await uploadOnboardingDoc(workerId, { key: reasonLetterDocKey(rowKey), label: `${title}（${rowLabel}）`, num: 0 }, file);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添付できませんでした");
    } finally {
      setBusy(null);
    }
  };

  const INPUT = "min-h-[36px] w-full rounded-lg border border-border bg-background px-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl bg-surface p-4 text-xs shadow-xl">
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-sm font-black">
              <FileText size={15} />
              理由書を作る
            </p>
            <p className="text-[11px] text-muted">{rowLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="p-1">
            <X size={18} />
          </button>
        </div>

        {/* 同じ書類で前に作った理由書。押すと本文などを入れるので、少し直して使う */}
        {candidates.length > 0 && (
          <div className="mb-3 rounded-lg border border-brand/30 bg-brand/5 p-2">
            <p className="mb-1 font-bold text-brand">前に作った理由書から選ぶ（押すと下に入ります。少し直してから添付してください）</p>
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setLetter((l) => ({ ...l, title: c.title === REASON_LETTER_DEFAULT_TITLE ? "" : c.title, addressee: c.addressee, body: c.body, options: c.options }))
                    }
                    className="w-full rounded border border-border bg-surface px-2 py-1 text-left hover:border-brand"
                  >
                    <span className="text-[10px] text-muted">
                      {c.workerName}・{c.updatedAt.slice(0, 10)}
                    </span>
                    <span className="block truncate">{c.body.replace(/\s+/g, " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted">題名（空なら「理由書」）</span>
            <input
              value={letter.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={REASON_LETTER_DEFAULT_TITLE}
              className={`${INPUT} placeholder:text-muted`}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted">日付（右上）</span>
            <input value={letter.letterDate} onChange={(e) => set({ letterDate: e.target.value })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span className="text-[11px] text-muted">宛先</span>
            <input value={letter.addressee} onChange={(e) => set({ addressee: e.target.value })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span className="text-[11px] text-muted">理由（本文）</span>
            <textarea
              value={letter.body}
              onChange={(e) => set({ body: e.target.value })}
              rows={9}
              placeholder="例: 申請人の令和7年度の個人住民税の納税証明書について、現在、住所地の市役所へ郵送で交付を請求しておりますが、申請日までに交付を受けることができませんでした。交付を受け次第、速やかに提出いたします。"
              className="w-full rounded-lg border border-border bg-background p-2 text-sm leading-relaxed"
            />
          </label>
        </div>

        <div className="mt-2 rounded-lg border border-border bg-background p-2">
          <p className="mb-1 font-bold">最後に入れる項目（右下）</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(Object.keys(REASON_LETTER_OPTION_LABELS) as (keyof ReasonLetterOptions)[]).map((k) => (
              <label key={k} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={letter.options[k]} onChange={(e) => setOpt(k, e.target.checked)} />
                {REASON_LETTER_OPTION_LABELS[k]}
                {k === "supportOrg" && supportOrgName ? `（${supportOrgName}）` : ""}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted">
            申請人：{person.name || "（氏名未登録）"}・{person.nationality || "国籍未登録"}・{person.birth || "生年月日未登録"}
          </p>
        </div>

        {error && <p className="mt-2 rounded bg-seal/10 p-2 text-seal">{error}</p>}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void preview()}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-brand bg-surface px-3 text-sm font-bold text-brand disabled:opacity-50"
          >
            {busy === "preview" ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            PDFを見る
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void attach()}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-brand px-4 text-sm font-black text-brand-foreground disabled:opacity-50"
          >
            {busy === "attach" ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            作って、この行に添付する（内容も記録）
          </button>
        </div>
      </div>
    </div>
  );
}
