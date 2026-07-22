import {
  Home,
  Users,
  FilePlus2,
  List,
  ScanLine,
  GraduationCap,
  Briefcase,
  ClipboardList,
  CalendarClock,
  BookMarked,
  Mailbox,
  Archive,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string; // サイドナビ用のフルラベル
  short: string; // 下部タブ用の短縮ラベル
  icon: LucideIcon;
  emphasize?: boolean;
}

// 下部タブ・サイドナビ共通のナビ項目（要件②の順序）
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", short: "ホーム", icon: Home },
  { href: "/workers", label: "外国人", short: "外国人", icon: Users },
  { href: "/mailing", label: "郵送請求", short: "郵送請求", icon: Mailbox },
  { href: "/applications/new", label: "申請登録", short: "申請登録", icon: FilePlus2, emphasize: true },
  { href: "/applications", label: "申請一覧", short: "申請一覧", icon: List },
  { href: "/workers/renewals", label: "申請準備", short: "申請準備", icon: CalendarClock },
  { href: "/workers/passports", label: "パスポート更新必要", short: "パスポート", icon: BookMarked },
  { href: "/custody", label: "保管ボックス（原本預かり）", short: "保管", icon: Archive },
  { href: "/notices/search", label: "通知書", short: "通知書", icon: ScanLine },
  { href: "/orientations", label: "生活オリエンテーション", short: "生活", icon: GraduationCap },
  { href: "/postings", label: "求人一覧", short: "求人", icon: Briefcase },
  { href: "/jobs", label: "求職一覧", short: "求職", icon: ClipboardList },
];

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
