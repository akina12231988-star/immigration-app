-- 追加資料の提出依頼に、オンライン申請の場合を足す（0083 の続き）。
--   ・来かた（method）に「メール」: オンライン申請では、追加資料の依頼が在留申請オンラインシステムからメールで来る
--   ・mail_link: そのメール（Gmail など）のリンク
--   ・対応状況（status）に「オンラインで提出済み」: オンラインシステムで追加資料を出したら、郵送しなくても完了
--     （提出した日は sent_on に入れる）
-- 何度実行しても安全。
alter table application_extra_requests
  add column if not exists mail_link text not null default '';
comment on column application_extra_requests.mail_link is '追加資料の依頼のメール（オンライン申請）のリンク';

alter table application_extra_requests drop constraint if exists application_extra_requests_method_check;
alter table application_extra_requests
  add constraint application_extra_requests_method_check check (method in ('書類', '電話', 'メール'));

alter table application_extra_requests drop constraint if exists application_extra_requests_status_check;
alter table application_extra_requests
  add constraint application_extra_requests_status_check
  check (status in ('本人へ依頼中', '本人から受領', '書類作成中', '郵送済み', 'オンラインで提出済み'));

notify pgrst, 'reload schema';
