"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setPending(false);
      setError(
        signInError.message === "Invalid login credentials"
          ? "メールアドレスまたはパスワードが正しくありません"
          : `ログインに失敗しました: ${signInError.message}`,
      );
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-sm">
        <span className="mb-1 block font-bold">メールアドレス</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-border bg-background px-4"
          placeholder="you@example.com"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-bold">パスワード</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-border bg-background px-4"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-5 font-bold text-brand-foreground disabled:opacity-60"
      >
        <LogIn size={18} />
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
