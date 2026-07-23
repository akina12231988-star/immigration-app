import { describe, expect, it } from "vitest";
import { buildNotionTransferText } from "./notion-transfer";
import type { Worker } from "@/types/db";

function worker(over: Partial<Worker>): Worker {
  return {
    id: "w1",
    name: "",
    kana: "",
    nationality: "",
    birth: null,
    residence_card_no: "",
    field: "",
    support: "支援対象",
    status: "支援中",
    health_note: "",
    family_note: "",
    current_organization_id: null,
    residence_status: "",
    residence_permit_date: null,
    residence_expiry_date: null,
    passport_no: "",
    passport_expiry_date: null,
    notion_link: "",
    residence_renewal_status: "",
    residence_renewal_todo: "",
    application_prep_kind: "",
    leaving_on: null,
    leaving_todo: "",
    leaving_kind: "",
    leaving_reason: "",
    leaving_org_name: "",
    leaving_org_address: "",
    gender: "",
    has_spouse: "",
    relatives_in_japan: "",
    relatives: [],
    address: "",
    employment_start_on: null,
    assigned_office: "",
    residence_note: "",
    photo_path: null,
    messenger_link: "",
    specialty_grade: "",
    other_qualifications: "",
    note: "",
    worker_code: null,
    legacy_id: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("buildNotionTransferText", () => {
  it("入力済みの項目を Notion の項目名で整形する", () => {
    const text = buildNotionTransferText(
      worker({
        name: "NGUYEN VAN A",
        kana: "グエン ヴァン アー",
        nationality: "ベトナム",
        birth: "1995-01-01",
        passport_no: "M1234567",
      }),
    );
    expect(text).toBe(
      [
        "外国人の名前：NGUYEN VAN A",
        "フリガナ：グエン ヴァン アー",
        "国籍：ベトナム",
        "生年月日：1995-01-01",
        "旅券番号：M1234567",
      ].join("\n"),
    );
  });

  it("空欄の項目は出力しない", () => {
    expect(buildNotionTransferText(worker({ name: "田中" }))).toBe("外国人の名前：田中");
  });

  it("値が無ければ空文字を返す", () => {
    expect(buildNotionTransferText(worker({}))).toBe("");
  });
});
