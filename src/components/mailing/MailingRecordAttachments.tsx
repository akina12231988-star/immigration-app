"use client";

import { MailingFileAttachments } from "@/app/(app)/mailing/MailingFileAttachments";
import { mailingAttachmentSlots, type MailingAttachmentRole } from "@/lib/mailing-attachments";
import type { JudgmentRecord, YearType } from "@/lib/tax-cert";

// 郵送請求の記録の添付欄（郵送請求した書類・届いた証明書・領収書）。
// 記録一覧のカード・編集モーダル・外国人詳細で共用する
export function MailingRecordAttachments({
  record,
  canEdit,
  only,
  divided = true,
  year,
}: {
  record: Pick<JudgmentRecord, "id" | "requestKind" | "docs" | "yearRequests" | "nhiYears">;
  canEdit: boolean;
  only?: MailingAttachmentRole[]; // 指定した欄（郵送請求した書類 / 届いた証明書 / 領収書）だけ出す
  divided?: boolean; // 欄の間に点線を引く
  year?: YearType; // 年度ごとの欄のうち、この年度の分だけ出す
}) {
  const slots = mailingAttachmentSlots(record).filter((s) => (!only || only.includes(s.role)) && (!year || s.year === year));
  return (
    <>
      {slots.map((s, i) => (
        <div key={s.kind} className={divided && i > 0 ? "mt-2 border-t border-dashed border-border pt-2" : i > 0 ? "mt-2" : ""}>
          <p className="mb-1 text-xs font-bold">{s.title}</p>
          <MailingFileAttachments
            recordId={record.id}
            kind={s.kind}
            filterKind={s.kind}
            addLabel={s.addLabel}
            canEdit={canEdit}
          />
        </div>
      ))}
    </>
  );
}
