-- 郵送請求（課税・納税証明書 取得タイミング判定ツール）用の共有テーブル（追加のみ）

-- 自治体マスタ
create table if not exists municipalities (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  cert_name               text not null default '課税証明書',
  has_income              boolean not null default true,
  has_tax                 boolean not null default true,
  needs_tax_payment_cert  boolean not null default false,
  show_asterisk           boolean not null default false,
  note                    text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 判定記録（レコード本体は data jsonb にまとめて保存する）
create table if not exists judgment_records (
  id         uuid primary key default gen_random_uuid(),
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_judgment_records_created on judgment_records (created_at desc);

alter table municipalities enable row level security;
alter table judgment_records enable row level security;

-- organizations と同じ権限（閲覧: ログイン者全員 / 追加・更新・削除: admin・staff）
create policy sel_municipalities on municipalities for select using (my_role() is not null);
create policy ins_municipalities on municipalities for insert with check (my_role() in ('admin', 'staff'));
create policy upd_municipalities on municipalities for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_municipalities on municipalities for delete using (my_role() in ('admin', 'staff'));

create policy sel_judgment_records on judgment_records for select using (my_role() is not null);
create policy ins_judgment_records on judgment_records for insert with check (my_role() in ('admin', 'staff'));
create policy upd_judgment_records on judgment_records for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_judgment_records on judgment_records for delete using (my_role() in ('admin', 'staff'));

create trigger municipalities_updated before update on municipalities
  for each row execute procedure moddatetime(updated_at);
create trigger judgment_records_updated before update on judgment_records
  for each row execute procedure moddatetime(updated_at);
