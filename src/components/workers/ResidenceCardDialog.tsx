"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  RESIDENCE_PERIODS,
  WORK_RESTRICTIONS,
  emptyResidenceCardInput,
  isValidResidenceCardNo,
  normalizeCardDate,
  residenceCardToWorkerFields,
  type ResidenceCardInput,
} from "@/lib/residence-card";
import { RESIDENCE_STATUSES } from "@/types/db";

// 在留カードの券面を見ながら入力するためのダイアログ。
// 実物のカードと同じ位置関係（左に氏名・生年月日・性別・国籍・住居地、
// 右上に番号と写真、下に在留資格・就労制限・在留期間・満了日・許可年月日）に並べる。
//
// 入力した内容はこのダイアログの中だけで持ち、「この内容を反映」で
// 外国人フォームへ渡す。保存や送信はしない（機微な情報を残さないため）。
export function ResidenceCardDialog({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (fields: Record<string, string>) => void;
}) {
  const [card, setCard] = useState<ResidenceCardInput>(emptyResidenceCardInput());
  const set = (key: keyof ResidenceCardInput, value: string) =>
    setCard((c) => ({ ...c, [key]: value }));

  const close = () => {
    setCard(emptyResidenceCardInput()); // 閉じたら入力内容は残さない
    onClose();
  };

  // 在留カード番号の形は確かめるが、合わなくても反映はできる（注意だけ出す）
  const cardNoInvalid = card.cardNo.trim() !== "" && !isValidResidenceCardNo(card.cardNo);
  // 日付として読み取れない書き方も注意を出す（反映では入れない）
  const badDate = (value: string) => value.trim() !== "" && normalizeCardDate(value) === "";
  const fields = residenceCardToWorkerFields(card);
  const nothingToApply = Object.keys(fields).length === 0;

  const apply = () => {
    onApply(fields);
    setCard(emptyResidenceCardInput());
  };

  return (
    <Modal open={open} title="在留カードから入力" onClose={close}>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        カードの券面と同じ並びにしています。読み取れたところだけ入れてください。
        「この内容を反映」を押すと、下の編集フォームの同じ項目に入ります（保存はフォームの保存ボタンで行います）。
        入力した内容はこの画面を閉じると消えます。
      </p>

      {/* カードの見た目に近い枠 */}
      <div className="rounded-2xl border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
            <CreditCard size={13} />
            在留カード RESIDENCE CARD
          </span>
          {/* カード右上の番号 */}
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted">番号</span>
            <input
              value={card.cardNo}
              onChange={(e) => set("cardNo", e.target.value)}
              placeholder="AB12345678CD"
              aria-invalid={cardNoInvalid}
              className={`min-h-[34px] w-[150px] rounded-lg border bg-surface px-2 text-xs tabular-nums focus:outline-none ${
                cardNoInvalid ? "border-seal" : "border-border focus:border-brand"
              }`}
            />
          </label>
        </div>

        <div className="flex gap-3">
          {/* 左: 氏名・生年月日・性別・国籍・住居地 */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <CardField label="氏名 NAME">
              <input
                value={card.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="NGUYEN VAN A"
                className={CARD_INPUT}
              />
            </CardField>
            <div className="grid grid-cols-2 gap-2">
              <CardField label="生年月日 DATE OF BIRTH">
                <input
                  value={card.birth}
                  onChange={(e) => set("birth", e.target.value)}
                  placeholder="1996年3月2日"
                  aria-invalid={badDate(card.birth)}
                  className={badDate(card.birth) ? CARD_INPUT_BAD : CARD_INPUT}
                />
              </CardField>
              <CardField label="性別 SEX">
                <select
                  value={card.gender}
                  onChange={(e) => set("gender", e.target.value)}
                  className={CARD_INPUT}
                >
                  <option value="">未入力</option>
                  <option value="男">男 M</option>
                  <option value="女">女 F</option>
                </select>
              </CardField>
            </div>
            <CardField label="国籍・地域 NATIONALITY/REGION">
              <input
                value={card.nationality}
                onChange={(e) => set("nationality", e.target.value)}
                placeholder="ベトナム"
                className={CARD_INPUT}
              />
            </CardField>
            <CardField label="住居地 ADDRESS">
              <input
                value={card.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="熊本県熊本市中央区◯◯1-2-3"
                className={CARD_INPUT}
              />
            </CardField>
          </div>

          {/* 右: 顔写真の位置（入力するものは無いので枠だけ出して位置を分かりやすくする） */}
          <div className="flex h-[104px] w-[80px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-center text-[10px] leading-tight text-muted">
            顔写真
            <br />
            の位置
          </div>
        </div>

        {/* 下段: 在留資格・就労制限・在留期間・満了日・許可年月日 */}
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          <div className="grid grid-cols-2 gap-2">
            <CardField label="在留資格 STATUS">
              <select
                value={card.residenceStatus}
                onChange={(e) => set("residenceStatus", e.target.value)}
                className={CARD_INPUT}
              >
                <option value="">未入力</option>
                {RESIDENCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </CardField>
            <CardField label="就労制限の有無">
              <select
                value={card.workRestriction}
                onChange={(e) => set("workRestriction", e.target.value)}
                className={CARD_INPUT}
              >
                <option value="">未入力</option>
                {WORK_RESTRICTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </CardField>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CardField label="在留期間 PERIOD OF STAY">
              <input
                list="residence-periods"
                value={card.residencePeriod}
                onChange={(e) => set("residencePeriod", e.target.value)}
                placeholder="1年"
                className={CARD_INPUT}
              />
              <datalist id="residence-periods">
                {RESIDENCE_PERIODS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </CardField>
            <CardField label="在留期間満了日 DATE OF EXPIRATION">
              <input
                value={card.expiryDate}
                onChange={(e) => set("expiryDate", e.target.value)}
                placeholder="2027年5月8日"
                aria-invalid={badDate(card.expiryDate)}
                className={badDate(card.expiryDate) ? CARD_INPUT_BAD : CARD_INPUT}
              />
            </CardField>
          </div>
          <CardField label="許可年月日 DATE OF PERMISSION">
            <input
              value={card.permitDate}
              onChange={(e) => set("permitDate", e.target.value)}
              placeholder="令和8年5月8日"
              aria-invalid={badDate(card.permitDate)}
              className={badDate(card.permitDate) ? CARD_INPUT_BAD : CARD_INPUT}
            />
          </CardField>
        </div>
      </div>

      {cardNoInvalid && (
        <p role="alert" className="mt-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          在留カード番号は英字2文字＋数字8桁＋英字2文字（例: AB12345678CD）です。
          読み間違いがないか確かめてください。このままでも反映はできます。
        </p>
      )}
      {(badDate(card.birth) || badDate(card.expiryDate) || badDate(card.permitDate)) && (
        <p role="alert" className="mt-2 rounded-lg bg-status-notice-bg px-3 py-2 text-xs text-status-notice-fg">
          日付として読み取れない欄があります（「2027年5月8日」「令和8年5月8日」「2027/5/8」の形で入れてください）。
          読み取れない日付は反映しません。
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" fullWidth onClick={close}>
          キャンセル
        </Button>
        <Button fullWidth disabled={nothingToApply} onClick={apply}>
          この内容を反映
        </Button>
      </div>
      {nothingToApply && (
        <p className="mt-1.5 text-center text-[11px] text-muted">
          反映できる内容がまだありません。カードを見て入力してください。
        </p>
      )}
    </Modal>
  );
}

const CARD_INPUT =
  "min-h-[36px] w-full rounded-lg border border-border bg-surface px-2 text-sm focus:border-brand focus:outline-none";
const CARD_INPUT_BAD =
  "min-h-[36px] w-full rounded-lg border border-seal bg-surface px-2 text-sm focus:outline-none";

function CardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}
