-- 特定技能総合保険の被保険者証明書の記録に「請求書のリンク先」を足す。
-- 証明書は画像・PDFを貼る代わりに、請求書（保険会社の画面など）のリンクを残せるようにする。
alter table worker_ssw_insurance_certs
  add column if not exists invoice_url text not null default '';
comment on column worker_ssw_insurance_certs.invoice_url is '請求書のリンク先（URL）。空なら未登録';
