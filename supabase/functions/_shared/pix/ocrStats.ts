// OCR provider stats: track quota exhaustion and prefer healthy providers.

export async function isProviderDisabled(supabase: any, provider: string): Promise<boolean> {
  const { data } = await supabase
    .from("ocr_provider_stats")
    .select("disabled_until")
    .eq("provider", provider)
    .maybeSingle();
  if (!data?.disabled_until) return false;
  return new Date(data.disabled_until).getTime() > Date.now();
}

export async function recordProviderSuccess(supabase: any, provider: string, elapsedMs: number): Promise<void> {
  try {
    const { data: cur } = await supabase
      .from("ocr_provider_stats").select("success_count, avg_elapsed_ms")
      .eq("provider", provider).maybeSingle();
    const success = (cur?.success_count || 0) + 1;
    const avg = cur?.avg_elapsed_ms
      ? Math.round((cur.avg_elapsed_ms * (success - 1) + elapsedMs) / success)
      : elapsedMs;
    await supabase.from("ocr_provider_stats").upsert({
      provider,
      success_count: success,
      avg_elapsed_ms: avg,
      last_success_at: new Date().toISOString(),
      disabled_until: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider" });
  } catch (e) {
    console.warn("[ocrStats] success record failed", String((e as any)?.message || e));
  }
}

export async function recordProviderFailure(
  supabase: any,
  provider: string,
  err: any,
): Promise<void> {
  try {
    const msg = String(err?.message || err || "").slice(0, 500);
    const is402 = /402|payment_required|not enough credits|insufficient/i.test(msg);
    const is429 = /429|rate.?limit|quota/i.test(msg);
    const disable = is402 || is429;
    const { data: cur } = await supabase
      .from("ocr_provider_stats").select("fail_count").eq("provider", provider).maybeSingle();
    await supabase.from("ocr_provider_stats").upsert({
      provider,
      fail_count: (cur?.fail_count || 0) + 1,
      last_fail_at: new Date().toISOString(),
      last_error: msg,
      last_402_at: is402 ? new Date().toISOString() : undefined,
      disabled_until: disable ? new Date(Date.now() + 10 * 60_000).toISOString() : undefined,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider" });
  } catch (e) {
    console.warn("[ocrStats] failure record failed", String((e as any)?.message || e));
  }
}
