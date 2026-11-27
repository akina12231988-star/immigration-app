-- 会社に印鑑をもらう書類（支援委託契約書・特定技能雇用契約書・雇用条件書）の
-- 押印後の控えの保存先リンク（Google ドライブなど）。
--
-- これらは会社の印鑑が必要で2部印刷する書類。押印してもらったらスキャンを
-- ドライブに置き、そのリンクを申請準備の「会社に印鑑をもらう書類」の枠に貼って残す。
--   kind … 書類のキー（shien-itaku = 支援委託契約書 / t1-5 = 特定技能雇用契約書 /
--          t1-6-1 = 雇用条件書。参考様式のキーと同じ）
--   sealed … 会社の印鑑をもらったか（書類ごとのチェックリスト）
-- 何度実行しても安全。

create table if not exists worker_sealed_docs (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references workers (id) on delete cascade,
  kind       text not null,
  drive_url  text not null default '',
  sealed     boolean not null default false,
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, kind)
);

create index if not exists worker_sealed_docs_worker on worker_sealed_docs (worker_id);

alter table worker_sealed_docs enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新・削除: admin・staff
drop policy if exists sel_worker_sealed_docs on worker_sealed_docs;
drop policy if exists ins_worker_sealed_docs on worker_sealed_docs;
drop policy if exists upd_worker_sealed_docs on worker_sealed_docs;
drop policy if exists del_worker_sealed_docs on worker_sealed_docs;
create policy sel_worker_sealed_docs on worker_sealed_docs for select using (my_role() is not null);
create policy ins_worker_sealed_docs on worker_sealed_docs for insert with check (my_role() in ('admin', 'staff'));
create policy upd_worker_sealed_docs on worker_sealed_docs for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_worker_sealed_docs on worker_sealed_docs for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists worker_sealed_docs_updated on worker_sealed_docs;
create trigger worker_sealed_docs_updated before update on worker_sealed_docs
  for each row execute procedure moddatetime(updated_at);

notify pgrst, 'reload schema';
