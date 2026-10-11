-- 一般職員（staff）にも次を許可する。
--   ・退職記録・契約変更・支援終了・預かり記録・オンボーディング記録の削除（これまでは admin のみ）
--   ・会社・機関マスタ（画面側の制限。DB は以前から admin/staff が編集可）
-- 誤って消しても困らないよう、画面では削除の前に確認を出している。
-- 何度実行しても同じ結果になる（drop if exists → create）。

-- 退職記録（0032）
drop policy if exists del_resignations on resignations;
create policy del_resignations on resignations for delete
  using (my_role() in ('admin', 'staff'));

-- 契約変更（0133）
drop policy if exists del_contract_changes on contract_changes;
create policy del_contract_changes on contract_changes for delete
  using (my_role() in ('admin', 'staff'));

-- 支援終了（0135）
drop policy if exists del_support_end_records on support_end_records;
create policy del_support_end_records on support_end_records for delete
  using (my_role() in ('admin', 'staff'));

-- 預かり記録（0026）
drop policy if exists del_custody on custody_records;
create policy del_custody on custody_records for delete
  using (my_role() in ('admin', 'staff'));
drop policy if exists del_custody_events on custody_events;
create policy del_custody_events on custody_events for delete
  using (my_role() in ('admin', 'staff'));

-- オンボーディング記録（0029）
drop policy if exists del_onboarding on onboarding_records;
create policy del_onboarding on onboarding_records for delete
  using (my_role() in ('admin', 'staff'));
drop policy if exists del_onboarding_docs on onboarding_documents;
create policy del_onboarding_docs on onboarding_documents for delete
  using (my_role() in ('admin', 'staff'));
