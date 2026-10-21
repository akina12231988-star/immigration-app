-- オンライン申請（在留申請オンラインシステム）の身分事項・区分Vで使う、外国人ごとの登録値（0187）。
--   15  犯罪を理由とする処分を受けたことの有無（有 / 無）と、有のときの内容
--   18.1 技能水準 評価区分、19.1 日本語能力 評価区分（技能実習2号を良好に修了 / 特定技能評価試験 / 技能検定 / … の選択）
-- 申請準備の「申請書に貼る情報をコピー」でその場で選んで保存する。何度実行しても安全。
alter table workers
  add column if not exists criminal_record      text not null default '', -- 犯罪を理由とする処分の有無（'' / 有 / 無）
  add column if not exists criminal_record_note text not null default '', -- 有のときの処分の内容
  add column if not exists skill_eval_kind      text not null default '', -- 技能水準の評価区分（オンライン申請 18.1）
  add column if not exists japanese_eval_kind   text not null default ''; -- 日本語能力の評価区分（オンライン申請 19.1）

comment on column workers.criminal_record is '犯罪を理由とする処分を受けたことの有無（空 / 有 / 無）。オンライン申請 15';
comment on column workers.criminal_record_note is '処分の内容（有のとき）。オンライン申請 15';
comment on column workers.skill_eval_kind is '技能水準 評価区分（オンライン申請 18.1）';
comment on column workers.japanese_eval_kind is '日本語能力 評価区分（オンライン申請 19.1）';
