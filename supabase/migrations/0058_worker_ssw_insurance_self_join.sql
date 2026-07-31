-- 特定技能総合保険の自己負担加入希望フラグを workers に追加（追加のみ）。
-- 所属機関の負担区分が「外国人負担」の場合、本人が希望したときだけ
-- 加入リンク先・有効期限を表示するために使う。
alter table workers
  add column if not exists ssw_insurance_self_join boolean not null default false;
