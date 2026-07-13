-- 申請の取下げ（キャンセル）対応。
-- 取下げはステップ進行とは別の終端状態で、取下げ日を記録する。誤操作は元に戻せる。

alter type immigration_app_status add value if not exists '取下げ';

alter table immigration_applications
  add column withdrawn_on date;
