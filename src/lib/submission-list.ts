// 「特定技能1号」に係る提出書類一覧表（在留資格変更許可申請用。令和8年10月9日改定）。
// 申請準備の詳細で、入管の一覧表と同じ番号・順番で書類を並べ、提出確認欄の「有」「無」を選ぶ。
// 選んだものは application_prep_checklists.submission_marks（0226）に残し、○を付けた一覧表を A4 で印刷できる。
//
// 入れている表
//   第1表          … 申請人に関する必要書類（1〜20）
//   第3表の13の1   … 農業分野に関する必要な書類（直接雇用。1〜4）。所属機関か外国人の分野が農業のときだけ
// 第2表（所属機関に関する必要書類）・農業の派遣（13の2・13の3）はまだ入れていない。

export type SubmitMark = "有" | "無";
// 1号: 第1表・第3表の13の1（農業・直接雇用）／2号: 第1表・第3表の8の1（農業・直接雇用）
export type SubmissionTable = "1" | "3agri" | "2-1" | "2-3agri";

// 画面・印刷に並べる表の順
export const SUBMISSION_TABLE_ORDER: readonly SubmissionTable[] = ["1", "3agri", "2-1", "2-3agri"];

export interface SubmissionItem {
  key: string; // 保存のキー（例: t1-4-1 / t3a-1-1）
  table: SubmissionTable;
  no: string; // 番号（1〜20）
  sub?: string; // 枝番の表示（(1) / ① など）
  group?: string; // まとまりの見出し（第3表の1「①又は②のいずれか」など）
  label: string; // 必要書類
  formNo: string; // 様式番号又は発行機関
  required: "○" | "△"; // 提出の要否
  note: string; // 留意事項（短くしたもの）
  pastInfo?: boolean; // 「過去に提出した申請情報」を書ける書類（△で省略できる）
}

export const SUBMISSION_TABLE_TITLES: Record<SubmissionTable, string> = {
  "1": "第1表 申請人に関する必要書類",
  "3agri": "第3表の13の1 農業分野に関する必要な書類（直接雇用）",
  "2-1": "第1表 申請人に関する必要書類（特定技能2号）",
  "2-3agri": "第3表の8の1 農業分野に関する必要な書類（特定技能2号・直接雇用）",
};

const SAME_YEAR = "同一年度内に特定技能外国人を既に受け入れている機関、又は一定の実績があり適正な受入れが見込まれる機関は省略可";
const PAST_1Y = "過去1年以内の申請人の在留諸申請で提出済み（いまも内容に変更がないもの）なら省略可";
const PAST_AGRI = "申請人に係る過去の在留諸申請で提出済み（いまも内容に変更がなく、有効期限内のもの）なら省略可";

export const SUBMISSION_ITEMS: SubmissionItem[] = [
  // ---- 第1表 ----
  { key: "t1-1", table: "1", no: "1", label: "申請人名簿", formNo: "―", required: "△", note: "複数の外国人を同一の機関で受け入れ、同時に申請する場合は必要" },
  { key: "t1-2", table: "1", no: "2", label: "「特定技能1号」に係る提出書類一覧表（在留資格変更許可申請用）", formNo: "―", required: "○", note: "第1表（表紙を含む）・第2表の1〜3のいずれか・第3表の1〜18のいずれか" },
  { key: "t1-3", table: "1", no: "3", label: "在留資格変更許可申請書", formNo: "別記第30号様式", required: "○", note: "申請前6か月以内に撮影した写真（縦4cm×横3cm・裏面に氏名）の貼付が必要" },
  { key: "t1-4-1", table: "1", no: "4", sub: "(1)", label: "特定技能外国人の報酬に関する説明書", formNo: "参考様式第1-4号", required: "△", note: SAME_YEAR },
  { key: "t1-4-2", table: "1", no: "4", sub: "(2)", label: "賃金規程の写し", formNo: "―", required: "△", note: `賃金規程に基づき報酬を決定した場合は必要。${SAME_YEAR}` },
  { key: "t1-5", table: "1", no: "5", label: "特定技能雇用契約書の写し", formNo: "参考様式第1-5号", required: "○", note: "申請人の署名と、申請人が十分に理解できる言語での記載が必要" },
  { key: "t1-6-1", table: "1", no: "6", sub: "(1)", label: "雇用条件書の写し", formNo: "参考様式第1-6号", required: "○", note: "申請人の署名と、申請人が十分に理解できる言語での記載が必要" },
  { key: "t1-6-2", table: "1", no: "6", sub: "(2)", label: "賃金の支払の写し", formNo: "参考様式第1-6号別紙", required: "○", note: "申請人が十分に理解できる言語での記載が必要" },
  { key: "t1-6-3", table: "1", no: "6", sub: "(3)", label: "申請人が十分に理解できる言語が併記された年間カレンダーの写し", formNo: "―", required: "△", note: "1年単位の変形労働時間制を採用している場合は必要" },
  { key: "t1-6-4", table: "1", no: "6", sub: "(4)", label: "1年単位の変形労働時間制に関する協定書の写し", formNo: "―", required: "△", note: "1年単位の変形労働時間制を採用している場合は必要" },
  { key: "t1-7-1", table: "1", no: "7", sub: "(1)", label: "雇用の経緯に係る説明書", formNo: "参考様式第1-16号", required: "△", note: `${SAME_YEAR}。申請人の署名と、申請人が十分に理解できる言語での記載が必要` },
  { key: "t1-7-2", table: "1", no: "7", sub: "(2)", label: "職業紹介事業者に関する「人材サービス総合サイト」の画面を印刷したもの", formNo: "―", required: "△", note: `雇用契約の成立をあっせんする者がいる場合は必要。${SAME_YEAR}` },
  { key: "t1-8-1", table: "1", no: "8", sub: "(1)", label: "健康診断個人票", formNo: "参考様式第1-3号", required: "○", note: "参考様式の検診項目を全て網羅しているもの。外国語のものは日本語訳も必要" },
  { key: "t1-8-2", table: "1", no: "8", sub: "(2)", label: "受診者の申告書", formNo: "参考様式第1-3号別紙", required: "○", note: "健康診断受診後に作成" },
  { key: "t1-9", table: "1", no: "9", label: "直近1年度分の申請人の個人住民税の納税証明書", formNo: "市区町村", required: "△", note: PAST_1Y, pastInfo: true },
  { key: "t1-10", table: "1", no: "10", label: "納税証明書の賦課年度と同一年度の申請人の個人住民税の課税証明書", formNo: "市区町村", required: "△", note: PAST_1Y, pastInfo: true },
  { key: "t1-11", table: "1", no: "11", label: "課税証明書と同一年の申請人の給与所得の源泉徴収票の写し", formNo: "―", required: "△", note: `${PAST_1Y}。源泉徴収票が複数で年末調整をしていない場合は、確定申告の上、納税証明書（その3）も必要`, pastInfo: true },
  { key: "t1-12", table: "1", no: "12", label: "医療保険の資格情報（マイナポータル）の写し又は資格確認書の写し", formNo: "―", required: "△", note: `申請時点で国民健康保険の被保険者である場合は必要。${PAST_1Y}。保険者番号・記号・番号はマスキング`, pastInfo: true },
  { key: "t1-13", table: "1", no: "13", label: "直近1年度分の申請人の国民健康保険料（税）納付証明書", formNo: "市区町村", required: "△", note: `申請時点で国民健康保険の被保険者である場合は必要。${PAST_1Y}`, pastInfo: true },
  { key: "t1-14", table: "1", no: "14", label: "申請人の被保険者記録照会回答票", formNo: "日本年金機構又は年金事務所", required: "△", note: `申請時点で国民年金の被保険者である場合は必要。24か月分の領収証書を出す場合は省略可。${PAST_1Y}。基礎年金番号はマスキング`, pastInfo: true },
  { key: "t1-15", table: "1", no: "15", label: "被保険者記録照会（納付Ⅱ）又は申請日の属する月の前々月までの24か月分の国民年金保険料領収証書の写し", formNo: "日本年金機構又は年金事務所", required: "△", note: `申請時点で国民年金の被保険者である場合は必要。${PAST_1Y}。基礎年金番号はマスキング`, pastInfo: true },
  { key: "t1-16", table: "1", no: "16", label: "前回申請時に履行すべきであった公的義務に係る書類", formNo: "―", required: "△", note: "前回申請時に公的義務を履行できないとして、項番17の書類を出して履行を誓約した場合は必要" },
  { key: "t1-17", table: "1", no: "17", label: "公的義務履行に関する誓約書", formNo: "参考様式第1-26号", required: "△", note: "項番9・11・13・15のいずれかに滞納がある場合は必要" },
  { key: "t1-18", table: "1", no: "18", label: "1号特定技能外国人支援計画書", formNo: "参考様式第1-17号", required: "○", note: "申請人の署名と、申請人が十分に理解できる言語での記載が必要" },
  { key: "t1-19", table: "1", no: "19", label: "登録支援機関との支援委託契約に関する説明書", formNo: "参考様式第1-25号", required: "△", note: "支援計画の実施の全部を登録支援機関に委託する場合は必要" },
  { key: "t1-20", table: "1", no: "20", label: "二国間取決めにおいて定められた遵守すべき手続に係る書類", formNo: "―", required: "△", note: "対象の国籍は、カンボジア・タイ・ベトナム（令和8年10月現在）" },

  // ---- 第3表の13の1（農業・直接雇用） ----
  {
    key: "t3a-1-1",
    table: "3agri",
    no: "1",
    group: "①又は②のいずれか該当する書類が必要",
    sub: "①",
    label: "申請人が技能実習2号良好修了者（2年10か月以上）の場合: 農業技能評価試験（専門級）の実技試験の合格証明書の写し、又は技能実習生に関する評価調書",
    formNo: "参考様式第1-2号（評価調書のみ）",
    required: "△",
    note: `試験免除の対象となる職種・作業は運用要領の別表を参照。${PAST_AGRI}`,
    pastInfo: true,
  },
  {
    key: "t3a-1-2",
    table: "3agri",
    no: "1",
    group: "①又は②のいずれか該当する書類が必要",
    sub: "②",
    label: "申請人が①に該当しない場合: 1号農業技能測定試験の合格証明書の写し",
    formNo: "―",
    required: "△",
    note: `対象となる業務区分は運用要領の別表を参照。${PAST_AGRI}`,
    pastInfo: true,
  },
  {
    key: "t3a-1-3",
    table: "3agri",
    no: "1",
    group: "①又は②のいずれか該当する書類が必要",
    sub: "②",
    label: "申請人が①に該当しない場合: 日本語能力試験（N4以上）の合格証明書の写し、又は国際交流基金日本語基礎テストの判定結果通知書の写し",
    formNo: "―",
    required: "△",
    note: `職種・作業にかかわらず技能実習2号良好修了者は省略可（技能実習2号良好修了を証明する書類が必要）。${PAST_AGRI}`,
    pastInfo: true,
  },
  { key: "t3a-2", table: "3agri", no: "2", label: "農業分野において直接雇用形態で特定技能外国人の受入れを行う特定技能所属機関に係る誓約書", formNo: "分野参考様式第11-1号", required: "○", note: "" },
  { key: "t3a-3", table: "3agri", no: "3", label: "協議会の構成員であることの証明書（特定技能所属機関）", formNo: "協議会", required: "○", note: "" },
  { key: "t3a-4", table: "3agri", no: "4", label: "登録支援機関誓約書", formNo: "分野参考様式第11-4号", required: "△", note: "登録支援機関に、1号特定技能外国人支援計画の実施の全部を委託する場合は必要" },

  // ---- 特定技能2号（在留資格変更許可申請用。令和8年8月20日改定）第1表 ----
  { key: "s2-1", table: "2-1", no: "1", label: "申請人名簿", formNo: "―", required: "△", note: "複数の外国人を同一の機関で受け入れ、同時に申請する場合は必要" },
  { key: "s2-2", table: "2-1", no: "2", label: "「特定技能2号」に係る提出書類一覧表（在留資格変更許可申請用）", formNo: "―", required: "○", note: "第1表（表紙を含む）・第2表の1〜3のいずれか・第3表の1〜11のいずれか" },
  { key: "s2-3", table: "2-1", no: "3", label: "在留資格変更許可申請書", formNo: "別記第30号様式", required: "○", note: "申請前6か月以内に撮影した写真（縦4cm×横3cm・裏面に氏名）の貼付が必要" },
  { key: "s2-4-1", table: "2-1", no: "4", sub: "(1)", label: "特定技能外国人の報酬に関する説明書", formNo: "参考様式第1-4号", required: "△", note: SAME_YEAR },
  { key: "s2-4-2", table: "2-1", no: "4", sub: "(2)", label: "賃金規程の写し", formNo: "―", required: "△", note: `賃金規程に基づき報酬を決定した場合は必要。${SAME_YEAR}` },
  { key: "s2-5", table: "2-1", no: "5", label: "特定技能雇用契約書の写し", formNo: "参考様式第1-5号", required: "○", note: "申請人の署名と、申請人が十分に理解できる言語での記載が必要" },
  { key: "s2-6-1", table: "2-1", no: "6", sub: "(1)", label: "雇用条件書の写し", formNo: "参考様式第1-6号", required: "○", note: "申請人の署名と、申請人が十分に理解できる言語での記載が必要" },
  { key: "s2-6-2", table: "2-1", no: "6", sub: "(2)", label: "賃金の支払の写し", formNo: "参考様式第1-6号別紙", required: "○", note: "申請人が十分に理解できる言語での記載が必要" },
  { key: "s2-6-3", table: "2-1", no: "6", sub: "(3)", label: "申請人が十分に理解できる言語が併記された年間カレンダーの写し", formNo: "―", required: "△", note: "1年単位の変形労働時間制を採用している場合は必要" },
  { key: "s2-6-4", table: "2-1", no: "6", sub: "(4)", label: "1年単位の変形労働時間制に関する協定書の写し", formNo: "―", required: "△", note: "1年単位の変形労働時間制を採用している場合は必要" },
  { key: "s2-7-1", table: "2-1", no: "7", sub: "(1)", label: "雇用の経緯に係る説明書", formNo: "参考様式第1-16号", required: "△", note: `${SAME_YEAR}。申請人の署名と、申請人が十分に理解できる言語での記載が必要` },
  { key: "s2-7-2", table: "2-1", no: "7", sub: "(2)", label: "職業紹介事業者に関する「人材サービス総合サイト」の画面を印刷したもの", formNo: "―", required: "△", note: `雇用契約の成立をあっせんする者がいる場合は必要。${SAME_YEAR}` },
  { key: "s2-8", table: "2-1", no: "8", label: "2号特定技能外国人の業務内容に関する誓約書", formNo: "参考様式第1-32号", required: "○", note: "申請人の署名と、申請人が十分に理解できる言語での記載が必要" },
  { key: "s2-9-1", table: "2-1", no: "9", sub: "(1)", label: "健康診断個人票", formNo: "参考様式第1-3号", required: "○", note: "参考様式の検診項目を全て網羅しているもの。外国語のものは日本語訳も必要" },
  { key: "s2-9-2", table: "2-1", no: "9", sub: "(2)", label: "受診者の申告書", formNo: "参考様式第1-3号別紙", required: "○", note: "健康診断受診後に作成" },
  { key: "s2-10", table: "2-1", no: "10", label: "直近1年度分の申請人の個人住民税の納税証明書", formNo: "市区町村", required: "△", note: PAST_1Y, pastInfo: true },
  { key: "s2-11", table: "2-1", no: "11", label: "納税証明書の賦課年度と同一年度の申請人の個人住民税の課税証明書", formNo: "市区町村", required: "△", note: PAST_1Y, pastInfo: true },
  { key: "s2-12", table: "2-1", no: "12", label: "課税証明書と同一年の申請人の給与所得の源泉徴収票の写し", formNo: "―", required: "△", note: `${PAST_1Y}。源泉徴収票が複数で年末調整をしていない場合は、確定申告の上、納税証明書（その3）も必要`, pastInfo: true },
  { key: "s2-13", table: "2-1", no: "13", label: "医療保険の資格情報（マイナポータル）の写し又は資格確認書の写し", formNo: "―", required: "△", note: `申請時点で国民健康保険の被保険者である場合は必要。${PAST_1Y}。保険者番号・記号・番号はマスキング`, pastInfo: true },
  { key: "s2-14", table: "2-1", no: "14", label: "直近1年度分の申請人の国民健康保険料（税）納付証明書", formNo: "市区町村", required: "△", note: `申請時点で国民健康保険の被保険者である場合は必要。${PAST_1Y}`, pastInfo: true },
  { key: "s2-15", table: "2-1", no: "15", label: "申請人の被保険者記録照会回答票", formNo: "日本年金機構又は年金事務所", required: "△", note: `申請時点で国民年金の被保険者である場合は必要。24か月分の領収証書を出す場合は省略可。${PAST_1Y}。基礎年金番号はマスキング`, pastInfo: true },
  { key: "s2-16", table: "2-1", no: "16", label: "被保険者記録照会（納付Ⅱ）又は申請日の属する月の前々月までの24か月分の国民年金保険料領収証書の写し", formNo: "日本年金機構又は年金事務所", required: "△", note: `申請時点で国民年金の被保険者である場合は必要。${PAST_1Y}。基礎年金番号はマスキング`, pastInfo: true },
  { key: "s2-17", table: "2-1", no: "17", label: "前回申請時に履行すべきであった公的義務に係る書類", formNo: "―", required: "△", note: "前回申請時に公的義務を履行できないとして、項番18の書類を出して履行を誓約した場合は必要" },
  { key: "s2-18", table: "2-1", no: "18", label: "公的義務履行に関する誓約書", formNo: "参考様式第1-26号", required: "△", note: "項番10・12・14・16のいずれかに滞納がある場合は必要" },
  { key: "s2-19", table: "2-1", no: "19", label: "技能移転に係る申告書", formNo: "参考様式第1-10号", required: "△", note: "過去に申請人が技能実習の活動に従事していた場合は必要。申請人の署名と、申請人が十分に理解できる言語での記載が必要" },
  { key: "s2-20", table: "2-1", no: "20", label: "二国間取決において定められた遵守すべき手続に係る書類", formNo: "―", required: "△", note: "対象の国籍は、カンボジア・ベトナム（令和8年8月現在）" },

  // ---- 特定技能2号 第3表の8の1（農業・直接雇用） ----
  { key: "s2a-1", table: "2-3agri", no: "1", label: "2号農業技能測定試験の合格証明書の写し", formNo: "―", required: "△", note: `対象となる業務区分は運用要領の別表を参照。${PAST_AGRI}`, pastInfo: true },
  { key: "s2a-2", table: "2-3agri", no: "2", label: "農業分野において直接雇用形態で特定技能外国人の受入れを行う特定技能所属機関に係る誓約書", formNo: "分野参考様式第11-1号", required: "○", note: "" },
  { key: "s2a-3", table: "2-3agri", no: "3", label: "協議会の構成員であることの証明書（特定技能所属機関）", formNo: "協議会", required: "○", note: "" },
];

// 2号の書類のうち、1号と同じ書類（見当の付け方・揃え方・参考様式のひな形を1号と同じにする）
export const SSW2_SAME_AS_SSW1: Record<string, string> = {
  "s2-1": "t1-1",
  "s2-2": "t1-2",
  "s2-3": "t1-3",
  "s2-4-1": "t1-4-1",
  "s2-4-2": "t1-4-2",
  "s2-5": "t1-5",
  "s2-6-1": "t1-6-1",
  "s2-6-2": "t1-6-2",
  "s2-6-3": "t1-6-3",
  "s2-6-4": "t1-6-4",
  "s2-7-1": "t1-7-1",
  "s2-7-2": "t1-7-2",
  "s2-9-1": "t1-8-1",
  "s2-9-2": "t1-8-2",
  "s2-10": "t1-9",
  "s2-11": "t1-10",
  "s2-12": "t1-11",
  "s2-13": "t1-12",
  "s2-14": "t1-13",
  "s2-15": "t1-14",
  "s2-16": "t1-15",
  "s2-17": "t1-16",
  "s2-18": "t1-17",
  "s2a-2": "t3a-2",
  "s2a-3": "t3a-3",
};

// 1号と同じ書類なら1号のキー（参考様式のひな形・揃え方はこのキーで引く）
export function canonicalSubmissionKey(key: string): string {
  return SSW2_SAME_AS_SSW1[key] ?? key;
}

// 二国間取決めの手続が必要な国籍（第1表 20）。2号の一覧表（令和8年8月現在）ではカンボジア・ベトナム
export const BILATERAL_NATIONALITIES = ["カンボジア", "タイ", "ベトナム"];
export const BILATERAL_NATIONALITIES_SSW2 = ["カンボジア", "ベトナム"];

// 有／無の見当を付けるのに使う、申請準備の情報
export interface SubmissionContext {
  jointKind: string; // '' / 単独 / 連名
  hasKokuho: boolean;
  hasNenkin: boolean;
  flexYear: boolean | null; // 1年単位の変形労働時間制か（所属機関の情報が無ければ null）
  assen: string; // '' / あり / なし
  nationality: string;
  certPattern: string; // 合格証の組み合わせ（申請準備の cert_pattern）
}

// 書類ごとの有／無の見当（分からないものは null ＝ 選んでもらう）
export function suggestSubmissionMark(key: string, c: SubmissionContext): SubmitMark | null {
  const yesNo = (b: boolean): SubmitMark => (b ? "有" : "無");
  // 2号だけの書類
  switch (key) {
    case "s2-8": // 2号の業務内容に関する誓約書（○）
    case "s2a-1": // 2号農業技能測定試験の合格証明書
      return "有";
    case "s2-19": // 技能移転に係る申告書（技能実習をしていたか）は選んでもらう
      return null;
    case "s2-20":
      return yesNo(BILATERAL_NATIONALITIES_SSW2.some((n) => c.nationality.includes(n)));
  }
  if (SSW2_SAME_AS_SSW1[key]) return suggestSubmissionMark(SSW2_SAME_AS_SSW1[key], c);
  switch (key) {
    case "t1-1":
      return yesNo(c.jointKind === "連名");
    case "t1-2":
    case "t1-3":
    case "t1-5":
    case "t1-6-1":
    case "t1-6-2":
    case "t1-8-1":
    case "t1-8-2":
    case "t1-9":
    case "t1-10":
    case "t1-11":
    case "t1-18":
    case "t1-19":
    case "t3a-2":
    case "t3a-3":
    case "t3a-4":
      return "有";
    case "t1-6-3":
    case "t1-6-4":
      return c.flexYear == null ? null : yesNo(c.flexYear);
    case "t1-7-2":
      return c.assen === "あり" ? "有" : c.assen === "なし" ? "無" : null;
    case "t1-12":
    case "t1-13":
      return yesNo(c.hasKokuho);
    case "t1-14":
    case "t1-15":
      return yesNo(c.hasNenkin);
    case "t1-16":
    case "t1-17":
      return "無";
    case "t1-20":
      return yesNo(BILATERAL_NATIONALITIES.some((n) => c.nationality.includes(n)));
    case "t3a-1-1":
    case "t3a-1-2":
    case "t3a-1-3":
      return suggestAgriSkill(key, c.certPattern);
    default:
      // 4・7(1)（同一年度内に受け入れているか）などは選んでもらう
      return null;
  }
}

// 第3表の1（技能・日本語）。合格証の組み合わせから見当を付ける
function suggestAgriSkill(key: string, certPattern: string): SubmitMark | null {
  const table: Record<string, [SubmitMark, SubmitMark, SubmitMark]> = {
    専門級: ["有", "無", "無"],
    技能評価調書: ["有", "無", "無"],
    // 別分野の専門級（技能実習2号良好修了）→ 農業の測定試験。日本語は省略可
    "別分野・専門級": ["無", "有", "無"],
    "専門外・日本語": ["無", "有", "有"],
    "専門外・技能評価調書": ["無", "有", "無"],
  };
  const row = table[certPattern];
  if (!row) return null;
  return row[key === "t3a-1-1" ? 0 : key === "t3a-1-2" ? 1 : 2];
}

// 画面・印刷に出す行（保存した選択があればそれ、無ければ見当）
export interface SubmissionRow extends SubmissionItem {
  mark: SubmitMark | null;
  auto: boolean; // 見当のまま（まだ選んでいない）
}

// ssw2 = 特定技能2号の一覧表（第1表・第3表の8の1）。agri = 農業の第3表も出す
export function buildSubmissionRows(
  marks: Record<string, SubmitMark>,
  ctx: SubmissionContext,
  opts: { agri: boolean; ssw2?: boolean },
): SubmissionRow[] {
  const tables: SubmissionTable[] = opts.ssw2 ? ["2-1", ...(opts.agri ? (["2-3agri"] as const) : [])] : ["1", ...(opts.agri ? (["3agri"] as const) : [])];
  return SUBMISSION_ITEMS.filter((i) => tables.includes(i.table)).map((i) => {
    const saved = marks[i.key];
    if (saved) return { ...i, mark: saved, auto: false };
    return { ...i, mark: suggestSubmissionMark(i.key, ctx), auto: true };
  });
}

// ---- 過去に提出した申請情報（0234） ----
// 過去1年以内の申請で出した書類（pastInfo の行）を省略するとき、入管の様式の
// 「過去に提出した申請情報」の欄に書く申請年月日（YYYY-MM-DD）と受付番号
export interface SubmissionPast {
  on: string;
  no: string;
}
export function normalizeSubmissionPast(v: unknown): Record<string, SubmissionPast> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, SubmissionPast> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const o = (x ?? {}) as Record<string, unknown>;
    if (!x || typeof x !== "object") continue;
    const on = typeof o.on === "string" ? o.on.trim() : "";
    const no = typeof o.no === "string" ? o.no.trim() : "";
    // 日付・番号がまだ空でも「転用する」として残す
    out[k] = { on, no };
  }
  return out;
}
// 1年を過ぎても申請番号で転用できる書類（分野参考様式第11-4号 登録支援機関誓約書）。
// 転用できるのは更新申請のときだけで、前回の申請と同じ所属機関の申請に限る（候補は同じ所属機関の申請だけ）。
// 様式の「過去に提出した申請情報」の欄は斜線なので一覧表には書かず、転用した申請を控えておく
export const ANYTIME_TRANSFER_KEYS = new Set(["t3a-4"]);
export function canTransferRow(row: Pick<SubmissionItem, "key" | "pastInfo">, opts: { renewal?: boolean } = {}): boolean {
  if (row.pastInfo) return true;
  return !!opts.renewal && ANYTIME_TRANSFER_KEYS.has(canonicalSubmissionKey(row.key));
}

// 様式に書く申請年月日（2026年5月1日）
export function submissionPastDateText(on: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(on.trim());
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : on.trim();
}

// 保存してある選択（jsonb）を読む。有／無以外は捨てる
export function normalizeSubmissionMarks(v: unknown): Record<string, SubmitMark> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, SubmitMark> = {};
  for (const [k, m] of Object.entries(v as Record<string, unknown>)) {
    if (m === "有" || m === "無") out[k] = m;
  }
  return out;
}

// ---- 「有」の書類を揃える（②） ----
// 書類ごとに、アプリのどこで揃えるか。
//   docs    … 「必要な書類の準備」の書類（PREP_DOC_DEFS の id）。添付はそちらで行い、ここには状態を出す
//   section … アプリの中で作る・確かめる章（申請準備の詳細のページ内リンク）
// docs が無い書類（と extraAttach の書類）は、この一覧の行に直接添付できる（保存キーは submissionAttachKey）
export interface SubmissionLink {
  docs?: string[];
  section?: { anchor: string; label: string };
  extraAttach?: boolean; // docs があっても、この行にも添付できる
}

export const SUBMISSION_LINKS: Record<string, SubmissionLink> = {
  // この一覧表そのもの（上の「○を付けた一覧表を印刷」で出す。添付はしない）
  "t1-2": { docs: [] },
  "t1-3": { section: { anchor: "prep-copy", label: "申請書に貼る情報" } },
  // 雇用契約書の写し: 一本化の画面では「署名・賃金」の章を出さないので、この行に添付する（外国人詳細で保管している分を使う）
  "t1-5": {},
  "t1-6-1": { section: { anchor: "hire-check", label: "採用条件の確認・賃金" } },
  "t1-6-2": { section: { anchor: "hire-check", label: "賃金（1-6号別紙）" } },
  "t1-7-2": { section: { anchor: "prep-assen", label: "あっせん" } },
  "t1-8-1": { docs: ["kenshin"] },
  "t1-9": { docs: ["nozei_shiken"] },
  "t1-10": { docs: ["kazei"] },
  "t1-11": { docs: ["gensen"] },
  "t1-12": { docs: ["hokensho"] },
  "t1-13": { docs: ["nozei_kokuho"] },
  "t1-14": { docs: ["nenkin"] },
  "t1-15": { docs: ["nenkin"], extraAttach: true },
  "t1-18": { section: { anchor: "prep-plan", label: "1-17号 支援計画書" } },
  "t1-19": { section: { anchor: "prep-dates", label: "支援計画書の日付（1-25号）" } },
  "t1-20": { docs: ["suisenjo"], extraAttach: true },
  "t3a-1-1": { docs: ["cert_senmonkyu", "hyoka_chosho"] },
  "t3a-1-2": { docs: ["cert_senmongai"] },
  "t3a-1-3": { docs: ["cert_nihongo"] },
  "t3a-3": { section: { anchor: "prep-farm", label: "農業 加入通知書" } },
  // 2号だけの書類（1号と同じ書類は SSW2_SAME_AS_SSW1 で1号の揃え方を使う）
  "s2a-1": { docs: ["cert_ssw2"] },
  "s2-20": { docs: ["suisenjo"], extraAttach: true },
};

// 書類の揃え方（2号の書類は1号の同じ書類の揃え方。2号だけの書類はその書類の分）
export function submissionLink(key: string): SubmissionLink | undefined {
  return SUBMISSION_LINKS[key] ?? SUBMISSION_LINKS[canonicalSubmissionKey(key)];
}

// この行に直接添付できるか
export function canAttachToSubmissionRow(key: string): boolean {
  const link = submissionLink(key);
  return !link?.docs || !!link.extraAttach;
}

// この行に直接添付したファイルの保存キー（onboarding_documents.doc_key。prep_ で始める）
export function submissionAttachKey(key: string): string {
  return `prep_sl_${key.replace(/-/g, "_")}`;
}

// まとめる PDF に入れる順番（「有」の書類だけ、一覧表の順）。
// 「必要な書類」の書類は その id、この行に添付したファイルは sl:キー。同じ書類は最初の1回だけ
// reasonRowKeys は理由書を作った行（「無」の行でも、その行の位置に reason:キー で入れる）
export function submissionBundleOrder(
  rows: SubmissionRow[],
  reasonRowKeys: ReadonlySet<string> = new Set(),
): { id: string; label: string; rowLabel: string }[] {
  const out: { id: string; label: string; rowLabel: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const rowLabel = `${SUBMISSION_TABLE_SHORT[r.table]}${r.no}${r.sub ?? ""}`;
    const push = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, label: r.label, rowLabel });
    };
    if (r.mark === "有") {
      for (const d of submissionLink(r.key)?.docs ?? []) push(d);
      if (canAttachToSubmissionRow(r.key)) push(`sl:${r.key}`);
    }
    // 理由書は、その行の書類のすぐ後
    if (reasonRowKeys.has(r.key)) push(`reason:${r.key}`);
  }
  return out;
}

const SUBMISSION_TABLE_SHORT: Record<SubmissionTable, string> = { "1": "", "3agri": "第3表 ", "2-1": "", "2-3agri": "第3表 " };

// 一覧表の名前（1号／2号）
export function submissionListTitle(rows: Pick<SubmissionRow, "table">[]): { kind: "1号" | "2号"; title: string } {
  const ssw2 = rows.some((r) => r.table === "2-1" || r.table === "2-3agri");
  return ssw2
    ? { kind: "2号", title: "「特定技能２号」に係る提出書類一覧表" }
    : { kind: "1号", title: "「特定技能１号」に係る提出書類一覧表" };
}

// ---- 一覧表の印刷（A4縦） ----

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function submissionListPrintHtml(input: {
  workerName: string;
  orgName: string;
  rows: SubmissionRow[];
}): string {
  const mark = (row: SubmissionRow, m: SubmitMark) =>
    `<span class="${row.mark === m ? "mk on" : "mk"}">${m}</span>`;
  const tables = SUBMISSION_TABLE_ORDER
    .map((t) => {
      const rows = input.rows.filter((r) => r.table === t);
      if (rows.length === 0) return "";
      const body = rows
        .map(
          (r) => `<tr>
  <td class="c">${esc(r.no)}</td>
  <td>${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ""}${esc(r.label)}</td>
  <td class="c small">${esc(r.formNo)}</td>
  <td class="c">${r.required}</td>
  <td class="c nowrap">${mark(r, "有")}${mark(r, "無")}</td>
</tr>`,
        )
        .join("\n");
      return `<h2>${esc(SUBMISSION_TABLE_TITLES[t])}</h2>
<table>
<thead><tr><th class="w-no">番号</th><th>必要書類</th><th class="w-form">様式番号又は発行機関</th><th class="w-req">提出の要否</th><th class="w-chk">提出確認欄<br>（○を記載）</th></tr></thead>
<tbody>
${body}
</tbody>
</table>`;
    })
    .join("\n");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>提出書類一覧表_${esc(input.workerName)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; } @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } }
  body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; font-size: 9pt; color: #000; margin: 0; }
  h1 { font-size: 13pt; text-align: center; margin: 0 0 2mm; }
  .sub-title { text-align: center; font-size: 11pt; margin: 0 0 4mm; }
  .who { display: flex; gap: 10mm; margin: 0 0 4mm; font-size: 10pt; }
  .who span { border-bottom: 1px solid #000; min-width: 60mm; display: inline-block; padding: 0 2mm; }
  h2 { font-size: 10pt; margin: 5mm 0 1.5mm; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #000; padding: 1.2mm 1.5mm; vertical-align: middle; }
  th { background: #eee; font-size: 8pt; }
  .c { text-align: center; } .small { font-size: 7.5pt; } .nowrap { white-space: nowrap; }
  .w-no { width: 9mm; } .w-form { width: 30mm; } .w-req { width: 11mm; } .w-chk { width: 22mm; }
  .sub { margin-right: 1mm; }
  .mk { display: inline-block; width: 6.5mm; height: 6.5mm; line-height: 6.5mm; margin: 0 0.8mm; text-align: center; }
  .mk.on { border: 1.4px solid #000; border-radius: 50%; font-weight: bold; }
</style></head><body>
<h1>${submissionListTitle(input.rows).title}</h1>
<p class="sub-title">（在留資格変更許可申請用）</p>
<div class="who"><div>申請人の氏名 <span>${esc(input.workerName)}</span></div><div>特定技能所属機関の名称 <span>${esc(input.orgName)}</span></div></div>
${tables}
</body></html>`;
}
