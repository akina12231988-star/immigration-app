-- 特定技能総合保険の解約金（返戻金）が振り込まれる日を追加（0147 の続き）。
-- 解約すると国際研修サービスから「中途解約返戻金明細のご案内」が届き、1人ずつの返戻保険料と
-- 指定口座への振込日が書いてある。金額（ssw_insurance_refund_amount）・解約売上No.（ssw_insurance_refund_sales_no）と
-- あわせて記録する（特定技能総合保険 ＞ 解約手続き／解約済み・返戻金 のタブ、外国人詳細の特定技能総合保険の枠）。
-- 何度実行しても安全（add column if not exists）。
alter table workers add column if not exists ssw_insurance_refund_paid_on date;
comment on column workers.ssw_insurance_refund_paid_on is '特定技能総合保険の解約金（返戻金）の振込日（明細に書かれた振込予定日）';

notify pgrst, 'reload schema';
