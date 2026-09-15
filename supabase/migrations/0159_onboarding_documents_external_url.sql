-- 申請準備の「申請する書類（入管へ提出する完成した書類）」を、ファイルのアップロードではなく
-- Google ドライブのリンクで登録できるようにする（Supabase のストレージ容量を使わないため）。
-- リンクで登録した行は storage_path が空で、external_url にリンクが入る。
-- 何度実行しても安全（if not exists）
alter table onboarding_documents
  add column if not exists external_url text not null default '';

comment on column onboarding_documents.external_url is
  'Google ドライブなど外部のリンクで登録した書類のURL（ファイルをアップロードした行は空）';
