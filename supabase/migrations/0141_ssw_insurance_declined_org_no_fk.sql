-- 0140 で足した外部キー（workers.ssw_insurance_declined_org_id → organizations）を外す。
--
-- workers から organizations への関連が2本になると、Supabase の埋め込み
-- organizations(name) がどちらの関連か決められずエラーになる（PGRST201）。
-- 外国人の一覧・ダッシュボード・申請準備など、あちこちで使っているため関連は1本に戻す。
-- 列（uuid）はそのまま残し、「加入しないと判断したときの所属機関」の記録に使い続ける
-- （所属機関IDを突き合わせるだけなので、外部キーは無くても動く）。
-- 何度実行しても安全（drop constraint if exists）。
alter table workers drop constraint if exists workers_ssw_insurance_declined_org_id_fkey;
