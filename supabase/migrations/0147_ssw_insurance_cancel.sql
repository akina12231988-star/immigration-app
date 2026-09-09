-- 特定技能総合保険の枠（外国人詳細）に、解約手続きと解約金の記録を持たせる（0139 の追加）。
--
-- ・解約手続きの書類を郵送した日付と追跡番号（解約手続きのTODOと並べて表示する）
-- ・解約金（返戻金）の金額と、その返戻金をfreee販売に登録したときの売上No.
-- ・被保険者証明書の記録（worker_ssw_insurance_certs）に種類を付け、解約金の書類（通知書など）も同じ表に置く
-- 何度実行しても安全（add column if not exists）。
alter table workers
  add column if not exists ssw_insurance_cancel_mailed_on date,                     -- 解約手続きを郵送した日
  add column if not exists ssw_insurance_cancel_tracking_no text not null default '', -- 郵送の追跡番号
  add column if not exists ssw_insurance_refund_amount integer,                     -- 解約金（返戻金・円）
  add column if not exists ssw_insurance_refund_sales_no text not null default '';   -- 返戻金の売上No.（freee販売）

-- 画像・PDFの種類（被保険者証 / 解約金）。これまでの行は被保険者証
alter table worker_ssw_insurance_certs
  add column if not exists kind text not null default '被保険者証';

comment on column workers.ssw_insurance_cancel_mailed_on is '特定技能総合保険の解約手続きを郵送した日';
comment on column workers.ssw_insurance_cancel_tracking_no is '解約手続きの郵送の追跡番号';
comment on column workers.ssw_insurance_refund_amount is '特定技能総合保険の解約金（返戻金・円）';
comment on column workers.ssw_insurance_refund_sales_no is '解約金（返戻金）の売上No.（freee販売）';
comment on column worker_ssw_insurance_certs.kind is '画像の種類（被保険者証 / 解約金）';
