-- 年間所定労働時間（organizations.annual_work_hours）に小数を入れられるようにする。
-- 雇用条件書の年間所定労働時間は 2347.5 のように小数になることがある（0082 では整数）。
-- 何度実行しても同じ結果になる
alter table organizations
  alter column annual_work_hours type numeric(7,1) using annual_work_hours::numeric(7,1);

comment on column organizations.annual_work_hours is
  '年間所定労働時間（賃金の時給⇔月給の換算に使う。0 = 未登録。小数1桁まで）';
