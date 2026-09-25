import { describe, expect, it } from "vitest";
import { computeScore, decisionAllowsAuto } from "../../supabase/functions/_shared/pix/score";

describe("PIX settlement decision", () => {
  it("allows a strong match and holds a weak match for review", () => {
    const strong = computeScore({
      client_identified: true,
      amount_found: true,
      txid_found: true,
      name_compatible: false,
      payer_known: false,
      single_open_match: true,
      match_source: "phone",
    });
    const weak = computeScore({
      client_identified: true,
      amount_found: true,
      txid_found: false,
      name_compatible: false,
      payer_known: false,
      single_open_match: true,
      match_source: "phone",
    });

    expect(strong.score).toBe(85);
    expect(decisionAllowsAuto(strong.decision)).toBe(true);
    expect(weak.score).toBe(70);
    expect(decisionAllowsAuto(weak.decision)).toBe(false);
  });
});
