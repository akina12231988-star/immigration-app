"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { createClient } from "@/lib/supabase/client";
import { listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import {
  deletePrepChecklist,
  EMPTY_PREP_DOC_STATUS,
  listPrepChecklists,
  listPrepDocStatuses,
  upsertPrepChecklist,
  upsertPrepDocStatus,
  type PrepChecklistRow,
  type PrepDocStatusInput,
} from "@/lib/supabase/queries/application-prep";
import { listActiveCustodyNoByWorker } from "@/lib/supabase/queries/custody";
import { formatStorageNo } from "@/lib/custody";
import { getHealthCheckDetail } from "@/lib/supabase/queries/health-check";
import { EMPTY_HEALTH_DETAIL, isHealthDetailComplete, type HealthCheckDetail } from "@/lib/health-check";
import {
  clearOnboardingDocFile,
  getOnboardingDocDownloadUrl,
  getOnboardingDocPreviewUrl,
} from "@/app/(app)/onboarding/actions";
import { getWorkerPhotoUrl } from "@/app/(app)/workers/actions";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { uploadWorkerPhoto } from "@/lib/worker-photo";
import { listWorkerAddresses } from "@/lib/supabase/queries/worker-addresses";
import { addressOnDate, reiwaJan1, type WorkerAddress } from "@/lib/worker-address";
import { gensenDocKey, reiwaYear } from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";
import {
  EMPTY_PREP_META,
  evaluatePrepChecklist,
  isPrepPageKeyOf,
  letterPackTrackingUrl,
  parseAttachItems,
  PREP_APP_TYPE_LABELS,
  PREP_APP_TYPES,
  PREP_CERT_PATTERNS,
  PREP_DOC_ALWAYS_EXTRAS,
  PREP_DOC_ATTACH_ITEMS,
  PREP_DOC_STATUS_OPTIONS,
  PREP_MAIL_AFTER_HIDDEN,
  PREP_TANTOU_OPTIONS,
  serializeAttachItems,
  prepDocLabel,
  prepPageKey,
  prepStatusOption,
  prepYearDocKey,
  type PrepChecklistMeta,
  type PrepDocDef,
  type PrepDocStatus,
  type PrepStatusExtra,
} from "@/lib/application-prep";
import type { OnboardingDocumentRow } from "@/types/db";

// 申請準備の書類チェックリスト。申請種別（変更/更新）と国保・年金の加入で必要書類が
// 切り替わり、今どれが不足しているかを一覧で把握できる。各書類はこの画面から直接添付でき、
// 保存先は既存のセクションと共有する（在留カード=外国人書類、顔写真=写真 など）。
export function ApplicationPrepChecklist({
  workerId,
  canEdit = false,
  photoPath,
  healthCheckOn,
}: {
  workerId: string;
  canEdit?: boolean;
  photoPath: string | null;
  healthCheckOn: string | null;
}) {
  // TODO番号ごとの準備リスト。selected が表示中のリスト（todo_no）
  const [lists, setLists] = useState<PrepChecklistRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newTodo, setNewTodo] = useState("");
  const [creating, setCreating] = useState(false);
  const [healthDetail, setHealthDetail] = useState<HealthCheckDetail>(EMPTY_HEALTH_DETAIL);
  const [addresses, setAddresses] = useState<WorkerAddress[]>([]);
  const [docs, setDocs] = useState<OnboardingDocumentRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 顔写真は workers.photo_path と連動（最新の1枚を共有）
  const [photoExists, setPhotoExists] = useState<boolean>(!!photoPath);
  const [photoUrl, setPhotoUrl] = useState<string>("");

  const uploadRef = useRef<{ docKey: string; label: string } | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // 書類ごとの準備状況（ステータス）。チェックリストID → 書類ID → 入力値
  const [docStatusesByList, setDocStatusesByList] = useState<
    Record<string, Record<string, PrepDocStatusInput>>
  >({});
  // 在留カード・パスポートの「預かった」で表示する預かり番号（保管ボックスと連動）
  const [custodyNo, setCustodyNo] = useState<number | null>(null);

  const loadDocs = () =>
    listOnboardingDocs(createClient(), workerId).then(setDocs).catch(() => undefined);

  useEffect(() => {
    listPrepChecklists(createClient(), workerId)
      .then((rows) => {
        setLists(rows);
        setSelected(rows[0]?.todo_no ?? null);
      })
      .catch(() => undefined);
    getHealthCheckDetail(createClient(), workerId).then(setHealthDetail).catch(() => undefined);
    listWorkerAddresses(createClient(), workerId).then(setAddresses).catch(() => undefined);
    listActiveCustodyNoByWorker(createClient())
      .then((m) => setCustodyNo(m.get(workerId) ?? null))
      .catch(() => undefined);
    void loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const current =
    selected != null ? (lists.find((l) => l.todo_no === selected) ?? null) : null;
  const meta: PrepChecklistMeta = current ?? EMPTY_PREP_META;

  // 表示中のリストを切り替えたら、そのリストの書類ステータスを読み込む
  const currentId = current?.id ?? null;
  const docStatuses: Record<string, PrepDocStatusInput> = currentId
    ? (docStatusesByList[currentId] ?? {})
    : {};
  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    listPrepDocStatuses(createClient(), currentId)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, PrepDocStatusInput> = {};
        for (const r of rows) {
          next[r.doc_id] = {
            status: r.status,
            note: r.note,
            amount: r.amount,
            date_on: r.date_on,
            tracking_out: r.tracking_out,
            tracking_back: r.tracking_back,
            mail_after_apply: r.mail_after_apply,
            attach_items: r.attach_items ?? "",
          };
        }
        setDocStatusesByList((prev) => ({ ...prev, [currentId]: next }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  // 書類ステータスの更新。save=false はテキスト入力中（保存はフォーカスが外れた時）
  const patchDocStatus = (docId: string, patch: Partial<PrepDocStatusInput>, save = true) => {
    if (!currentId) return;
    const next = { ...EMPTY_PREP_DOC_STATUS, ...(docStatuses[docId] ?? {}), ...patch };
    setDocStatusesByList((prev) => ({
      ...prev,
      [currentId]: { ...(prev[currentId] ?? {}), [docId]: next },
    }));
    if (save) {
      upsertPrepDocStatus(createClient(), currentId, docId, next).catch((err) =>
        setError(err instanceof Error ? err.message : "準備状況の保存に失敗しました"),
      );
    }
  };

  const today = todayStr();
  const filledDocKeys = new Set(docs.filter((d) => d.storage_path).map((d) => d.doc_key));
  // 健康診断書の完了判定は詳細（様式・受診項目・就労可の後日結果）まで含める
  const healthComplete = isHealthDetailComplete(
    healthDetail,
    filledDocKeys.has("kenshin"),
    healthCheckOn,
    today,
  );
  // 完了判定は「添付＋準備状況が完了」の両方（ステータスの無い書類は添付のみ）
  const statusValues = Object.fromEntries(
    Object.entries(docStatuses).map(([docId, v]) => [docId, v.status]),
  );
  const { items, missing } = evaluatePrepChecklist(
    meta,
    {
      filledDocKeys,
      photoPath: photoExists ? "yes" : null,
      healthComplete,
    },
    statusValues,
  );

  const currentReiwa = reiwaYear(today);
  // 課税・納税証明書の基準日（対象年度の1月1日）時点の住所
  const kazeiRefAddress =
    meta.target_reiwa != null ? addressOnDate(addresses, reiwaJan1(meta.target_reiwa)) : null;

  // 書類の実際の保存キー（源泉徴収票は対象年度の前年分で変わる）。写真はキーなし。
  const resolveDocKey = (def: PrepDocDef): string | null => {
    switch (def.source.kind) {
      case "doc":
        return def.source.docKey;
      case "docYear":
        // 課税・納税証明書は対象年度ごとに別ファイルとして蓄積する
        return meta.target_reiwa != null
          ? prepYearDocKey(def.source.baseKey, meta.target_reiwa)
          : null;
      case "gensenYear":
        return meta.target_reiwa != null ? gensenDocKey(meta.target_reiwa - 1) : null;
      case "health":
        return "kenshin";
      case "photo":
        return null;
    }
  };

  async function patchMeta(patch: Partial<PrepChecklistMeta>) {
    if (selected == null || current == null) return;
    const next: PrepChecklistMeta = {
      app_type: current.app_type,
      has_kokuho: current.has_kokuho,
      has_nenkin: current.has_nenkin,
      target_reiwa: current.target_reiwa,
      kenshin_items_ok: current.kenshin_items_ok,
      tantou: current.tantou,
      cert_pattern: current.cert_pattern,
      ...patch,
    };
    setLists((ls) => ls.map((l) => (l.todo_no === selected ? { ...l, ...patch } : l)));
    setError(null);
    try {
      await upsertPrepChecklist(createClient(), workerId, selected, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  }

  // TODO番号を入力して新しい準備リストを作成する
  async function createList() {
    const todo = newTodo.trim();
    if (!todo) {
      setError("TODO番号を入力してください。");
      return;
    }
    if (lists.some((l) => l.todo_no === todo)) {
      setSelected(todo);
      setNewTodo("");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await upsertPrepChecklist(createClient(), workerId, todo, EMPTY_PREP_META);
      const rows = await listPrepChecklists(createClient(), workerId);
      setLists(rows);
      setSelected(todo);
      setNewTodo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setCreating(false);
    }
  }

  // 表示中のTODOの準備リストを削除する（添付済みの書類ファイル自体は消えない）
  async function removeList() {
    if (selected == null) return;
    const label = selected || "（番号未設定）";
    if (!window.confirm(`「${label}」の準備リストを削除します。添付済みの書類ファイルは削除されません。よろしいですか？`))
      return;
    setError(null);
    try {
      await deletePrepChecklist(createClient(), workerId, selected);
      const rows = lists.filter((l) => l.todo_no !== selected);
      setLists(rows);
      setSelected(rows[0]?.todo_no ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }

  function startAttach(def: PrepDocDef) {
    setError(null);
    if (def.source.kind === "photo") {
      photoInputRef.current?.click();
      return;
    }
    const key = resolveDocKey(def);
    if (!key) {
      setError("先に対象年度（令和）を入力してください。");
      return;
    }
    uploadRef.current = { docKey: key, label: prepDocLabel(def, meta.target_reiwa, currentReiwa) };
    docInputRef.current?.click();
  }

  // 画像の追加添付（2枚目以降）。空いている枝番キー（{base}_p2, _p3 …）へ保存する
  function startAttachPage(def: PrepDocDef, files: OnboardingDocumentRow[]) {
    setError(null);
    const key = resolveDocKey(def);
    if (!key) {
      setError("先に対象年度（令和）を入力してください。");
      return;
    }
    const keys = new Set(files.map((f) => f.doc_key));
    let page = 2;
    while (keys.has(prepPageKey(key, page))) page++;
    uploadRef.current = {
      docKey: prepPageKey(key, page),
      label: `${prepDocLabel(def, meta.target_reiwa, currentReiwa)}（${page}枚目）`,
    };
    docInputRef.current?.click();
  }

  // その書類に添付済みのファイル一覧（基本キー＋追加添付の枝番キー。年度なしの旧形式も含む）
  function docFilesFor(def: PrepDocDef): OnboardingDocumentRow[] {
    const key = resolveDocKey(def);
    if (!key) return [];
    let files = docs.filter((d) => d.storage_path && isPrepPageKeyOf(key, d.doc_key));
    if (files.length === 0 && def.source.kind === "docYear") {
      const base = def.source.baseKey;
      files = docs.filter((d) => d.storage_path && isPrepPageKeyOf(base, d.doc_key));
    }
    return files.sort((a, b) => a.doc_key.localeCompare(b.doc_key, "en"));
  }

  async function uploadDoc(
    target: { docKey: string; label: string },
    file: File | undefined,
  ) {
    if (!file) return;
    setBusyKey(target.docKey);
    setError(null);
    try {
      await uploadOnboardingDoc(workerId, { key: target.docKey, label: target.label, num: 0 }, file);
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDocFile(file: File | undefined) {
    const target = uploadRef.current;
    if (target) await uploadDoc(target, file);
  }

  // ドラッグ&ドロップでの添付。顔写真はそのまま、書類は既存の枚数に応じた枝番キーへ保存する
  async function dropAttach(def: PrepDocDef, file: File | undefined) {
    if (!file) return;
    setError(null);
    if (def.source.kind === "photo") {
      await handlePhotoFile(file);
      return;
    }
    const key = resolveDocKey(def);
    if (!key) {
      setError("先に対象年度（令和）を入力してください。");
      return;
    }
    const existing = docFilesFor(def);
    if (existing.length === 0) {
      await uploadDoc(
        { docKey: key, label: prepDocLabel(def, meta.target_reiwa, currentReiwa) },
        file,
      );
      return;
    }
    const keys = new Set(existing.map((f) => f.doc_key));
    let page = 2;
    while (keys.has(prepPageKey(key, page))) page++;
    await uploadDoc(
      {
        docKey: prepPageKey(key, page),
        label: `${prepDocLabel(def, meta.target_reiwa, currentReiwa)}（${page}枚目）`,
      },
      file,
    );
  }

  async function handlePhotoFile(file: File | undefined) {
    if (!file) return;
    setBusyKey("photo");
    setError(null);
    try {
      const url = await uploadWorkerPhoto(workerId, file);
      setPhotoExists(true);
      setPhotoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "写真のアップロードに失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeDoc(key: string, label: string) {
    if (!window.confirm(`「${label}」の保存データを削除します。よろしいですか？`)) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await clearOnboardingDocFile(workerId, key);
      if (!res.ok) throw new Error(res.message);
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusyKey(null);
    }
  }

  async function previewDoc(id: string) {
    const res = await getOnboardingDocPreviewUrl(id);
    if (!res.ok) return setError(res.message);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function downloadDoc(id: string) {
    const res = await getOnboardingDocDownloadUrl(id);
    if (!res.ok) return setError(res.message);
    const a = document.createElement("a");
    a.href = res.url;
    a.download = res.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function previewPhoto() {
    let url = photoUrl;
    if (!url && photoPath) url = await getWorkerPhotoUrl(photoPath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const inputCls =
    "rounded-lg border border-border bg-surface px-2.5 py-2 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-muted">
        <ClipboardList size={15} />
        申請準備 書類チェックリスト
      </h2>
      <p className="mb-3 text-[11px] text-muted">
        Notion申請TODO番号ごとに準備リストを作成できます。申請種別と加入状況を選ぶと、必要書類と不足がわかります。各書類はこの場で添付できます。
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {/* TODO番号ごとの準備リスト切り替え */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3">
        <p className="mb-2 text-xs font-bold text-muted">申請TODO番号</p>
        {lists.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {lists.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelected(l.todo_no)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  selected === l.todo_no
                    ? "bg-brand text-brand-foreground"
                    : "border border-border text-muted"
                }`}
              >
                {l.todo_no || "（番号未設定）"}
              </button>
            ))}
          </div>
        )}
        {canEdit ? (
          <div className="flex gap-2">
            <input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="例: TODO-1234"
              className={`${inputCls} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={createList}
              disabled={creating}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
            >
              {creating ? "作成中…" : "リストを追加"}
            </button>
          </div>
        ) : (
          lists.length === 0 && <p className="text-xs text-muted">準備リストはまだありません。</p>
        )}
      </div>

      {current == null ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          TODO番号を追加すると、そのTODOに対する準備リストが表示されます。
        </p>
      ) : (
        <>
      {/* 条件の選択 */}
      <div className="mb-3 space-y-2.5 rounded-xl border border-border bg-background p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            申請種別
            <select
              value={meta.app_type}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ app_type: e.target.value as PrepChecklistMeta["app_type"] })}
              className={inputCls}
            >
              <option value="">選択してください</option>
              {PREP_APP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PREP_APP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            対象年度 令和
            <input
              type="number"
              min={1}
              max={99}
              value={meta.target_reiwa ?? ""}
              disabled={!canEdit}
              placeholder={`${reiwaYear(today)}`}
              onChange={(e) =>
                patchMeta({ target_reiwa: e.target.value ? Number(e.target.value) : null })
              }
              className={`${inputCls} w-20 tabular-nums`}
            />
            年
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
            担当者
            <select
              value={meta.tantou}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ tantou: e.target.value })}
              className={inputCls}
            >
              <option value="">未定（あとで申請一覧から設定可）</option>
              {PREP_TANTOU_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* 合格証の組み合わせ（申請内容で必要な合格証が変わる。更新申請では不要） */}
        {meta.app_type && meta.app_type !== "更新" && (
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-xs font-bold text-muted">
              合格証の組み合わせ
              <select
                value={meta.cert_pattern}
                disabled={!canEdit}
                onChange={(e) =>
                  patchMeta({ cert_pattern: e.target.value as PrepChecklistMeta["cert_pattern"] })
                }
                className={inputCls}
              >
                <option value="">未選択（合格証3種をすべて表示）</option>
                {PREP_CERT_PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {/* 本人の合格証の登録状況。下までスクロールしなくても組み合わせを選べるようにする */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">本人の登録状況:</span>
              {(
                [
                  ["専門級", "cert_senmonkyu"],
                  ["日本語", "cert_nihongo"],
                  ["専門外", "cert_senmongai"],
                  ["技能評価調書", "prep_hyoka_chosho"],
                ] as const
              ).map(([certLabel, certKey]) => {
                const has = filledDocKeys.has(certKey);
                return (
                  <span
                    key={certKey}
                    className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      has
                        ? "bg-status-approved-bg text-status-approved-fg"
                        : "bg-seal/10 text-seal"
                    }`}
                  >
                    {has && <CheckCircle2 size={11} />}
                    {certLabel} {has ? "登録済み" : "未登録"}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs font-bold">
            <input
              type="checkbox"
              checked={meta.has_kokuho}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ has_kokuho: e.target.checked })}
              className="h-4 w-4"
            />
            国民健康保険に加入
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold">
            <input
              type="checkbox"
              checked={meta.has_nenkin}
              disabled={!canEdit}
              onChange={(e) => patchMeta({ has_nenkin: e.target.checked })}
              className="h-4 w-4"
            />
            国民年金に加入
          </label>
        </div>
      </div>

      {!meta.app_type ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          申請種別を選ぶと、必要書類のチェックリストが表示されます。
        </p>
      ) : (
        <>
          {/* 不足サマリ */}
          {missing.length === 0 ? (
            <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-status-approved-bg px-3 py-2.5 text-sm font-bold text-status-approved-fg">
              <CheckCircle2 size={15} />
              必要書類はすべて揃っています
            </p>
          ) : (
            <div className="mb-3 rounded-xl border border-seal/40 bg-seal/5 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-seal">
                <TriangleAlert size={15} />
                不足 {missing.length}件
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-seal">
                {missing.map((m) => (
                  <li key={m.def.id}>{prepDocLabel(m.def, meta.target_reiwa, currentReiwa)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 課税・納税証明書の「1月1日時点の住所」案内（郵送請求先の判断用） */}
          {meta.target_reiwa != null && (
            <div className="mb-3 rounded-xl border border-status-applied-fg/30 bg-status-applied-bg/40 px-3 py-2.5 text-xs text-status-applied-fg">
              <p className="font-bold">
                令和{meta.target_reiwa}年1月1日（{reiwaJan1(meta.target_reiwa)}）時点の住所
              </p>
              <p className="mt-0.5">
                {kazeiRefAddress
                  ? `${kazeiRefAddress.address} → この住所の市区町村へ課税・市県民税納税証明書を郵送請求してください。`
                  : "住所歴が未登録です。外国人詳細の「住所歴」に転入日と住所を登録すると、請求先を判定できます。"}
              </p>
            </div>
          )}

          {/* 書類一覧 */}
          <div className="overflow-hidden rounded-xl border border-border">
            {items.map((item) => {
              const key = resolveDocKey(item.def);
              const files = docFilesFor(item.def);
              const isPhoto = item.def.source.kind === "photo";
              return (
                <DocRow
                  key={item.def.id}
                  item={item}
                  meta={meta}
                  workerId={workerId}
                  files={files}
                  isPhoto={isPhoto}
                  canEdit={canEdit}
                  busy={busyKey != null && (isPhoto ? busyKey === "photo" : busyKey.startsWith(key ?? " "))}
                  ds={{ ...EMPTY_PREP_DOC_STATUS, ...(docStatuses[item.def.id] ?? {}) }}
                  custodyNo={custodyNo}
                  onPatchStatus={(patch, save) => patchDocStatus(item.def.id, patch, save)}
                  onAttach={() => startAttach(item.def)}
                  onDropFiles={(files) => void dropAttach(item.def, files[0])}
                  onAddPage={() => startAttachPage(item.def, files)}
                  onRemoveFile={(f) =>
                    void removeDoc(
                      f.doc_key,
                      `${prepDocLabel(item.def, meta.target_reiwa, currentReiwa)}（${f.file_name}）`,
                    )
                  }
                  onPreviewFile={(f) => void previewDoc(f.id)}
                  onPreviewPhoto={() => void previewPhoto()}
                  onDownloadFile={(f) => void downloadDoc(f.id)}
                />
              );
            })}
          </div>
        </>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={removeList}
          className="mt-3 flex items-center gap-1 text-xs font-bold text-seal"
        >
          <Trash2 size={13} />
          この準備リスト（{(current.todo_no || "番号未設定")}）を削除
        </button>
      )}
        </>
      )}

      {/* 書類（画像・PDF）用の隠しファイル入力 */}
      <input
        ref={docInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void handleDocFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {/* 顔写真用の隠しファイル入力（画像のみ） */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handlePhotoFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </Card>
  );
}

function DocRow({
  item,
  meta,
  workerId,
  files,
  isPhoto,
  canEdit,
  busy,
  ds,
  custodyNo,
  onPatchStatus,
  onAttach,
  onDropFiles,
  onAddPage,
  onRemoveFile,
  onPreviewFile,
  onPreviewPhoto,
  onDownloadFile,
}: {
  item: PrepDocStatus;
  meta: PrepChecklistMeta;
  workerId: string;
  files: OnboardingDocumentRow[];
  isPhoto: boolean;
  canEdit: boolean;
  busy: boolean;
  ds: PrepDocStatusInput;
  custodyNo: number | null;
  onPatchStatus: (patch: Partial<PrepDocStatusInput>, save?: boolean) => void;
  onAttach: () => void;
  onDropFiles: (files: FileList) => void;
  onAddPage: () => void;
  onRemoveFile: (f: OnboardingDocumentRow) => void;
  onPreviewFile: (f: OnboardingDocumentRow) => void;
  onPreviewPhoto: () => void;
  onDownloadFile: (f: OnboardingDocumentRow) => void;
}) {
  const { def, satisfied, fileSatisfied } = item;
  const label = prepDocLabel(def, meta.target_reiwa, reiwaYear(todayStr()));
  const hasFile = files.length > 0;

  // 書類ごとの準備状況（ステータス）。選択肢と、選択に応じた付随入力を表示する
  const statusOptions = PREP_DOC_STATUS_OPTIONS[def.id];
  const selectedOption = prepStatusOption(def.id, ds.status);
  const extras: PrepStatusExtra[] = [
    ...(selectedOption?.extras ?? []),
    ...(PREP_DOC_ALWAYS_EXTRAS[def.id] ?? []),
  ];

  return (
    <FileDropArea
      onFiles={onDropFiles}
      disabled={!canEdit || busy}
      className="border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${satisfied ? "bg-status-approved-fg" : "bg-seal"}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">{label}</span>
            {def.viaMail && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-status-applied-bg px-1.5 py-0.5 text-[10px] font-bold text-status-applied-fg">
                <Mail size={10} />
                郵送請求
              </span>
            )}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                satisfied
                  ? "bg-status-approved-bg text-status-approved-fg"
                  : "bg-seal/10 text-seal"
              }`}
            >
              {satisfied ? "完了" : "不足"}
            </span>
            {!satisfied && fileSatisfied && (
              <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted ring-1 ring-border">
                添付済み・準備状況が未完了
              </span>
            )}
          </span>
          {def.note && <span className="mt-0.5 block text-[11px] text-muted">※ {def.note}</span>}
          {def.managedIn && (
            <span className="mt-0.5 block text-[11px] text-muted">「{def.managedIn}」と共有</span>
          )}
        </span>

        {/* 添付・操作 */}
        <div className="flex shrink-0 items-center gap-1">
          {busy ? (
            <Loader2 size={15} className="animate-spin text-muted" />
          ) : (
            <>
              {isPhoto && fileSatisfied && (
                <IconButton label="表示" onClick={onPreviewPhoto}>
                  <Eye size={13} />
                </IconButton>
              )}
              {canEdit && (
                <IconButton label={hasFile || (isPhoto && fileSatisfied) ? "差し替え" : "添付"} onClick={onAttach}>
                  <Upload size={13} />
                  {hasFile || (isPhoto && fileSatisfied) ? "差し替え" : "添付"}
                </IconButton>
              )}
              {canEdit && !isPhoto && hasFile && (
                <IconButton label="画像を追加" onClick={onAddPage}>
                  <Upload size={13} />
                  追加
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>

      {/* 添付ファイル一覧（複数添付に対応。1件ずつ表示・DL・削除できる） */}
      {files.length > 0 && (
        <div className="ml-[18px] mt-1.5 space-y-1">
          {files.map((f, i) => (
            <div key={f.id} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                {files.length > 1 && <span className="mr-1 font-bold">{i + 1}枚目:</span>}
                {f.file_name}
              </span>
              <IconButton label="表示" onClick={() => onPreviewFile(f)}>
                <Eye size={12} />
              </IconButton>
              <IconButton label="ダウンロード" onClick={() => onDownloadFile(f)}>
                <Download size={12} />
              </IconButton>
              {canEdit && (
                <IconButton label="削除" tone="danger" onClick={() => onRemoveFile(f)}>
                  <Trash2 size={12} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 郵送請求への導線 */}
      {def.viaMail && (
        <Link
          href="/mailing"
          className="ml-[18px] mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
        >
          <ExternalLink size={11} />
          郵送請求ツールを開く
        </Link>
      )}

      {/* 健康診断書: 様式・受診項目・就労可の後日結果は別ページで管理 */}
      {def.source.kind === "health" && (
        <Link
          href={`/workers/${workerId}/health-check`}
          className="ml-[18px] mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
        >
          <ExternalLink size={11} />
          受診項目・就労可の詳細を確認/入力
        </Link>
      )}

      {/* 年金記録: 記号の意味と未納アラートは別ページで確認 */}
      {def.id === "nenkin" && (
        <Link
          href={`/workers/${workerId}/pension`}
          className="ml-[18px] mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
        >
          <ExternalLink size={11} />
          記号の確認・支払/免除の判定
        </Link>
      )}

      {/* 準備状況（ステータス）: 書類ごとの選択肢と付随入力 */}
      {statusOptions && (
        <div className="ml-[18px] mt-2 space-y-1.5 rounded-lg bg-surface/60 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-muted">準備状況</span>
            <select
              value={ds.status}
              disabled={!canEdit}
              onChange={(e) => onPatchStatus({ status: e.target.value })}
              className="min-h-[32px] max-w-full rounded-lg border border-border bg-background px-1.5 text-xs focus:border-brand focus:outline-none disabled:opacity-60"
            >
              <option value="">未選択</option>
              <optgroup label="準備中">
                {statusOptions
                  .filter((o) => !o.done)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="完了">
                {statusOptions
                  .filter((o) => o.done)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                    </option>
                  ))}
              </optgroup>
            </select>
            {selectedOption && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  selectedOption.done
                    ? "bg-status-approved-bg text-status-approved-fg"
                    : "bg-status-applied-bg text-status-applied-fg"
                }`}
              >
                {selectedOption.done ? "完了" : "準備中"}
              </span>
            )}
          </div>
          {extras.map((extra, i) => (
            <StatusExtraField
              key={`${ds.status}-${i}`}
              extra={extra}
              ds={ds}
              custodyNo={custodyNo}
              canEdit={canEdit}
              onPatch={onPatchStatus}
            />
          ))}
          {/* 添付する資料項目の選択（年金記録: 年金記録／免除申請書） */}
          {PREP_DOC_ATTACH_ITEMS[def.id] && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] text-muted">添付する資料項目:</span>
              {PREP_DOC_ATTACH_ITEMS[def.id].map((item) => {
                const selected = parseAttachItems(ds.attach_items);
                const checked = selected.includes(item);
                return (
                  <label key={item} className="flex items-center gap-1.5 text-[11px] font-bold">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canEdit}
                      onChange={(e) =>
                        onPatchStatus({
                          attach_items: serializeAttachItems(
                            e.target.checked
                              ? [...selected, item]
                              : selected.filter((x) => x !== item),
                          ),
                        })
                      }
                      className="h-3.5 w-3.5"
                    />
                    {item}
                  </label>
                );
              })}
            </div>
          )}
          {canEdit && !PREP_MAIL_AFTER_HIDDEN.has(def.id) && (
            <label className="flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                checked={ds.mail_after_apply}
                onChange={(e) => onPatchStatus({ mail_after_apply: e.target.checked })}
                className="h-3.5 w-3.5"
              />
              申請後に発行され次第、入管へ郵送する（申請詳細にアラート表示・郵送したらチェックを外す）
            </label>
          )}
        </div>
      )}
    </FileDropArea>
  );
}

// 準備状況に付随する入力・表示（依頼先・金額・受診日・預かり番号・郵送請求・レターパック追跡）
function StatusExtraField({
  extra,
  ds,
  custodyNo,
  canEdit,
  onPatch,
}: {
  extra: PrepStatusExtra;
  ds: PrepDocStatusInput;
  custodyNo: number | null;
  canEdit: boolean;
  onPatch: (patch: Partial<PrepDocStatusInput>, save?: boolean) => void;
}) {
  const inputCls =
    "min-h-[32px] w-full rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";
  switch (extra.kind) {
    case "text":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <input
            value={ds.note}
            readOnly={!canEdit}
            onChange={(e) => onPatch({ note: e.target.value }, false)}
            onBlur={() => onPatch({}, true)}
            className={inputCls}
          />
        </label>
      );
    case "tantou":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <select
            value={ds.note}
            disabled={!canEdit}
            onChange={(e) => onPatch({ note: e.target.value })}
            className={inputCls}
          >
            <option value="">選択してください</option>
            {/* 名簿から外れた保存済みの値（旧・自由入力など）も選択肢として残す */}
            {ds.note &&
              !PREP_TANTOU_OPTIONS.includes(ds.note as (typeof PREP_TANTOU_OPTIONS)[number]) && (
                <option value={ds.note}>{ds.note}</option>
              )}
            {PREP_TANTOU_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      );
    case "textarea":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <textarea
            value={ds.note}
            readOnly={!canEdit}
            rows={2}
            onChange={(e) => onPatch({ note: e.target.value }, false)}
            onBlur={() => onPatch({}, true)}
            className={`${inputCls} min-h-[48px] py-1.5 leading-relaxed`}
          />
        </label>
      );
    case "amount":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <input
            value={ds.amount}
            readOnly={!canEdit}
            inputMode="numeric"
            placeholder="例: 12,000円"
            onChange={(e) => onPatch({ amount: e.target.value }, false)}
            onBlur={() => onPatch({}, true)}
            className={inputCls}
          />
        </label>
      );
    case "date":
      return (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{extra.label}</span>
          <input
            type="date"
            value={ds.date_on ?? ""}
            disabled={!canEdit}
            onChange={(e) => onPatch({ date_on: e.target.value || null })}
            className={inputCls}
          />
        </label>
      );
    case "custody":
      return (
        <p className="text-[11px] font-bold tabular-nums">
          預かり番号:{" "}
          {custodyNo != null ? (
            <span className="text-brand">{formatStorageNo(custodyNo)}</span>
          ) : (
            <span className="font-medium text-muted">
              未預かり（保管ボックスに登録すると表示されます）
            </span>
          )}
        </p>
      );
    case "mailing":
      return (
        <Link
          href="/mailing"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
        >
          <ExternalLink size={11} />
          郵送請求ツールで請求状況を確認する
        </Link>
      );
    case "tracking":
      return (
        <div className="space-y-1.5">
          <TrackingNoField
            label="送付レターパックの追跡番号"
            value={ds.tracking_out}
            canEdit={canEdit}
            onChange={(v) => onPatch({ tracking_out: v }, false)}
            onBlur={() => onPatch({}, true)}
          />
          <TrackingNoField
            label="返信用レターパックの追跡番号"
            value={ds.tracking_back}
            canEdit={canEdit}
            onChange={(v) => onPatch({ tracking_back: v }, false)}
            onBlur={() => onPatch({}, true)}
          />
        </div>
      );
  }
}

// レターパック追跡番号の入力（コピー＋日本郵便の追跡ページへのリンク付き）
function TrackingNoField({
  label,
  value,
  canEdit,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };
  return (
    <div>
      <span className="mb-0.5 block text-[11px] text-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          readOnly={!canEdit}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="例: 1234-5678-9012"
          className="min-h-[32px] min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs tabular-nums focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={copy}
          aria-label={`${label}をコピー`}
          className="shrink-0 text-muted hover:text-brand disabled:opacity-40"
          disabled={!value.trim()}
        >
          {copied ? <CheckCircle2 size={14} className="text-status-approved-fg" /> : <Copy size={14} />}
        </button>
        {value.trim() && (
          <a
            href={letterPackTrackingUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11px] font-bold text-brand hover:underline"
          >
            追跡
          </a>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold ${
        tone === "danger" ? "text-seal" : "text-brand"
      }`}
    >
      {children}
    </button>
  );
}
