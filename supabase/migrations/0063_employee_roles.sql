-- 従業員に「代表」と、現在の支援体制上の役割（支援責任者・支援担当者）を追加（追加のみ）。
--
-- ・代表: 個人事業主には役員がいないため、支援責任者等の要件（常勤の役員又は職員）を
--   確認するときに代表であることを記録できるようにする。役員との併用も可。
-- ・支援責任者／支援担当者: 「現在その役割をしているか」を従業員側で管理し、
--   所属機関の選任（intake.support_managers / support_staff）では該当者だけを
--   選べるようにする（支援責任者でない人を誤って選任してしまうのを防ぐ）。
alter table employees
  add column if not exists is_representative boolean not null default false,  -- 代表（個人事業主本人・法人の代表者）
  add column if not exists is_support_manager boolean not null default false, -- 現在 支援責任者をしている
  add column if not exists is_support_staff boolean not null default false;   -- 現在 支援担当者をしている
