-- 随時届出の届出機関欄に転記する法人番号（13桁）を会社・機関マスタに追加（追加のみ）
alter table organizations
  add column if not exists corporate_no text not null default '';
