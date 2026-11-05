"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { OrgFileAttachments } from "@/app/(app)/organizations/OrganizationFormFields";
import { ORG_FILE_KIND_OWNER_ID, orgFilesPrintHref } from "@/lib/org-attachments";

// 事業主の確認書類（名刺・住民票・運転免許証のどれかの画像）。
// 雇用保険の適用事業所でない会社が外国人雇用状況届出書をハローワークへ出すときに添える。
// 所属機関の添付ファイル（organization_files・kind=事業主の確認書類）に保存するので、
// 所属機関の編集画面と随時報告書（退職）の届出書作成画面のどちらで入れても同じものが出る。
// 印刷はA4縦の真ん中に置く（名刺・免許証は実物大、住民票は用紙いっぱい。印刷画面で大きさを変えられる）
export function OrgOwnerIdDocs({ orgId, canEdit = true }: { orgId: string; canEdit?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {canEdit && (
        <OrgFileAttachments
          orgId={orgId}
          kind={ORG_FILE_KIND_OWNER_ID}
          addLabel="名刺・住民票・免許証の画像を追加"
        />
      )}
      <Link
        href={orgFilesPrintHref(orgId, [ORG_FILE_KIND_OWNER_ID])}
        target="_blank"
        className="inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-lg border border-brand px-3 text-xs font-bold text-brand hover:bg-brand/5"
      >
        <Printer size={14} />
        確認書類を印刷（A4縦・中央に配置）
      </Link>
      <p className="text-[11px] leading-relaxed text-muted">
        名刺・免許証のような小さい画像は、A4縦の真ん中に実物大で印刷します（印刷画面で大きさを変えられます）。
        所属機関の情報に保存されるので、次の届出でもそのまま使えます。
      </p>
    </div>
  );
}
