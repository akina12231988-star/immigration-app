-- オンライン申請 2.5「特定技能雇用契約 (2)従事すべき業務の内容 職種 主たる職種」の選択値（0188）。
-- 画面の職種一覧（経営〜その他）から選んで外国人ごとに保存する。何度実行しても安全。
alter table workers
  add column if not exists main_occupation text not null default ''; -- 主たる職種（オンライン申請 2.5）

comment on column workers.main_occupation is '主たる職種（オンライン申請 2.5。職種一覧の表記）';
