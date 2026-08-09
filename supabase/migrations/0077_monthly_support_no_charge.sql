-- 支援代をあえて請求しない月の記録。
--
-- 病欠や帰国などで「在籍はしているがその月の支援代は請求しない」ことがある。
-- これまでは名簿のメモに理由を書くだけで金額はそのままだったため、
-- 請求書作成の画面に「請求しない」ボタンを付け、押した月は支援費請求額を
-- 0円（区分「請求しない」）として名簿・エクセル・合計から外せるようにする。
-- 期間が複数月にわたる場合は、対象の月ごとに押して記録する。
alter table monthly_support_registrations
  add column if not exists no_charge boolean not null default false;

comment on column monthly_support_registrations.no_charge is
  'この月の支援代を請求しない（請求書作成の名簿で0円・区分「請求しない」になる）';
