import { describe, expect, it } from "vitest";
import {
  BACKUP_PAGE_SIZE,
  BACKUP_TABLES,
  backupFileName,
  buildBackup,
  fetchAllRows,
  fetchBackupTableNames,
  totalRowCount,
  type BackupSource,
} from "./backup-export";

// 偽の Supabase クライアント。tables に無い名前は 42P01 相当のエラーを返す
function fakeClient(options: {
  rpcTables?: string[] | null; // null: rpc がエラー（関数未適用）
  tables: Record<string, { rows: Record<string, unknown>[]; orderColumn?: string }>;
}): BackupSource {
  return {
    async rpc() {
      if (options.rpcTables === null || options.rpcTables === undefined) {
        return { data: null, error: { message: "PGRST202: function not found" } };
      }
      return { data: options.rpcTables, error: null };
    },
    from(table: string) {
      return {
        select() {
          return {
            order(column: string) {
              return {
                async range(from: number, to: number) {
                  const t = options.tables[table];
                  if (!t) {
                    return { data: null, error: { message: `relation "${table}" does not exist` } };
                  }
                  if ((t.orderColumn ?? "id") !== column) {
                    return {
                      data: null,
                      error: { message: `column ${table}.${column} does not exist`, code: "42703" },
                    };
                  }
                  return { data: t.rows.slice(from, to + 1), error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("backupFileName", () => {
  it("日付と時刻の入ったファイル名を作る", () => {
    expect(backupFileName(new Date(2026, 7, 29, 15, 5))).toBe(
      "immigration-app-backup-20260829-1505.json",
    );
  });

  it("月・日・時・分を0埋めする", () => {
    expect(backupFileName(new Date(2026, 0, 3, 9, 7))).toBe(
      "immigration-app-backup-20260103-0907.json",
    );
  });
});

describe("fetchBackupTableNames", () => {
  it("DBの backup_table_names() があればそれを使う", async () => {
    const client = fakeClient({ rpcTables: ["a", "b"], tables: {} });
    expect(await fetchBackupTableNames(client)).toEqual(["a", "b"]);
  });

  it("関数が未適用（エラー）のときはコード内の一覧に切り替える", async () => {
    const client = fakeClient({ rpcTables: null, tables: {} });
    expect(await fetchBackupTableNames(client)).toEqual(BACKUP_TABLES);
  });

  it("空の一覧が返ったときもコード内の一覧に切り替える", async () => {
    const client = fakeClient({ rpcTables: [], tables: {} });
    expect(await fetchBackupTableNames(client)).toEqual(BACKUP_TABLES);
  });
});

describe("fetchAllRows", () => {
  it("1000行を超えるテーブルもページ送りで全部読む", async () => {
    const rows = Array.from({ length: BACKUP_PAGE_SIZE + 5 }, (_, i) => ({ id: i }));
    const client = fakeClient({ tables: { workers: { rows } } });
    const result = await fetchAllRows(client, "workers");
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(BACKUP_PAGE_SIZE + 5);
    expect(result.rows[0]).toEqual({ id: 0 });
    expect(result.rows.at(-1)).toEqual({ id: BACKUP_PAGE_SIZE + 4 });
  });

  it("id 列が無いテーブルは worker_id の並びで読み直す", async () => {
    const rows = [{ worker_id: "w1" }, { worker_id: "w2" }];
    const client = fakeClient({
      tables: { pension_records: { rows, orderColumn: "worker_id" } },
    });
    const result = await fetchAllRows(client, "pension_records");
    expect(result.error).toBeNull();
    expect(result.rows).toEqual(rows);
  });

  it("テーブルが無い（読めない）ときはエラーを返す", async () => {
    const client = fakeClient({ tables: {} });
    const result = await fetchAllRows(client, "missing_table");
    expect(result.rows).toEqual([]);
    expect(result.error).toContain("does not exist");
  });
});

describe("buildBackup", () => {
  it("全テーブルを読み出し、読めなかった表は errors に分ける", async () => {
    const client = fakeClient({
      rpcTables: ["workers", "pension_records", "broken_table"],
      tables: {
        workers: { rows: [{ id: 1 }, { id: 2 }] },
        pension_records: { rows: [{ worker_id: "w1" }], orderColumn: "worker_id" },
      },
    });
    const progress: string[] = [];
    const backup = await buildBackup(client, new Date(2026, 7, 29, 12, 0), (done, total, table) => {
      progress.push(`${done}/${total}:${table}`);
    });
    expect(Object.keys(backup.tables)).toEqual(["workers", "pension_records"]);
    expect(backup.counts).toEqual({ workers: 2, pension_records: 1 });
    expect(Object.keys(backup.errors)).toEqual(["broken_table"]);
    expect(totalRowCount(backup)).toBe(3);
    expect(backup.app).toBe("immigration-app");
    expect(backup.format).toBe(1);
    expect(progress[0]).toBe("0/3:workers");
    expect(progress.at(-1)).toBe("3/3:");
  });
});

describe("BACKUP_TABLES", () => {
  it("重複が無い", () => {
    expect(new Set(BACKUP_TABLES).size).toBe(BACKUP_TABLES.length);
  });

  it("だいじな基本テーブルが入っている", () => {
    for (const t of ["workers", "organizations", "immigration_applications", "job_postings"]) {
      expect(BACKUP_TABLES).toContain(t);
    }
  });
});
