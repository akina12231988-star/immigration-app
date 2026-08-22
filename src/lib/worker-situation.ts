// 「只今の状況」（経過メモ）の選択肢と、その意味（どういう人に付けるか）。
// Notion「ビザの状況」データベースの 只今の状況（select）の選択肢と同じ並び。
// ここに無い状況は自由入力でそのまま保存できる（Notionへ同期すると選択肢が自動で増える）。
// Notion側と文字がずれると選択肢が二重にできるため、直すときは両方をそろえること。
// description が空の選択肢は、意味の説明をまだもらっていないもの。

import type { ApplicationContent } from "@/types/application";

export interface WorkerSituation {
  value: string;
  description: string;
}

export const WORKER_SITUATIONS: WorkerSituation[] = [
  {
    value: "特定活動（特定技能１号以降準備）",
    description: "支援対象の人",
  },
  {
    value: "特定活動（特定技能２号移行準備）",
    description: "支援対象外の人",
  },
  {
    value: "更新",
    description:
      "特定技能１号の更新許可がおりた人（「特定技能１号＜支援委託中＞」の意味も含めて付ける）",
  },
  {
    value: "更新＜５年目＞",
    description:
      "特定技能１号の更新許可を受けたが１年未満で許可がおりた人（もうこれ以上特定技能１号で在籍できない）",
  },
  {
    value: "１号満了終了",
    description: "特定技能１号としての５年を過ぎてしまった人",
  },
  {
    value: "特定技能（認定）の審査中",
    description: "在留資格認定許可申請で審査中の人",
  },
  {
    value: "特定活動の審査中",
    description: "特定活動ビザへの在留資格変更許可申請で審査中の人",
  },
  {
    value: "特定活動更新許可の審査中",
    description: "特定活動ビザの在留期間更新許可申請で審査中の人",
  },
  {
    value: "特定活動（２号以降準備）の審査中",
    description: "本人申請。特定活動ビザへの在留資格変更許可申請で審査中の人",
  },
  {
    value: "特定技能更新許可の審査中",
    description: "特定技能ビザの在留期間更新許可申請で審査中の人",
  },
  { value: "特定技能の審査中", description: "" },
  {
    value: "２号特定技能の審査中",
    description: "本人申請。特定技能２号ビザへの在留資格変更許可申請で審査中の人",
  },
  {
    value: "在留資格認定申請書の準備中",
    description: "申請準備で、在留資格認定申請の準備中の人",
  },
  {
    value: "特定技能申請準備中",
    description: "申請準備で、特定技能１号申請の準備中の人",
  },
  {
    value: "特定技能更新の準備中",
    description: "申請準備で、特定技能１号の更新申請の準備中の人",
  },
  {
    value: "特定活動で申請準備中",
    description: "申請準備で、特定活動（特定技能１号以降）の準備中の人",
  },
  {
    value: "特定活動（特定技能２号移行準備のため）準備中",
    description: "申請準備で、特定活動（特定技能２号以降）の準備中の人",
  },
  {
    value: "特定活動ビザ更新の申請準備",
    description: "申請準備で、特定活動（特定技能１号以降）の更新の準備中の人",
  },
  // 「技人国申請　更新準備中」は今後使わないため選択肢から外した（登録済みの値はそのまま残る）
  {
    value: "特定技能2号申請準備中",
    description: "申請準備で、特定技能２号の準備中の人",
  },
  {
    value: "特定技能1号＜支援委託中＞",
    description: "許可後、在留資格が特定技能１号になった人で支援委託中の人",
  },
  {
    value: "特定技能2号になったので支援終了",
    description: "許可後、在留資格が特定技能２号になった人で支援委託を終了した人",
  },
  {
    value: "特定技能２号（他の登録支援機関）",
    description: "支援委託はしておらず、特定技能２号になっている人",
  },
  {
    value: "特定活動（次の職場にて特定技能へ）",
    description:
      "現在特定活動ビザで、弊社契約外の所属機関で特定技能ビザになる人（ビザ期限が切れても問題ない）",
  },
  {
    value: "日本国査証の発行手続き中",
    description: "在留資格認定で、在留認定証が届いたあと海外で日本国査証の手続き中の人",
  },
  {
    value: "入国管理局からビザの許可おりた電話あり",
    description: "審査中で許可がおりた人",
  },
  {
    value: "特定技能の更新なし",
    description: "特定技能を更新しない人（ビザ期限が切れても大丈夫な人）",
  },
  { value: "申請の取り下げ", description: "申請をキャンセルした人" },
  {
    value: "年金脱退一時金の為、一時的に退職（再入国次第、際雇用契約予定）",
    description:
      "特定技能ビザとしての在歴はそのまま。随時報告書で退職届の提出が必要で、再入国後にはあらためて再雇用の随時報告書の提出が必要な人",
  },
  { value: "支援委託終了", description: "もう支援しない人" },
  { value: "退職", description: "退職した人" },
  {
    value: "キャンセル",
    description: "一度、面接で採用になったが、その後キャンセルになった人",
  },
  // 「❌特定技能に移行しない」「技能習2号ロ」は使わないため選択肢から外した（登録済みの値はそのまま残る）
];

// 入力中・保存済みの値に対する説明。選択肢に無い自由入力は空を返す。
// 「・」で併記されているときは、それぞれの説明をつなげて返す
export function situationDescription(value: string): string {
  const parts = value
    .split("・")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts
    .map((p) => WORKER_SITUATIONS.find((s) => s.value === p)?.description ?? "")
    .filter(Boolean)
    .join("。");
}

// 支援委託中の目印。支援対象かつ在籍中の人からは、自動更新で外さない
export const ENTRUSTED_SITUATION = "特定技能1号＜支援委託中＞";

// 状況を併記するときの区切り（例: 特定技能1号＜支援委託中＞・更新）
export const SITUATION_SEPARATOR = "・";

export function splitSituations(value: string): string[] {
  return value
    .split(SITUATION_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 申請準備・申請登録から只今の状況を入れるときの値を決める。
// 支援対象かつ在籍中で「特定技能1号＜支援委託中＞」が付いている人は、
// 新しい状況に変えるときも外さず「特定技能1号＜支援委託中＞・新しい状況」の形で残す
export function mergeSituation(
  next: string,
  worker: {
    current_situation?: string | null;
    support?: string | null;
    status?: string | null;
  },
): string {
  const keep =
    (worker.current_situation ?? "").includes(ENTRUSTED_SITUATION) &&
    worker.support === "支援対象" &&
    worker.status === "在籍中" &&
    !next.includes(ENTRUSTED_SITUATION);
  return keep ? `${ENTRUSTED_SITUATION}${SITUATION_SEPARATOR}${next}` : next;
}

// 許可がおりたときの只今の状況。
// 特定技能の更新（特定技能更新許可の審査中）の許可なら、その部分を「更新」に変える
// （＜支援委託中＞などの併記は残す。例: 特定技能1号＜支援委託中＞・更新）。
// それ以外の状況のときは変えない（null を返す）
export function situationAfterApproval(current: string): string | null {
  const parts = splitSituations(current);
  if (!parts.includes("特定技能更新許可の審査中")) return null;
  const next: string[] = [];
  for (const p of parts) {
    const v = p === "特定技能更新許可の審査中" ? "更新" : p;
    if (!next.includes(v)) next.push(v);
  }
  return next.join(SITUATION_SEPARATOR);
}

// 只今の状況が未入力のときに自動で表示する内容。
// 現在のビザ（在留資格）に、いちばん新しい申請の「審査中／許可済」の情報を添える。
// 申請登録・許可時の自動更新が入る前から登録している人でも、いまの状態がひと目でわかるようにする
export function autoSituation(
  residenceStatus: string | null | undefined,
  latestApplication?: { status: string; applicationContent?: string | null } | null,
): string {
  const visa = (residenceStatus ?? "").trim();
  let appInfo = "";
  if (latestApplication) {
    const content = (latestApplication.applicationContent ?? "").trim();
    const status = latestApplication.status;
    if (status === "申請済" || status === "LINE報告済" || status === "通知書到着") {
      appInfo = content ? `${content}の審査中` : "審査中";
    } else if (status === "許可済") {
      appInfo = content
        ? `${content}の許可済（在留カード受け取り待ち）`
        : "許可済（在留カード受け取り待ち）";
    }
    // 在留カード受領・取下げ・申請前は添えない（ビザだけを表示する）
  }
  return [visa, appInfo].filter(Boolean).join(SITUATION_SEPARATOR);
}

// 申請準備の対応状況を「準備中」にしたときに選ぶ、準備の内容（7つ）。
// 選んで保存すると、外国人詳細の「只今の状況」にそのまま入る
export const PREP_SITUATIONS: string[] = [
  "在留資格認定申請書の準備中",
  "特定技能申請準備中",
  "特定技能更新の準備中",
  "特定活動で申請準備中",
  "特定活動（特定技能２号移行準備のため）準備中",
  "特定活動ビザ更新の申請準備",
  "特定技能2号申請準備中",
];

// 申請登録の「申請内容」の候補（7つ）。
// 選ぶと、保存する申請内容（従来どおりの3種類のどれか）と、
// 外国人の只今の状況（どの内容で審査中か）が決まる
export interface ApplicationContentChoice {
  label: string; // 画面に出す候補名
  content: ApplicationContent; // 保存する申請内容（従来の3種類）
  situation: string; // 外国人詳細の「只今の状況」に入れる値
  selfApply?: boolean; // 本人申請の候補（選ぶと本人申請にチェックが入る）
}

export const APPLICATION_CONTENT_CHOICES: ApplicationContentChoice[] = [
  {
    label: "在留認定許可申請（特定技能）",
    content: "在留認定許可申請",
    situation: "特定技能（認定）の審査中",
  },
  {
    label: "在留資格の変更許可（特定活動）",
    content: "在留資格の変更許可",
    situation: "特定活動の審査中",
  },
  {
    label: "在留期間の更新許可（特定活動）",
    content: "在留期間の更新許可",
    situation: "特定活動更新許可の審査中",
  },
  {
    label: "在留資格の変更許可（特定活動・２号以降準備）※本人申請",
    content: "在留資格の変更許可",
    situation: "特定活動（２号以降準備）の審査中",
    selfApply: true,
  },
  {
    label: "在留期間の更新許可（特定技能）",
    content: "在留期間の更新許可",
    situation: "特定技能更新許可の審査中",
  },
  {
    label: "在留資格の変更許可（特定技能）",
    content: "在留資格の変更許可",
    situation: "特定技能の審査中",
  },
  {
    label: "在留資格の変更許可（特定技能２号）※本人申請",
    content: "在留資格の変更許可",
    situation: "２号特定技能の審査中",
    selfApply: true,
  },
];
