-- 所属機関の「業種 主たる業種」（0189）。
-- オンライン申請 3.4「特定技能所属機関 (4)業種 主たる業種」のプルダウン（日本標準産業分類の大分類・中分類）から選んで保存する。
-- 特定技能の産業分野（industry）とは別の項目。何度実行しても安全。
alter table organizations
  add column if not exists main_industry text not null default ''; -- 主たる業種（'' = 未登録）

comment on column organizations.main_industry is '業種 主たる業種（オンライン申請 3.4 のプルダウンの表記。空は未登録）';
