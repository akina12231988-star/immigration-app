-- 職歴の在留資格区分に「無職」を追加。
-- 転職活動中などで働いていなかった期間を、勤務先なしで記録する。
-- 特定技能1号の在留資格を保持したまま無職だった期間は、職歴の「通算5年に含める」
-- （kept_residence_status = true）で通算にカウントできる。
-- 何度実行しても安全（if not exists）
alter type visa_type add value if not exists '無職';
