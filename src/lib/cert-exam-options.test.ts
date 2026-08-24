import { describe, expect, it } from "vitest";
import {
  EXAM_LOCATION_JAPAN,
  NIHONGO_EXAM_NAME_OPTIONS,
  SENMONGAI_EXAM_NAME_OPTIONS,
} from "./cert-exam-options";

describe("cert-exam-options", () => {
  it("候補に重複が無い", () => {
    expect(new Set(NIHONGO_EXAM_NAME_OPTIONS).size).toBe(NIHONGO_EXAM_NAME_OPTIONS.length);
    expect(new Set(SENMONGAI_EXAM_NAME_OPTIONS).size).toBe(SENMONGAI_EXAM_NAME_OPTIONS.length);
  });

  it("受験地の「日本国内」は空でない", () => {
    expect(EXAM_LOCATION_JAPAN).toBe("日本国内");
  });
});
