-- 労働者名簿の「雇用開始年月日（入社年月日）」を名簿ごとに持てるようにする（0054 の追加）。
--
-- これまでは外国人の登録データ（所属機関別の雇用開始日）をそのまま出していたが、
-- 名簿の画面で直したり、空欄のまま印刷したりできるようにする。
--   null … 未設定（これまでどおり登録データの日付を出す）
--   ''   … 空欄のまま（何も出さずに印刷する）
--   文字 … 画面で入れた表示文字（例: 2026年7月31日）
-- 何度実行しても安全（add column if not exists）。
alter table worker_rosters
  add column if not exists employment_start text;
comment on column worker_rosters.employment_start is '雇用開始年月日の表示文字（null は登録データから自動、空文字は空欄）';
