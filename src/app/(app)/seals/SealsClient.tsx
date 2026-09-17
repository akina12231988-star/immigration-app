"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, Plus, Stamp, Trash2, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { deleteSeal, insertSeal, updateSeal, type SealWithWorker } from "@/lib/supabase/queries/seals";
import { isSealInBox, sealMatchesKana, sortSeals } from "@/lib/seals";
import { dbErrorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/application-alerts";

const INPUT =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

interface WorkerBrief {
  id: string;
  name: string;
  kana: string;
}

// 印鑑BOX。フリガナで何の印鑑が箱に入っているかを一覧にし、本人に渡したら「譲渡」で記録する。
// フリガナが当てはまる外国人（一部一致）も並べて出す
export function SealsClient({
  initialSeals,
  loadError,
  workers,
  canEdit,
}: {
  initialSeals: SealWithWorker[];
  loadError: string | null;
  workers: WorkerBrief[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [seals, setSeals] = useState(initialSeals);
  const [prev, setPrev] = useState(initialSeals);
  if (initialSeals !== prev) {
    setPrev(initialSeals);
    setSeals(initialSeals);
  }
  const [error, setError] = useState<string | null>(loadError);
  const [query, setQuery] = useState("");
  const [showTransferred, setShowTransferred] = useState(false);
  const [adding, setAdding] = useState(false);
  const [transferring, setTransferring] = useState<SealWithWorker | null>(null);
  const [deleting, setDeleting] = useState<SealWithWorker | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => sortSeals(seals), [seals]);
  const inBox = sorted.filter(isSealInBox);
  const transferred = sorted.filter((s) => !isSealInBox(s));
  const q = query.trim();
  const filter = (list: SealWithWorker[]) =>
    q ? list.filter((s) => sealMatchesKana(q, s.kana) || sealMatchesKana(s.kana, q) || s.note.includes(q)) : list;

  // その印鑑のフリガナが当てはまる外国人（一部一致）
  const matches = (s: SealWithWorker) => workers.filter((w) => sealMatchesKana(s.kana, w.kana));

  const patch = (id: string, p: Partial<SealWithWorker>) =>
    setSeals((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const undoTransfer = async (s: SealWithWorker) => {
    setBusy(true);
    setError(null);
    try {
      await updateSeal(createClient(), s.id, { transferred_on: null, transferred_to: null });
      patch(s.id, { transferred_on: null, transferred_to: null, workers: null });
      router.refresh();
    } catch (e) {
      setError(dbErrorMessage(e, "0162_seals.sql"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSeal(createClient(), deleting.id);
      setSeals((list) => list.filter((s) => s.id !== deleting.id));
      setDeleting(null);
      router.refresh();
    } catch (e) {
      setError(dbErrorMessage(e, "0162_seals.sql", "削除に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const SealItem = ({ s }: { s: SealWithWorker }) => {
    const hit = matches(s);
    const boxed = isSealInBox(s);
    return (
      <li className={`rounded-xl border p-3 ${boxed ? "border-border bg-surface" : "border-border/60 bg-background text-muted"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-black tracking-widest">{s.kana}</span>
              {boxed ? (
                <span className="rounded-full bg-status-approved-bg px-2 py-0.5 text-[11px] font-bold text-status-approved-fg">箱の中</span>
              ) : (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold">
                  譲渡済み {s.transferred_on}
                  {s.workers && `（${s.workers.name}）`}
                </span>
              )}
            </p>
            {s.made_on && <p className="text-[11px] text-muted">作成日 {s.made_on}</p>}
            {s.note && <p className="text-xs">{s.note}</p>}
            {/* フリガナが当てはまる外国人（一部一致）。誰の印鑑かの目安 */}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
              <span className="text-muted">当てはまる外国人:</span>
              {hit.length === 0 ? (
                <span className="text-muted">フリガナが一致する外国人はいません</span>
              ) : (
                hit.slice(0, 6).map((w) => (
                  <Link key={w.id} href={`/workers/${w.id}`} className="font-bold text-brand underline">
                    {w.name}
                  </Link>
                ))
              )}
              {hit.length > 6 && <span className="text-muted">ほか{hit.length - 6}名</span>}
            </p>
          </div>
          {canEdit && (
            <div className="flex shrink-0 items-center gap-1.5">
              {boxed ? (
                <button
                  type="button"
                  onClick={() => setTransferring(s)}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground"
                >
                  <Gift size={14} />
                  譲渡
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void undoTransfer(s)}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-3 text-xs font-bold text-brand disabled:opacity-50"
                >
                  <Undo2 size={14} />
                  箱に戻す
                </button>
              )}
              <button
                type="button"
                onClick={() => setDeleting(s)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-seal"
                aria-label="削除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold">
              <Stamp size={16} />
              印鑑BOX（箱の中 {inBox.length}本）
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              外国人用に作った印鑑をフリガナで登録します。本人に渡したら「譲渡」で渡した日を記録すると、箱の中には無いことが分かります。
              フリガナが外国人のフリガナの一部に当てはまれば、外国人詳細の名前の横に「印鑑あり」が出ます。
            </p>
          </div>
          {canEdit && (
            <Button className="shrink-0" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
              印鑑を登録
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="フリガナで検索（例: グエン）"
            className={`${INPUT} max-w-xs`}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showTransferred} onChange={(e) => setShowTransferred(e.target.checked)} className="size-4" />
            譲渡済みも出す（{transferred.length}本）
          </label>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-xs font-bold text-muted">箱の中にある印鑑</p>
        {filter(inBox).length === 0 ? (
          <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
            {q ? `「${q}」に当てはまる印鑑は箱にありません。` : "箱の中に印鑑はありません。"}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {filter(inBox).map((s) => (
              <SealItem key={s.id} s={s} />
            ))}
          </ul>
        )}
      </Card>

      {showTransferred && (
        <Card className="p-4">
          <p className="mb-2 text-xs font-bold text-muted">譲渡済み（本人に渡した印鑑。箱の中には無い）</p>
          {filter(transferred).length === 0 ? (
            <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">譲渡済みの印鑑はありません。</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {filter(transferred).map((s) => (
                <SealItem key={s.id} s={s} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {adding && (
        <AddSealDialog
          workers={workers}
          onClose={() => setAdding(false)}
          onSaved={(row) => {
            setSeals((list) => [{ ...row, workers: null }, ...list]);
            setAdding(false);
            router.refresh();
          }}
          onError={(m) => setError(m)}
        />
      )}
      {transferring && (
        <TransferDialog
          seal={transferring}
          workers={workers}
          onClose={() => setTransferring(null)}
          onSaved={(on, worker) => {
            patch(transferring.id, {
              transferred_on: on,
              transferred_to: worker?.id ?? null,
              workers: worker ? { id: worker.id, name: worker.name } : null,
            });
            setTransferring(null);
            router.refresh();
          }}
          onError={(m) => setError(m)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="印鑑の削除"
        message={`印鑑「${deleting?.kana ?? ""}」の記録を削除します。よろしいですか？`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// 登録（フリガナ・作成日・メモ）。フリガナを打つと当てはまる外国人を出して、誰の印鑑か確認できる
function AddSealDialog({
  workers,
  onClose,
  onSaved,
  onError,
}: {
  workers: WorkerBrief[];
  onClose: () => void;
  onSaved: (row: SealWithWorker) => void;
  onError: (message: string) => void;
}) {
  const [kana, setKana] = useState("");
  const [madeOn, setMadeOn] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const hit = kana.trim() ? workers.filter((w) => sealMatchesKana(kana, w.kana)) : [];

  const save = async () => {
    if (!kana.trim()) return;
    setBusy(true);
    try {
      const row = await insertSeal(createClient(), { kana: kana.trim(), note: note.trim(), made_on: madeOn || null });
      onSaved({ ...row, workers: null });
    } catch (e) {
      onError(dbErrorMessage(e, "0162_seals.sql"));
      setBusy(false);
    }
  };

  return (
    <Modal open title="印鑑を登録" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">フリガナ（印鑑に彫った文字・必須）</span>
          <input value={kana} onChange={(e) => setKana(e.target.value)} placeholder="例: グエン" className={INPUT} autoFocus />
          <span className="text-[11px] text-muted">
            {kana.trim()
              ? hit.length > 0
                ? `当てはまる外国人: ${hit.slice(0, 5).map((w) => w.name).join("、")}${hit.length > 5 ? ` ほか${hit.length - 5}名` : ""}`
                : "フリガナが一致する外国人はいません（登録はできます）"
              : "外国人のフリガナの一部に当てはまれば、外国人詳細に「印鑑あり」が出ます"}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">作成日</span>
          <input type="date" value={madeOn} onChange={(e) => setMadeOn(e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">メモ（書体・サイズ・誰のために作ったかなど）</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
        </label>
        <Button fullWidth disabled={busy || !kana.trim()} onClick={() => void save()}>
          {busy ? "保存中…" : "登録"}
        </Button>
      </div>
    </Modal>
  );
}

// 譲渡（渡した日と、渡した外国人）。外国人はフリガナが当てはまる人を先に出す
function TransferDialog({
  seal,
  workers,
  onClose,
  onSaved,
  onError,
}: {
  seal: SealWithWorker;
  workers: WorkerBrief[];
  onClose: () => void;
  onSaved: (on: string, worker: WorkerBrief | null) => void;
  onError: (message: string) => void;
}) {
  const [on, setOn] = useState(todayStr());
  const [workerId, setWorkerId] = useState(() => {
    const hit = workers.filter((w) => sealMatchesKana(seal.kana, w.kana));
    return hit.length === 1 ? hit[0].id : "";
  });
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => {
    const hit = workers.filter((w) => sealMatchesKana(seal.kana, w.kana));
    const rest = workers.filter((w) => !hit.includes(w));
    return [...hit, ...rest].map((w) => ({
      id: w.id,
      label: `${w.name}${w.kana ? `（${w.kana}）` : ""}${hit.includes(w) ? " ★フリガナ一致" : ""}`,
    }));
  }, [workers, seal.kana]);

  const save = async () => {
    if (!on) return;
    setBusy(true);
    try {
      await updateSeal(createClient(), seal.id, { transferred_on: on, transferred_to: workerId || null });
      onSaved(on, workers.find((w) => w.id === workerId) ?? null);
    } catch (e) {
      onError(dbErrorMessage(e, "0162_seals.sql"));
      setBusy(false);
    }
  };

  return (
    <Modal open title={`印鑑「${seal.kana}」を譲渡`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">本人に渡した日を記録します。記録すると箱の中には無いことになり、外国人詳細の「印鑑あり」も消えます。</p>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">譲渡した日（必須）</span>
          <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">渡した外国人（分かれば）</span>
          <Combobox options={options} value={workerId} onChange={setWorkerId} placeholder="名前を入力して候補から選択" />
        </label>
        <Button fullWidth disabled={busy || !on} onClick={() => void save()}>
          {busy ? "保存中…" : "譲渡を記録"}
        </Button>
      </div>
    </Modal>
  );
}
