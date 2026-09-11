-- 督促の「金額」「誰が払うか」「金額の内訳・支払期限」（一覧表用）。
--
-- 納付書などの金額と、本人が払うのか・当社が代わりに払う（立替）のかを督促ごとに持つ。
-- 金額は複数の内訳（第1期・第2期など。それぞれ支払期限付き）で入れられ、合計を amount に入れる。
-- 代わりに払うときは 0150 の立替払い（advance_*）で返金を追いかける。
-- 納付書の画像は reminder_images に kind = 'slip' で保存する。
-- 何度実行しても安全（add column if not exists）。
alter table reminders
  add column if not exists amount integer,                    -- 金額（円。内訳の合計）
  add column if not exists payer  text not null default ''    -- 誰が払うか: '' / 本人 / 代わり
    check (payer in ('', '本人', '代わり')),
  add column if not exists amount_items jsonb not null default '[]'::jsonb, -- 内訳 [{label, amount, due_on}]
  add column if not exists due_on date;                       -- 支払期限（内訳の一番早い期限）
