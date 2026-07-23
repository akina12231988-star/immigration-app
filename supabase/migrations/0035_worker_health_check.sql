-- 外国人ごとの健康診断 受診日。有効期限（受診日の1年後）はアプリ側で算出する。
-- 健康診断のファイル自体は onboarding_documents（doc_key = 'kenshin'）に保存し、
-- 入社書類メールには添付しない運用とする。
alter table workers
  add column if not exists health_check_on date;
