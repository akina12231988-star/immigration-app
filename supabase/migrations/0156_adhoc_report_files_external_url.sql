-- 随時報告書の署名済み届出書を、ファイルのアップロードではなく Google ドライブのリンクで登録できるようにする
-- （Supabase のストレージ容量を使わないため。以前にアップロードしたファイルはそのまま見られる）。
-- 退職・契約内容変更・支援委託終了の3つの記録で同じ列を持つ。
-- リンクで登録した行は storage_path が空で、external_url にリンクが入る。何度実行しても安全（if not exists）
alter table resignation_files
  add column if not exists external_url text not null default '';
alter table contract_change_files
  add column if not exists external_url text not null default '';
alter table support_end_files
  add column if not exists external_url text not null default '';

comment on column resignation_files.external_url is 'Google ドライブなど外部のリンクで登録した届出書のURL（アップロードした行は空）';
comment on column contract_change_files.external_url is 'Google ドライブなど外部のリンクで登録した届出書のURL（アップロードした行は空）';
comment on column support_end_files.external_url is 'Google ドライブなど外部のリンクで登録した届出書のURL（アップロードした行は空）';
