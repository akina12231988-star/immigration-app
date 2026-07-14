import { BottomNav } from "@/components/BottomNav";
import { SideNav } from "@/components/SideNav";
import { ApplicationsProvider } from "@/lib/application-store";

// ログイン後の共通シェル。
// モバイル: 上部ヘッダー（各ページ）＋下部タブ。
// PC(lg~): 左サイドナビ＋横幅いっぱいの本文。
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ApplicationsProvider>
      <div className="lg:flex">
        <SideNav />
        <div className="flex min-h-screen w-full min-w-0 flex-col">
          <main className="w-full flex-1 px-4 pb-8 pt-4 lg:px-8 lg:pt-6">
            {children}
          </main>
          <BottomNav />
        </div>
      </div>
    </ApplicationsProvider>
  );
}
