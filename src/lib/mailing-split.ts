// 課税・納税証明書の請求の記録から、国民健康保険税の納税証明書の分を別の記録に分ける。
// 国保税だけ受け取り方が違うとき（例: 課税・市県民税は代理人が窓口、国保税は別の市役所へ郵送）や、
// 国保に加入していた自治体が課税証明書の自治体と違うときに、進捗・添付を記録ごとに分けるため。

import type { JudgmentRecord, RecipientType, RequestMethod } from "@/lib/tax-cert";

export interface MethodInfo {
  requestMethod: RequestMethod;
  mailRequestDate: string;
  recipientType: RecipientType;
  agentName: string;
}

// 国保に加入していた自治体のうち、課税証明書・市県民税の納税証明書の自治体と違うものがあるか
export function nhiInOtherMunicipality(r: Pick<JudgmentRecord, "yearRequests" | "nhiYears">): boolean {
  const taxMunis = new Set((r.yearRequests ?? []).map((y) => y.municipalityId || y.municipalityName));
  return (r.nhiYears ?? []).some((n) => !taxMunis.has(n.municipalityId || n.municipalityName));
}

// 国保税の分を分けられる記録か（課税証明書などと国保税の両方を1つの記録で請求しているもの）
export function canSplitNhi(r: JudgmentRecord): boolean {
  return (
    (r.requestKind ?? "tax") === "tax" &&
    r.hasNhi &&
    (r.nhiYears ?? []).length > 0 &&
    (r.yearRequests ?? []).length > 0
  );
}

// 分けたあとの2つの記録。main は国保税を除いたもの（課税証明書・市県民税が無ければ null）、
// nhi は国保税の納税証明書だけの記録（受け取り方は nhiInfo）
export function splitNhiRecord(
  record: JudgmentRecord,
  nhiInfo: MethodInfo,
): { main: JudgmentRecord | null; nhi: JudgmentRecord } {
  const mainDocs = (record.docs ?? []).filter((d) => !d.isNhi);
  const nhiDocs = (record.docs ?? []).filter((d) => d.isNhi);
  const nhiFirst = (record.nhiYears ?? [])[0];
  const main: JudgmentRecord | null =
    mainDocs.length > 0
      ? {
          ...record,
          hasNhi: false,
          nhiYears: [],
          nhiMunicipalityId: "",
          nhiMunicipalityName: "",
          nhiFiscalStartYear: null,
          docs: mainDocs,
          // 定額小為替は国保税の分を除く
          moneyOrders: (record.moneyOrders ?? []).filter((o) => !nhiDocs.some((d) => d.title === o.docTitle)),
        }
      : null;
  const nhi: JudgmentRecord = {
    ...record,
    id: "",
    createdAt: "",
    // 課税証明書・市県民税の納税証明書は無し（国保税の納税証明書のみの記録）
    municipalityId: nhiFirst?.municipalityId ?? record.nhiMunicipalityId ?? "",
    municipalityName: nhiFirst?.municipalityName ?? record.nhiMunicipalityName ?? "",
    yearRequests: [],
    requestBothYears: false,
    prevMunicipalityId: undefined,
    prevMunicipalityName: undefined,
    prevFiscalStartYear: undefined,
    docs: nhiDocs,
    ...nhiInfo,
    nhiRequestMethod: nhiInfo.requestMethod,
    nhiMailRequestDate: nhiInfo.mailRequestDate,
    nhiRecipientType: nhiInfo.recipientType,
    nhiAgentName: nhiInfo.agentName,
    nhiSameAsMain: true,
    mailingProgress: "preparing",
    receivedDate: "",
    trackingNumber: "",
    mailingNote: "",
    // 定額小為替は国保税の分だけ（番号は記録の編集で入れる）
    moneyOrders: (record.moneyOrders ?? []).filter((o) => nhiDocs.some((d) => d.title === o.docTitle)),
  };
  return { main, nhi };
}
