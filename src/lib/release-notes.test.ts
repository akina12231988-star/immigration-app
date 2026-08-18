import { describe, expect, it } from "vitest";
import {
  LATEST_RELEASE_DATE,
  RELEASE_NOTES,
  unreadReleaseNotes,
} from "./release-notes";

describe("release-notes", () => {
  it("新しい順に並んでいる", () => {
    const dates = RELEASE_NOTES.map((n) => n.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(LATEST_RELEASE_DATE).toBe(dates[0]);
  });

  it("どのお知らせにも「場所」と中身がある", () => {
    for (const n of RELEASE_NOTES) {
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.where.length).toBeGreaterThan(0);
      expect(n.items.length).toBeGreaterThan(0);
    }
  });

  it("最後に読んだ日より後のものが未読になる", () => {
    expect(unreadReleaseNotes(LATEST_RELEASE_DATE)).toHaveLength(0);
    expect(unreadReleaseNotes("2000-01-01")).toHaveLength(RELEASE_NOTES.length);
  });

  it("一度も読んでいない端末では、最新の日付の分だけを未読にする", () => {
    const unread = unreadReleaseNotes("");
    expect(unread.length).toBeGreaterThan(0);
    expect(unread.every((n) => n.date === LATEST_RELEASE_DATE)).toBe(true);
  });
});
