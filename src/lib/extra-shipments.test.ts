import { describe, expect, it } from "vitest";
import {
  emptyShipment,
  removeShipmentAt,
  shipmentCount,
  shipmentsOf,
  updateShipmentAt,
} from "./extra-shipments";

describe("shipmentsOf（2回目以降の郵送の記録を読む）", () => {
  it("列が未適用（undefined）や配列でない値は空として読む", () => {
    expect(shipmentsOf(undefined)).toEqual([]);
    expect(shipmentsOf(null)).toEqual([]);
    expect(shipmentsOf("x")).toEqual([]);
    expect(shipmentsOf({})).toEqual([]);
  });

  it("項目が欠けていても補って読む", () => {
    expect(shipmentsOf([{ sent_on: "2026-10-19" }, { items: "賃金台帳", tracking_no: "1234" }, null])).toEqual([
      { sent_on: "2026-10-19", items: "", tracking_no: "" },
      { sent_on: null, items: "賃金台帳", tracking_no: "1234" },
    ]);
    expect(shipmentsOf([{ sent_on: "" }])[0].sent_on).toBeNull();
  });
});

describe("updateShipmentAt / removeShipmentAt", () => {
  const list = [emptyShipment("2026-10-19"), emptyShipment("2026-10-25")];

  it("指定した行だけ直し、元の配列は変えない", () => {
    const next = updateShipmentAt(list, 1, { items: "出勤簿", tracking_no: "5678" });
    expect(next[1]).toEqual({ sent_on: "2026-10-25", items: "出勤簿", tracking_no: "5678" });
    expect(next[0]).toEqual(list[0]);
    expect(list[1].items).toBe("");
  });

  it("指定した行だけ消す", () => {
    expect(removeShipmentAt(list, 0)).toEqual([list[1]]);
    expect(removeShipmentAt(list, 5)).toEqual(list);
  });
});

describe("shipmentCount（郵送した回数）", () => {
  it("1回目（sent_on / tracking_no）と2回目以降を合わせて数える", () => {
    expect(shipmentCount({ sent_on: null, tracking_no: "" })).toBe(0);
    expect(shipmentCount({ sent_on: "2026-10-19", tracking_no: "" })).toBe(1);
    expect(shipmentCount({ sent_on: null, tracking_no: "1234" })).toBe(1);
    expect(shipmentCount({ sent_on: "2026-10-19", tracking_no: "1234", shipments: [emptyShipment(), emptyShipment()] })).toBe(3);
    expect(shipmentCount({ sent_on: null, tracking_no: "", shipments: undefined })).toBe(0);
  });
});
