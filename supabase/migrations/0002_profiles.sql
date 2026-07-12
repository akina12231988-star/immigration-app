-- docs/03_database_design.md §4.1: 職員（ログインユーザー）と権限

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  role         staff_role not null default 'viewer',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated before update on profiles
  for each row execute procedure moddatetime(updated_at);

-- auth.users 作成時に profiles 行を自動生成する（初期ロールは viewer。昇格は admin が行う）
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ログイン中ユーザーのロールを返す（無効化済み・未ログインなら null）。
-- security definer のため profiles の RLS を経由せず参照でき、ポリシー内で安全に呼べる
create function my_role() returns staff_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active;
$$;
