// 郵送請求の「保存」「判定する」が押せない理由を文章にする（画面に赤字で出す）。
// 以前は押せない理由が分からなかったため、条件をここにまとめて理由ごとに返す。

import type { RecipientType, RequestMethod } from "@/lib/tax-cert";

// 受領方法の入力不足（課税証明書など / 国保税納税証明書で共用）
export function methodBlockers(
  method: RequestMethod,
  mailDate: string,
  recipient: RecipientType,
  agent: string,
  prefix = "",
): string[] {
  const out: string[] = [];
  if (method === "agent_window" && !agent.trim()) {
    out.push(`${prefix}「代理人が窓口で取得」の代理人の氏名・宛先を入力してください`);
  }
  if (method === "mail") {
    if (!mailDate) out.push(`${prefix}郵送請求した日を入力してください`);
    if (recipient === "agent" && !agent.trim()) {
      out.push(`${prefix}「代理人宛に届く」の代理人の氏名・宛先を入力してください`);
    }
  }
  return out;
}

// 課税・納税証明書の「判定する」が押せない理由
export function judgeBlockers(p: {
  hasMunicipalities: boolean;
  newMuniSelected: boolean;
  prevSame: boolean;
  prevMuniSelected: boolean;
  appDate: string;
  hasNhi: boolean;
  nhiMuniSelected: boolean;
}): string[] {
  const out: string[] = [];
  if (!p.hasMunicipalities) {
    out.push("自治体マスタが未登録です。「自治体マスタ」タブで追加してください");
    return out;
  }
  if (!p.newMuniSelected) out.push("最新年度の自治体を選んでください");
  if (!p.prevSame && !p.prevMuniSelected) {
    out.push("前年度の自治体を選んでください（同じなら「最新年度と同じ自治体」にチェック）");
  }
  if (!p.appDate) out.push("申請予定日を入力してください");
  if (p.hasNhi && !p.nhiMuniSelected) out.push("国保税納税証明書の取得先自治体を選んでください");
  return out;
}

// 課税・納税証明書の判定結果の「この結果を記録として保存」が押せない理由
export function taxSaveBlockers(p: {
  canEdit: boolean;
  saved: boolean;
  personName: string;
  method: RequestMethod;
  mailDate: string;
  recipient: RecipientType;
  agent: string;
  hasNhi: boolean;
  nhiSameAsMain: boolean;
  nhiMethod: RequestMethod;
  nhiMailDate: string;
  nhiRecipient: RecipientType;
  nhiAgent: string;
}): string[] {
  const out: string[] = [];
  if (!p.canEdit) {
    out.push("閲覧のみの権限のため保存できません（管理者に権限の変更を依頼してください）");
    return out;
  }
  if (p.saved) {
    out.push("この判定結果はすでに記録済みです。内容を変えて保存し直すには、条件を変えて「判定する」を押してください");
    return out;
  }
  if (!p.personName.trim()) out.push("対象者情報の「外国人の氏名」を選んでください（一覧にいなければ新規登録）");
  out.push(...methodBlockers(p.method, p.mailDate, p.recipient, p.agent, "受領方法："));
  if (p.hasNhi && !p.nhiSameAsMain) {
    out.push(...methodBlockers(p.nhiMethod, p.nhiMailDate, p.nhiRecipient, p.nhiAgent, "国保税納税証明書の受領方法："));
  }
  return out;
}

// 転出届・住民票の「この請求を記録として保存」が押せない理由
export function extraSaveBlockers(p: {
  canEdit: boolean;
  personName: string;
  formError: string | null;
}): string[] {
  const out: string[] = [];
  if (!p.canEdit) {
    out.push("閲覧のみの権限のため保存できません（管理者に権限の変更を依頼してください）");
    return out;
  }
  if (!p.personName.trim()) out.push("対象者情報の「外国人の氏名」を選んでください（一覧にいなければ新規登録）");
  if (p.formError) out.push(p.formError);
  return out;
}

// 納税証明書その3（税務署）の「この請求を記録として保存」が押せない理由
export function nozei3SaveBlockers(p: {
  canEdit: boolean;
  personName: string;
  taxOfficeSelected: boolean;
  hasTaxOffices: boolean;
}): string[] {
  const out: string[] = [];
  if (!p.canEdit) {
    out.push("閲覧のみの権限のため保存できません（管理者に権限の変更を依頼してください）");
    return out;
  }
  if (!p.personName.trim()) out.push("対象者情報の「外国人の氏名」を選んでください（一覧にいなければ新規登録）");
  if (!p.hasTaxOffices) out.push("税務署マスタが未登録です。「税務署マスタ」タブで追加してください");
  else if (!p.taxOfficeSelected) out.push("投函先の税務署を選んでください（住所から自動判定できないときは手で選びます）");
  return out;
}
