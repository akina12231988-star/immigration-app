import {
  Home,
  Building2,
  Users,
  FilePlus2,
  List,
  ListTodo,
  ScanLine,
  GraduationCap,
  Briefcase,
  ClipboardList,
  PencilLine,
  CalendarClock,
  CalendarSync,
  BookMarked,
  Mailbox,
  MailPlus,
  MailQuestionMark,
  Archive,
  UserMinus,
  Coins,
  UserCheck,
  Bell,
  Handshake,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string; // サイドナビ用のフルラベル
  short: string; // 下部タブ用の短縮ラベル
  icon: LucideIcon;
  emphasize?: boolean;
  // メニューにアラート件数を出す項目
  // passports=パスポート更新必要 / orientations=要実施の生活オリエン
  // followups=あとでやる手続き（転居手続き・国保/国民年金の加入）が残っている人
  alert?: "passports" | "orientations" | "followups";
}

// トグル表示のグループ（サイドナビで開閉できる。下部タブでは中身を並べる）
export interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).children !== undefined;
}

// メニューの表示順（トグルのグループ入り）。
// ※「入社書類メール」「郵送請求」は指定の並びに無かったため、関連の近くに仮置きしている
export const NAV_ENTRIES: NavEntry[] = [
  { href: "/", label: "ホーム", short: "ホーム", icon: Home },
  { href: "/notifications", label: "入管メール通知", short: "お知らせ", icon: Bell },
  { href: "/organizations", label: "所属機関の情報", short: "所属機関", icon: Building2 },
  { href: "/workers", label: "外国人", short: "外国人", icon: Users, alert: "followups" },
  // ★指定の並びに無かった項目（仮置き）: 外国人まわりの書類のためここに置いている
  { href: "/onboarding", label: "入社書類メール", short: "入社書類", icon: MailPlus },
  { href: "/custody", label: "保管ボックス（原本預かり）", short: "保管", icon: Archive },
  {
    key: "todo",
    label: "TODO",
    icon: ListTodo,
    children: [
      // 更新準備: 在留期限が4か月以内になった人の一覧（申請準備の前段の確認用）
      { href: "/workers/renewal-prep", label: "更新準備", short: "更新準備", icon: CalendarSync },
      { href: "/workers/renewals", label: "申請準備", short: "申請準備", icon: CalendarClock },
      { href: "/resignations", label: "退職＜随時報告＞", short: "退職", icon: UserMinus },
      { href: "/todos/exams", label: "試験の申込", short: "試験", icon: PencilLine },
    ],
  },
  { href: "/applications", label: "申請一覧", short: "申請一覧", icon: List },
  { href: "/applications/new", label: "申請登録", short: "申請登録", icon: FilePlus2, emphasize: true },
  // ★指定の並びに無かった項目（仮置き）: 申請準備で使う証明書の請求のためここに置いている
  { href: "/mailing", label: "郵送請求", short: "郵送請求", icon: Mailbox },
  // 発行依頼中の書類を、誰に頼んだかでまとめて見る
  { href: "/issue-requests", label: "発行依頼のまとめ", short: "発行依頼", icon: MailQuestionMark },
  { href: "/notices/search", label: "通知書", short: "通知書", icon: ScanLine },
  {
    href: "/workers/passports",
    label: "パスポート更新必要",
    short: "パスポート",
    icon: BookMarked,
    alert: "passports",
  },
  {
    href: "/orientations",
    label: "生活オリエンテーション",
    short: "生活",
    icon: GraduationCap,
    alert: "orientations",
  },
  { href: "/sales", label: "請求書作成", short: "請求", icon: Coins },
  {
    key: "assen",
    label: "あっせん",
    icon: Handshake,
    children: [
      { href: "/postings", label: "求人一覧", short: "求人", icon: Briefcase },
      { href: "/jobs", label: "求職一覧", short: "求職", icon: ClipboardList },
      { href: "/referrals", label: "紹介手数料台帳", short: "紹介料", icon: Handshake },
    ],
  },
  { href: "/employees", label: "支援体制（従業員）", short: "支援体制", icon: UserCheck },
  { href: "/updates", label: "更新のお知らせ", short: "更新情報", icon: Sparkles },
];

// グループを展開した平らな一覧（下部タブ・現在地の判定用）
export const NAV_ITEMS: NavItem[] = NAV_ENTRIES.flatMap((e) =>
  isNavGroup(e) ? e.children : [e],
);

// 現在パスがナビ項目にマッチするか（ホームは完全一致、他は前方一致）
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // /applications/new が /applications より優先されるよう、より長い一致を呼び出し側で判定
  return pathname === href || pathname.startsWith(`${href}/`);
}

// パスに最もマッチするナビ項目のhrefを返す（最長一致）
export function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    if (item.href === "/") {
      if (pathname === "/") return "/";
      continue;
    }
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}
