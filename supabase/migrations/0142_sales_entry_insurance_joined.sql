-- 特定技能総合保険の売上（保険No.）に、実際に保険へ加入した記録を持たせる（0139 の追加）。
--
-- 請求（freee販売の伝票番号＝保険No.）は立てたけれど、保険の加入手続きがまだ、
-- ということが起きないように、売上明細ごとに「加入した日」を残す。
-- TODO ＞ 特定技能総合保険 の一覧から、その売上No.に対して記録する。
-- 何度実行しても安全（add column if not exists）。
alter table sales_entries
  add column if not exists insurance_joined_on date;
