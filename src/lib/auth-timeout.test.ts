import { describe, expect, it } from "vitest";
import { AUTH_DOWN_PARAM, AUTH_TIMEOUT_MS, withAuthTimeout } from "@/lib/auth-timeout";

const later = <T>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("withAuthTimeout", () => {
  it("時間内に返れば、その結果を返す", async () => {
    await expect(withAuthTimeout(later("ok", 5), 100)).resolves.toBe("ok");
  });

  it("時間内に返らなければ null（固まらせない）", async () => {
    await expect(withAuthTimeout(later("ok", 200), 20)).resolves.toBeNull();
  });

  it("通信そのものが失敗しても null にして、例外にしない", async () => {
    await expect(withAuthTimeout(Promise.reject(new Error("network")), 100)).resolves.toBeNull();
  });

  it("待ち時間の上限は5秒（ふだんは0.1〜0.3秒で返る）", () => {
    expect(AUTH_TIMEOUT_MS).toBe(5_000);
  });

  it("ログイン画面へ渡す目印", () => {
    expect(AUTH_DOWN_PARAM).toBe("down");
  });
});
