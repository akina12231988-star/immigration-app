-- 特定技能総合保険の解約手続きのTODOの経過に「解約書類郵送済み」を足す（0139 の追加）。
--
-- 加入手続きの進行中は「申込手続中」のままで、解約手続きの進行中は「解約書類郵送済み」にする
-- （解約の届出書を出力すると、その人の解約手続きのTODOが自動でこの経過になる）。
-- これまで「申込手続中」になっていた解約手続きのTODOは「解約書類郵送済み」に直す。
-- 何度実行しても安全（on conflict do nothing・条件付き update）。
insert into todo_status_options (kind, stage, name, sort_no) values
  ('特定技能総合保険', '進行中', '解約書類郵送済み', 2)
on conflict (kind, name) do nothing;

update todos
  set status = '解約書類郵送済み'
  where kind = '特定技能総合保険'
    and title = '特定技能総合保険の解約手続き'
    and status = '申込手続中'
    and deleted_at is null;
