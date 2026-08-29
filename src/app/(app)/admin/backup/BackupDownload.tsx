"use client";

import { useRef, useState } from "react";
import { DatabaseBackup, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import {
  backupFileName,
  buildBackup,
  totalRowCount,
  type BackupFile,
  type BackupSource,
} from "@/lib/backup-export";

type Phase =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number; table: string }
  | { kind: "finished"; fileName: string; tableCount: number; rowCount: number; errors: Record<string, string> }
  | { kind: "failed"; message: string };

export function BackupDownload() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const runningRef = useRef(false);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase({ kind: "running", done: 0, total: 0, table: "" });
    try {
      const client = createClient() as unknown as BackupSource;
      const backup: BackupFile = await buildBackup(client, new Date(), (done, total, table) => {
        setPhase({ kind: "running", done, total, table });
      });

      const okTables = Object.keys(backup.tables).length;
      if (okTables === 0) {
        setPhase({
          kind: "failed",
          message:
            "1つもテーブルを読み出せませんでした。通信状態を確認して、もう一度お試しください。",
        });
        return;
      }

      const fileName = backupFileName(new Date());
      const blob = new Blob([JSON.stringify(backup, null, 1)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      setPhase({
        kind: "finished",
        fileName,
        tableCount: okTables,
        rowCount: totalRowCount(backup),
        errors: backup.errors,
      });
    } catch (e) {
      setPhase({
        kind: "failed",
        message: `バックアップに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      runningRef.current = false;
    }
  };

  const running = phase.kind === "running";

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <DatabaseBackup size={16} />
          バックアップをダウンロード
        </h2>
        <p className="mb-3 text-sm text-muted">
          登録してあるデータ（外国人・申請・求人・売上など全部）を、1つのファイル
          （JSON形式）にまとめてこの端末にダウンロードします。データが消えたときの
          控えとして、<span className="font-bold text-foreground">月に1回</span>を目安に取ってください。
        </p>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="min-h-[44px] w-full rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground disabled:opacity-50"
        >
          {running ? "読み出し中…" : "バックアップをダウンロード"}
        </button>

        {phase.kind === "running" && (
          <p role="status" className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
            読み出し中… {phase.done}/{phase.total || "?"} テーブル
            {phase.table ? `（${phase.table}）` : ""}
          </p>
        )}
        {phase.kind === "finished" && (
          <div role="status" className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
            <p className="font-bold">ダウンロードしました: {phase.fileName}</p>
            <p>
              {phase.tableCount}テーブル・合計{phase.rowCount.toLocaleString()}行
            </p>
            {Object.keys(phase.errors).length > 0 && (
              <p className="mt-1 text-seal">
                読めなかったテーブル: {Object.keys(phase.errors).join(", ")}
                （このぶんはファイルに入っていません）
              </p>
            )}
          </div>
        )}
        {phase.kind === "failed" && (
          <p role="status" className="mt-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {phase.message}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <TriangleAlert size={16} className="text-seal" />
          気をつけること
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
          <li>
            ファイルには<span className="font-bold text-foreground">全員分の個人情報</span>が
            入っています。共有フォルダに置かず、Google ドライブの自分だけのフォルダなど、
            Supabase とは別の安全な場所に保管してください。
          </li>
          <li>
            <span className="font-bold text-foreground">添付ファイルは含まれません。</span>
            在留カードの画像・PDF などは Supabase の Storage にあり、このボタンでは
            落ちてきません（Storage ＞ 各バケット から別途ダウンロード）。
          </li>
          <li>ログインアカウント（職員のメール・パスワード）も含まれません。消えたら招待し直します。</li>
          <li>
            戻すときは手作業になります。ファイルを捨てずに保管しておけば、万一のとき
            このファイルから復元できます（supabase/README.md の「5. バックアップ」参照）。
          </li>
        </ul>
      </Card>
    </div>
  );
}
