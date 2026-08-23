-- 良好に修了した技能実習2号の記録（外国人詳細・専門級の下に表示）。
-- 職種名・作業名と、良好に修了したことの証明方法を記録する。
--   jisshu2_proof: '' / 実技試験の合格（3級の技能検定又はこれに相当する技能実習評価試験の実技試験）
--                  / 書面による証明（不合格の場合。実習状況に関する書面＝技能評価調書を添付）
alter table workers add column if not exists jisshu2_shokushu text not null default '';
alter table workers add column if not exists jisshu2_sagyo text not null default '';
alter table workers add column if not exists jisshu2_proof text not null default '';
