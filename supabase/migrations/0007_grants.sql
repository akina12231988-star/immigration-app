-- Data API のスキーマ権限。プロジェクト作成時に「Automatically expose new tables」を
-- 無効にしている前提で、必要な権限を明示的に付与する。行レベルの制御は RLS が行う。
-- anon（未ログイン）にはテーブル権限を一切与えない（ログイン必須）。

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 今後追加されるテーブル・関数にも同じ権限を自動適用する
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
