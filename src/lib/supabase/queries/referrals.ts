import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferralFee, ReferralFeeInput } from "@/types/db";

// ---- 人材紹介（あっせん）手数料の台帳（referral_fees） ----

// 一覧（外国人の在留許可日・在留資格、所属機関名つき）。紹介手数料台帳で使う
export interface ReferralFeeWithRefs extends ReferralFee {
  workers: {
    name: string;
    residence_permit_date: string | null;
    residence_status: string;
  } | null;
  organizations: { name: string } | null;
}

export async function listReferralFees(
  supabase: SupabaseClient,
): Promise<ReferralFeeWithRefs[]> {
  const { data, error } = await supabase
    .from("referral_fees")
    .select("*, workers(name, residence_permit_date, residence_status), organizations(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ReferralFeeWithRefs[]) ?? [];
}

export async function insertReferralFee(
  supabase: SupabaseClient,
  input: ReferralFeeInput,
): Promise<ReferralFee> {
  const { data, error } = await supabase
    .from("referral_fees")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ReferralFee;
}

export async function updateReferralFee(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ReferralFeeInput>,
): Promise<void> {
  const { error } = await supabase.from("referral_fees").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteReferralFee(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("referral_fees").delete().eq("id", id);
  if (error) throw error;
}
