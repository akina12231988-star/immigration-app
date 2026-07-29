-- 申請準備 書類チェックリスト: 添付する資料項目の選択（年金記録: 年金記録／免除申請書）。
-- どの資料を添付するかをチェックボックスで選び、カンマ区切りで保存する。
alter table prep_doc_statuses add column if not exists attach_items text not null default '';
