-- 申請準備（TODO番号ごとの準備リスト）に、見積書・許可後の請求に使う明細（明細項目と金額）を登録する。
-- 所属機関の情報の「申請種別ごとの売上明細」から読み込んで、この申請だけ直せる。
-- null は未登録（所属機関の売上明細をそのまま使う）
alter table application_prep_checklists
  add column if not exists estimate_items jsonb;

comment on column application_prep_checklists.estimate_items is
  '見積書・許可後の請求に使う明細（[{name, amount}]。amount は税抜の数字。null は未登録で所属機関の売上明細を使う）';
