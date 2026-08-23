-- 支援計画書 日付計算の結果の保存（外国人×TODO番号で1件）。
-- 日付計算ツールで「保存」すると入り、あとから申請準備のTODO・日付計算のどちらからでも
-- 日付を編集できる。すべて冪等（何度実行してもエラーにならない）。
create table if not exists support_plan_dates (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid references workers (id) on delete cascade,
  todo_no    text not null default '',
  name       text not null default '',   -- 申請人の名前（控え）
  org        text not null default '',   -- 所属機関名（控え）
  is_legal   boolean not null default false, -- 法人（2年）か個人（1年）か
  inputs     jsonb not null default '{}',    -- 選んだ日付（雇用開始日・申請予定日など）
  dates      jsonb not null default '{}',    -- 算出結果の日付一覧（あとから編集可）
  updated_at timestamptz not null default now()
);

-- 外国人×TODO番号で1件（TODO番号未設定の行も外国人ごとに1件）
create unique index if not exists support_plan_dates_worker_todo
  on support_plan_dates (worker_id, todo_no);

alter table support_plan_dates enable row level security;

drop policy if exists sel_plan_dates on support_plan_dates;
create policy sel_plan_dates on support_plan_dates for select
  using (my_role() is not null);
drop policy if exists ins_plan_dates on support_plan_dates;
create policy ins_plan_dates on support_plan_dates for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_plan_dates on support_plan_dates;
create policy upd_plan_dates on support_plan_dates for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_plan_dates on support_plan_dates;
create policy del_plan_dates on support_plan_dates for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists support_plan_dates_updated on support_plan_dates;
create trigger support_plan_dates_updated before update on support_plan_dates
  for each row execute procedure moddatetime(updated_at);
