import { describe, expect, it } from "vitest";
import { EMPTY_FOLLOWUPS, type WorkerFollowups } from "./worker-followups";
import {
  NEW_STEP,
  normalizeProcedureSteps,
  procedureOverallStatus,
  procedureStepsFromFollowups,
  procedureStepsSummary,
  syncFollowupsWithTodos,
  type ProcedureStep,
} from "./procedure-todo";

const fu = (p: { moving?: Partial<WorkerFollowups["moving"]>; kokuho?: Partial<WorkerFollowups["kokuho"]> }): WorkerFollowups => ({
  moving: { ...EMPTY_FOLLOWUPS.moving, ...p.moving },
  kokuho: { ...EMPTY_FOLLOWUPS.kokuho, ...p.kokuho },
});
const st = (status: string, extra: Partial<ProcedureStep> = {}): ProcedureStep => ({ ...NEW_STEP, status, ...extra });

describe("procedureStepsFromFollowups（これまでのチェックからTODOの中の手続きを作る）", () => {
  it("転居の必要あり → 転出手続き。依頼先があれば依頼中", () => {
    expect(procedureStepsFromFollowups(fu({ moving: { needed: true, requested_to: "NGAさん" } }), {})).toEqual({
      moveOut: { status: "依頼中", requested_to: "NGAさん", requested_on: null, note: "" },
    });
  });
  it("転出証明書が届いていれば転出は完了・転入手続きも足す", () => {
    const r = procedureStepsFromFollowups(fu({ moving: { needed: true, certificate_received_on: "2026-09-20" } }), {});
    expect(r.moveOut?.status).toBe("完了");
    expect(r.moveIn?.status).toBe("未着手");
  });
  it("国保・国民年金の加入が必要 → 2つ。済んでいる方は完了", () => {
    const r = procedureStepsFromFollowups(fu({ kokuho: { needed: true, nenkin_done: true } }), {});
    expect([r.kokuho?.status, r.nenkin?.status]).toEqual(["未着手", "完了"]);
  });
  it("すでにある手続きは足さない・チェックが無ければ何も足さない", () => {
    expect(procedureStepsFromFollowups(fu({ moving: { needed: true } }), { moveOut: st("依頼中") })).toEqual({});
    expect(procedureStepsFromFollowups(fu({}), {})).toEqual({});
  });
});

describe("procedureOverallStatus（TODOの経過は中の手続きから決める）", () => {
  it("依頼中があれば依頼中、未着手があれば未着手、全部終われば完了", () => {
    expect(procedureOverallStatus({})).toBe("未着手");
    expect(procedureOverallStatus({ moveOut: st("完了"), moveIn: st("依頼中") })).toBe("依頼中");
    expect(procedureOverallStatus({ moveOut: st("完了"), kokuho: st("未着手") })).toBe("未着手");
    expect(procedureOverallStatus({ moveOut: st("完了"), nenkin: st("キャンセル") })).toBe("完了");
    expect(procedureOverallStatus({ nenkin: st("キャンセル") })).toBe("キャンセル");
  });
});

describe("normalizeProcedureSteps・procedureStepsSummary", () => {
  it("知らない手続き・値は捨てる", () => {
    const r = normalizeProcedureSteps({ moveOut: { status: "完了", requested_to: "本人" }, other: {}, kokuho: { status: "x" } });
    expect(r.moveOut).toEqual({ status: "完了", requested_to: "本人", requested_on: null, note: "" });
    expect(r.kokuho?.status).toBe("未着手");
    expect(normalizeProcedureSteps(null)).toEqual({});
  });
  it("TODO一覧の要約は転出・転入・国保・年金の順", () => {
    expect(procedureStepsSummary({ nenkin: st("未着手"), moveOut: st("完了") }).map((x) => x.label)).toEqual(["転出", "年金"]);
  });
});

describe("syncFollowupsWithTodos（手続きの経過から外国人一覧の印を合わせる）", () => {
  it("転出が完了でも転入が残っていれば転居は残る。転入も完了したら外れる", () => {
    const base = fu({ moving: { needed: true } });
    const a = syncFollowupsWithTodos(base, { moveOut: st("完了"), moveIn: st("依頼中", { requested_to: "本人" }) });
    expect(a?.moving.needed).toBe(true);
    expect(a?.moving.movein_requested_to).toBe("本人");
    const b = syncFollowupsWithTodos(base, { moveOut: st("完了"), moveIn: st("完了") });
    expect(b?.moving.needed).toBe(false);
    expect(b?.moving.status).toBe("完了");
  });
  it("転出をキャンセルしたら転居は外れる", () => {
    expect(syncFollowupsWithTodos(fu({ moving: { needed: true } }), { moveOut: st("キャンセル") })?.moving.needed).toBe(false);
  });
  it("国保・年金は両方済んだら外れ、片方残れば残る", () => {
    const base = fu({ kokuho: { needed: true } });
    expect(syncFollowupsWithTodos(base, { kokuho: st("完了"), nenkin: st("未着手") })?.kokuho).toMatchObject({ needed: true, kokuho_done: true, nenkin_done: false });
    expect(syncFollowupsWithTodos(base, { kokuho: st("完了"), nenkin: st("キャンセル") })?.kokuho.needed).toBe(false);
  });
  it("変わらなければ null", () => {
    expect(syncFollowupsWithTodos(fu({}), {})).toBeNull();
  });
});
