-- 申請準備のメモ（いま何を依頼していて、何を待っているか）。
-- TODO番号ごとの準備リストに持たせ、申請準備の画面（現在の住所の上）に出し、
-- A4印刷（申請準備の詳細）のメモ欄にも印字する。何度実行しても安全（if not exists）
alter table application_prep_checklists
  add column if not exists memo text not null default '';

comment on column application_prep_checklists.memo is
  '申請準備のメモ（依頼中・待ちの内容など）。A4印刷のメモ欄にも出す';
