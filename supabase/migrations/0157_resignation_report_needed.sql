-- 退職の記録に「随時報告書が必要か」と、記録したときの在留資格を持たせる。
--
-- 特定活動（特定技能1号移行準備など）の人は特定技能所属機関の随時届出が要らないが、
-- 退職扱い（退職日で請求の日割り計算）は同じように行いたい。
-- 在留資格が特定技能1号・2号なら report_needed = true（届出書を作る）、
-- 特定活動なら false（届出書なし・退職扱いのみ）。
-- 何度実行しても安全（if not exists）
alter table resignations
  add column if not exists residence_status text not null default '',
  add column if not exists report_needed boolean not null default true;

comment on column resignations.residence_status is
  '退職を記録したときの在留資格（特定技能1号／2号／特定活動…）のスナップショット';
comment on column resignations.report_needed is
  '随時報告書（参考様式第3-1-2号ほか）を作るか。特定活動の人は不要なので false';

create index if not exists idx_resignations_report_needed
  on resignations (report_needed, leaving_on desc);
