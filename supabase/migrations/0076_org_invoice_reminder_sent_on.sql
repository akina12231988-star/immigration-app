-- 督促状を発行したかどうかを記録できるようにする。
-- 請求書作成の画面で、どの所属機関に督促状を出したかをひと目で確認できるようにし、
-- 同じ機関へ二重に出したり、出し忘れたりするのを防ぐ。
alter table org_invoices add column if not exists reminder_sent_on date;

comment on column org_invoices.reminder_sent_on is '督促状を発行した日（未発行なら NULL）';
