-- 特定技能総合保険の「加入しない」を、どの所属機関にいたときの判断かで残す（0139 の追加）。
--
-- 加入しないと決めた人は、その所属機関にいる間は保険のTODO（未加入・期限切れ）に出さない。
-- 別の所属機関に転職したら、その機関では改めて加入を検討するので、また一覧に出るようにする。
-- 何度実行しても安全（add column if not exists）。
alter table workers
  add column if not exists ssw_insurance_declined_org_id uuid
    references organizations(id) on delete set null;
