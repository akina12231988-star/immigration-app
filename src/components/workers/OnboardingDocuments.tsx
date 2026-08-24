"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  Eye,
  FileText,
  Link2,
  Loader2,
  MailPlus,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import {
  getOnboardingRecord,
  listOnboardingDocs,
  listOnboardingFollowups,
} from "@/lib/supabase/queries/onboarding";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
  linkWorkerDocToOnboarding,
} from "@/app/(app)/onboarding/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { downloadBlob, toPdfBlob } from "@/lib/onboarding-pdf";
import { Modal } from "@/components/ui/Modal";
import { isPrepDocKey } from "@/lib/application-prep";
import {
  DOC_REFERENCE_LINKS,
  isGensenYearKey,
  isPendingDocAlert,
  isPendingDocOverdue,
  isWorkerCertKey,
  HEALTH_CHECK_DOC_KEY,
  LINKABLE_DOC_KINDS,
  onboardingDocDefs,
  WORKER_DETAIL_DOC_KEYS,
  type OnboardingDocDef,
} from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";
import type {
  OnboardingDocumentRow,
  OnboardingFollowupRow,
  OnboardingRecordRow,
} from "@/types/db";

// 入社書類メールで使うデータの管理。書類ごとに保存・差し替え・削除ができ、
// 在留カード・指定書は登録済みのものから紐付け（複製）できる。
// チェックで選んだファイルは画像もPDFに変換し「番号＋添付データ名＋外国人の氏名.pdf」でダウンロードできる。
export function OnboardingDocuments({
  workerId,
  canEdit = false,
  myNumber: myNumberProp,
}: {
  workerId: string;
  canEdit?: boolean;
  // 個人番号（外国人詳細から渡す）。渡されていれば、詳細で登録・修正した内容がすぐ反映される
  myNumber?: string;
}) {
  const [record, setRecord] = useState<OnboardingRecordRow | null>(null);
  const [docs, setDocs] = useState<OnboardingDocumentRow[]>([]);
  const [followups, setFollowups] = useState<OnboardingFollowupRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 個人番号（マイナンバー）。扶養控除等申告書・労働者名簿はこれが無いと作れない。
  // 外国人詳細から渡されていればそれを使い（登録・修正がすぐ反映される）、
  // 渡されていないときだけ自分で読む
  const [loadedMyNumber, setLoadedMyNumber] = useState<string | null>(null);
  // 作成した書類のプレビュー（内容を見てから添付する）
  const [preview, setPreview] = useState<{
    def: OnboardingDocDef;
    label: string;
    file: File;
    url: string;
  } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const myNumber = myNumberProp !== undefined ? myNumberProp : loadedMyNumber;

  const uploadDefRef = useRef<OnboardingDocDef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    const supabase = createClient();
    return Promise.all([
      getOnboardingRecord(supabase, workerId),
      listOnboardingDocs(supabase, workerId),
      // onboarding_followups 未作成でも表示できるように握りつぶす
      listOnboardingFollowups(supabase, workerId).catch(() => []),
    ])
      .then(([r, d, fus]) => {
        setRecord(r);
        setDocs(d);
        setFollowups(fus);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    void load();
    // 個人番号の有無だけ見る（未入力なら作成ボタンを押せないようにする）。
    // 外国人詳細から渡されているときは読まない
    if (myNumberProp === undefined) {
      void createClient()
        .from("workers")
        .select("my_number")
        .eq("id", workerId)
        .maybeSingle()
        .then(({ data, error: err }) => {
          // 読み込めなかったときは作成を止めない（保存時にサーバー側でも同じ確認をする）
          if (err || !data) return;
          const w = data as { my_number: string | null };
          setLoadedMyNumber(w.my_number ?? "");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const today = todayStr();
  const managedDefs = onboardingDocDefs(today).filter((d) =>
    (WORKER_DETAIL_DOC_KEYS as readonly string[]).includes(d.key),
  );
  // 健康診断・源泉徴収票（令和年別）・外国人書類（cert_*）・申請準備（prep_*）は
  // それぞれ専用セクションで扱うため、この一覧からは除く
  const isDedicated = (key: string) =>
    key === HEALTH_CHECK_DOC_KEY ||
    isGensenYearKey(key) ||
    isWorkerCertKey(key) ||
    isPrepDocKey(key);
  const emailDocs = docs.filter((d) => !isDedicated(d.doc_key));
  const docByKey = new Map(emailDocs.map((d) => [d.doc_key, d]));
  const files = emailDocs.filter((d) => d.storage_path);
  const pending = emailDocs.filter((d) => isPendingDocAlert(d));

  // 職員は常に管理行を表示。閲覧者はファイルがあるときだけ表示する。
  const hasAny = record !== null || files.length > 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const downloadSelected = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    setError(null);
    try {
      for (const doc of files.filter((f) => selected.has(f.id))) {
        const res = await getOnboardingDocDownloadUrl(doc.id);
        if (!res.ok) throw new Error(`${doc.label}: ${res.message}`);
        // バイト列を取得し、画像も含めてPDF化してから「氏名_書類名.pdf」で保存する
        const bytes = await fetch(res.url).then((r) => r.arrayBuffer());
        const { blob, converted } = await toPdfBlob(bytes, res.mimeType);
        downloadBlob(blob, converted ? res.pdfName : res.fileName);
        // 連続ダウンロードがブラウザにブロックされないよう少し間隔をあける
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  const openPreview = async (docId: string) => {
    const res = await getOnboardingDocPreviewUrl(docId);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  };

  const startUpload = (def: OnboardingDocDef) => {
    uploadDefRef.current = def;
    fileInputRef.current?.click();
  };

  // ボタンからの選択・ドラッグ&ドロップの共通のアップロード処理
  const upload = async (def: OnboardingDocDef, file: File | undefined) => {
    if (!file) return;
    setBusyKey(def.key);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, def, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  // アプリで作れる書類（扶養控除等申告書・労働者名簿）。
  // 登録済みの内容からPDFを作り、ダウンロードせずにそのまま添付データとして保存する
  const GENERATABLE: Record<string, string> = {
    fuyokojo: "扶養控除等申告書",
    meibo: "労働者名簿",
  };
  // 個人番号が未入力だと、扶養控除等申告書・労働者名簿は正しく作れない
  const needsMyNumber = (key: string) => !!GENERATABLE[key] && myNumber !== null && !myNumber.trim();

  // 「作成」を押したら、まず作った書類をプレビューで見せる。
  // 内容を確かめてから「添付する」を押したときに保存する
  const createAndPreview = async (def: OnboardingDocDef) => {
    const label = GENERATABLE[def.key];
    if (!label) return;
    if (needsMyNumber(def.key)) {
      setError(
        `個人番号が未入力のため「${label}」は添付できません。外国人詳細の「個人番号（マイナンバー）」を登録してから作成してください。`,
      );
      return;
    }
    setBusyKey(def.key);
    setError(null);
    try {
      const res = await fetch("/api/onboarding-doc-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workerId, kind: def.key }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${label}の作成に失敗しました`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const fileName = m ? decodeURIComponent(m[1]) : `${label}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      setPreview({ def, label, file, url: URL.createObjectURL(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label}の作成に失敗しました`);
    } finally {
      setBusyKey(null);
    }
  };

  // プレビューを閉じる（表示に使った一時的なURLを片づける）
  const closePreview = () => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  // プレビューの内容でよければ添付する
  const attachPreview = async () => {
    if (!preview) return;
    setAttaching(true);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, preview.def, preview.file);
      await load();
      closePreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${preview.label}の添付に失敗しました`);
    } finally {
      setAttaching(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    const def = uploadDefRef.current;
    if (def) await upload(def, file);
  };

  const linkDoc = async (def: OnboardingDocDef) => {
    setBusyKey(def.key);
    setError(null);
    try {
      const res = await linkWorkerDocToOnboarding(workerId, def.key, def.label, def.num);
      if (!res.ok) throw new Error(res.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "紐付けに失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  const deleteDoc = async (def: OnboardingDocDef, fileName: string) => {
    if (!window.confirm(`「${def.label}」の添付データ（${fileName}）を削除します。よろしいですか？`)) {
      return;
    }
    setBusyKey(def.key);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, def.key);
      if (!res.ok) throw new Error(res.message);
      setSelected((prev) => {
        const row = docByKey.get(def.key);
        if (!row) return prev;
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-muted">入社書類（メール添付データ）</h2>
        <Link
          href={`/onboarding?worker=${workerId}`}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
        >
          <MailPlus size={13} />
          入社書類メール
        </Link>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {!canEdit && !hasAny ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          まだ登録がありません。「入社書類メール」から書類のアップロードとメール作成ができます。
        </p>
      ) : (
        <div className="space-y-3">
          {/* 後送のまま未受領の書類 */}
          {pending.length > 0 && (
            <div className="rounded-xl border border-status-notice-fg/40 bg-status-notice-bg/40 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-status-notice-fg">
                <TriangleAlert size={13} />
                後送待ち {pending.length}件
              </p>
              <ul className="space-y-0.5 text-xs">
                {pending.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{d.label}</span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        isPendingDocOverdue(d.due_on, today) ? "font-bold text-seal" : "text-muted"
                      }`}
                    >
                      {d.due_on ? `期日 ${d.due_on}` : "期日未設定"}
                      {isPendingDocOverdue(d.due_on, today) && "（超過）"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 書類ごとの管理（保存・差し替え・削除・紐付け） */}
          {canEdit ? (
            <div className="overflow-hidden rounded-xl border border-border">
              {managedDefs.map((def) => {
                const row = docByKey.get(def.key);
                const hasFile = !!row?.storage_path;
                const isLinkable = def.key in LINKABLE_DOC_KINDS;
                const busy = busyKey === def.key;
                return (
                  <FileDropArea
                    key={def.key}
                    onFiles={(files) => void upload(def, files[0])}
                    disabled={!canEdit || busy}
                    className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
                  >
                    {hasFile && row ? (
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={`${def.label}を選択`}
                        className="h-4 w-4 shrink-0"
                      />
                    ) : (
                      <span className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{def.label}</span>
                      {DOC_REFERENCE_LINKS[def.key] && (
                        <a
                          href={DOC_REFERENCE_LINKS[def.key]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
                        >
                          <ExternalLink size={11} />
                          国税庁の様式ページ
                        </a>
                      )}
                      <span className="block truncate text-[11px] text-muted">
                        {hasFile ? row!.file_name : "未登録"}
                      </span>
                      {needsMyNumber(def.key) && (
                        <span className="block text-[11px] font-bold text-seal">
                          個人番号が未入力のため作成できません（外国人詳細の「個人番号（マイナンバー）」を登録してください）
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {busy ? (
                        <Loader2 size={15} className="animate-spin text-muted" />
                      ) : (
                        <>
                          {hasFile && (
                            <IconButton label="表示" onClick={() => openPreview(row!.id)}>
                              <Eye size={13} />
                            </IconButton>
                          )}
                          {GENERATABLE[def.key] && (
                            <IconButton
                              label={
                                needsMyNumber(def.key)
                                  ? "個人番号が未入力のため添付できません"
                                  : `${GENERATABLE[def.key]}を作成して添付`
                              }
                              disabled={needsMyNumber(def.key)}
                              onClick={() => void createAndPreview(def)}
                            >
                              <FileText size={13} />
                              {hasFile ? "作り直す" : "作成"}
                            </IconButton>
                          )}
                          {isLinkable ? (
                            <IconButton label={hasFile ? "紐付け直す" : "登録済みから紐付け"} onClick={() => linkDoc(def)}>
                              <Link2 size={13} />
                              {hasFile ? "紐付け直す" : "紐付け"}
                            </IconButton>
                          ) : (
                            <IconButton label={hasFile ? "差し替え" : "アップロード"} onClick={() => startUpload(def)}>
                              <Upload size={13} />
                              {hasFile ? "差し替え" : "追加"}
                            </IconButton>
                          )}
                          {hasFile && (
                            <IconButton label="削除" tone="danger" onClick={() => deleteDoc(def, row!.file_name)}>
                              <Trash2 size={13} />
                            </IconButton>
                          )}
                        </>
                      )}
                    </div>
                  </FileDropArea>
                );
              })}
            </div>
          ) : files.length === 0 ? (
            <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
              アップロード済みのファイルはまだありません。
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {files.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{d.label}</span>
                    <span className="block truncate text-[11px] text-muted">{d.file_name}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* 選択ダウンロード */}
          {files.length > 0 && (
            <>
              <button
                type="button"
                onClick={downloadSelected}
                disabled={selected.size === 0 || downloading}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground disabled:opacity-40"
              >
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                選択したデータをダウンロード（{selected.size}件）
              </button>
              <p className="text-[11px] text-muted">
                画像もPDFに変換し、ファイル名は「番号＋添付データ名＋外国人の氏名.pdf」で保存されます。
              </p>
            </>
          )}

          {/* 訂正・追送の履歴（入社書類メールの訂正・追送モードで記録したもの） */}
          {followups.length > 0 && (
            <div className="rounded-xl border border-border bg-background px-3 py-2.5">
              <p className="mb-1 text-xs font-bold text-muted">訂正・追送の履歴（{followups.length}件）</p>
              <ul className="space-y-1 text-[11px] leading-relaxed">
                {followups.map((f) => (
                  <li key={f.id}>
                    <span className="font-bold tabular-nums">{f.sent_on ?? "日付未設定"}</span>
                    {f.reason && <span className="ml-1.5">{f.reason}</span>}
                    <span className="block text-muted">
                      {(f.docs ?? [])
                        .map((d) => `${d.label}（${d.kind}）`)
                        .join(" ・ ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gmailリンク */}
          {record?.gmail_link && (
            <a
              href={record.gmail_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-brand"
            >
              <ExternalLink size={13} />
              最初に送ったメールをGmailで開く
              {record.mail_sent_on && (
                <span className="font-medium text-muted">（送信日 {record.mail_sent_on}）</span>
              )}
            </a>
          )}
        </div>
      )}

      {/* 差し替え・アップロード用の隠しファイル入力（画像・PDF） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* 作成した書類のプレビュー。中身を見てから「添付する」で保存する */}
      {preview && (
        <Modal open wide title={`${preview.label}のプレビュー`} onClose={closePreview}>
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              外国人詳細の登録内容で作成しました。
              <span className="font-bold">内容に間違いがなければ「添付する」を押してください。</span>
              <span className="block text-[11px] text-muted">
                添付後も「差し替え」でやり直せます。直すところがあるときは「やめる」で閉じ、外国人詳細を直してからもう一度作成してください。
              </span>
            </p>
            <iframe
              src={preview.url}
              title={`${preview.label}のプレビュー`}
              className="h-[60vh] w-full rounded-xl border border-border bg-background"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void attachPreview()}
                disabled={attaching}
                className="flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-foreground disabled:opacity-50"
              >
                <Upload size={14} />
                {attaching ? "添付中…" : "添付する"}
              </button>
              <button
                type="button"
                onClick={closePreview}
                disabled={attaching}
                className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-muted"
              >
                やめる
              </button>
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
              >
                <ExternalLink size={12} />
                別のタブで大きく開く
              </a>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  tone = "default",
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold disabled:opacity-50 ${
        tone === "danger" ? "text-seal" : "text-brand"
      }`}
    >
      {children}
    </button>
  );
}
