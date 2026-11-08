-- 住所・保険の手続きをTODOにする（転出手続き・転入手続き・国民健康保険の加入手続き・国民年金の加入手続き）。
-- これまで外国人詳細の「あとでやる手続き」（workers.followups）のチェックでまとめていたものを、
-- 手続きごとのTODOにして、それぞれ経過（未着手 → 依頼中 → 完了／キャンセル）・依頼先・依頼日を持つ。
-- 転居予定日・転入先の住所・保険証の切り替えなどの詳しい記録は、これまでどおり workers.followups に残す。
-- 何度実行しても安全。

-- TODOの種類に「住所・保険の手続き」を足す
alter table todos drop constraint if exists todos_kind_check;
alter table todos add constraint todos_kind_check
  check (kind in ('申請準備', '退職の随時報告書', '試験の申込', '特定技能総合保険', '住所・保険の手続き'));

alter table todo_status_options drop constraint if exists todo_status_options_kind_check;
alter table todo_status_options add constraint todo_status_options_kind_check
  check (kind in ('申請準備', '退職の随時報告書', '試験の申込', 'チェック', '特定技能総合保険', '住所・保険の手続き'));

insert into todo_status_options (kind, stage, name, sort_no) values
  ('住所・保険の手続き', '未着手', '未着手', 1),
  ('住所・保険の手続き', '進行中', '依頼中', 1),
  ('住所・保険の手続き', '完了', '完了', 1),
  ('住所・保険の手続き', '完了', 'キャンセル', 2)
on conflict (kind, name) do nothing;

-- TODOに依頼先・依頼日を持たせる（TODO ＞ 依頼中 の一覧にも出す）
alter table todos add column if not exists requested_to text not null default '';
alter table todos add column if not exists requested_on date;
comment on column todos.requested_to is '誰に依頼したか（住所・保険の手続きなど）';
comment on column todos.requested_on is '依頼日';
