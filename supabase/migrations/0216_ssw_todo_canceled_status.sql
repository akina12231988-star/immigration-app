-- 特定技能総合保険のTODOの経過に「キャンセル」を追加（完了の扱い）。
-- 加入手続きのTODOを作ったあとに、本人が加入しないことになった（帰国する など）ときに選ぶ。
-- 「加入しない」を保存すると、残っている加入手続きのTODOは自動でキャンセルになる。
-- 何度実行しても安全（on conflict do nothing）。
insert into todo_status_options (kind, stage, name, sort_no) values
  ('特定技能総合保険', '完了', 'キャンセル', 2)
on conflict (kind, name) do nothing;
