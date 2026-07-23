-- 年金記録票の記号（通知書記載の記号）と判定。外国人1人につき1件。
-- 年金記録票ファイル自体は onboarding_documents（doc_key='prep_nenkin'）に保存する。
create table if not exists pension_records (
  worker_id  uuid primary key references workers (id) on delete cascade,
  symbols    text not null default '', -- 記録票に出てくる記号コードのカンマ区切り
  note       text not null default '', -- ○/○未納 などの内訳メモ
  updated_at timestamptz not null default now()
);

alter table pension_records enable row level security;

create policy sel_pension on pension_records for select
  using (my_role() is not null);
create policy ins_pension on pension_records for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_pension on pension_records for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));

create trigger pension_records_updated before update on pension_records
  for each row execute procedure moddatetime(updated_at);
