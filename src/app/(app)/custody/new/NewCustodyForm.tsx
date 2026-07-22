"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Stamp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { createCustody } from "@/lib/supabase/queries/custody";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { CUSTODY_ITEMS } from "@/types/db";
import { todayStr } from "@/lib/application-alerts";
import {
  STORAGE_NO_MAX,
  STORAGE_NO_MIN,
  custodyRefNo,
  defaultExpireOn,
  formatStorageNo,
  nextFreeStorageNo,
} from "@/lib/custody";

const CONTENTS = [
  "福岡出入局管理局への在留資格変更許可申請",
  "福岡出入局管理局への在留資格更新許可申請",
];

export function NewCustodyForm({
  workers,
  activeNos,
  meName,
}: {
  workers: WorkerWithOrg[];
  activeNos: number[];
  meName: string;
}) {
  const router = useRouter();
  const today = todayStr();
  const suggestedNo = nextFreeStorageNo(activeNos);

  const [workerId, setWorkerId] = useState("");
  const [storageNo, setStorageNo] = useState(suggestedNo ? formatStorageNo(suggestedNo) : "");
  const [items, setItems] = useState<string>(CUSTODY_ITEMS[0]);
  const [receivedOn, setReceivedOn] = useState(today);
  const [expireOn, setExpireOn] = useState(defaultExpireOn(today));
  const [autoExpire, setAutoExpire] = useState(true);
  const [content, setContent] = useState(CONTENTS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const worker = workers.find((w) => w.id === workerId) ?? null;

  const options = useMemo(
    () =>
      workers.map((w) => ({
        id: w.id,
        label: `${w.name}${w.worker_code ? `（${w.worker_code}）` : ""}${w.nationality ? ` ・ ${w.nationality}` : ""}`,
      })),
    [workers],
  );

  const parsedNo = Number.parseInt(storageNo, 10);
  const noInvalid =
    !Number.isFinite(parsedNo) || parsedNo < STORAGE_NO_MIN || parsedNo > STORAGE_NO_MAX;
  const noConflict = !noInvalid && activeNos.includes(parsedNo);

  const changeReceivedOn = (v: string) => {
    setReceivedOn(v);
    if (autoExpire) setExpireOn(defaultExpireOn(v));
  };

  const submit = async () => {
    if (!worker) {
      setError("外国人を選択してください");
      return;
    }
    if (noInvalid || noConflict) {
      setError(noConflict ? "この保管番号は既に預かり中です" : "保管番号は 1〜999 で入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const record = await createCustody(
        createClient(),
        {
          worker_id: worker.id,
          storage_no: parsedNo,
          items,
          received_on: receivedOn,
          expire_on: expireOn || null,
          content,
          ref_no: custodyRefNo(receivedOn, parsedNo),
          note,
        },
        meName,
      );
      router.push(`/custody/${record.id}/receipt`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const inputCls =
    "min-h-[44px] w-full rounded-xl border border-border bg-surface px-3.5 text-base focus:border-brand focus:outline-none";
  const labelCls = "mb-1.5 block text-sm font-bold";

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div>
          <label className={labelCls}>外国人（登録済みの情報が預かり証に入ります）</label>
          <Combobox options={options} value={workerId} onChange={setWorkerId} placeholder="氏名で検索" />
        </div>

        {worker && (
          <div className="rounded-xl bg-background p-3 text-xs leading-relaxed">
            <p>
              <span className="text-muted">国籍：</span>
              {worker.nationality || "—"}
              <span className="ml-3 text-muted">生年月日：</span>
              {worker.birth ?? "—"}
            </p>
            <p>
              <span className="text-muted">在留カード番号：</span>
              {worker.residence_card_no || "—"}
              <span className="ml-3 text-muted">在留資格：</span>
              {worker.residence_status || "—"}
            </p>
            <p>
              <span className="text-muted">在留期限：</span>
              {worker.residence_expiry_date ?? "—"}
              <span className="ml-3 text-muted">パスポート番号：</span>
              {worker.passport_no || "—"}
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>保管番号（パスポートの付箋に貼る番号）</label>
          <div className="flex items-center gap-3">
            <input
              value={storageNo}
              onChange={(e) => setStorageNo(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              className="min-h-[52px] w-28 rounded-xl border-2 border-seal bg-surface text-center text-2xl font-black tracking-widest text-seal focus:outline-none"
            />
            <p className="text-xs leading-relaxed text-muted">
              空き番号を自動で提案します。
              <br />
              入管許可後はこの番号でパスポートを探します。
            </p>
          </div>
          {noConflict && (
            <p className="mt-1 text-xs font-bold text-seal">
              No.{formatStorageNo(parsedNo)} は既に預かり中です。空き番号: {(() => {
                const next = nextFreeStorageNo(activeNos);
                return next ? formatStorageNo(next) : "なし";
              })()}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls}>預かる書類</label>
          <select value={items} onChange={(e) => setItems(e.target.value)} className={inputCls}>
            {CUSTODY_ITEMS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>預かった日</label>
            <input type="date" value={receivedOn} onChange={(e) => changeReceivedOn(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>有効年月日</label>
            <input
              type="date"
              value={expireOn}
              onChange={(e) => {
                setExpireOn(e.target.value);
                setAutoExpire(false);
              }}
              className={inputCls}
            />
            <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={autoExpire}
                onChange={(e) => {
                  setAutoExpire(e.target.checked);
                  if (e.target.checked) setExpireOn(defaultExpireOn(receivedOn));
                }}
              />
              預かった日の3ヶ月後を自動計算
            </label>
          </div>
        </div>

        <div>
          <label className={labelCls}>申請内容</label>
          <select value={content} onChange={(e) => setContent(e.target.value)} className={inputCls}>
            {CONTENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>メモ（任意）</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </div>

        {error && <p className="text-sm font-bold text-seal">{error}</p>}

        <Button fullWidth icon={<Stamp size={18} />} disabled={busy} onClick={submit}>
          {busy ? "登録中…" : "発行して台帳に記録"}
        </Button>
        <p className="text-center text-[11px] text-muted">
          発行すると No.{noInvalid ? "—" : formatStorageNo(parsedNo)} で預かりが記録され、印刷用の預かり証が開きます。
        </p>
      </Card>
    </div>
  );
}
