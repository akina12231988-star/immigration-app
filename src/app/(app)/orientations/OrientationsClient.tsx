"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ExternalLink, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { updateOrientation } from "@/lib/supabase/queries/orientations";
import { recommendedFileName, recommendedFolderName } from "@/lib/orientation";
import type { OrientationWithRefs } from "@/lib/supabase/queries/orientations";

type Tab = "未実施" | "実施済";

export function OrientationsClient({
  orientations,
  canEdit,
}: {
  orientations: OrientationWithRefs[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("未実施");
  const [editing, setEditing] = useState<OrientationWithRefs | null>(null);

  const filtered = useMemo(
    () => orientations.filter((o) => o.status === tab),
    [orientations, tab],
  );

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <GraduationCap size={14} className="mt-0.5 shrink-0" />
        特定技能1号の対象者について、雇用開始日から2週間後の日曜を予定日として自動登録します。
      </p>

      <div className="flex gap-2">
        {(["未実施", "実施済"] as Tab[]).map((t) => {
          const count = orientations.filter((o) => o.status === t).length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold ${
                tab === t
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {t}（{count}）
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {tab}の生活オリエンテーションはありません。
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link href={o.workers ? `/workers/${o.workers.id}` : "#"} className="min-w-0">
                  <p className="truncate font-bold">{o.workers?.name ?? "（削除済み）"}</p>
                  <p className="truncate text-xs text-muted">{o.organizations?.name ?? "所属機関未設定"}</p>
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    o.status === "実施済"
                      ? "bg-status-reported-bg text-status-reported-fg"
                      : "bg-status-notice-bg text-status-notice-fg"
                  }`}
                >
                  {o.status}
                </span>
              </div>
              <p className="flex items-center gap-1 text-xs tabular-nums text-muted">
                <CalendarClock size={12} />
                予定日 {o.scheduled_on}
                {o.done_on && ` ・ 実施日 ${o.done_on}`}
              </p>
              {o.drive_link && (
                <a
                  href={o.drive_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1 text-xs font-bold text-brand"
                >
                  <ExternalLink size={13} />
                  保存資料を開く
                </a>
              )}
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  {o.status === "未実施" ? (
                    <Button variant="primary" fullWidth icon={<Check size={16} />} onClick={() => setEditing(o)}>
                      実施済にする
                    </Button>
                  ) : (
                    <Button variant="secondary" fullWidth onClick={() => setEditing(o)}>
                      編集
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <DoneDialog
          orientation={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DoneDialog({
  orientation,
  onClose,
  onSaved,
}: {
  orientation: OrientationWithRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [doneOn, setDoneOn] = useState(orientation.done_on ?? new Date().toISOString().slice(0, 10));
  const [driveLink, setDriveLink] = useState(orientation.drive_link ?? "");
  const [note, setNote] = useState(orientation.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folder = recommendedFolderName(orientation.organizations?.name ?? "");
  const file = recommendedFileName(orientation.workers?.name ?? "", doneOn);

  const save = async (markDone: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await updateOrientation(createClient(), orientation.id, {
        status: markDone ? "実施済" : orientation.status,
        done_on: doneOn || null,
        drive_link: driveLink,
        note,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  const INPUT = "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Modal open title="生活オリエンテーション 実施記録" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">実施日</span>
          <input type="date" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} className={INPUT} />
        </label>

        <div className="rounded-xl bg-background p-3 text-xs leading-relaxed text-muted">
          <p className="mb-1 font-bold text-foreground">Drive 推奨の保存名</p>
          <p>フォルダ: {folder}</p>
          <p>ファイル: {file}</p>
          <p className="mt-1">上記の名前で Drive に保存し、そのリンクを下に貼り付けてください。</p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">保存先リンク（Drive など）</span>
          <input type="url" value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." className={INPUT} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">備考</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
        </label>

        {orientation.status === "実施済" ? (
          <Button fullWidth disabled={busy} onClick={() => save(false)}>
            {busy ? "保存中…" : "保存する"}
          </Button>
        ) : (
          <Button fullWidth disabled={busy} onClick={() => save(true)}>
            {busy ? "保存中…" : "実施済として保存"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
