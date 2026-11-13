"use client";

import { createContext, useContext, useEffect, useRef } from "react";

// 所属機関の画面の「編集」「編集した内容を保存」を、別に保存している欄（２号の指導体制など）にも効かせる。
// 欄の側は useOrgEditSection で、編集中か・変更があるか・保存のしかた・元に戻し方を渡す。
// 画面の上の「編集した内容を保存」で、その欄もいっしょに保存される（編集ボタンは画面に1つだけ）

export interface OrgEditSection {
  dirty: boolean;
  save: () => Promise<boolean>; // 保存できたら true
  reset: () => void; // 保存せずに元に戻す
}

interface OrgEditContextValue {
  editing: boolean;
  register: (key: string, section: OrgEditSection | null) => void;
}

export const OrgEditContext = createContext<OrgEditContextValue | null>(null);

// 欄の側で使う。画面の外（Provider が無いところ）で使ったときは null を返す
export function useOrgEditSection(key: string, section: OrgEditSection): { editing: boolean } | null {
  const ctx = useContext(OrgEditContext);
  const latest = useRef(section);
  useEffect(() => {
    latest.current = section;
  });
  const register = ctx?.register;
  const dirty = section.dirty;
  useEffect(() => {
    if (!register) return;
    register(key, {
      dirty,
      save: () => latest.current.save(),
      reset: () => latest.current.reset(),
    });
  }, [register, key, dirty]);
  useEffect(() => {
    if (!register) return;
    return () => register(key, null);
  }, [register, key]);
  return ctx ? { editing: ctx.editing } : null;
}
