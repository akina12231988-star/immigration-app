-- 申請の収入印紙代をだれが負担するか（本人負担 / 会社負担。'' = 未設定）。
-- TODO番号ごとの準備リストに持たせ、申請準備の詳細（申請種別の上）のボタンで選ぶ。
-- 有限会社國崎青果は画面で自動的に本人負担にする。
-- 未設定の申請は「収入印紙代の負担が未設定」の一覧（/todos/stamp-fee）に出す。
-- 何度実行しても安全（if not exists）
alter table application_prep_checklists
  add column if not exists stamp_fee_payer text not null default '';

comment on column application_prep_checklists.stamp_fee_payer is
  '収入印紙代の負担（本人負担 / 会社負担。空は未設定）';
