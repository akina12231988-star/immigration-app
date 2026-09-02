-- 支援委託終了の随時報告書（参考様式第３－３－２号
-- 「支援委託契約の終了又は締結に係る届出書」）。
--
-- いちばん多いのは「特定技能2号へ移行したので支援委託契約が終わる」ケース。
-- 終了年月日は特定技能2号の許可日の前の日、届出書の①欄には特定技能2号へ移る前
-- （＝特定技能1号のとき）の在留カード番号・分野・業務区分を書くため、
-- そのときの内容をこの記録に残す（外国人情報を2号に更新しても届出書は変わらない）。
--
-- 進み具合と投函の記録は退職・契約内容変更の記録（0086・0134）と同じ。
-- すべて冪等（何度実行してもエラーにならない）。
create table if not exists support_end_records (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  organization_id uuid references organizations (id) on delete set null,
  -- ③ 届出機関（特定技能所属機関）のスナップショット
  org_name        text not null default '',
  org_address     text not null default '',
  org_contact     text not null default '',   -- 電話番号
  org_staff       text not null default '',   -- 担当者
  -- ① 届出の対象者（特定技能1号のときの内容）
  card_no             text not null default '',  -- 在留カード番号
  field               text not null default '',  -- 特定産業分野
  business_category   text not null default '',  -- 業務区分
  -- Ａa 終了年月日と、そのもとになった特定技能2号の許可日
  permit_date_2go date,                       -- 特定技能2号の許可日
  ended_on        date not null,              -- 終了年月日（許可日の前の日）
  -- Ａb 終了の事由
  major_reason    text not null default '期間満了',
  minor_reason    text not null default 'その他',
  other_reason    text not null default '',   -- 小分類が「その他」のときの理由
  todo_no         text not null default '',   -- Notion随時報告TODO番号
  note            text not null default '',
  -- 進み具合と投函の記録
  status          text not null default '準備中',
  forms_downloaded_at timestamptz,
  posted_on       date,
  tracking_no     text not null default '',
  created_by      uuid references profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table support_end_records drop constraint if exists support_end_records_status_check;
alter table support_end_records add constraint support_end_records_status_check
  check (status in ('準備中', '署名依頼中', '投函完了'));

create index if not exists idx_support_end_worker
  on support_end_records (worker_id, ended_on desc);
create index if not exists idx_support_end_ended_on
  on support_end_records (ended_on desc);
create index if not exists idx_support_end_status
  on support_end_records (status, ended_on desc);

comment on table public.support_end_records is
  '支援委託終了の随時報告書（参考様式第3-3-2号）の記録';
comment on column public.support_end_records.ended_on is
  '支援委託契約の終了年月日（特定技能2号の許可日の前の日）';
comment on column public.support_end_records.card_no is
  '特定技能1号のときの在留カード番号（届出書①欄）';

alter table support_end_records enable row level security;

-- 閲覧は全ロール、追加・更新は admin/staff、削除は admin のみ（resignations と同じ方針）
drop policy if exists sel_support_end_records on support_end_records;
create policy sel_support_end_records on support_end_records for select
  using (my_role() is not null);
drop policy if exists ins_support_end_records on support_end_records;
create policy ins_support_end_records on support_end_records for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_support_end_records on support_end_records;
create policy upd_support_end_records on support_end_records for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_support_end_records on support_end_records;
create policy del_support_end_records on support_end_records for delete
  using (my_role() = 'admin');

drop trigger if exists support_end_records_updated on support_end_records;
create trigger support_end_records_updated before update on support_end_records
  for each row execute procedure moddatetime(updated_at);

-- 署名済みの届出書（スキャンしたPDF・画像）
create table if not exists support_end_files (
  id               uuid primary key default gen_random_uuid(),
  support_end_id   uuid not null references support_end_records (id) on delete cascade,
  storage_path     text not null,
  file_name        text not null,
  mime_type        text not null,
  uploaded_by      uuid references profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index if not exists idx_support_end_files
  on support_end_files (support_end_id, created_at);

alter table support_end_files enable row level security;
drop policy if exists sel_support_end_files on support_end_files;
drop policy if exists ins_support_end_files on support_end_files;
drop policy if exists del_support_end_files on support_end_files;
create policy sel_support_end_files on support_end_files for select
  using (my_role() is not null);
create policy ins_support_end_files on support_end_files for insert
  with check (my_role() in ('admin', 'staff'));
create policy del_support_end_files on support_end_files for delete
  using (my_role() in ('admin', 'staff'));
