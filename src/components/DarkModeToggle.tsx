"use client";

import { useEffect, useState } from "react";

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  // 初期描画時にhead内スクリプトが設定したクラスと状態を一致させる（SSRでは判定不可なため必須）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label="ダークモード切替"
      className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-lg"
    >
      {isDark ? "🌙" : "☀️"}
    </button>
  );
}
