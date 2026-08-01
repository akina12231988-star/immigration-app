-- 弊社（登録支援機関）の従業員マスタ。
-- 令和9年4月1日施行の省令改正（1号特定技能外国人への支援体制に係る要件）で
--   ・支援責任者及び支援担当者を、支援を行う事務所ごとに1名以上選任する
--   ・支援業務に従事できる者を支援責任者等に限定する
--   ・支援責任者に養成講習の受講を義務付ける（当分の間は未修了でも可）
--   ・支援担当者の数が「委託を受けている特定技能所属機関の数÷10」と
--     「支援を行っている1号特定技能外国人の数÷50」の双方を超えていること
-- が求められるため、誰が支援責任者・支援担当者になれるか／なっているかを管理する。
create table if not exists employees (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null default '',       -- 氏名（所属機関の支援責任者・支援担当者の選択肢になる）
  kana                   text not null default '',       -- フリガナ
  joined_on              date,                           -- 入社日（支援責任者の要件判定に使う）
  left_on                date,                           -- 退職日（入力があれば在籍対象から外す）
  employment_kind        text not null default '常勤',    -- 常勤 / 非常勤（支援責任者等は常勤の役員又は職員）
  is_officer             boolean not null default false, -- 役員か
  office                 text not null default '',       -- 支援業務を行う事務所（事務所ごとに1名以上必要）
  training_completed_on  date,                           -- 支援責任者の養成講習 修了日
  note                   text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_employees_name on employees (name);

alter table employees enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff
create policy sel_employees on employees for select
  using (my_role() is not null);
create policy ins_employees on employees for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_employees on employees for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_employees on employees for delete
  using (my_role() in ('admin', 'staff'));

create trigger employees_updated before update on employees
  for each row execute procedure moddatetime(updated_at);
