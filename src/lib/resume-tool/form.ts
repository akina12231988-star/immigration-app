// 履歴書ツールの入力内容（画面の状態）と、その日本語への確定。
// 選択式の項目（職種・作業・在留資格・分野）は内部コード（key）で持ち、
// 履歴書に出すときに必ず日本語（ja）へ変換する。

import type { ResumeLang } from "./i18n";
import {
  CURRENT_STATUS,
  JITSU_JOBS,
  OTHER_LABEL,
  RESIDENCE,
  SSW_FIELDS,
  type BilingualOption,
} from "./options";
import { parseCareerDate } from "./dates";

export const OTHER_KEY = "other";

export interface CareerRow {
  id: number;
  from: string; // 入力のまま（2019/04 など）
  to: string;
  company: string;
  fieldKey: string; // 特定技能分野の key
  statKey: string; // 当時の在留資格の key
}

export interface FamilyRow {
  id: number;
  relation: string;
  name: string;
  birthYear: string;
  job: string;
}

export interface ResumeForm {
  kana: string;
  name: string;
  gender: string; // 男性 / 女性
  dob: string;
  nat: string;
  lang: string;
  spouse: string; // 有 / 無
  jtypeKey: string; // 技能実習の職種（key または other）
  jtypeOther: string;
  jworkKey: string;
  jworkOther: string;
  tend: string;
  vexp: string;
  statusKey: string; // 現在の在留資格の key
  adjp: string;
  adhm: string;
  careers: CareerRow[];
  lic: string;
  ht: string;
  wt: string;
  bl: string;
  ill: string;
  vis: string;
  hand: string; // 右 / 左
  hob: string;
  drink: string; // 無 / 時々 / 沢山
  smoke: string;
  families: FamilyRow[];
  photo: string; // data URL
}

let rowSeq = 0;
export function nextRowId(): number {
  rowSeq += 1;
  return rowSeq;
}

export function emptyCareer(): CareerRow {
  return { id: nextRowId(), from: "", to: "", company: "", fieldKey: "", statKey: "" };
}

export function emptyFamily(): FamilyRow {
  return { id: nextRowId(), relation: "", name: "", birthYear: "", job: "" };
}

// 最初の画面は職歴2行・家族3行（ツールと同じ）
export function emptyResumeForm(): ResumeForm {
  return {
    kana: "",
    name: "",
    gender: "",
    dob: "",
    nat: "",
    lang: "",
    spouse: "",
    jtypeKey: "",
    jtypeOther: "",
    jworkKey: "",
    jworkOther: "",
    tend: "",
    vexp: "",
    statusKey: "",
    adjp: "",
    adhm: "",
    careers: [emptyCareer(), emptyCareer()],
    lic: "",
    ht: "",
    wt: "",
    bl: "",
    ill: "",
    vis: "",
    hand: "",
    hob: "",
    drink: "",
    smoke: "",
    families: [emptyFamily(), emptyFamily(), emptyFamily()],
    photo: "",
  };
}

// ---- 選択肢の表示と日本語化 ----

// プルダウンの表示: 日本語なら ja だけ、他言語なら「日本語 ／ 各国語」の併記
export function optionLabel(opt: BilingualOption, lang: ResumeLang): string {
  if (lang === "ja") return opt.ja;
  const local = opt[lang] || opt.en || opt.ja;
  return `${opt.ja} ／ ${local}`;
}

export function otherLabel(lang: ResumeLang): string {
  return lang === "ja" ? OTHER_LABEL.ja : `${OTHER_LABEL.ja} ／ ${OTHER_LABEL[lang] ?? OTHER_LABEL.en}`;
}

export function jaOf(list: BilingualOption[], key: string): string {
  if (!key) return "";
  return list.find((o) => o.key === key)?.ja ?? "";
}

export const residenceJa = (key: string) => jaOf(RESIDENCE, key);
export const currentStatusJa = (key: string) => jaOf(CURRENT_STATUS, key);
export const sswFieldJa = (key: string) => jaOf(SSW_FIELDS, key);

export function jobOf(key: string) {
  return JITSU_JOBS.find((j) => j.key === key) ?? null;
}
export const jobJa = (key: string) => jobOf(key)?.ja ?? "";
export function workOptions(jobKey: string): BilingualOption[] {
  return jobOf(jobKey)?.works ?? [];
}
export function workJa(jobKey: string, workKey: string): string {
  return jaOf(workOptions(jobKey), workKey);
}

// ---- 履歴書に出す形（日本語に確定したデータ） ----

export interface ResumeCareer {
  fy: string;
  fm: string;
  fd: string;
  ty: string;
  tm: string;
  td: string;
  comp: string;
  fieldKey: string;
  fieldJa: string;
  statKey: string;
  statJa: string;
}

export interface ResumeFamily {
  rel: string;
  name: string;
  age: string; // 生まれ年
  job: string;
}

export interface ResumeData {
  kana: string;
  name: string;
  gender: string;
  dob: string;
  nat: string;
  lang: string;
  spouse: string;
  jtype: string; // 日本語（その他は入力のまま）
  jtypeKey: string;
  jwork: string;
  jworkKey: string;
  tend: string;
  vexp: string;
  status: string; // 現在の在留資格（日本語）
  statusKey: string;
  adjp: string;
  adhm: string;
  careers: ResumeCareer[];
  lic: string;
  ht: string;
  wt: string;
  bl: string;
  ill: string;
  vis: string;
  hand: string;
  hob: string;
  drink: string;
  smoke: string;
  families: ResumeFamily[];
  photo: string;
  translateNote: string; // 翻訳できなかったときの注意書き
}

// 画面の入力をまとめ、選択式の項目を日本語に確定する（ツールの collectData と同じ）
export function collectResumeData(f: ResumeForm): ResumeData {
  const careers: ResumeCareer[] = f.careers.map((c) => {
    const fp = parseCareerDate(c.from);
    const tp = parseCareerDate(c.to);
    return {
      fy: fp.y,
      fm: fp.m,
      fd: fp.d,
      ty: tp.y,
      tm: tp.m,
      td: tp.d,
      comp: c.company,
      fieldKey: c.fieldKey,
      fieldJa: sswFieldJa(c.fieldKey),
      statKey: c.statKey,
      statJa: residenceJa(c.statKey),
    };
  });
  const families: ResumeFamily[] = f.families.map((r) => ({
    rel: r.relation,
    name: r.name,
    age: r.birthYear,
    job: r.job,
  }));
  return {
    kana: f.kana,
    name: f.name,
    gender: f.gender,
    dob: f.dob,
    nat: f.nat,
    lang: f.lang,
    spouse: f.spouse,
    jtype: f.jtypeKey === OTHER_KEY ? f.jtypeOther : jobJa(f.jtypeKey),
    jtypeKey: f.jtypeKey,
    jwork: f.jworkKey === OTHER_KEY ? f.jworkOther : workJa(f.jtypeKey, f.jworkKey),
    jworkKey: f.jworkKey,
    tend: f.tend,
    vexp: f.vexp,
    status: currentStatusJa(f.statusKey),
    statusKey: f.statusKey,
    adjp: f.adjp,
    adhm: f.adhm,
    careers,
    lic: f.lic,
    ht: f.ht,
    wt: f.wt,
    bl: f.bl,
    ill: f.ill,
    vis: f.vis,
    hand: f.hand,
    hob: f.hob,
    drink: f.drink,
    smoke: f.smoke,
    families,
    photo: f.photo,
    translateNote: "",
  };
}
