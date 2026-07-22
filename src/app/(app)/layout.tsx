import { BottomNav } from "@/components/BottomNav";
import { SideNav } from "@/components/SideNav";
import { ApplicationsProvider } from "@/lib/application-store";

// ログイン後の共通シェル。
// モバイル: 上部ヘッダー（各ページ）＋下部タブ。
// PC(md~): 左サイドナビ＋横幅いっぱいの本文。
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ApplicationsProvider>
      <div className="md:flex">
        <SideNav />
        <div className="flex min-h-screen w-full min-w-0 flex-col">
          <main className="w-full flex-1 px-4 pb-8 pt-4 md:px-8 md:pt-6 print:p-0">
            {children}
          </main>
          <BottomNav />
        </div>
      </div>
    </ApplicationsProvider>
  );
}
