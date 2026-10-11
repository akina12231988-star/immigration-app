"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildStaffNameMap, staffNameOf, type StaffNameSource } from "@/lib/staff-name";

// 職員のメールアドレス → 名前の対応を読み込み、記録の記入者を名前で出すための関数を返す。
// 読み込み前・読み込めないとき（閲覧のみの職員は他人のプロフィールを見られない）は記入者をそのまま出す
export function useStaffNames(): (author: string | null | undefined) => string {
  const [map, setMap] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("profiles")
      .select("display_name, email")
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMap(buildStaffNameMap(data as StaffNameSource[]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (author) => staffNameOf(author, map);
}
