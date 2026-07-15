-- 会社・機関マスタに特定技能の「業務区分」を追加（産業分野の下位区分）。

alter table organizations
  add column if not exists business_category text not null default '';
