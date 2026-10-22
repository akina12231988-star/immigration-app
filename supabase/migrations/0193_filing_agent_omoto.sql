-- 申請取次士の名簿（filing_agents）に「大元　麗奈」を足す。
-- 申請準備の詳細・申請登録の「申請取次士」の選択肢に出る。
-- すでに同じ名前（空白の有無・全角半角の違いは無視）があれば足さない。何度実行しても安全
insert into filing_agents (name)
select '大元　麗奈'
where not exists (
  select 1 from filing_agents
  where replace(replace(name, ' ', ''), '　', '') = '大元麗奈'
);
