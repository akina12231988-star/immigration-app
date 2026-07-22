import { describe, expect, it } from "vitest";
import { buildRenewalPlaceholders, isRenewalPlaceholder } from "./renewal-placeholders";
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import type { Application } from "@/types/application";

const TODAY = "2026-07-21";

function makeWorker(over: Partial<WorkerWithOrg>): WorkerWithOrg {
  return {
    id: "w1",
    code: "V-1",
    name: "NGUYEN TEST",
    name_kana: "",
    nationality: "ベトナム",
    birthday: null,
    status: "支援中",
    current_organization_id: "org1",
    residence_card_no: "",
    residence_status: "特定技能1号",
    residence_permit_date: null,
    residence_expiry_date: "2026-09-01",
    passport_no: "",
    passport_expiry_date: null,
    notion_link: "",
    residence_renewal_status: "準備中",
    residence_renewal_todo: "TODO-1",
    application_prep_kind: "",
    leaving_on: null,
    leaving_todo: "",
    gender: "",
    employment_start_on: null,
    assigned_office: "",
    messenger_link: "",
    created_at: "",
    updated_at: "",
    organizations: { name: "テスト機関" },
    ...over,
  } as WorkerWithOrg;
}

function makeApp(over: Partial<Application>): Application {
  return {
    id: "a1",
    workerId: null,
    organizationId: null,
    name: "テスト",
    applicationDate: "2026-07-01",
    applicationNumber: "1",
    applicationContent: "在留期間の更新許可",
    method: "窓口",
    emailLink: "",
    isSelfApply: false,
    reportOrgHonorific: "御中",
    approvalReported: false,
    lineReported: false,
    notionSynced: false,
    approved: false,
    status: "申請済",
    assignee: "担当",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("buildRenewalPlaceholders", () => {
  it("準備中かつ在留更新対象の外国人を「申請前＜準備中＞」の擬似行にする", () => {
    const rows = buildRenewalPlaceholders([makeWorker({})], [], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("申請前");
    expect(rows[0].workerRenewalStatus).toBe("準備中");
    expect(rows[0].workerId).toBe("w1");
    expect(isRenewalPlaceholder(rows[0])).toBe(true);
  });

  it("準備中でない外国人は対象外", () => {
    const rows = buildRenewalPlaceholders(
      [makeWorker({ residence_renewal_status: "" })],
      [],
      TODAY,
    );
    expect(rows).toHaveLength(0);
  });

  it("在留期限が3か月より先の外国人は対象外", () => {
    const rows = buildRenewalPlaceholders(
      [makeWorker({ residence_expiry_date: "2026-12-01" })],
      [],
      TODAY,
    );
    expect(rows).toHaveLength(0);
  });

  it("新規で申請書類準備の人は在留期限に関係なく擬似行になる", () => {
    const rows = buildRenewalPlaceholders(
      [makeWorker({ application_prep_kind: "新規", residence_expiry_date: null })],
      [],
      TODAY,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].workerRenewalStatus).toBe("準備中");
  });

  it("新規で申請書類準備でも退職者は対象外", () => {
    const rows = buildRenewalPlaceholders(
      [makeWorker({ application_prep_kind: "新規", status: "退職" })],
      [],
      TODAY,
    );
    expect(rows).toHaveLength(0);
  });

  it("審査中の申請がある外国人は擬似行を出さない", () => {
    const rows = buildRenewalPlaceholders(
      [makeWorker({})],
      [makeApp({ workerId: "w1", status: "申請済" })],
      TODAY,
    );
    expect(rows).toHaveLength(0);
  });

  it("実レコードの「申請前」がある外国人は擬似行を出さない（二重表示防止）", () => {
    const rows = buildRenewalPlaceholders(
      [makeWorker({})],
      [makeApp({ workerId: "w1", status: "申請前" })],
      TODAY,
    );
    expect(rows).toHaveLength(0);
  });

  it("退職者は対象外", () => {
    const rows = buildRenewalPlaceholders([makeWorker({ status: "退職" })], [], TODAY);
    expect(rows).toHaveLength(0);
  });

  it("在留期限の近い順に並ぶ", () => {
    const rows = buildRenewalPlaceholders(
      [
        makeWorker({ id: "w2", residence_expiry_date: "2026-10-01" }),
        makeWorker({ id: "w1", residence_expiry_date: "2026-08-01" }),
      ],
      [],
      TODAY,
    );
    expect(rows.map((r) => r.workerId)).toEqual(["w1", "w2"]);
  });
});
