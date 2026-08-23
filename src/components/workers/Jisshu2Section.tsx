"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { WorkerCertDocRows } from "@/components/workers/WorkerCertDocRows";
import { dbErrorMessage } from "@/lib/errors";

// 良好修了の証明方法（workers.jisshu2_proof）
export const JISSHU2_PROOF_EXAM = "実技試験の合格";
export const JISSHU2_PROOF_DOCUMENT = "書面による証明";

const INPUT =
  "min-h-[36px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none";

// 良好に修了した技能実習2号の記録（職種名・作業名・良好修了の証明）。
// 外国人詳細（専門級の下）と申請準備チェックリストの合格証パネルの両方で使う。
// 3級の技能検定等の実技試験に合格していれば「合格による証明」、
// 不合格の場合は「実習状況に関する書面による証明」にチェックして技能評価調書を添付する
export function Jisshu2Section({
  workerId,
  canEdit,
}: {
  workerId: string;
  canEdit: boolean;
}) {
  const [loaded, setLoaded] = useState<{
    shokushu: string;
    sagyo: string;
    proof: string;
  } | null>(null);
  const [shokushu, setShokushu] = useState("");
  const [sagyo, setSagyo] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 0110未適用でも壊れないよう select("*") で読み、無い列は空として扱う
    createClient()
      .from("workers")
      .select("*")
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const r = data as Record<string, unknown>;
        const s = (v: unknown) => (typeof v === "string" ? v : "");
        const values = {
          shokushu: s(r.jisshu2_shokushu),
          sagyo: s(r.jisshu2_sagyo),
          proof: s(r.jisshu2_proof),
        };
        setLoaded(values);
        setShokushu(values.shokushu);
        setSagyo(values.sagyo);
        setProof(values.proof);
      });
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const save = async (patch: {
    jisshu2_shokushu?: string;
    jisshu2_sagyo?: string;
    jisshu2_proof?: string;
  }) => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), workerId, patch);
      setLoaded((prev) =>
        prev
          ? {
              shokushu: patch.jisshu2_shokushu ?? prev.shokushu,
              sagyo: patch.jisshu2_sagyo ?? prev.sagyo,
              proof: patch.jisshu2_proof ?? prev.proof,
            }
          : prev,
      );
    } catch (err) {
      setError(dbErrorMessage(err, "0110_worker_jisshu2.sql", "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-border p-2">
      <p className="text-[11px] font-bold text-muted">良好に修了した技能実習2号</p>
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          職種名
          <input
            value={shokushu}
            disabled={!canEdit || loaded === null}
            onChange={(e) => setShokushu(e.target.value)}
            onBlur={() => {
              if (loaded && shokushu !== loaded.shokushu) {
                void save({ jisshu2_shokushu: shokushu });
              }
            }}
            placeholder="例: 耕種農業"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted">
          作業名
          <input
            value={sagyo}
            disabled={!canEdit || loaded === null}
            onChange={(e) => setSagyo(e.target.value)}
            onBlur={() => {
              if (loaded && sagyo !== loaded.sagyo) {
                void save({ jisshu2_sagyo: sagyo });
              }
            }}
            placeholder="例: 施設園芸"
            className={INPUT}
          />
        </label>
      </div>
      {/* 良好に修了したことの証明。合格なら実技試験、不合格なら書面（技能評価調書）で証明する */}
      <p className="text-[11px] font-bold text-muted">良好に修了したことの証明</p>
      <label className="flex items-start gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={proof === JISSHU2_PROOF_EXAM}
          disabled={!canEdit || busy || loaded === null}
          onChange={(e) => {
            const next = e.target.checked ? JISSHU2_PROOF_EXAM : "";
            setProof(next);
            void save({ jisshu2_proof: next });
          }}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        3級の技能検定又はこれに相当する技能実習評価試験の実技試験の合格による証明
      </label>
      <label className="flex items-start gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={proof === JISSHU2_PROOF_DOCUMENT}
          disabled={!canEdit || busy || loaded === null}
          onChange={(e) => {
            const next = e.target.checked ? JISSHU2_PROOF_DOCUMENT : "";
            setProof(next);
            void save({ jisshu2_proof: next });
          }}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        実習状況に関する書面による証明（実技試験が不合格の場合。技能評価調書を添付）
      </label>
      {proof === JISSHU2_PROOF_DOCUMENT && (
        <WorkerCertDocRows
          workerId={workerId}
          canEdit={canEdit}
          defs={[{ key: "prep_hyoka_chosho", label: "技能評価調書" }]}
        />
      )}
    </div>
  );
}
