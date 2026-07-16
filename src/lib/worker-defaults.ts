import type { WorkerInput } from "@/types/db";

// 氏名だけで外国人を新規登録するときの既定値（残りは後から詳細入力）
export function blankWorkerInput(name: string, organizationId: string | null = null): WorkerInput {
  return {
    name: name.trim(),
    kana: "",
    nationality: "",
    birth: null,
    residence_card_no: "",
    field: "",
    support: "支援対象",
    status: "支援中",
    health_note: "",
    family_note: "",
    current_organization_id: organizationId,
    residence_status: "",
    residence_permit_date: null,
    residence_expiry_date: null,
    passport_no: "",
    passport_expiry_date: null,
    notion_link: "",
    residence_renewal_status: "",
    residence_renewal_todo: "",
    photo_path: null,
    messenger_link: "",
    specialty_grade: "",
    other_qualifications: "",
    note: "",
  };
}
