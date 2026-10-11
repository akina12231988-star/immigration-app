import { describe, expect, it } from "vitest";
import { decodeJwtPayload, lastAuthAt, mustReLogin, weekStartJst } from "./session-week";

// 日本時間の日時を Date にする
const jst = (s: string) => new Date(`${s}+09:00`);

describe("weekStartJst", () => {
  it("水曜日なら同じ週の月曜 0:00（日本時間）", () => {
    expect(weekStartJst(jst("2026-10-14T15:30:00")).toISOString()).toBe(jst("2026-10-12T00:00:00").toISOString());
  });

  it("月曜 0:00 ちょうどはその時刻、月曜の直前（日曜 23:59）は前の週の月曜", () => {
    expect(weekStartJst(jst("2026-10-12T00:00:00")).toISOString()).toBe(jst("2026-10-12T00:00:00").toISOString());
    expect(weekStartJst(jst("2026-10-11T23:59:59")).toISOString()).toBe(jst("2026-10-05T00:00:00").toISOString());
  });

  it("日曜日は前の月曜（UTC では土曜でも日本時間で判断する）", () => {
    // 日本時間の日曜 07:00 = UTC の土曜 22:00
    expect(weekStartJst(jst("2026-10-18T07:00:00")).toISOString()).toBe(jst("2026-10-12T00:00:00").toISOString());
  });
});

describe("decodeJwtPayload", () => {
  const payload = { sub: "u1", amr: [{ method: "password", timestamp: 1760000000 }], 名前: "テスト" };
  const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(payload))}.sig`;

  it("base64url の本文を読める（日本語も）", () => {
    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it("壊れたトークン・空は null", () => {
    expect(decodeJwtPayload("abc")).toBeNull();
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
    expect(decodeJwtPayload(null)).toBeNull();
  });
});

describe("lastAuthAt", () => {
  it("amr のいちばん新しい時刻を使う", () => {
    const claims = { amr: [{ method: "password", timestamp: 1760000000 }, { method: "totp", timestamp: 1760000300 }] };
    expect(lastAuthAt(claims, "2020-01-01T00:00:00Z")?.toISOString()).toBe(new Date(1760000300 * 1000).toISOString());
  });

  it("amr が無ければ last_sign_in_at、それも無ければ null", () => {
    expect(lastAuthAt({}, "2026-10-10T01:02:03Z")?.toISOString()).toBe("2026-10-10T01:02:03.000Z");
    expect(lastAuthAt(null, null)).toBeNull();
    expect(lastAuthAt({ amr: "x" }, "not a date")).toBeNull();
  });
});

describe("mustReLogin", () => {
  const now = jst("2026-10-14T09:00:00"); // 水曜

  it("今週の月曜 0時より前のログインなら true", () => {
    expect(mustReLogin(jst("2026-10-11T23:00:00"), now)).toBe(true); // 日曜の夜にログイン
    expect(mustReLogin(jst("2026-10-05T09:00:00"), now)).toBe(true);
  });

  it("今週の月曜 0時以降のログインなら false", () => {
    expect(mustReLogin(jst("2026-10-12T00:00:00"), now)).toBe(false);
    expect(mustReLogin(jst("2026-10-13T18:00:00"), now)).toBe(false);
  });

  it("いつログインしたか分からなければ追い出さない", () => {
    expect(mustReLogin(null, now)).toBe(false);
  });
});
