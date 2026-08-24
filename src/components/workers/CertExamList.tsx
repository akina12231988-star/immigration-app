"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { clearOnboardingDocFile } from "@/app/(app)/onboarding/actions";
import { CopyButton } from "@/components/ui/CopyButton";
import { WorkerCertDocRows } from "@/components/workers/WorkerCertDocRows";
import { EXAM_LOCATION_JAPAN } from "@/lib/cert-exam-options";
import {
  CERT_KIND_LABEL,
  JLPT_LEVELS,
  certExamDocKey,
  certExamRows,
  newCertExamId,
  normalizeCertExams,
  type CertExamKind,
  type WorkerCertExam,
} from "@/lib/cert-exam";
import { dbErrorMessage } from "@/lib/errors";

const INPUT =
  "min-h-[36px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none";

// セレクトの「その他（自由入力）」を表す値。候補にない試験名・国名を入れられるようにする
const OTHER = "__other__";

// 候補から選ぶ・無ければ自由入力するセレクト。選択直後（または自由入力のフォーカスが
// 外れた時）に保存し、保存後は文字をそのままコピーできるようにする
function PickOrTypeRow({
  label,
  value,
  options,
  otherLabel = "その他（入力）",
  placeholder = "入力してください",
  canEdit,
  busy,
  onSave,
}: {
  label: string;
  value: string; // 保存されている現在の値（''=未選択）
  options: readonly string[];
  otherLabel?: string;
  placeholder?: string;
  canEdit: boolean;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const isKnown = value === "" || options.includes(value);
  // セレクトの表示（候補にある値ならその値、無ければ「その他」を選んだ状態にする）。
  // 呼び出し側で key={value} を付けてもらい、外部から値が変わったとき
  // （読み込み完了・保存反映）はこのコンポーネントごと作り直して表示を合わせる
  const [mode, setMode] = useState(isKnown ? value : OTHER);
  const [customText, setCustomText] = useState(isKnown ? "" : value);

  if (!canEdit) {
    return (
      <div>
        <p className="text-[11px] font-bold text-muted">{label}</p>
        <p className="flex items-center gap-1.5 text-sm">
          {value || <span className="text-muted">未登録</span>}
          {value && <CopyButton value={value} label={`${label}をコピー`} />}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-bold text-muted">{label}</p>
      <div className="flex items-center gap-1.5">
        <select
          value={mode}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            setMode(v);
            if (v === OTHER) {
              // 自由入力に切り替えるだけ（保存は文字を入れてから）
              setCustomText("");
              return;
            }
            onSave(v);
          }}
          className={INPUT}
        >
          <option value="">未選択</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value={OTHER}>{otherLabel}</option>
        </select>
        {value && <CopyButton value={value} label={`${label}をコピー`} />}
      </div>
      {mode === OTHER && (
        <input
          value={customText}
          disabled={busy}
          onChange={(e) => setCustomText(e.target.value)}
          onBlur={() => {
            if (customText.trim() !== value) onSave(customText.trim());
          }}
          placeholder={placeholder}
          className={`${INPUT} mt-1`}
        />
      )}
    </div>
  );
}

// 日本語の合格証・専門外の合格証の受験情報（外国人詳細）。
// 受験した試験名・受験地・（日本語は）レベルを、受験情報ごとに登録できる。
// 合格証のファイルもその枠の中で登録するので、どの試験名の合格証かを取り違えない。
// 1件目は従来の列・ファイルキーをそのまま使い、2件目以降は cert_exams（0115）に足していく
export function CertExamList({
  workerId,
  canEdit,
  kind,
  nameOptions,
}: {
  workerId: string;
  canEdit: boolean;
  kind: CertExamKind;
  nameOptions: readonly string[];
}) {
  const [loaded, setLoaded] = useState<{
    firstName: string;
    firstLocation: string;
    firstLevel: string;
    exams: WorkerCertExam[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = CERT_KIND_LABEL[kind];
  const nameKey = kind === "nihongo" ? "cert_nihongo_name" : "cert_senmongai_name";
  const locationKey = kind === "nihongo" ? "cert_nihongo_location" : "cert_senmongai_location";

  useEffect(() => {
    let cancelled = false;
    // 0114・0115未適用でも壊れないよう select("*") で読み、無い列は空として扱う
    createClient()
      .from("workers")
      .select("*")
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const r = data as Record<string, unknown>;
        const s = (v: unknown) => (typeof v === "string" ? v : "");
        setLoaded({
          firstName: s(r[nameKey]),
          firstLocation: s(r[locationKey]),
          firstLevel: s(r.cert_nihongo_level),
          exams: normalizeCertExams(r.cert_exams),
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // 1件目（従来の列）の保存
  const saveFirst = async (patch: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), workerId, patch);
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              firstName: patch[nameKey] ?? prev.firstName,
              firstLocation: patch[locationKey] ?? prev.firstLocation,
              firstLevel: patch.cert_nihongo_level ?? prev.firstLevel,
            }
          : prev,
      );
    } catch (err) {
      const migration =
        "cert_nihongo_level" in patch
          ? "0115_worker_cert_exams.sql"
          : "0114_cert_exam_name_location.sql";
      setError(dbErrorMessage(err, migration, "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  // 2件目以降（cert_exams）の保存。渡した配列をそのまま入れ替える
  const saveExams = async (exams: WorkerCertExam[]) => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), workerId, { cert_exams: exams });
      setLoaded((prev) => (prev ? { ...prev, exams } : prev));
    } catch (err) {
      setError(dbErrorMessage(err, "0115_worker_cert_exams.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  if (loaded === null) return null;

  const rows = certExamRows(
    kind,
    loaded.firstName,
    loaded.firstLocation,
    loaded.firstLevel,
    loaded.exams,
  );

  // 受験情報1件分の変更（1件目は列へ、2件目以降は配列へ）
  const patchRow = (row: WorkerCertExam, field: "name" | "location" | "level", value: string) => {
    if (row.id === "") {
      const key =
        field === "name" ? nameKey : field === "location" ? locationKey : "cert_nihongo_level";
      void saveFirst({ [key]: value });
      return;
    }
    void saveExams(
      loaded.exams.map((e) => (e.id === row.id ? { ...e, [field]: value } : e)),
    );
  };

  const addRow = () => {
    const id = newCertExamId(loaded.exams.map((e) => e.id));
    void saveExams([
      ...loaded.exams,
      { id, kind, name: "", location: "", level: "", doc_key: certExamDocKey(kind, id) },
    ]);
  };

  const removeRow = async (row: WorkerCertExam) => {
    if (
      !window.confirm(
        `${title}の受験情報（${row.name || "試験名未設定"}）を削除します。添付している合格証も一緒に削除されます。よろしいですか？`,
      )
    ) {
      return;
    }
    // 先に添付ファイルを消してから行を消す（消し忘れのデータが残らないように）
    await clearOnboardingDocFile(workerId, row.doc_key).catch(() => undefined);
    await saveExams(loaded.exams.filter((e) => e.id !== row.id));
  };

  return (
    <div className="mt-1 space-y-1.5">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}

      {rows.map((row, i) => (
        <div
          key={row.doc_key}
          className="space-y-1.5 rounded-lg border border-dashed border-border p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-muted">
              {title}の受験情報{rows.length > 1 ? `（${i + 1}件目）` : ""}
            </p>
            {canEdit && row.id !== "" && (
              <button
                type="button"
                aria-label="この受験情報を削除"
                disabled={busy}
                onClick={() => void removeRow(row)}
                className="shrink-0 rounded-lg border border-border px-1.5 py-0.5 text-seal"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* key={値} で、外部からの値の変化（読み込み完了・保存反映）ごとに
              作り直して表示を合わせる（入力中の文字は value がまだ変わらないので保たれる） */}
          <PickOrTypeRow
            key={`name-${row.doc_key}-${row.name}`}
            label="受験した試験名"
            value={row.name}
            options={nameOptions}
            canEdit={canEdit}
            busy={busy}
            onSave={(v) => patchRow(row, "name", v)}
          />
          <PickOrTypeRow
            key={`location-${row.doc_key}-${row.location}`}
            label="受験地"
            value={row.location}
            options={[EXAM_LOCATION_JAPAN]}
            otherLabel="海外（国名を入力）"
            placeholder="例: ベトナム"
            canEdit={canEdit}
            busy={busy}
            onSave={(v) => patchRow(row, "location", v)}
          />
          {/* 日本語の合格証は、N4・N3・N2・N1のどれかを選んで残せる */}
          {kind === "nihongo" && (
            <PickOrTypeRow
              key={`level-${row.doc_key}-${row.level}`}
              label="合格したレベル"
              value={row.level}
              options={JLPT_LEVELS}
              otherLabel="その他（入力）"
              placeholder="例: A2（JFT-Basic）"
              canEdit={canEdit}
              busy={busy}
              onSave={(v) => patchRow(row, "level", v)}
            />
          )}

          {/* この受験情報の合格証。試験名と同じ枠に入れて、取り違えが起きないようにする */}
          <div>
            <p className="mb-1 text-[11px] font-bold text-muted">この試験の合格証</p>
            <WorkerCertDocRows
              workerId={workerId}
              canEdit={canEdit}
              defs={[
                {
                  key: row.doc_key,
                  label: row.name ? `${title}（${row.name}）` : title,
                },
              ]}
            />
          </div>
        </div>
      ))}

      {canEdit && (
        <button
          type="button"
          disabled={busy}
          onClick={addRow}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-1.5 text-[11px] font-bold text-brand disabled:opacity-50"
        >
          <Plus size={13} />
          {title}の受験情報を追加
        </button>
      )}
    </div>
  );
}
