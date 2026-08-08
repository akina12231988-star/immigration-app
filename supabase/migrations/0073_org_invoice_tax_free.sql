-- 請求・入金の記録（org_invoices）に非課税額を追加する。
-- 特定技能総合保険など非課税の項目が請求に混ざるため、
-- 税抜（課税対象）・消費税・非課税の3本立てで持ち、合計を税込金額とする。
--
--   amount_excl … 税抜金額（10%の課税対象）
--   tax         … 消費税額
--   tax_free    … 非課税額（特定技能総合保険 など）
--   amount      … 税込金額（従来どおり。amount_excl + tax + tax_free）
alter table org_invoices
  add column if not exists tax_free integer not null default 0; -- 非課税額

-- 0072 で「税込 ÷ 1.1」から内訳を埋めた記録は非課税を含んでいないため、
-- 非課税の項目があった月は画面（請求・入金の記録）で3つの欄を入れ直してください。
-- 合計が合わない記録は画面で赤く表示されます。
