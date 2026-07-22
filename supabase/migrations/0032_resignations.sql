-- 退職＜随時報告＞（特定技能所属機関の随時届出の作成支援）
-- 退職の記録を resignations に保存し、外国人情報（workers）の退職者情報にも転記する。
-- 会社都合/自己都合に応じて参考様式第3-1-2号・第3-4号・第5-11号の作成画面で使う。

-- workers: 退職者情報に退職区分・理由・退職元の所属機関情報を追加（追加のみ）
alter table workers
  add column if not exists leaving_kind text not null default ''
    check (leaving_kind in ('', '会社都合', '自己都合')),
  add column if not exists leaving_reason text not null default '',
  add column if not exists leaving_org_name text not null default '',
  add column if not exists leaving_org_address text not null default '';

-- 退職記録（外国人1人につき複数可: 転職を繰り返すケースに対応）
create table if not exists resignations (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  -- 届出書に載せる退職元機関のスナップショット（機関マスタを後で変更しても影響しない）
  org_name        text not null default '',
  org_address     text not null default '',
  org_contact     text not null default '',
  -- 会社都合 / 自己都合
  kind            text not null check (kind in ('会社都合', '自己都合')),
  reason          text not null default '',   -- 退職理由（わかれば）
  leaving_on      date not null,              -- 退職日
  todo_no         text not null default '',   -- Notion随時報告TODO番号（記録保存後に入力）
  note            text not null default '',
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_resignations_worker on resignations (worker_id, leaving_on desc);

alter table resignations enable row level security;

-- 閲覧は全ロール、追加・更新は admin/staff、削除は admin のみ（onboarding と同じ方針）
create policy sel_resignations on resignations for select using (my_role() is not null);
create policy ins_resignations on resignations for insert with check (my_role() in ('admin', 'staff'));
create policy upd_resignations on resignations for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_resignations on resignations for delete using (my_role() = 'admin');

create trigger resignations_updated before update on resignations
  for each row execute procedure moddatetime(updated_at);
