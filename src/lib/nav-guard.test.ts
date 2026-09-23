import { describe, expect, it, vi } from "vitest";
import { checkNavGuard, isInternalNavigation, setNavGuard } from "./nav-guard";

const here = { origin: "https://app.example.com", pathname: "/organizations/1", search: "" };
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const a = (href: string, target = "", download = false) => ({
  href,
  target,
  hasAttribute: (name: string) => name === "download" && download,
});

describe("isInternalNavigation", () => {
  it("サイト内の別の画面へのリンクは確認の対象", () => {
    expect(isInternalNavigation(a("https://app.example.com/workers"), here, click)).toBe(true);
    expect(isInternalNavigation(a("https://app.example.com/organizations/1?tab=x"), here, click)).toBe(true);
  });
  it("外のサイトへのリンクも確認の対象", () => {
    expect(isInternalNavigation(a("https://other.example.com/"), here, click)).toBe(true);
  });
  it("同じページ内（#だけ違う）・新しいタブ・ダウンロード・修飾キーつきは対象外", () => {
    expect(isInternalNavigation(a("https://app.example.com/organizations/1#council"), here, click)).toBe(false);
    expect(isInternalNavigation(a("https://app.example.com/print", "_blank"), here, click)).toBe(false);
    expect(isInternalNavigation(a("https://app.example.com/file.pdf", "", true), here, click)).toBe(false);
    expect(isInternalNavigation(a("https://app.example.com/workers"), here, { ...click, ctrlKey: true })).toBe(false);
    expect(isInternalNavigation(a("https://app.example.com/workers"), here, { ...click, button: 1 })).toBe(false);
  });
});

describe("checkNavGuard", () => {
  it("確認が登録されていなければそのまま移動してよい", () => {
    setNavGuard(null);
    expect(checkNavGuard(() => {})).toBe(true);
  });
  it("確認が必要なときは移動を止めて、続きの処理を預ける", () => {
    const guard = vi.fn(() => true);
    setNavGuard(guard);
    const proceed = () => {};
    expect(checkNavGuard(proceed)).toBe(false);
    expect(guard).toHaveBeenCalledWith(proceed);
    setNavGuard(() => false);
    expect(checkNavGuard(proceed)).toBe(true);
    setNavGuard(null);
  });
});
