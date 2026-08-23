-- 申請準備のTODOに、申請取次士と本人申請でするかの記録を追加。
-- 内容（title）は申請登録と同じ7つの申請内容の候補から選ぶ（列の変更は不要）。
-- すべて冪等（何度実行してもエラーにならない）。
alter table todos
  add column if not exists agent_name text not null default '';  -- 申請取次士（filing_agents の名前）
alter table todos
  add column if not exists self_apply boolean not null default false; -- 本人申請でするか
