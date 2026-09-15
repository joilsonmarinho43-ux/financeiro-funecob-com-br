import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeScore, decisionAllowsAuto } from "./score.ts";

test("auto settlement requires strong identity and transaction identity", () => {
  const result = computeScore({
    client_identified: true,
    amount_found: true,
    txid_found: true,
    name_compatible: true,
    payer_known: true,
    single_open_match: true,
    match_source: "phone",
  });
  assertEquals(result.decision, "auto_high");
  assertEquals(decisionAllowsAuto(result.decision), true);
});

test("amount/name score cannot authorize without transaction identity", () => {
  const result = computeScore({
    client_identified: true,
    amount_found: true,
    txid_found: false,
    name_compatible: true,
    payer_known: true,
    single_open_match: true,
    match_source: "phone",
  });
  assertEquals(decisionAllowsAuto(result.decision), false);
});

test("fuzzy-name identity alone cannot authorize automatic settlement", () => {
  const result = computeScore({
    client_identified: true,
    amount_found: true,
    txid_found: true,
    name_compatible: true,
    payer_known: false,
    single_open_match: true,
    match_source: "fuzzy_name",
  });
  assertEquals(decisionAllowsAuto(result.decision), false);
});
