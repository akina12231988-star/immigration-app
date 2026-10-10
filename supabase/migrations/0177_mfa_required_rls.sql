-- 二段階認証（認証アプリのワンタイムコード）をデータベース側でも必須にする。
--
-- アプリはログイン後に認証アプリのコード入力を求めるが、それだけだとパスワードを
-- 盗まれた人が Supabase の API を直接叩いてデータを読めてしまう。
-- そこで、ロール判定の my_role() を「コード入力まで済んだセッション（aal2）」でだけ
-- 返すようにし、パスワードだけのセッション（aal1）では全テーブルの RLS が閉じるようにする。
--
-- 自分の profiles 行は sel_profiles の「id = auth.uid()」で aal1 でも読めるので、
-- 認証アプリの登録画面・コード入力画面はこのまま動く。
--
-- 【適用の順序】アプリ（二段階認証の画面）を本番に出し、職員が認証アプリを登録してから
-- 適用する。先に適用すると、コード入力の画面が無いためデータが見えなくなる。
-- 何度実行しても安全（create or replace）
create or replace function my_role() returns staff_role
language sql stable security definer set search_path = public as $$
  select role from profiles
  where id = auth.uid()
    and is_active
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
