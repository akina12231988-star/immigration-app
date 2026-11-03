-- 個人票などに出す「現在」の在留カード・照合結果・指定書の画像を手で選べるようにする（0210）。
--
-- これまでは登録日（または「いつ時点の書類か」）がいちばん新しい画像を自動で出していたため、
-- 新しい在留カードを申請の許可情報で登録したあとに古い画像を別の場所で登録し直したときなどに、
-- 個人票（A4印刷）へ現在の在留カードでない画像が出ることがあった。
-- この表に「この画像が現在」という選択を保存し、外国人詳細の書類タブで選び直せるようにする。
-- 選択が無い種別は、これまでどおりいちばん新しい画像を自動で出す。
--
-- 画像は外国人詳細で登録した worker_documents と、申請詳細の許可情報で登録した
-- application_files の2か所にあるため、どちらかのIDを入れる（両方は入れない）。
-- 選んだ画像を削除すると、この行も一緒に消えて自動選択に戻る（on delete cascade）。
-- 何度実行しても安全（if not exists）。
create table if not exists worker_current_docs (
  worker_id           uuid not null references workers (id) on delete cascade,
  kind                text not null, -- 在留カード・照合結果・指定書
  worker_document_id  uuid references worker_documents (id) on delete cascade,
  application_file_id uuid references application_files (id) on delete cascade,
  updated_at          timestamptz not null default now(),
  primary key (worker_id, kind)
);
comment on table worker_current_docs is '個人票などに出す「現在」の画像の手での選択（無い種別は最新の画像を自動で出す）';

alter table worker_current_docs enable row level security;
drop policy if exists sel_worker_current_docs on worker_current_docs;
create policy sel_worker_current_docs on worker_current_docs for select
  using (my_role() is not null);
drop policy if exists ins_worker_current_docs on worker_current_docs;
create policy ins_worker_current_docs on worker_current_docs for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_worker_current_docs on worker_current_docs;
create policy upd_worker_current_docs on worker_current_docs for update
  using (my_role() in ('admin', 'staff'));
drop policy if exists del_worker_current_docs on worker_current_docs;
create policy del_worker_current_docs on worker_current_docs for delete
  using (my_role() in ('admin', 'staff'));
