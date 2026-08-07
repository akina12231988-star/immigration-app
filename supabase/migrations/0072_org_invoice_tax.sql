-- 請求・入金の記録（org_invoices）に税抜金額と消費税額を追加する。
-- 領収書に「内消費税額」を正しく書けるようにするため、
-- 税抜・消費税・税込の3つを画面から入力して残せるようにする。
--
-- 既存の amount は税込金額として使ってきたので、意味は変えない。
--   amount_excl … 税抜金額
--   tax         … 消費税額
--   amount      … 税込金額（従来どおり。amount_excl + tax）
alter table org_invoices
  add column if not exists amount_excl integer not null default 0, -- 税抜金額
  add column if not exists tax         integer not null default 0; -- 消費税額

-- 既存の記録は税込金額しか持っていないので、消費税10%として内訳を埋める。
-- （税抜 = 税込 ÷ 1.1 の切り捨て、消費税 = 税込 − 税抜）
-- 実際の請求書と1円ずれることがあるので、必要なら画面で直してください。
update org_invoices
set
  amount_excl = floor(amount / 1.1),
  tax         = amount - floor(amount / 1.1)
where amount > 0
  and amount_excl = 0
  and tax = 0;
