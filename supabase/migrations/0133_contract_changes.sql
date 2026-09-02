-- 契約内容変更の随時報告書（参考様式第３－１－１号「特定技能雇用契約の変更に係る届出書」）。
-- 何をいつ変更したかを記録し、届出書（Excel）を作る。
-- 退職の記録（resignations・0032）と同じ考え方で、届出書に載せる機関の情報は
-- 記録した時点のスナップショットを持つ（機関マスタを後で直しても届出書は変わらない）。
-- すべて冪等（何度実行してもエラーにならない）。
create table if not exists contract_changes (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  organization_id uuid references organizations (id) on delete set null,
  -- 届出書に載せる特定技能所属機関のスナップショット
  org_name        text not null default '',
  org_address     text not null default '',
  org_contact     text not null default '',   -- 電話番号
  org_staff       text not null default '',   -- 担当者
  changed_on      date not null,              -- 変更年月日（②ａ）
  -- 変更事項（②ｂ。Ⅰ〜Ⅸ のコードを複数）
  items           text[] not null default '{}',
  detail          text not null default '',   -- 何を変えたかのメモ（社内用。届出書には出ない）
  todo_no         text not null default '',   -- Notion随時報告TODO番号
  note            text not null default '',
  forms_downloaded_at timestamptz,            -- 届出書を最初に作った日時
  created_by      uuid references profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_contract_changes_worker
  on contract_changes (worker_id, changed_on desc);
create index if not exists idx_contract_changes_changed_on
  on contract_changes (changed_on desc);

comment on table public.contract_changes is
  '契約内容変更の随時報告書（参考様式第3-1-1号）の記録';
comment on column public.contract_changes.items is
  '変更事項のコード（I〜IX。参考様式第3-1-1号 ②ｂ）';

alter table contract_changes enable row level security;

-- 閲覧は全ロール、追加・更新は admin/staff、削除は admin のみ（resignations と同じ方針）
drop policy if exists sel_contract_changes on contract_changes;
create policy sel_contract_changes on contract_changes for select
  using (my_role() is not null);
drop policy if exists ins_contract_changes on contract_changes;
create policy ins_contract_changes on contract_changes for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_contract_changes on contract_changes;
create policy upd_contract_changes on contract_changes for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_contract_changes on contract_changes;
create policy del_contract_changes on contract_changes for delete
  using (my_role() = 'admin');

drop trigger if exists contract_changes_updated on contract_changes;
create trigger contract_changes_updated before update on contract_changes
  for each row execute procedure moddatetime(updated_at);
