"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { CopyButton } from "@/components/ui/CopyButton";
import { EXAM_LOCATION_JAPAN } from "@/lib/cert-exam-options";
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
  // （読み込み完了・保存反映）はこのコンポーストごと作り直して表示を合わせる
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

// 日本語の合格証・専門外の合格証の「受験した試験名」「受験地」（外国人詳細・合格証の下）。
// 試験名はよくある候補から選ぶか自由入力、受験地は「日本国内」か海外の国名を選べる。
// 保存後はどちらもコピーできる（申請書類への転記用）
export function CertExamField({
  workerId,
  canEdit,
  title,
  nameKey,
  locationKey,
  nameOptions,
}: {
  workerId: string;
  canEdit: boolean;
  title: string; // どちらの合格証の受験情報か（例:「日本語の合格証」）。上のファイル欄と対応させる
  nameKey: "cert_nihongo_name" | "cert_senmongai_name";
  locationKey: "cert_nihongo_location" | "cert_senmongai_location";
  nameOptions: readonly string[];
}) {
  const [loaded, setLoaded] = useState<{ name: string; location: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 0114未適用でも壊れないよう select("*") で読み、無い列は空として扱う
    createClient()
      .from("workers")
      .select("*")
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const r = data as Record<string, unknown>;
        const s = (v: unknown) => (typeof v === "string" ? v : "");
        setLoaded({ name: s(r[nameKey]), location: s(r[locationKey]) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  const save = async (patch: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), workerId, patch);
      setLoaded((prev) =>
        prev
          ? {
              name: patch[nameKey] ?? prev.name,
              location: patch[locationKey] ?? prev.location,
            }
          : prev,
      );
    } catch (err) {
      setError(dbErrorMessage(err, "0114_cert_exam_name_location.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  if (loaded === null) return null;

  return (
    <div className="mt-1 space-y-1.5 rounded-lg border border-dashed border-border p-2">
      <p className="text-[11px] font-bold text-muted">{title}の受験情報</p>
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {/* key={value} で、外部からの値の変化（読み込み完了・保存反映）ごとに
          作り直して表示を合わせる（入力中の文字は value がまだ変わらないので保たれる） */}
      <PickOrTypeRow
        key={`name-${loaded.name}`}
        label="受験した試験名"
        value={loaded.name}
        options={nameOptions}
        canEdit={canEdit}
        busy={busy}
        onSave={(v) => void save({ [nameKey]: v })}
      />
      <PickOrTypeRow
        key={`location-${loaded.location}`}
        label="受験地"
        value={loaded.location}
        options={[EXAM_LOCATION_JAPAN]}
        otherLabel="海外（国名を入力）"
        placeholder="例: ベトナム"
        canEdit={canEdit}
        busy={busy}
        onSave={(v) => void save({ [locationKey]: v })}
      />
    </div>
  );
}
