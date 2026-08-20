-- 賃金の記録に「参考様式第1-6号 別紙1（賃金の支払）」の内容を持たせる。
--
-- 賃金を入れるときに、どういう内容で1-6号別紙を作成したか（諸手当・固定残業代・
-- 控除する項目＝所得税/社会保険料/雇用保険料/食費/居住費/水道光熱費/その他）を
-- 一緒に残しておくと、あとから「この人の手取りはいくらで出したか」を再現できる。
--
-- 項目がこれからも増えるため、1列の jsonb にまとめて持つ（{} は未入力）。
-- 中身の形は src/types/db.ts の WageDetail、計算は src/lib/wage-calc.ts を参照。
alter table worker_wages
  add column if not exists detail jsonb not null default '{}'::jsonb;

comment on column worker_wages.detail is
  '1-6号別紙（賃金の支払）の内容。諸手当・控除項目・税と社保の前提など。{} = 未入力';
