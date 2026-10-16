-- 最低賃金の改定への回答（0181）に、月給での回答も記録できるようにする。
-- 所属機関によっては月給で返事が来るため、1号・2号それぞれに月給の欄を足す。
-- 集計では所属機関の年間所定労働時間で時給に換算して使う（画面側）。
alter table organization_wage_replies
  add column if not exists monthly_ssw1 integer, -- 回答の月給（特定技能1号・円）。空は未回答
  add column if not exists monthly_ssw2 integer; -- 回答の月給（特定技能2号・円）。空は未回答

comment on column organization_wage_replies.monthly_ssw1 is '回答の月給（特定技能1号・円）。空は未回答';
comment on column organization_wage_replies.monthly_ssw2 is '回答の月給（特定技能2号・円）。空は未回答';
