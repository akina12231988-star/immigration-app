"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ImageUp, MessageSquareText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOrganization, updateOrganization } from "@/lib/supabase/queries/organizations";
import { createPrepResumeTicket, getPrepResumeUrl, removePrepResume } from "@/app/(app)/workers/prep-resume-actions";
import { dbErrorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/ssw/calc";
import {
  HOUSING_ASK_STAFF,
  HOUSING_LABEL,
  HOUSING_OPTIONS,
  PAY_SYSTEMS,
  hireConditionMessage,
  housingQuestionText,
  isPaySystem,
  daysSince,
  thanhAskState,
  type HireCheck,
  type PaySystem,
} from "@/lib/hire-check";
import type { OrganizationInput } from "@/types/db";
import { STAMP_FEE_PAYERS, stampFeePayerLabel, type StampFeePayer } from "@/lib/stamp-fee";

// 申請準備の「所属機関への採用条件の確認」。
//  ① 所属機関の給与の形態（月給制／時給制）を登録する（所属機関の情報に保存）
//  ② VUONG VAN THANH に住居（社宅／自分で契約）を聞いて押す
//  ③ ①②がそろったら、所属機関のLINEグループに送る文章をコピーする
//  あわせて履歴書の画像をアップロードし、LINEに貼れるよう画像としてコピーする
export function HireCheckPanel({
  checklistId,
  workerName,
  orgId,
  orgName,
  orgPaySystem,
  stampFeePayer,
  askStampFee,
  onStampFeeSave,
  value,
  canEdit,
  onSave,
  onOrgPaySaved,
  wages,
}: {
  checklistId: string;
  workerName: string;
  orgId: string | null;
  orgName: string;
  orgPaySystem: string;
  stampFeePayer: StampFeePayer | ""; // いまの収入印紙代の負担（未設定なら ''）
  askStampFee: boolean; // THANHに印紙代も聞くか（申請種別・所属機関で自動で決まらないとき）
  onStampFeeSave?: (payer: StampFeePayer | "") => void; // THANHの答えで印紙代の負担を選ぶ（申請準備の「収入印紙代」に保存）
  value: HireCheck;
  canEdit: boolean;
  onSave: (next: HireCheck) => Promise<void> | void;
  onOrgPaySaved?: (pay: PaySystem | "") => void;
  wages?: React.ReactNode; // ④ 所属機関からの返答の下に出す賃金（時給・月給）の入力欄
}) {
  // 給与の形態（画面で押した値。押していなければ所属機関の登録内容）
  const [payPicked, setPay] = useState<PaySystem | "" | null>(null);
  const pay: PaySystem | "" = payPicked ?? (isPaySystem(orgPaySystem) ? orgPaySystem : "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [resumeUrlState, setResumeUrl] = useState<{ path: string; url: string | null } | null>(null);
  const resumeUrl = resumeUrlState?.path === value.resume_path ? resumeUrlState.url : null;
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const message = hireConditionMessage(workerName, pay, value.housing);
  const stampFeeDecided = !!stampFeePayer;
  const askState = thanhAskState(value, stampFeeDecided);
  const waitDays = daysSince(value.thanh_asked_on, todayStr());
  const replyWaitDays = daysSince(value.message_copied_on, todayStr());
  const [replyNote, setReplyNote] = useState(value.reply_note);

  // 履歴書の画像の表示用URL
  useEffect(() => {
    const path = value.resume_path;
    if (!path) return;
    let cancelled = false;
    void getPrepResumeUrl(checklistId, path).then((r) => {
      if (!cancelled) setResumeUrl({ path, url: r.ok ? r.url : null });
    });
    return () => {
      cancelled = true;
    };
  }, [checklistId, value.resume_path]);

  const flash = (key: string) => {
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  };

  // ① 給与の形態を所属機関の情報に保存する（ほかの項目を消さないよう、保存の直前に読み直す）
  const savePay = async (p: PaySystem) => {
    if (!orgId) return;
    const next = pay === p ? "" : p;
    setPay(next);
    setError(null);
    try {
      const supabase = createClient();
      const org = await getOrganization(supabase, orgId);
      if (!org) throw new Error("所属機関が見つかりません");
      await updateOrganization(supabase, orgId, { intake: { ...(org.intake ?? {}), pay_system: next } } as Partial<OrganizationInput>);
      onOrgPaySaved?.(next);
    } catch (err) {
      setError(dbErrorMessage(err, "", "給与の形態の保存に失敗しました"));
    }
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    flash(key);
  };

  // 履歴書を画像としてクリップボードに入れる（LINEのトークにそのまま貼れる）。
  // クリップボードは PNG だけを受け付けるので、JPEG などは描き直して PNG にする
  const copyResumeImage = async () => {
    if (!resumeUrl) return;
    setError(null);
    try {
      const blob = await (await fetch(resumeUrl)).blob();
      const png =
        blob.type === "image/png"
          ? blob
          : await new Promise<Blob>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                const c = document.createElement("canvas");
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                c.getContext("2d")?.drawImage(img, 0, 0);
                c.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を変換できませんでした"))), "image/png");
              };
              img.onerror = () => reject(new Error("画像を読み込めませんでした"));
              img.src = URL.createObjectURL(blob);
            });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      flash("resume");
    } catch (err) {
      setError(err instanceof Error ? `画像をコピーできませんでした: ${err.message}` : "画像をコピーできませんでした");
    }
  };

  const uploadResume = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const ticket = await createPrepResumeTicket(checklistId, file.type);
      if (!ticket.ok) throw new Error(ticket.message);
      const { error: upErr } = await createClient()
        .storage.from("app-files")
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
      const old = value.resume_path;
      await onSave({ ...value, resume_path: ticket.path, resume_name: file.name });
      if (old) await removePrepResume(checklistId, old);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const step = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold";
  const pill = (on: boolean) =>
    `min-h-[38px] rounded-xl border px-3 text-xs font-bold disabled:opacity-60 ${
      on ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background text-foreground hover:border-brand"
    }`;
  const copyBtn =
    "inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-brand px-2.5 text-[11px] font-bold text-brand hover:bg-brand/5 disabled:opacity-50";

  return (
    <div className="rounded-xl border-2 border-brand/30 bg-background p-3">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
        <MessageSquareText size={15} />
        所属機関への採用条件の確認（LINEグループ）
      </p>
      <p className="mb-3 text-[11px] text-muted">
        {orgName || "所属機関"} のLINEグループで、{workerName}さんの{pay === "月給制" ? "月給" : pay === "時給制" ? "時給" : "時給（月給）"}と居住費用を聞きます。①②がそろうと、送る文章ができます。
      </p>
      {error && <p className="mb-2 rounded-lg bg-seal/10 px-2 py-1.5 text-xs text-seal">{error}</p>}

      <div className="space-y-3">
        {/* ① 給与の形態 */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
            <span className={`${step} ${pay ? "bg-status-approved-bg text-status-approved-fg" : "bg-seal text-white"}`}>
              {pay ? <Check size={12} /> : "1"}
            </span>
            {orgName || "所属機関"} は月給制ですか？時給制ですか？
            <span className="font-normal text-muted">（所属機関の情報に保存します）</span>
          </p>
          <div className="flex flex-wrap gap-2 pl-6">
            {PAY_SYSTEMS.map((p) => (
              <button key={p} type="button" disabled={!canEdit || !orgId} onClick={() => void savePay(p)} className={pill(pay === p)}>
                {p}
              </button>
            ))}
            {!orgId && <span className="self-center text-[11px] text-seal">所属機関が未設定です</span>}
          </div>
        </div>

        {/* ② 住居（THANHに聞く） */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
            <span
              className={`${step} ${
                askState === "answered" ? "bg-status-approved-bg text-status-approved-fg" : askState === "waiting" ? "bg-status-notice-fg text-white" : "bg-seal text-white"
              }`}
            >
              {askState === "answered" ? <Check size={12} /> : "2"}
            </span>
            {HOUSING_ASK_STAFF} さんに居住場所{askStampFee ? "と印紙代の負担" : ""}を聞く
            {/* 聞いたかどうか・返答待ちかを一目で分かるようにする */}
            {askState === "notAsked" && (
              <span className="rounded-full bg-seal/10 px-2 py-0.5 text-[10px] font-bold text-seal">まだ聞いていません</span>
            )}
            {askState === "waiting" && (
              <span className="rounded-full bg-status-notice-bg px-2 py-0.5 text-[10px] font-bold text-status-notice-fg">
                返答待ち
                {value.thanh_asked_on && `（${value.thanh_asked_on.replace(/-/g, "/")} に聞いた・${waitDays === 0 ? "今日" : `${waitDays}日たっています`}）`}
              </span>
            )}
            {askState === "answered" && (
              <span className="rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">返答あり</span>
            )}
          </p>
          {askState === "waiting" && (
            <p className="mb-1 pl-6 text-[11px] font-bold text-status-notice-fg">
              THANHさんの返答を待っています。返答が来たら、
              {!value.housing && "下の「THANHさんの答え（居住場所）」"}
              {!value.housing && !stampFeeDecided && "と"}
              {!stampFeeDecided && "「THANHさんの答え（印紙代）」"}
              を押してください。
            </p>
          )}
          <div className="space-y-1.5 pl-6">
            {/* 先にTHANHへの質問をコピーしてMessengerのグループで聞き、答えを聞いてから下のボタンを押す */}
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-2 font-sans text-xs leading-relaxed">
              {housingQuestionText({ askStampFee })}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await copyText("thanh", housingQuestionText({ askStampFee }));
                  if (canEdit && !value.thanh_asked_on) void onSave({ ...value, thanh_asked_on: todayStr() });
                }}
                className={copyBtn}
              >
                {copied === "thanh" ? <Check size={13} /> : <Copy size={13} />}
                {copied === "thanh" ? "コピーしました" : "THANHさんへの質問をコピー"}
              </button>
              {value.thanh_asked_on && <span className="text-[10px] text-muted">{value.thanh_asked_on.replace(/-/g, "/")} に聞きました</span>}
              {/* コピーしただけで送っていなかったときに、「まだ聞いていない」に戻せる */}
              {canEdit && value.thanh_asked_on && !value.housing && (
                <button
                  type="button"
                  onClick={() => void onSave({ ...value, thanh_asked_on: null })}
                  className="text-[10px] font-bold text-muted underline"
                >
                  まだ聞いていないに戻す
                </button>
              )}
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
            <span className="text-[11px] font-bold">THANHさんの答え（居住場所）:</span>
            {HOUSING_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                disabled={!canEdit || (!value.thanh_asked_on && !value.housing)}
                title={!value.thanh_asked_on && !value.housing ? "先にTHANHさんへの質問をコピーして聞いてください" : undefined}
                onClick={() =>
                  void onSave({ ...value, housing: value.housing === h ? "" : h, housing_on: value.housing === h ? null : todayStr() })
                }
                className={pill(value.housing === h)}
              >
                {HOUSING_LABEL[h]}
              </button>
            ))}
            {value.housing_on && <span className="text-[10px] text-muted">（{value.housing_on.replace(/-/g, "/")} に確認）</span>}
            {!value.thanh_asked_on && !value.housing && (
              <span className="text-[11px] text-seal">先に上の質問をコピーしてTHANHさんに聞いてから押してください</span>
            )}
          </div>
          {/* 印紙代も聞いたときは、THANHの答えをここで押す（申請準備の「収入印紙代」に保存される） */}
          {(askStampFee || stampFeePayer) && onStampFeeSave && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
              <span className="text-[11px] font-bold">THANHさんの答え（印紙代）:</span>
              {STAMP_FEE_PAYERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!canEdit || (askStampFee && !value.thanh_asked_on && !stampFeePayer)}
                  title={askStampFee && !value.thanh_asked_on && !stampFeePayer ? "先にTHANHさんへの質問をコピーして聞いてください" : undefined}
                  onClick={() => onStampFeeSave(stampFeePayer === p ? "" : p)}
                  className={pill(stampFeePayer === p)}
                >
                  {stampFeePayerLabel(p)}
                </button>
              ))}
              {!askStampFee && stampFeePayer ? (
                <span className="text-[10px] text-muted">（申請種別・所属機関で決まっている負担です）</span>
              ) : (
                <span className="text-[10px] text-muted">下の「収入印紙代」と同じ設定です（どちらで押しても両方に入ります）</span>
              )}
            </div>
          )}
        </div>

        {/* ③ 所属機関への文章 */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
            <span className={`${step} ${value.message_copied_on ? "bg-status-approved-bg text-status-approved-fg" : message ? "bg-brand text-brand-foreground" : "bg-border text-muted"}`}>
              {value.message_copied_on ? <Check size={12} /> : "3"}
            </span>
            所属機関のLINEグループに送る文章
          </p>
          <div className="pl-6">
            {message ? (
              <>
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-2.5 font-sans text-xs leading-relaxed">{message}</pre>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await copyText("message", message);
                      if (canEdit) void onSave({ ...value, message_copied_on: todayStr() });
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground"
                  >
                    {copied === "message" ? <Check size={14} /> : <Copy size={14} />}
                    {copied === "message" ? "コピーしました" : "文章をコピー"}
                  </button>
                  {value.message_copied_on && (
                    <span className="text-[11px] text-muted">{value.message_copied_on.replace(/-/g, "/")} にコピーしました</span>
                  )}
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-surface p-2.5 text-[11px] text-muted">
                ①（月給制／時給制）と②（社宅に住む／本人契約のアパート）を選ぶと、ここに文章ができます。
              </p>
            )}
          </div>
        </div>

        {/* 履歴書の画像 */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
            <ImageUp size={14} className="text-muted" />
            履歴書（画像）
            <span className="font-normal text-muted">— 文章と一緒にLINEに貼れるよう、画像としてコピーできます</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadResume(f);
            }}
          />
          {/* 画像をここにドラッグ＆ドロップ（または押して選ぶ・コピーした画像を貼り付け）でもアップロードできる */}
          <div
            className={`ml-6 flex flex-wrap items-start gap-3 rounded-xl border-2 border-dashed p-2.5 transition-colors ${
              dragging ? "border-brand bg-brand/5" : "border-transparent"
            }`}
            onDragOver={(e) => {
              if (!canEdit || busy) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              if (!canEdit || busy) return;
              e.preventDefault();
              setDragging(false);
              const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
              if (f) void uploadResume(f);
              else setError("履歴書は画像（JPEG・PNG・WebP）をドロップしてください");
            }}
            onPaste={(e) => {
              if (!canEdit || busy) return;
              const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                void uploadResume(f);
              }
            }}
            tabIndex={canEdit ? 0 : -1}
          >
            {dragging && <p className="w-full text-center text-xs font-bold text-brand">ここに離すとアップロードします</p>}
            {resumeUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resumeUrl} alt={`${workerName}さんの履歴書`} className="h-32 w-auto rounded-lg border border-border object-contain" />
            ) : value.resume_path ? (
              <span className="text-[11px] text-muted">読み込み中…</span>
            ) : null}
            <div className="flex flex-col gap-1.5">
              {value.resume_path && (
                <button type="button" onClick={() => void copyResumeImage()} disabled={!resumeUrl} className={copyBtn}>
                  {copied === "resume" ? <Check size={13} /> : <Copy size={13} />}
                  {copied === "resume" ? "画像をコピーしました" : "履歴書の画像をコピー"}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-dashed border-brand px-2.5 text-[11px] font-bold text-brand disabled:opacity-50"
                >
                  <ImageUp size={13} />
                  {busy ? "アップロード中…" : value.resume_path ? "画像を差し替える" : "履歴書の画像をアップロード"}
                </button>
              )}
              {value.resume_name && <span className="text-[10px] text-muted">{value.resume_name}</span>}
              {canEdit && !busy && (
                <span className="text-[10px] text-muted">画像をこの枠にドラッグ＆ドロップ、または枠を押して Ctrl+V（⌘+V）で貼り付けてもアップロードできます</span>
              )}
            </div>
          </div>
        </div>

        {/* ④ 所属機関からの返答。返答が来たら日付を入れ、気になることは備考に書く。
            その下で賃金（時給・月給）をそのまま入れられるようにする */}
        <div className="border-t border-dashed border-border pt-3">
          <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className={`${step} ${value.reply_on ? "bg-status-approved-bg text-status-approved-fg" : value.message_copied_on ? "bg-status-notice-fg text-white" : "bg-border text-muted"}`}>
              {value.reply_on ? <Check size={12} /> : "4"}
            </span>
            {orgName || "所属機関"} からの返答
            {value.reply_on ? (
              <span className="rounded-full bg-status-approved-bg px-2 py-0.5 text-[10px] font-bold text-status-approved-fg">
                返答あり（{value.reply_on.replace(/-/g, "/")}）
              </span>
            ) : value.message_copied_on ? (
              <span className="rounded-full bg-status-notice-bg px-2 py-0.5 text-[10px] font-bold text-status-notice-fg">
                返答待ち（{value.message_copied_on.replace(/-/g, "/")} に送った・{replyWaitDays === 0 ? "今日" : `${replyWaitDays}日たっています`}）
              </span>
            ) : null}
          </p>
          <div className="space-y-2 pl-6">
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && !value.reply_on && (
                <button
                  type="button"
                  onClick={() => void onSave({ ...value, reply_on: todayStr() })}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground"
                >
                  <Check size={14} />
                  返答が来た（今日）
                </button>
              )}
              <label className="flex items-center gap-1 text-[11px] text-muted">
                返答が来た日
                <input
                  type="date"
                  value={value.reply_on ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => void onSave({ ...value, reply_on: e.target.value || null })}
                  className="min-h-[32px] rounded-lg border border-border bg-background px-2 text-xs"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-bold text-muted">備考（所属機関からの返答で気になること・決まったことなど）</span>
              <textarea
                value={replyNote}
                disabled={!canEdit}
                onChange={(e) => setReplyNote(e.target.value)}
                onBlur={() => replyNote !== value.reply_note && void onSave({ ...value, reply_note: replyNote })}
                rows={3}
                placeholder="例: 社宅の家賃は月2万円、光熱費は実費。試用期間3か月は時給1,000円 など"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs leading-relaxed focus:border-brand focus:outline-none disabled:opacity-60"
              />
            </label>
            {/* 返答の金額を、そのまま賃金（時給・月給）に入れる */}
            {wages && (
              <div>
                <p className="mb-1 text-[11px] font-bold text-muted">返答の金額は、下の賃金（時給・月給）に入れてください</p>
                {wages}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
