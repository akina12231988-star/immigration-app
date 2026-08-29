// バックアップのダウンロード（ホーム ＞ バックアップ）のロジック。
//
// 管理者がログインしたままブラウザで全テーブルを読み出し、1つの JSON
// ファイルに固めてダウンロードする。RLS はログイン中の権限で普通に通る
// （select は全ロール可のため、読み出しに service_role キーは使わない）。
//
// 含まれないもの:
//   - Storage の添付ファイル（在留カード画像・PDF など）
//   - ログインアカウント（auth スキーマ）
// この2つの扱いは supabase/README.md の「5. バックアップ（手動）」参照。

// テーブル一覧の控え（DB の backup_table_names() が未適用・空のときに使う）。
// 新しいテーブルを足したら、マイグレーションと一緒にここにも1行足す。
export const BACKUP_TABLES: string[] = [
  "application_extra_requests",
  "application_files",
  "application_memos",
  "application_prep_checklists",
  "custody_events",
  "custody_persons",
  "custody_records",
  "employees",
  "employments",
  "filing_agents",
  "health_check_details",
  "immigration_applications",
  "job_applications",
  "job_postings",
  "judgment_records",
  "mail_notifications",
  "mailing_files",
  "monthly_support_registrations",
  "municipalities",
  "onboarding_documents",
  "onboarding_followups",
  "onboarding_records",
  "org_invoices",
  "organization_files",
  "organizations",
  "orientations",
  "pension_records",
  "posting_files",
  "prep_doc_statuses",
  "profiles",
  "referral_fees",
  "resignation_files",
  "resignations",
  "sales_entries",
  "ssw2_instructees",
  "support_plan_dates",
  "todo_corrections",
  "todo_files",
  "todo_status_options",
  "todos",
  "work_histories",
  "worker_addresses",
  "worker_documents",
  "worker_files",
  "worker_passport_files",
  "worker_rosters",
  "worker_travels",
  "worker_wages",
  "workers",
];

// 1回の読み出し行数。PostgREST の既定の上限（1000行）に合わせる
export const BACKUP_PAGE_SIZE = 1000;

export interface BackupFile {
  app: "immigration-app";
  format: 1;
  generated_at: string; // ISO 8601
  // テーブル名 → 全行。読めなかったテーブルはここに入らず errors に入る
  tables: Record<string, Record<string, unknown>[]>;
  counts: Record<string, number>;
  errors: Record<string, string>;
}

// ファイル名: immigration-app-backup-20260829-1530.json
export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const t = `${p(now.getHours())}${p(now.getMinutes())}`;
  return `immigration-app-backup-${d}-${t}.json`;
}

// Supabase クライアントのうち、バックアップに使う部分だけの型
// （テストで偽物に差し替えられるようにしておく）
export interface BackupSource {
  rpc(fn: string): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): {
      order(column: string): {
        range(
          from: number,
          to: number,
        ): PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
}

// バックアップ対象のテーブル名一覧。DB の backup_table_names() を優先し、
// 未適用（PGRST202 など）や空のときはコード内の一覧に切り替える
export async function fetchBackupTableNames(client: BackupSource): Promise<string[]> {
  try {
    const { data, error } = await client.rpc("backup_table_names");
    if (!error && Array.isArray(data) && data.length > 0) {
      return (data as string[]).filter((t) => typeof t === "string");
    }
  } catch {
    // 通信エラー等は控えの一覧で続行
  }
  return BACKUP_TABLES;
}

// 1テーブルの全行を、1000行ずつページ送りで読み出す。
// 並び順の列は id → worker_id の順に試す（worker_id が主キーの表があるため）
export async function fetchAllRows(
  client: BackupSource,
  table: string,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  for (const orderColumn of ["id", "worker_id"]) {
    const rows: Record<string, unknown>[] = [];
    let failedColumn = false;
    for (let from = 0; ; from += BACKUP_PAGE_SIZE) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .order(orderColumn)
        .range(from, from + BACKUP_PAGE_SIZE - 1);
      if (error) {
        // 並び順の列が無い（42703）ときだけ次の候補で読み直す
        if (error.code === "42703") {
          failedColumn = true;
          break;
        }
        return { rows: [], error: error.message };
      }
      rows.push(...(data ?? []));
      if (!data || data.length < BACKUP_PAGE_SIZE) return { rows, error: null };
    }
    if (!failedColumn) break;
  }
  return { rows: [], error: "並び順に使える列（id / worker_id）が見つかりません" };
}

// 全テーブルを読み出して1つのバックアップにまとめる。
// onProgress は「いま何テーブル目か」を画面に出すためのもの
export async function buildBackup(
  client: BackupSource,
  now: Date,
  onProgress?: (done: number, total: number, table: string) => void,
): Promise<BackupFile> {
  const tables = await fetchBackupTableNames(client);
  const backup: BackupFile = {
    app: "immigration-app",
    format: 1,
    generated_at: now.toISOString(),
    tables: {},
    counts: {},
    errors: {},
  };
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    onProgress?.(i, tables.length, table);
    const { rows, error } = await fetchAllRows(client, table);
    if (error) {
      backup.errors[table] = error;
    } else {
      backup.tables[table] = rows;
      backup.counts[table] = rows.length;
    }
  }
  onProgress?.(tables.length, tables.length, "");
  return backup;
}

// 合計行数（画面の完了メッセージ用）
export function totalRowCount(backup: BackupFile): number {
  return Object.values(backup.counts).reduce((a, b) => a + b, 0);
}
