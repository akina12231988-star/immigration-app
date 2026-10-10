import { describe, expect, it } from "vitest";
import { inviteErrorMessage } from "@/lib/invite-error";

describe("職員の招待の失敗メッセージ", () => {
  it("登録済みのメールアドレスは、職員一覧と Supabase での直し方を案内する", () => {
    const msg = inviteErrorMessage("A user with this email address has already been registered");
    expect(msg).toMatch(/すでに登録されています/);
    expect(msg).toMatch(/Send password recovery/);
  });

  it("形式ちがい・送りすぎは短く言い換える", () => {
    expect(inviteErrorMessage("Unable to validate email address: invalid format")).toBe("メールアドレスの形式が正しくありません");
    expect(inviteErrorMessage("email rate limit exceeded")).toMatch(/送りすぎました/);
  });

  it("それ以外は元の文を添える。空なら既定の文だけ", () => {
    expect(inviteErrorMessage("network error")).toBe("招待に失敗しました: network error");
    expect(inviteErrorMessage(undefined)).toBe("招待に失敗しました");
  });
});
