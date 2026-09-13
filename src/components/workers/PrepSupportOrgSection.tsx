"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Building2, Printer, Users, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { createClient } from "@/lib/supabase/client";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { listWorkersForSupport } from "@/lib/supabase/queries/workers";
import { listOrganizationFiles } from "@/lib/supabase/queries/organization-files";
import { getOrgFilePreviewUrl } from "@/app/(app)/organizations/actions";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo, type CustodianInfo } from "@/lib/custody";
import {
  WORKERS_PER_SUPPORT_STAFF,
  isActiveEmployee,
  isSupportedSsw1,
  orgSupportManagers,
  orgSupportStaff,
  requiredSupportStaffCount,
  type SupportWorker,
} from "@/lib/support-system";
import { ORG_FILE_KIND_AGRI_NOTICE, isAgricultureIndustry, latestOrgFiles, orgFilesPrintHref } from "@/lib/org-attachments";
import { rosterJpDate } from "@/lib/roster";
import { todayStr } from "@/lib/ssw/calc";
import { OrgAttachmentPreview } from "@/components/workers/ApplicationPrepExtras";
import type { Employee, Organization, OrganizationFileRow } from "@/types/db";

// 申請準備の「申請書に貼る情報」の下に並べる、登録支援機関・所属機関の情報。
//  1. 職業紹介事業者の情報（登録支援機関の情報から。コピーできる）
//  2. 支援している特定技能外国人の人数（全体とこの所属機関）
//  3. 支援責任者・支援担当者の名簿（この所属機関に選任されている人）。A4で印刷できる
//  4. 所属機関の農業特定技能加入通知書（添付データ。業種が農業のときだけ）
export function PrepSupportOrgSection({ orgId }: { orgId: string | null }) {
  const [data, setData] = useState<{
    orgId: string | null;
    info: CustodianInfo;
    employees: Employee[];
    workers: SupportWorker[];
    org: Organization | null;
    files: OrganizationFileRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([
      getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
      listEmployees(supabase).catch(() => [] as Employee[]),
      listWorkersForSupport(supabase).catch(() => [] as SupportWorker[]),
      orgId
        ? supabase.from("organizations").select("*").eq("id", orgId).maybeSingle().then(({ data: o }) => (o as Organization | null) ?? null)
        : Promise.resolve(null),
      orgId ? listOrganizationFiles(supabase, orgId).catch(() => [] as OrganizationFileRow[]) : Promise.resolve([] as OrganizationFileRow[]),
    ]).then(([setting, employees, workers, org, files]) => {
      if (cancelled) return;
      setData({ orgId, info: mergeCustodianInfo(setting), employees, workers, org, files });
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!data || data.orgId !== orgId) return null;
  const { info, employees, workers, org, files } = data;
  const today = todayStr();

  // 2. 人数（全体と、この所属機関）
  const supported = workers.filter(isSupportedSsw1);
  const orgCount = orgId ? supported.filter((w) => w.current_organization_id === orgId).length : 0;
  const activeStaffCount = employees.filter((e) => isActiveEmployee(e, today) && e.is_support_staff).length;
  const requiredStaff = requiredSupportStaffCount(supported.length);

  // 3. 名簿（この所属機関に選任されている支援責任者・支援担当者。未選任なら在籍中の全員を出す）
  const orgManagers = org ? orgSupportManagers(org.intake) : [];
  const orgStaff = org ? orgSupportStaff(org.intake) : [];
  const allManagers = employees.filter((e) => isActiveEmployee(e, today) && e.is_support_manager).map((e) => e.name);
  const allStaff = employees.filter((e) => isActiveEmployee(e, today) && e.is_support_staff).map((e) => e.name);

  // 4. 農業特定技能加入通知書
  const isAgri = !!org && isAgricultureIndustry(org.industry);
  const agriNotice = isAgri ? latestOrgFiles(files, ORG_FILE_KIND_AGRI_NOTICE) : null;

  const preview = async (id: string) => {
    const res = await getOrgFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };

  const placementRows: [string, string][] = [
    ["許可・届出受理番号", info.placementLicenseNo],
    ["受理年月日", info.placementLicensedOn ? rosterJpDate(info.placementLicensedOn) : ""],
    ["職業紹介事業者の区分", info.placementKind],
    ["職業紹介事業者の氏名", info.placementName],
    ["郵便番号", info.placementPostal],
    ["住所", info.placementAddress],
    ["電話番号", info.placementTel],
  ];

  const nameList = (names: string[]) =>
    names.length === 0 ? <span className="text-muted">未選任</span> : names.map((n) => <span key={n} className="mr-2 font-bold">{n}</span>);

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}

      {/* 1. 職業紹介事業者の情報 */}
      <Card className="p-3">
        <h3 className="mb-1 flex flex-wrap items-center gap-1.5 text-sm font-bold">
          <Briefcase size={15} className="text-brand" />
          職業紹介事業者の情報
          <Link href="/support-org" className="ml-auto text-[11px] font-bold text-brand hover:underline">
            登録支援機関の画面で変更 →
          </Link>
        </h3>
        <p className="mb-2 text-[11px] text-muted">申請書の「職業紹介事業者（国内）」に書く当社の情報です（全員共通）。</p>
        <table className="w-full text-[11px]">
          <tbody>
            {placementRows.map(([k, v]) => (
              <tr key={k} className="border-t border-border">
                <th className="w-[40%] py-1 pr-2 text-left font-normal text-muted">{k}</th>
                <td className="py-1">
                  <span className="mr-1 font-bold">{v || <span className="font-normal text-muted">未登録</span>}</span>
                  {v && <CopyButton value={v} label={`${k}をコピー`} size={12} className="inline-flex align-middle" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 2. 支援している特定技能外国人の人数 */}
      <Card className="p-3">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <Users size={15} className="text-brand" />
          支援している特定技能外国人の人数
        </h3>
        <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
          <div className="rounded-lg bg-background p-2">
            <dt className="text-muted">当社全体（支援対象・在籍中の1号）</dt>
            <dd className="text-base font-bold">{supported.length}名</dd>
          </div>
          <div className="rounded-lg bg-background p-2">
            <dt className="text-muted">この所属機関{org ? `（${org.name}）` : ""}</dt>
            <dd className="text-base font-bold">{orgId ? `${orgCount}名` : "所属機関が未設定"}</dd>
          </div>
          <div className="rounded-lg bg-background p-2">
            <dt className="text-muted">必要な支援担当者（1人当たり{WORKERS_PER_SUPPORT_STAFF}人未満）</dt>
            <dd className="text-base font-bold">
              {requiredStaff}名 <span className="text-xs font-normal text-muted">／ 現在 {activeStaffCount}名</span>
            </dd>
          </div>
        </dl>
      </Card>

      {/* 3. 支援責任者・支援担当者の名簿（A4印刷） */}
      <Card className="p-3">
        <h3 className="mb-1 flex flex-wrap items-center gap-1.5 text-sm font-bold">
          <UserCheck size={15} className="text-brand" />
          支援責任者・支援担当者の名簿
          <a
            href={`/support-org/print${orgId ? `?org=${encodeURIComponent(orgId)}` : ""}`}
            target="_blank"
            rel="noopener"
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold text-brand-foreground"
          >
            <Printer size={11} />
            A4で印刷
          </a>
        </h3>
        <p className="mb-2 text-[11px] text-muted">
          「支援業務を行う体制についての説明」として印刷できます。印刷前に載せる人をチェックで選べます。
        </p>
        <div className="flex flex-col gap-1 text-[11px]">
          <p>
            この所属機関の支援責任者: {nameList(orgManagers)}
            {orgManagers.length === 0 && allManagers.length > 0 && <span className="text-muted">（在籍中の支援責任者: {allManagers.join("、")}）</span>}
          </p>
          <p>
            この所属機関の支援担当者: {nameList(orgStaff)}
            {orgStaff.length === 0 && allStaff.length > 0 && <span className="text-muted">（在籍中の支援担当者: {allStaff.join("、")}）</span>}
          </p>
          {org && (orgManagers.length === 0 || orgStaff.length === 0) && (
            <p className="text-muted">
              選任は
              <Link href={`/organizations/${org.id}`} className="mx-1 font-bold text-brand hover:underline">
                所属機関の画面
              </Link>
              の「支援体制」で行います。
            </p>
          )}
        </div>
      </Card>

      {/* 4. 所属機関の農業特定技能加入通知書 */}
      <Card className="p-3">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <Building2 size={15} className="text-brand" />
          所属機関の農業特定技能加入通知書（添付データ）
        </h3>
        {!org ? (
          <p className="text-[11px] text-muted">所属機関が未設定です。</p>
        ) : !isAgri ? (
          <p className="text-[11px] text-muted">
            この所属機関の業種は{org.industry ? `「${org.industry}」` : "未登録"}のため、農業特定技能加入通知書は不要です。
          </p>
        ) : (
          <div className="text-[11px] leading-relaxed">
            <OrgAttachmentPreview
              label={ORG_FILE_KIND_AGRI_NOTICE}
              latest={agriNotice}
              onPreview={preview}
              printHref={orgFilesPrintHref(org.id, [ORG_FILE_KIND_AGRI_NOTICE])}
              printLabel="印刷（A4縦）"
            />
          </div>
        )}
      </Card>
    </div>
  );
}
