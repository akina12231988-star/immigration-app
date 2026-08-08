-- 請求書を作成したかどうかを記録できるようにする。
-- 請求書作成の画面で所属機関ごとに「請求書 作成済み」を残せるようにし、
-- 機関が増えても「どこまで作ったか」をひと目で確認できるようにする。
alter table org_invoices add column if not exists invoice_created_on date;

comment on column org_invoices.invoice_created_on is '請求書を作成した日（未作成なら NULL）';

-- すでに請求書番号を入れてある記録は、請求書を作成済みとみなして請求日で埋める
update org_invoices
set invoice_created_on = coalesce(billed_on, to_date(month || '-01', 'YYYY-MM-DD')::date)
where invoice_created_on is null
  and btrim(invoice_no) <> '';
