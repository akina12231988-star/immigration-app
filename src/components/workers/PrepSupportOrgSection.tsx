"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Briefcase, Upload } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { createClient } from "@/lib/supabase/client";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { listWorkersForSupport } from "@/lib/supabase/queries/workers";
import { listOrganizationFiles } from "@/lib/supabase/queries/organization-files";
import { getOrgFilePreviewUrl } from "@/app/(app)/organizations/actions";
import { getSupportOrgFilePreviewUrl, listSupportOrgFiles, type SupportOrgFileView } from "@/app/(app)/support-org/actions";
import { AttachedFileButton } from "@/components/ui/AttachedFileButton";
import { SUPPORT_ORG_LISTING_FILE_KIND } from "@/lib/support-org-info";
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
import { ORG_FILE_KIND_AGRI_NOTICE, latestOrgFiles, orgFilesPrintHref } from "@/lib/org-attachments";
import { filledCouncilSubmissions, normalizeOrganizationIntake } from "@/lib/organization-intake";
import { uploadOrgFiles } from "@/lib/org-file-upload";
import { rosterJpDate } from "@/lib/roster";
import { todayStr } from "@/lib/ssw/calc";
import { OrgAttachmentPreview } from "@/components/workers/ApplicationPrepExtras";
import type { Employee, Organization, OrganizationFileRow } from "@/types/db";

// 申請準備の詳細ページで使う、登録支援機関・所属機関の情報。
//  ・PlacementAgencyCard: 職業紹介事業者の情報（あっせん「有り」のときに出す。コピーできる）
//  ・Prep117Section: １－１７号の特定技能外国人支援計画書に記載する項目（1つずつコピーできる）
//  ・PrepAgriNoticeSection: 所属機関の農業特定技能加入通知書（未登録ならこの場で添付）

// 値と「コピー」ボタンの1行。値が無いときは「未登録」
function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[40px] items-center gap-2 border-t border-border px-3 py-1.5 text-xs first:border-t-0">
      <span className="w-28 shrink-0 text-[11px] text-muted">{label}</span>
      <span className={`min-w-0 flex-1 ${value ? "font-bold" : "text-muted"}`}>{value || "未登録"}</span>
      {value && <CopyButton value={value} label={`${label}をコピー`} size={13} className="inline-flex shrink-0" />}
    </div>
  );
}

// 職業紹介事業者（国内）＝当社の情報（登録支援機関の画面で登録。全員共通）
export function PlacementAgencyCard() {
  const [info, setInfo] = useState<CustodianInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getAppSetting<Record<string, unknown>>(createClient(), CUSTODIAN_SETTING_KEY)
      .catch(() => null)
      .then((setting) => {
        if (!cancelled) setInfo(mergeCustodianInfo(setting));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!info) return null;
  const rows: [string, string][] = [
    ["許可・届出受理番号", info.placementLicenseNo],
    ["受理年月日", info.placementLicensedOn ? rosterJpDate(info.placementLicensedOn) : ""],
    ["職業紹介事業者の区分", info.placementKind],
    ["職業紹介事業者の氏名", info.placementName],
    ["郵便番号", info.placementPostal],
    ["住所", info.placementAddress],
    ["電話番号", info.placementTel],
  ];
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="mb-1 flex flex-wrap items-center gap-1.5 text-sm font-bold">
        <Briefcase size={15} className="text-brand" />
        職業紹介事業者の情報
        <Link href="/support-org" className="ml-auto text-[11px] font-bold text-brand hover:underline">
          登録支援機関の画面で変更 →
        </Link>
      </p>
      <p className="mb-2 text-[11px] text-muted">申請書の「職業紹介事業者（国内）」に書く当社の情報です（全員共通）。</p>
      <div className="overflow-hidden rounded-lg border border-border">
        {rows.map(([k, v]) => (
          <CopyRow key={k} label={k} value={v} />
        ))}
      </div>
      {/* 人材サービス総合サイトに掲載している画面（最新版の画像。登録支援機関の画面で添付） */}
      <ListingImages />
    </div>
  );
}

interface PlanWorker {
  id: string;
  name: string;
  birth: string | null;
  gender: string;
  nationality: string;
}

// １－１７号の特定技能外国人支援計画書に記載する項目。どの値も1つずつコピーできる
//  1. 外国人（連名の方を含む）: 氏名・生年月日・性別・国籍
//  2. 所属機関: 会社名・住所・電話番号
//  3. 支援している特定技能外国人の人数
//  4. 支援責任者・支援担当者の名簿（A4で印刷）
//  5. 所属機関の協力確認書: 提出先・提出日
export function Prep117Section({ orgId, workerIds }: { orgId: string | null; workerIds: string[] }) {
  const workerKey = workerIds.join(",");
  const [data, setData] = useState<{
    key: string;
    workers: PlanWorker[];
    employees: Employee[];
    supportWorkers: SupportWorker[];
    org: Organization | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const ids = workerKey ? workerKey.split(",") : [];
    void Promise.all([
      ids.length > 0
        ? supabase
            .from("workers")
            .select("id, name, birth, gender, nationality")
            .in("id", ids)
            .then(({ data: rows }) => (rows as PlanWorker[] | null) ?? [])
        : Promise.resolve([] as PlanWorker[]),
      listEmployees(supabase).catch(() => [] as Employee[]),
      listWorkersForSupport(supabase).catch(() => [] as SupportWorker[]),
      orgId
        ? supabase.from("organizations").select("*").eq("id", orgId).maybeSingle().then(({ data: o }) => (o as Organization | null) ?? null)
        : Promise.resolve(null),
    ]).then(([workers, employees, supportWorkers, org]) => {
      if (cancelled) return;
      // 本人を先に、連名の方をあとに並べる
      const order = new Map(ids.map((id, i) => [id, i]));
      workers.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setData({ key: `${orgId ?? ""}|${workerKey}`, workers, employees, supportWorkers, org });
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, workerKey]);

  if (!data || data.key !== `${orgId ?? ""}|${workerKey}`) return null;
  const { workers, employees, supportWorkers, org } = data;
  const today = todayStr();
  const intake = normalizeOrganizationIntake(org?.intake);

  // 3. 人数（全体と、この所属機関）
  const supported = supportWorkers.filter(isSupportedSsw1);
  const orgCount = orgId ? supported.filter((w) => w.current_organization_id === orgId).length : 0;
  const activeStaffCount = employees.filter((e) => isActiveEmployee(e, today) && e.is_support_staff).length;
  const requiredStaff = requiredSupportStaffCount(supported.length);

  // 4. 名簿（この所属機関に選任されている人。未選任なら在籍中の全員を出す）
  const orgManagers = org ? orgSupportManagers(org.intake) : [];
  const orgStaff = org ? orgSupportStaff(org.intake) : [];
  const managers = orgManagers.length > 0 ? orgManagers : employees.filter((e) => isActiveEmployee(e, today) && e.is_support_manager).map((e) => e.name);
  const staff = orgStaff.length > 0 ? orgStaff : employees.filter((e) => isActiveEmployee(e, today) && e.is_support_staff).map((e) => e.name);

  // 5. 協力確認書（事業所の所在地・住居地）
  const councils = [
    { label: "事業所の所在地", rows: filledCouncilSubmissions(intake.council_office_submissions) },
    { label: "住居地", rows: filledCouncilSubmissions(intake.council_residence_submissions) },
  ];

  const heading = (text: string, right?: React.ReactNode) => (
    <p className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-bold text-brand">
      <span className="flex-1">{text}</span>
      {right}
    </p>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 1. 外国人（連名の方を含む） */}
      <div>
        {heading("1. 外国人（連名の方を含む）")}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[34rem] text-xs">
            <thead className="bg-background text-[11px] text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left font-bold">氏名</th>
                <th className="px-3 py-1.5 text-left font-bold">生年月日</th>
                <th className="px-3 py-1.5 text-left font-bold">性別</th>
                <th className="px-3 py-1.5 text-left font-bold">国籍</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w, i) => (
                <tr key={w.id} className="border-t border-border">
                  {[
                    w.name,
                    rosterJpDate(w.birth),
                    w.gender,
                    w.nationality,
                  ].map((v, j) => (
                    <td key={j} className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className={v ? (j === 0 ? "font-bold" : "") : "text-muted"}>{v || "未登録"}</span>
                        {j === 0 && i > 0 && (
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">連名</span>
                        )}
                        {v && <CopyButton value={v} label={`${w.name}の${["氏名", "生年月日", "性別", "国籍"][j]}をコピー`} size={12} className="ml-auto inline-flex shrink-0" />}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. 所属機関 */}
      <div>
        {heading("2. 所属機関")}
        {!org ? (
          <p className="text-xs text-muted">所属機関が未設定です。</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <CopyRow label="会社名" value={org.name} />
            <CopyRow label="住所" value={org.address ?? ""} />
            <CopyRow label="電話番号" value={org.contact ?? ""} />
          </div>
        )}
      </div>

      {/* 3. 支援している特定技能外国人の人数 */}
      <div>
        {heading("3. 支援している特定技能外国人の人数")}
        <dl className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
          <div className="rounded-lg bg-background p-2.5">
            <dt className="text-muted">当社全体（支援対象・在籍中の1号）</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-lg font-bold">
              {supported.length}名
              <CopyButton value={String(supported.length)} label="当社全体の人数をコピー" size={13} className="inline-flex" />
            </dd>
          </div>
          <div className="rounded-lg bg-background p-2.5">
            <dt className="text-muted">この所属機関{org ? `（${org.name}）` : ""}</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-lg font-bold">
              {orgId ? (
                <>
                  {orgCount}名
                  <CopyButton value={String(orgCount)} label="この所属機関の人数をコピー" size={13} className="inline-flex" />
                </>
              ) : (
                "所属機関が未設定"
              )}
            </dd>
          </div>
          <div className="rounded-lg bg-background p-2.5">
            <dt className="text-muted">必要な支援担当者（1人当たり{WORKERS_PER_SUPPORT_STAFF}人未満）</dt>
            <dd className="mt-0.5 text-lg font-bold">
              {requiredStaff}名 <span className="text-xs font-normal text-muted">／ 現在 {activeStaffCount}名</span>
            </dd>
          </div>
        </dl>
      </div>

      {/* 4. 支援責任者・支援担当者の名簿 */}
      <div>
        {heading(
          "4. 支援責任者・支援担当者の名簿",
          <a
            href={`/support-org/print${orgId ? `?org=${encodeURIComponent(orgId)}` : ""}`}
            target="_blank"
            rel="noopener"
            className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold text-brand-foreground"
          >
            名簿をA4で印刷
          </a>,
        )}
        <div className="overflow-hidden rounded-xl border border-border">
          {managers.length === 0 && <CopyRow label="支援責任者" value="" />}
          {managers.map((n) => (
            <CopyRow key={`m-${n}`} label="支援責任者" value={n} />
          ))}
          {staff.length === 0 && <CopyRow label="支援担当者" value="" />}
          {staff.map((n) => (
            <CopyRow key={`s-${n}`} label="支援担当者" value={n} />
          ))}
        </div>
        {org && (orgManagers.length === 0 || orgStaff.length === 0) && (
          <p className="mt-1 text-[11px] text-muted">
            この所属機関に選任されていないため、在籍中の全員を出しています。選任は
            <Link href={`/organizations/${org.id}`} className="mx-1 font-bold text-brand hover:underline">
              所属機関の画面
            </Link>
            の「支援体制」で行います。
          </p>
        )}
      </div>

      {/* 5. 所属機関の協力確認書 */}
      <div>
        {heading("5. 所属機関の協力確認書")}
        <div className="overflow-hidden rounded-xl border border-border">
          {councils.map((c) =>
            c.rows.length === 0 ? (
              <CopyRow key={c.label} label={`${c.label} 提出先`} value="" />
            ) : (
              c.rows.map((r, i) => (
                <div key={`${c.label}-${i}`}>
                  <CopyRow label={`${c.label} 提出先`} value={r.to} />
                  <CopyRow label={`${c.label} 提出日`} value={r.on ? rosterJpDate(r.on) : ""} />
                </div>
              ))
            ),
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">未登録の提出日は「基本情報・所属機関」の所属機関の欄で入れられます。</p>
      </div>
    </div>
  );
}

// 所属機関の農業特定技能加入通知書（添付データ）。未登録ならこの場で添付でき、所属機関にも保存される
export function PrepAgriNoticeSection({
  orgId,
  canEdit,
  onChanged,
}: {
  orgId: string;
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const [files, setFiles] = useState<OrganizationFileRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listOrganizationFiles(createClient(), orgId)
      .then((rows) => {
        if (!cancelled) setFiles(rows);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, reloadKey]);

  const preview = async (id: string) => {
    const res = await getOrgFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await uploadOrgFiles(orgId, ORG_FILE_KIND_AGRI_NOTICE, list);
      setReloadKey((k) => k + 1);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (!files) return null;
  const latest = latestOrgFiles(files, ORG_FILE_KIND_AGRI_NOTICE);
  return (
    <div className="flex flex-col gap-2 text-[11px] leading-relaxed">
      {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
      {latest ? (
        <OrgAttachmentPreview
          label={ORG_FILE_KIND_AGRI_NOTICE}
          latest={latest}
          onPreview={preview}
          printHref={orgFilesPrintHref(orgId, [ORG_FILE_KIND_AGRI_NOTICE])}
          printLabel="印刷（A4縦）"
        />
      ) : (
        <p className="text-sm font-bold text-seal">所属機関にまだ登録されていません。ここで添付すると、所属機関にも保存されます。</p>
      )}
      {canEdit && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-[44px] items-center gap-1.5 self-start rounded-lg bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            <Upload size={15} />
            {busy ? "アップロード中…" : latest ? "新しい通知書を添付" : "ファイルを選んで添付"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

// 人材サービス総合サイトの掲載画面（最新版 = いちばん新しいアップロード日の分）を表示する。
// 画像はその場に、PDF は「添付済み」ボタンで別タブに開く
function ListingImages() {
  const [files, setFiles] = useState<SupportOrgFileView[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSupportOrgFiles(SUPPORT_ORG_LISTING_FILE_KIND)
      .then((rows) => {
        if (cancelled) return;
        const newestDay = rows[0]?.created_at.slice(0, 10) ?? "";
        const latest = rows.filter((f) => f.created_at.slice(0, 10) === newestDay).reverse();
        setFiles(latest);
        return Promise.all(
          latest
            .filter((f) => f.mime_type.startsWith("image/"))
            .map(async (f) => {
              const res = await getSupportOrgFilePreviewUrl(f.id);
              return [f.id, res.ok ? res.url : ""] as const;
            }),
        ).then((pairs) => {
          if (!cancelled) setUrls(Object.fromEntries(pairs));
        });
      })
      // 0153 未適用などで読めないときは、この枠だけ出さない
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = async (id: string) => {
    const res = await getSupportOrgFilePreviewUrl(id);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else setError(res.message);
  };

  if (!files) return null;
  return (
    <div className="mt-2 border-t border-border pt-2 text-[11px]">
      <p className="mb-1 font-bold">
        {SUPPORT_ORG_LISTING_FILE_KIND}の掲載画面（最新版）
        {files[0] && <span className="font-normal text-muted">（{files[0].created_at.slice(0, 10)} にアップロード）</span>}
      </p>
      {error && <p className="mb-1 rounded-lg bg-seal/10 px-2 py-1 text-seal">{error}</p>}
      {files.length === 0 ? (
        <p className="text-muted">
          未登録（
          <Link href="/support-org" className="font-bold text-brand hover:underline">
            登録支援機関の画面
          </Link>
          の職業紹介事業者の欄からアップロードできます）
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex flex-col gap-1">
              <AttachedFileButton fileName={f.file_name} onOpen={() => void open(f.id)} className="self-start" />
              {f.mime_type.startsWith("image/") && urls[f.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[f.id]}
                  alt={`${SUPPORT_ORG_LISTING_FILE_KIND} ${f.file_name}`}
                  className="max-h-80 w-auto max-w-full self-start rounded-lg border border-border bg-white object-contain"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
