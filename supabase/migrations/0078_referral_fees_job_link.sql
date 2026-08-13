-- 求職一覧と紹介手数料台帳の紐づけ＋freee販売の売上登録確認。
--
-- 1) job_application_id: 求職一覧（応募）から「手数料台帳に追加」したときに、
--    どの応募から生まれた手数料かを覚えておく。求職一覧に台帳の状態
--    （手数料・紹介売上No.・入金）を出すのに使う。応募が消えても台帳は残す。
-- 2) sales_checked_on: 紹介売上No.からfreee販売を開いて売上登録を確認できた日。
--    台帳ではこの確認が済むまで入金年月日を入れられないようにして、
--    freee販売への登録漏れのまま入金済みにしてしまうのを防ぐ。
alter table referral_fees
  add column if not exists job_application_id uuid references job_applications (id) on delete set null,
  add column if not exists sales_checked_on date;

create index if not exists idx_referral_fees_application
  on referral_fees (job_application_id);

comment on column referral_fees.job_application_id is
  '紐づく応募（求職一覧の行）。求職一覧から台帳に追加したときに入る';
comment on column referral_fees.sales_checked_on is
  'freee販売で売上登録を確認した日。未確認のうちは入金年月日を入れられない';
