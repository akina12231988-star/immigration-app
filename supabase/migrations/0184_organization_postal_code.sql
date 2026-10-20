-- 所属機関に郵便番号を持つ（0184）。
-- 所属機関の住所をテープ（ラベルプリンター）に印刷するとき「〒861-8041」の行が要るため、
-- 住所とは別に郵便番号を保存する。住所から自動で探した番号を保存して使い回す。何度実行しても安全。
alter table organizations
  add column if not exists postal_code text not null default ''; -- 郵便番号（数字7桁。'' = 未登録）

comment on column organizations.postal_code is '郵便番号（数字7桁・ハイフンなし。空は未登録）';
