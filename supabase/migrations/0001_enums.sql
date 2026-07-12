-- docs/03_database_design.md §3: enum 定義

create extension if not exists moddatetime;

-- 在留資格区分（職歴用）。値は画面の選択肢・旧HTML版JSONと完全一致させる
create type visa_type as enum (
  '本国での職歴',
  '技能実習',
  '特定技能1号',
  '特定技能2号',
  '特定活動（特定技能1号移行準備）',
  '特定活動（特定技能2号移行準備）',
  '留学',
  'その他'
);

create type support_scope      as enum ('支援対象', '支援対象外');
create type worker_status      as enum ('支援中', '求職活動中', '帰国', '退職');
create type application_result as enum ('選考中', '採用', '不採用', '辞退');
create type file_kind          as enum ('在留カード表', '在留カード裏', '指定書', '履歴書', 'その他');
create type staff_role         as enum ('admin', 'staff', 'viewer');
