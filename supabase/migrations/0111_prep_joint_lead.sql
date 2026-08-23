-- 連名申請の筆頭者。どちらの申請準備TODOからも「誰と連名で、筆頭者が誰か」が
-- 分かるようにする（相手側のリストにも自動で表示される）。
--   joint_lead: '' / 本人（この行の外国人が筆頭者） / 相手（連名相手が筆頭者）
alter table application_prep_checklists
  add column if not exists joint_lead text not null default '';
