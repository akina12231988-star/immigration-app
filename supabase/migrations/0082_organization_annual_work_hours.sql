-- 会社ごとの年間所定労働時間（賃金の時給⇔月給の換算に使う）。
--
-- 月給の人が時給いくらか（最低賃金を下回っていないか）、時給の人が月いくらになるかを
-- 外国人詳細の賃金で出すために使う。計算は雇用条件書と同じ考え方で、
--   時給 = 月給 × 12 ÷ 年間所定労働時間
--   月給 = 時給 × 年間所定労働時間 ÷ 12
-- 0 は未登録（換算を出さない）。
alter table organizations
  add column if not exists annual_work_hours integer not null default 0;

comment on column organizations.annual_work_hours is
  '年間所定労働時間（賃金の時給⇔月給の換算に使う。0 = 未登録）';
