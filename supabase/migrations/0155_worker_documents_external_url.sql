-- 雇用契約書・雇用条件書を、ファイルのアップロードではなく Google ドライブのリンクで登録できるようにする。
-- （Supabase のストレージ容量を使わないため。以前にアップロードしたファイルはそのまま見られる）
-- リンクで登録した行は storage_path が空で、external_url にリンクが入る。
-- 何度実行しても安全（if not exists）
alter table worker_documents
  add column if not exists external_url text not null default '';

comment on column worker_documents.external_url is
  'Google ドライブなど外部のリンクで登録した書類のURL（雇用契約書・雇用条件書）。ファイルをアップロードした行は空';
