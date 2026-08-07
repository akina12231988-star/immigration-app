-- 請求・入金の記録（org_invoices）の請求日・支払期限を運用に合わせて直す。
-- 請求は対象月が終わってから出すため、請求日は「対象月の翌月1日」、
-- 支払期限は「その請求日と同じ月の末日」になる。
--   例: 対象月 2026-06 → 請求日 2026-07-01 ・ 支払期限 2026-07-31
--
-- これまでは請求日を対象月の1日、支払期限を対象月の末日として保存していたため、
-- その形で入っている記録だけを翌月へずらす（すでに直っている記録は触らない）。
update org_invoices
set
  billed_on = (to_date(month || '-01', 'YYYY-MM-DD') + interval '1 month')::date,
  due_on    = (to_date(month || '-01', 'YYYY-MM-DD') + interval '2 month' - interval '1 day')::date
where month ~ '^\d{4}-\d{2}$'
  and (
    billed_on is null
    or billed_on = to_date(month || '-01', 'YYYY-MM-DD')::date
  );
