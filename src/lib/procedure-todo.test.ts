import { describe, expect, it } from "vitest";
import { EMPTY_FOLLOWUPS, type WorkerFollowups } from "./worker-followups";
import {
  latestProcedureTodos,
  procedureDraftsFromFollowups,
  syncFollowupsWithTodos,
  type ProcedureTodo,
} from "./procedure-todo";

const fu = (p: { moving?: Partial<WorkerFollowups["moving"]>; kokuho?: Partial<WorkerFollowups["kokuho"]> }): WorkerFollowups => ({
  moving: { ...EMPTY_FOLLOWUPS.moving, ...p.moving },
  kokuho: { ...EMPTY_FOLLOWUPS.kokuho, ...p.kokuho },
});
const todo = (title: string, status: string, extra: Partial<ProcedureTodo> = {}): ProcedureTodo => ({
  id: title, todo_no: "TODO-1", title, status, note: "", requested_to: "", requested_on: null, deleted_at: null, created_at: "2026-11-08", ...extra,
});

describe("procedureDraftsFromFollowups（これまでのチェックからTODOを作る）", () => {
  it("転居の必要あり → 転出手続き。依頼先があれば依頼中", () => {
    const d = procedureDraftsFromFollowups(fu({ moving: { needed: true, requested_to: "NGAさん" } }), {});
    expect(d).toEqual([{ key: "moveOut", status: "依頼中", requested_to: "NGAさん", requested_on: null }]);
  });
  it("転出証明書が届いていれば転出は完了・転入手続きも作る", () => {
    const d = procedureDraftsFromFollowups(fu({ moving: { needed: true, certificate_received_on: "2026-09-20" } }), {});
    expect(d.map((x) => [x.key, x.status])).toEqual([["moveOut", "完了"], ["moveIn", "未着手"]]);
  });
  it("国保・国民年金の加入が必要 → 2つ。済んでいる方は完了", () => {
    const d = procedureDraftsFromFollowups(fu({ kokuho: { needed: true, nenkin_done: true } }), {});
    expect(d.map((x) => [x.key, x.status])).toEqual([["kokuho", "未着手"], ["nenkin", "完了"]]);
  });
  it("すでにTODOがある手続きは作らない・チェックが無ければ何も作らない", () => {
    expect(procedureDraftsFromFollowups(fu({ moving: { needed: true } }), { moveOut: {} })).toEqual([]);
    expect(procedureDraftsFromFollowups(fu({}), {})).toEqual([]);
  });
});

describe("syncFollowupsWithTodos（TODOの経過から外国人一覧の印を合わせる）", () => {
  it("転出が完了でも転入が残っていれば転居は残る。転入も完了したら外れる", () => {
    const base = fu({ moving: { needed: true } });
    const a = syncFollowupsWithTodos(base, latestProcedureTodos([todo("転出手続き", "完了"), todo("転入手続き", "依頼中", { requested_to: "本人" })]));
    expect(a?.moving.needed).toBe(true);
    expect(a?.moving.movein_requested_to).toBe("本人");
    const b = syncFollowupsWithTodos(base, latestProcedureTodos([todo("転出手続き", "完了"), todo("転入手続き", "完了")]));
    expect(b?.moving.needed).toBe(false);
    expect(b?.moving.status).toBe("完了");
  });
  it("転出をキャンセルしたら転居は外れる", () => {
    const r = syncFollowupsWithTodos(fu({ moving: { needed: true } }), latestProcedureTodos([todo("転出手続き", "キャンセル")]));
    expect(r?.moving.needed).toBe(false);
  });
  it("国保・年金は両方済んだら外れ、片方残れば残る", () => {
    const base = fu({ kokuho: { needed: true } });
    expect(syncFollowupsWithTodos(base, latestProcedureTodos([todo("国民健康保険の加入手続き", "完了"), todo("国民年金の加入手続き", "未着手")]))?.kokuho).toMatchObject({ needed: true, kokuho_done: true, nenkin_done: false });
    expect(syncFollowupsWithTodos(base, latestProcedureTodos([todo("国民健康保険の加入手続き", "完了"), todo("国民年金の加入手続き", "キャンセル")]))?.kokuho.needed).toBe(false);
  });
  it("変わらなければ null", () => {
    expect(syncFollowupsWithTodos(fu({}), {})).toBeNull();
  });
});
