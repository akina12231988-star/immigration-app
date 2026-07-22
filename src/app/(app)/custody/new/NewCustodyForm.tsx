"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, ImagePlus, Stamp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { createClient } from "@/lib/supabase/client";
import { createCustody } from "@/lib/supabase/queries/custody";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { CUSTODY_ITEMS } from "@/types/db";
import { todayStr } from "@/lib/application-alerts";
import { processCardImage, uploadCustodyCardImage, type ProcessedImage } from "@/lib/custody-image";
import {
  CUSTODIAN_INFO,
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

const inputCls =
  "min-h-[44px] w-full rounded-xl border border-border bg-surface px-3.5 text-base focus:border-brand focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold text-muted";

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

  // 基本情報
  const [storageNo, setStorageNo] = useState(suggestedNo ? formatStorageNo(suggestedNo) : "");
  const [receivedOn, setReceivedOn] = useState(today);
  const [expireOn, setExpireOn] = useState(defaultExpireOn(today));
  const [autoExpire, setAutoExpire] = useState(true);
  const [content, setContent] = useState(CONTENTS[0]);
  const [items, setItems] = useState<string>(CUSTODY_ITEMS[0]);

  // 在留カード画像
  const [front, setFront] = useState<ProcessedImage | null>(null);
  const [back, setBack] = useState<ProcessedImage | null>(null);

  // 名義人情報（外国人を選ぶと自動入力・編集可能）
  const [workerId, setWorkerId] = useState("");
  const [name, setName] = useState("");
  const [nationality, setNationality] = useState("");
  const [birth, setBirth] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [status, setStatus] = useState("");
  const [cardExpire, setCardExpire] = useState("");

  // 申請取次者証明書 有効期限
  const [agentExpire, setAgentExpire] = useState<string>(CUSTODIAN_INFO.agentCertExpiry);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () =>
      workers.map((w) => ({
        id: w.id,
        label: `${w.name}${w.worker_code ? `（${w.worker_code}）` : ""}${w.nationality ? ` ・ ${w.nationality}` : ""}`,
      })),
    [workers],
  );

  const selectWorker = (id: string) => {
    setWorkerId(id);
    const w = workers.find((x) => x.id === id);
    if (!w) return;
    setName(w.name);
    setNationality(w.nationality);
    setBirth(w.birth ?? "");
    setCardNo(w.residence_card_no);
    setStatus(w.residence_status);
    setCardExpire(w.residence_expiry_date ?? "");
  };

  const parsedNo = Number.parseInt(storageNo, 10);
  const noInvalid =
    !Number.isFinite(parsedNo) || parsedNo < STORAGE_NO_MIN || parsedNo > STORAGE_NO_MAX;
  const noConflict = !noInvalid && activeNos.includes(parsedNo);

  const changeReceivedOn = (v: string) => {
    setReceivedOn(v);
    if (autoExpire) setExpireOn(defaultExpireOn(v));
  };

  const handleImage = async (slot: "front" | "back", file: File | undefined) => {
    if (!file) return;
    try {
      const processed = await processCardImage(file);
      if (slot === "front") setFront(processed);
      else setBack(processed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submit = async () => {
    if (!workerId) {
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
      const frontPath = front ? await uploadCustodyCardImage(front.blob, "front") : "";
      const backPath = back ? await uploadCustodyCardImage(back.blob, "back") : "";
      const record = await createCustody(
        createClient(),
        {
          worker_id: workerId,
          storage_no: parsedNo,
          items,
          received_on: receivedOn,
          expire_on: expireOn || null,
          content,
          ref_no: custodyRefNo(receivedOn, parsedNo),
          note,
          holder_name: name.trim(),
          holder_nationality: nationality.trim(),
          holder_birth: birth || null,
          holder_card_no: cardNo.trim().toUpperCase(),
          holder_residence_status: status.trim(),
          holder_card_expire: cardExpire || null,
          agent_cert_expire: agentExpire || null,
          front_image_path: frontPath,
          back_image_path: backPath,
        },
        meName,
      );
      router.push(`/custody/${record.id}/receipt`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 基本情報 */}
      <Card className="space-y-4 p-4">
        <h2 className="border-b border-border pb-2 text-sm font-bold text-muted">基本情報</h2>
        <div>
          <label className={labelCls}>📦 保管番号（001〜999）</label>
          <div className="flex items-center gap-3">
            <input
              value={storageNo}
              onChange={(e) => setStorageNo(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              maxLength={3}
              className="min-h-[52px] w-24 rounded-xl border-2 border-seal bg-surface text-center text-xl font-black tracking-[0.1em] text-seal focus:outline-none"
            />
            <p className="text-[11px] leading-relaxed text-muted">
              パスポートの付箋に貼る番号です。
              <br />
              入管許可後にこの番号でパスポートを探します。
            </p>
          </div>
          {noConflict && (
            <p className="mt-1 text-xs font-bold text-seal">
              No.{formatStorageNo(parsedNo)} は既に預かり中です。次の空き番号: {(() => {
                const next = nextFreeStorageNo(activeNos);
                return next ? formatStorageNo(next) : "なし";
              })()}
            </p>
          )}
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
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
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
          <label className={labelCls}>預かる書類</label>
          <select value={items} onChange={(e) => setItems(e.target.value)} className={inputCls}>
            {CUSTODY_ITEMS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* 在留カード写真 */}
      <Card className="space-y-3 p-4">
        <h2 className="border-b border-border pb-2 text-sm font-bold text-muted">預かっている在留カード</h2>
        <p className="text-[11px] text-muted">
          表面・裏面の写真を添付できます。余白は自動でトリミングされます。
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["front", "back"] as const).map((slot) => {
            const img = slot === "front" ? front : back;
            const setImg = slot === "front" ? setFront : setBack;
            return (
              <div key={slot}>
                <p className="mb-1.5 text-xs font-bold text-muted">{slot === "front" ? "表面" : "裏面"}</p>
                <div className="flex min-h-[90px] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface">
                  {img ? (
                    // 処理済みプレビュー（dataURL）のため next/image ではなく img を使う
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.dataUrl} alt={slot === "front" ? "在留カード表面" : "在留カード裏面"} className="max-h-44 w-full object-contain" />
                  ) : (
                    <span className="p-3 text-[11px] text-muted">未選択</span>
                  )}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border bg-surface px-2 py-2 text-xs font-bold">
                    <Camera size={14} />
                    撮影
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        void handleImage(slot, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border bg-surface px-2 py-2 text-xs font-bold">
                    <ImagePlus size={14} />
                    アルバム
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        void handleImage(slot, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {img && (
                  <button type="button" onClick={() => setImg(null)} className="mt-1 text-[11px] text-seal underline">
                    画像をクリア
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 名義人情報 */}
      <Card className="space-y-3 p-4">
        <h2 className="border-b border-border pb-2 text-sm font-bold text-muted">在留カード名義人情報</h2>
        <div>
          <label className={labelCls}>外国人を選ぶと登録済みの情報が自動入力されます（修正可）</label>
          <Combobox options={options} value={workerId} onChange={selectWorker} placeholder="氏名で検索" />
        </div>
        <div>
          <label className={labelCls}>氏名（在留カード記載のローマ字）</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：PHAT CHANNY" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>国籍・地域</label>
            <input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="例：カンボジア" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>生年月日</label>
            <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>在留カード番号</label>
          <input
            value={cardNo}
            onChange={(e) => setCardNo(e.target.value.toUpperCase())}
            placeholder="例：UH88121481RF"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>在留資格</label>
            <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="例：特定技能1号" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>在留期間（満了日）</label>
            <input type="date" value={cardExpire} onChange={(e) => setCardExpire(e.target.value)} className={inputCls} />
          </div>
        </div>
      </Card>

      {/* 預かり者・申請取次者 */}
      <Card className="space-y-3 p-4">
        <h2 className="border-b border-border pb-2 text-sm font-bold text-muted">預かり者・申請取次者（固定）</h2>
        <div className="flex items-start gap-3 rounded-xl bg-seal/5 p-3">
          <p className="flex-1 text-[11.5px] leading-relaxed text-muted">
            事業所名：{CUSTODIAN_INFO.officeName}（登録番号 {CUSTODIAN_INFO.registrationNo}）
            <br />
            {CUSTODIAN_INFO.address}
            <br />
            申請取次者：{CUSTODIAN_INFO.agentName}（証明書番号 {CUSTODIAN_INFO.agentCertNo}）
          </p>
          <Image src="/azk-stamp.png" alt="角印" width={48} height={53} className="shrink-0 opacity-80" />
        </div>
        <div>
          <label className={labelCls}>申請取次者証明書 有効期限</label>
          <input type="date" value={agentExpire} onChange={(e) => setAgentExpire(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>メモ（任意・預かり証には印字されません）</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </div>
      </Card>

      {error && <p className="text-sm font-bold text-seal">{error}</p>}

      <Button fullWidth icon={<Stamp size={18} />} disabled={busy} onClick={submit}>
        {busy ? "登録中…" : "発行して預かり証を作成"}
      </Button>
      <p className="pb-2 text-center text-[11px] text-muted">
        No.{noInvalid ? "—" : formatStorageNo(parsedNo)} で台帳に記録され、プレビュー画面からPDF・JPEGで保存できます。
      </p>
    </div>
  );
}
