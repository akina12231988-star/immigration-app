import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeQuoteRow, type QuoteEvent, type QuoteItem, type QuoteRow } from "@/lib/quote";

// 見積書（0235_quotes.sql）

export async function listQuotes(supabase: SupabaseClient, organizationId?: string): Promise<QuoteRow[]> {
  let q = supabase.from("quotes").select("*").order("updated_at", { ascending: false });
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(normalizeQuoteRow);
}

export async function getQuote(supabase: SupabaseClient, id: string): Promise<QuoteRow | null> {
  const { data, error } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizeQuoteRow(data as Record<string, unknown>) : null;
}

export interface QuoteInput {
  organization_id: string | null;
  addressee_name: string;
  addressee_person: string;
  addressee_address: string;
  issued_on: string | null;
  number: string;
  subject: string;
  items: QuoteItem[];
  notes: string;
  show_stamp_table: boolean;
  status: string;
}

export async function insertQuote(supabase: SupabaseClient, input: QuoteInput): Promise<QuoteRow> {
  const { data, error } = await supabase.from("quotes").insert(input).select("*").single();
  if (error) throw error;
  return normalizeQuoteRow(data as Record<string, unknown>);
}

export async function updateQuote(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<QuoteInput> & { events?: QuoteEvent[] },
): Promise<void> {
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteQuote(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw error;
}
