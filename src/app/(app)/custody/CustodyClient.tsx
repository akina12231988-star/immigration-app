"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Download, FileUp, Printer, QrCode, Stamp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import {
  addCustodyPerson,
  listCustodyEvents,
  recordCustodyAction,
  type CustodyWithWorker,
} from "@/lib/supabase/queries/custody";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import type { CustodyEventRow, CustodyStatus } from "@/types/db";
import { CUSTODY_PURPOSES, formatStorageNo, parseAzkLedger } from "@/lib/custody";
import { QrImage, QrLinkCopyButton, QrSaveButton, custodyQrUrl, useOrigin } from "./QrImage";

const STATUS_BADGE: Record<CustodyStatus, string> = {
  ボックス保管中: "bg-status-approved-bg text-status-approved-fg",
  持出中: "bg-seal/10 text-seal",
  返却済み: "bg-status-before-bg text-status-before-fg",
};

type Filter = "預かり中" | CustodyStatus | "すべて";
const FILTERS: Filter[] = ["預かり中", "ボックス保管中", "持出中", "返却済み", "すべて"];

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CustodyClient({
  initialRecords,
  workers,
  canWrite,
  meName,
  initialNo,
  initialPersons,
}: {
  initialRecords: CustodyWithWorker[];
  workers: WorkerWithOrg[];
  canWrite: boolean;
  meName: string;
  initialNo?: number;
  initialPersons: string[];
}) {
  const [persons, setPersons] = useState(initialPersons);
  // QRコード（/custody?no=番号）から開いた場合、その番号の預かりを直接開く。
  // 現在預かり中でない番号は、検索欄に番号を入れて過去履歴を表示する。
  const initialActive = initialNo
    ? (initialRecords.find((r) => r.storage_no === initialNo && r.status !== "返却済み") ?? null)
    : null;
  const [records, setRecords] = useState(initialRecords);
  const [filter, setFilter] = useState<Filter>(initialNo && !initialActive ? "すべて" : "預かり中");
  const [q, setQ] = useState(initialNo && !initialActive ? formatStorageNo(initialNo) : "");
  const [selected, setSelected] = useState<CustodyWithWorker | null>(initialActive);
  const [importing, setImporting] = useState(false);

  const active = records.filter((r) => r.status !== "返却済み");
  const inBox = active.filter((r) => r.status === "ボックス保管中");
  const out = active.filter((r) => r.status === "持出中");

  const filtered = useMemo(() => {
    const query = q.trim().toUpperCase();
    return records
      .filter((r) => {
        if (filter === "預かり中") return r.status !== "返却済み";
        if (filter === "すべて") return true;
        return r.status === filter;
      })
      .filter((r) => {
        if (!query) return true;
        return (
          formatStorageNo(r.storage_no).includes(query) ||
          (r.workers?.name ?? "").toUpperCase().includes(query) ||
          (r.workers?.kana ?? "").toUpperCase().includes(query) ||
          (r.workers?.nationality ?? "").toUpperCase().includes(query)
        );
      });
  }, [records, filter, q]);

  const replaceRecord = (updated: CustodyWithWorker) => {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    setSelected((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  };

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <Archive size={14} className="mt-0.5 shrink-0" />
        パスポート・在留カード原本の保管ボックスです。番号は預かり証・付箋と同じ保管番号。出し入れは必ずここで記録してください。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-status-approved-bg px-3 py-1 text-xs font-bold text-status-approved-fg">
          ボックス在庫 {inBox.length}
        </span>
        <span className="rounded-full bg-seal/10 px-3 py-1 text-xs font-bold text-seal">
          持出中 {out.length}
        </span>
        <span className="rounded-full bg-status-before-bg px-3 py-1 text-xs font-bold text-status-before-fg">
          預かり合計 {active.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {canWrite && (
          <>
            <LinkButton href="/custody/new" icon={<Stamp size={18} />}>
              預かり証を発行
            </LinkButton>
            <Button variant="secondary" icon={<FileUp size={18} />} onClick={() => setImporting(true)}>
              azk台帳から取込
            </Button>
          </>
        )}
        <LinkButton href="/custody/qr" variant="secondary" icon={<QrCode size={18} />}>
          QRコード
        </LinkButton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="番号・氏名・国籍で検索"
          className="min-h-[44px] flex-1 rounded-xl border border-border bg-surface px-3.5 text-base focus:border-brand focus:outline-none"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="min-h-[44px] rounded-xl border border-border bg-surface px-3 text-sm font-bold"
        >
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          該当する預かりがありません。「預かり証を発行」から登録できます。
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r)}
              className="text-left"
            >
              <Card
                className={`h-full p-3 transition hover:border-brand ${
                  r.status === "持出中" ? "border-seal" : ""
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <span className="rounded border-2 border-seal px-1.5 text-lg font-black tabular-nums tracking-widest text-seal">
                    {formatStorageNo(r.storage_no)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[r.status]}`}>
                    {r.status}
                  </span>
                </div>
                <p className="truncate text-sm font-bold">{r.workers?.name ?? "（不明）"}</p>
                <p className="truncate text-[11px] text-muted">
                  {r.workers?.nationality || "国籍未登録"} ・ {r.items}
                </p>
                {r.status === "持出中" && (
                  <p className="mt-1 truncate text-[11px] font-bold text-seal">
                    {r.holder || "持出者未記録"}
                    {r.held_since ? ` ・ ${fmtDateTime(r.held_since)}〜` : ""}
                  </p>
                )}
                {r.status === "返却済み" && r.returned_on && (
                  <p className="mt-1 text-[11px] text-muted">返却 {r.returned_on}</p>
                )}
              </Card>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <DetailModal
          record={selected}
          canWrite={canWrite}
          meName={meName}
          persons={persons}
          onAddPerson={(name) =>
            setPersons((prev) => (prev.includes(name) ? prev : [...prev, name]))
          }
          onClose={() => setSelected(null)}
          onUpdated={replaceRecord}
        />
      )}

      {importing && (
        <ImportModal
          workers={workers}
          records={records}
          onClose={() => setImporting(false)}
          onImported={(added) => setRecords((prev) => [...prev, ...added].sort((a, b) => a.storage_no - b.storage_no))}
        />
      )}
    </div>
  );
}

// ---- 詳細モーダル（持出・返却の登録と履歴表示） ----

const ADD_PERSON = "__add__";
const OTHER_PURPOSE = "__other__";

function DetailModal({
  record,
  canWrite,
  meName,
  persons,
  onAddPerson,
  onClose,
  onUpdated,
}: {
  record: CustodyWithWorker;
  canWrite: boolean;
  meName: string;
  persons: string[];
  onAddPerson: (name: string) => void;
  onClose: () => void;
  onUpdated: (r: CustodyWithWorker) => void;
}) {
  const [events, setEvents] = useState<CustodyEventRow[] | null>(null);
  const [person, setPerson] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [purposeSel, setPurposeSel] = useState("");
  const [purposeOther, setPurposeOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReturn, setConfirmReturn] = useState(false);

  // 履歴は開いたときに一度だけ取得
  useEffect(() => {
    listCustodyEvents(createClient(), record.id)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [record.id]);

  // 「＋新しい名前を追加」で入力した名前を名簿に登録して選択状態にする
  const registerPerson = async () => {
    const name = newPerson.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await addCustodyPerson(createClient(), name);
      onAddPerson(name);
      setPerson(name);
      setNewPerson("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: "持出" | "ボックスへ戻す" | "本人へ返却") => {
    const personName = person === ADD_PERSON ? "" : person;
    if (action === "持出" && !personName) {
      setError("持ち出す人を選択してください");
      return;
    }
    const purpose = purposeSel === OTHER_PURPOSE ? purposeOther.trim() : purposeSel;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const updated = await recordCustodyAction(
        supabase,
        record.id,
        action,
        personName || meName,
        purpose,
      );
      onUpdated(updated);
      setEvents(await listCustodyEvents(supabase, record.id).catch(() => []));
      setPerson("");
      setPurposeSel("");
      setPurposeOther("");
      setConfirmReturn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const w = record.workers;
  const inputCls =
    "min-h-[44px] w-full rounded-xl border border-border bg-surface px-3.5 text-base focus:border-brand focus:outline-none";

  return (
    <Modal open title={`No.${formatStorageNo(record.storage_no)} ${w?.name ?? ""}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[record.status]}`}>
            {record.status}
          </span>
          {record.status === "持出中" && (
            <span className="text-xs font-bold text-seal">
              {record.holder || "持出者未記録"}
              {record.held_since ? `（${fmtDateTime(record.held_since)}〜）` : ""}
            </span>
          )}
        </div>

        <div className="rounded-xl bg-background p-3 text-xs leading-relaxed">
          <p>
            <span className="text-muted">預かり書類：</span>
            {record.items}
          </p>
          <p>
            <span className="text-muted">国籍：</span>
            {w?.nationality || "—"}
            <span className="ml-3 text-muted">在留カード番号：</span>
            {w?.residence_card_no || "—"}
          </p>
          <p>
            <span className="text-muted">預かった日：</span>
            {record.received_on}
            <span className="ml-3 text-muted">有効年月日：</span>
            {record.expire_on ?? "—"}
          </p>
          {record.content && (
            <p>
              <span className="text-muted">申請内容：</span>
              {record.content}
            </p>
          )}
          {record.note && (
            <p>
              <span className="text-muted">メモ：</span>
              {record.note}
            </p>
          )}
        </div>

        <LinkButton
          href={`/custody/${record.id}/receipt`}
          variant="secondary"
          fullWidth
          icon={<Printer size={18} />}
        >
          預かり証を表示・印刷
        </LinkButton>

        <QrSection storageNo={record.storage_no} />

        {canWrite && record.status !== "返却済み" && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-bold">出し入れを記録</p>

            <div>
              <p className="mb-1 text-[11px] font-bold text-muted">
                {record.status === "ボックス保管中" ? "持ち出す人（必須）" : `対応した人（未選択は ${meName}）`}
              </p>
              <select value={person} onChange={(e) => setPerson(e.target.value)} className={inputCls}>
                <option value="">選択してください</option>
                {persons.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value={ADD_PERSON}>＋ 新しい名前を追加</option>
              </select>
              {person === ADD_PERSON && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={newPerson}
                    onChange={(e) => setNewPerson(e.target.value)}
                    placeholder="名前を入力"
                    className={inputCls}
                  />
                  <Button variant="secondary" disabled={busy || !newPerson.trim()} onClick={registerPerson}>
                    追加
                  </Button>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1 text-[11px] font-bold text-muted">目的</p>
              <select value={purposeSel} onChange={(e) => setPurposeSel(e.target.value)} className={inputCls}>
                <option value="">選択してください（任意）</option>
                {CUSTODY_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value={OTHER_PURPOSE}>その他（手入力）</option>
              </select>
              {purposeSel === OTHER_PURPOSE && (
                <input
                  value={purposeOther}
                  onChange={(e) => setPurposeOther(e.target.value)}
                  placeholder="目的を入力"
                  className={`${inputCls} mt-2`}
                />
              )}
            </div>

            {error && <p className="text-xs font-bold text-seal">{error}</p>}
            <div className="flex flex-col gap-2">
              {record.status === "ボックス保管中" && (
                <Button fullWidth disabled={busy} onClick={() => act("持出")}>
                  ボックスから持出
                </Button>
              )}
              {record.status === "持出中" && (
                <Button fullWidth disabled={busy} onClick={() => act("ボックスへ戻す")}>
                  ボックスへ戻す
                </Button>
              )}
              {confirmReturn ? (
                <div className="rounded-xl bg-seal/10 p-3 text-center">
                  <p className="mb-2 text-xs font-bold text-seal">
                    本人へ返却すると預かりが終了し、No.{formatStorageNo(record.storage_no)} は空き番号になります。
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" fullWidth disabled={busy} onClick={() => setConfirmReturn(false)}>
                      やめる
                    </Button>
                    <Button variant="seal" fullWidth disabled={busy} onClick={() => act("本人へ返却")}>
                      返却を確定
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" fullWidth disabled={busy} onClick={() => setConfirmReturn(true)}>
                  本人へ返却（預かり終了）
                </Button>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-bold">履歴</p>
          {!events || events.length === 0 ? (
            <p className="text-xs text-muted">履歴はまだありません。</p>
          ) : (
            <ul className="space-y-1.5">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 tabular-nums text-muted">{fmtDateTime(ev.happened_at)}</span>
                  <span className="shrink-0 font-bold">{ev.action}</span>
                  <span className="truncate text-muted">
                    {ev.person}
                    {ev.purpose ? ` ・ ${ev.purpose}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---- 保管番号QR（スマホで読み取るとこの番号の画面が直接開く） ----

function QrSection({ storageNo }: { storageNo: number }) {
  const origin = useOrigin();
  if (!origin) return null;

  const url = custodyQrUrl(origin, storageNo);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <QrImage text={url} size={96} className="shrink-0 rounded bg-white p-1" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-[11px] leading-relaxed text-muted">
          この番号のQRコードです。印刷して付箋やボックスに貼っておくと、スマホで読み取るだけでこの画面が開き、その場で持出・返却を記録できます。
        </p>
        <div className="flex flex-wrap gap-3">
          <QrSaveButton
            text={url}
            filename={`保管QR_No${formatStorageNo(storageNo)}.png`}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand"
          >
            <Download size={13} />
            QR画像を保存
          </QrSaveButton>
          <QrLinkCopyButton url={url} className="inline-flex items-center gap-1 text-xs font-bold text-brand" />
        </div>
      </div>
    </div>
  );
}

// ---- azk-receipt バックアップJSONの取込 ----

function ImportModal({
  workers,
  records,
  onClose,
  onImported,
}: {
  workers: WorkerWithOrg[];
  records: CustodyWithWorker[];
  onClose: () => void;
  onImported: (added: CustodyWithWorker[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[]>([]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setResult([]);
    const lines: string[] = [];
    try {
      const { entries, skipped } = parseAzkLedger(await file.text());
      if (skipped > 0) lines.push(`番号が読めない ${skipped} 件をスキップしました`);

      const activeNos = new Set(
        records.filter((r) => r.status !== "返却済み").map((r) => r.storage_no),
      );
      const supabase = createClient();
      const added: CustodyWithWorker[] = [];

      for (const e of entries) {
        const label = `No.${formatStorageNo(e.boxno)} ${e.name || "(氏名なし)"}`;
        if (!e.returned && activeNos.has(e.boxno)) {
          lines.push(`${label}: 同じ番号が既に預かり中のためスキップ`);
          continue;
        }
        const worker =
          workers.find(
            (w) => e.cardno && w.residence_card_no.trim().toUpperCase() === e.cardno,
          ) ??
          workers.find(
            (w) => e.name && w.name.trim().toUpperCase() === e.name.toUpperCase(),
          );
        if (!worker) {
          lines.push(`${label}: 外国人が見つかりません（先に外国人を登録してください）`);
          continue;
        }

        try {
          const { data, error } = await supabase
            .from("custody_records")
            .insert({
              worker_id: worker.id,
              storage_no: e.boxno,
              status: e.returned ? "返却済み" : "ボックス保管中",
              received_on: e.date || new Date().toISOString().slice(0, 10),
              expire_on: e.expire || null,
              content: e.content,
              ref_no: e.refno,
              returned_on: e.returned ? (e.returnedAt ?? "").slice(0, 10) || null : null,
              note: "azk-receipt 台帳から取込",
              holder_name: e.name,
              holder_nationality: e.nat,
              holder_card_no: e.cardno,
              holder_residence_status: e.status,
            })
            .select(
              "*, workers(id, name, kana, nationality, birth, residence_card_no, residence_status, residence_expiry_date, passport_no, passport_expiry_date, worker_code)",
            )
            .single();
          if (error) throw error;
          const rec = data as CustodyWithWorker;

          const events = [
            {
              custody_id: rec.id,
              action: "預かり",
              person: "",
              purpose: "azk-receipt 台帳から取込",
              ...(e.date ? { happened_at: `${e.date}T00:00:00+09:00` } : {}),
            },
            ...(e.returned
              ? [
                  {
                    custody_id: rec.id,
                    action: "本人へ返却",
                    person: "",
                    purpose: "azk-receipt 台帳から取込",
                    ...(e.returnedAt ? { happened_at: `${e.returnedAt.slice(0, 10)}T00:00:00+09:00` } : {}),
                  },
                ]
              : []),
          ];
          const { error: evError } = await supabase.from("custody_events").insert(events);
          if (evError) throw evError;

          if (!e.returned) activeNos.add(e.boxno);
          added.push(rec);
          lines.push(`${label}: 取込OK（${worker.name}）`);
        } catch (err) {
          lines.push(`${label}: 失敗（${err instanceof Error ? err.message : String(err)}）`);
        }
      }

      if (added.length > 0) onImported(added);
      lines.unshift(`取込完了: ${added.length} 件`);
    } catch (err) {
      lines.push(err instanceof Error ? err.message : String(err));
    } finally {
      setResult(lines);
      setBusy(false);
    }
  };

  return (
    <Modal open title="azk-receipt 台帳から取込" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          預かり証発行ツール（azk-receipt）の「バックアップ保存」で出力したJSONファイルを選ぶと、
          保管番号ごとの預かり記録をこの台帳へ取り込みます。外国人は在留カード番号（無ければ氏名）で照合します。
        </p>
        <label className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-sm font-bold text-brand">
          <FileUp size={18} />
          {busy ? "取込中…" : "バックアップJSONを選択"}
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {result.length > 0 && (
          <div className="max-h-60 overflow-y-auto rounded-xl bg-background p-3">
            {result.map((line, i) => (
              <p key={i} className="text-xs leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
