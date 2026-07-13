-- service_role（サーバー側の管理クライアント）へのスキーマ権限付与。
-- 0007 では authenticated のみに付与していたため、画像メタデータの登録や
-- 申請の削除などサーバー経由の操作が permission denied になっていた。
-- service_role は RLS をバイパスするが、テーブルの GRANT 自体は必要。

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 今後追加されるテーブル・関数にも自動適用する
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
