// 「只今の状況」（経過メモ）の選択肢と、その意味（どういう人に付けるか）。
// Notion「ビザの状況」データベースの 只今の状況（select）の選択肢と同じ並び。
// ここに無い状況は自由入力でそのまま保存できる（Notionへ同期すると選択肢が自動で増える）。
// Notion側と文字がずれると選択肢が二重にできるため、直すときは両方をそろえること。
// description が空の選択肢は、意味の説明をまだもらっていないもの。

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
  { value: "入国管理局からビザの許可おりた電話あり", description: "" },
  { value: "特定技能の更新なし", description: "" },
  { value: "申請の取り下げ", description: "" },
  { value: "年金脱退一時金の為、一時的に退職（再入国次第、際雇用契約予定）", description: "" },
  { value: "支援委託終了", description: "" },
  { value: "退職", description: "" },
  { value: "キャンセル", description: "" },
  { value: "❌特定技能に移行しない", description: "" },
  { value: "技能習2号ロ", description: "" },
];

// 入力中・保存済みの値に対する説明。選択肢に無い自由入力は空を返す
export function situationDescription(value: string): string {
  const v = value.trim();
  return WORKER_SITUATIONS.find((s) => s.value === v)?.description ?? "";
}
