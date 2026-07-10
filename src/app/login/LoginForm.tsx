"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setError(json.error || "ログインに失敗しました");
        setSubmitting(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("通信に失敗しました。もう一度お試しください");
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm bg-surface p-6 text-foreground">
      <p className="mb-5 text-center text-sm text-muted">
        社内共通のログインID・パスワードを入力してください
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-muted">
            ログインID
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-muted">
            パスワード
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base focus:border-brand focus:outline-none"
          />
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-seal/10 px-3 py-2 text-xs font-bold text-seal">
            <TriangleAlert size={15} className="shrink-0" />
            {error}
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          disabled={submitting || !username || !password}
        >
          {submitting ? "ログインしています…" : "ログイン"}
        </Button>
      </form>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
        <ShieldCheck size={14} />
        社内関係者のみご利用いただけます
      </p>
    </Card>
  );
}
