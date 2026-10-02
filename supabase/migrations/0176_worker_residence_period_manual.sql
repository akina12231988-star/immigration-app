-- 在留期間を手入力で訂正したかどうか。
--
-- 在留期間は許可年月日と満了日から自動計算して出しているが、計算と券面が違うときに
-- 手で直せるようにする。true のときは自動計算より登録値（residence_period）を優先して
-- 出す（外国人詳細・申請の許可情報・申請準備・申請書に貼る情報など）。
-- 許可年月日や満了日を変えたときは false に戻し、新しい日付からの自動計算に戻る。
-- 何度実行しても安全（if not exists）
alter table workers
  add column if not exists residence_period_manual boolean not null default false;

comment on column workers.residence_period_manual is
  '在留期間を手入力で訂正した（true なら自動計算より residence_period を優先）';
