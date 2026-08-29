-- バックアップ対象のテーブル名一覧を返す関数（管理者のみ）。
-- ホーム ＞ バックアップ の「バックアップをダウンロード」ボタンが、
-- テーブルの取りこぼしを防ぐために使う。
-- 未適用でも壊れない: アプリはこの関数が無いとき、コード内の一覧
-- （src/lib/backup-export.ts の BACKUP_TABLES）で動く。
-- すべて冪等（何度実行してもエラーにならない）。

create or replace function backup_table_names()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  -- 管理者以外には空を返す（エラーにはしない）
  select tablename::text
  from pg_tables
  where schemaname = 'public'
    and my_role() = 'admin'
  order by tablename;
$$;

revoke all on function backup_table_names() from public;
revoke all on function backup_table_names() from anon;
grant execute on function backup_table_names() to authenticated;
