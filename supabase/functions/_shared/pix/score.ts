// PIX confidence score engine (0–100).
// Consumed by pix-ocr-settlement to decide auto/review.
//
// Point rubric (per spec):
//   client_identified : +35
//   amount_found      : +25
//   txid_found        : +15
//   name_compatible   : +10
//   payer_known       : +10   (trusted_payers)
//   single_open_match : +5
//   phone_match_bonus : +5    (extra confidence when phone is the match source)
//
// Cap = 100. Decision thresholds:
//   >=95  auto  (auto_high)
//   80-94 auto  (auto_ok, logged)
//   60-79 pendente_revisao (review_recommended)
//   <60   pendente_revisao (review_required)

export type ScoreInputs = {
  client_identified: boolean;
  amount_found: boolean;
  txid_found: boolean;
  name_compatible: boolean;
  payer_known: boolean;
  single_open_match: boolean;
  match_source?: "phone" | "lid_map" | "cpf" | "fuzzy_name" | "trusted_payer" | null;
};

export type ScoreResult = {
  score: number;
  breakdown: Record<string, number>;
  decision: "auto_high" | "auto_ok" | "review_recommended" | "review_required";
};

export function computeScore(x: ScoreInputs): ScoreResult {
  const b: Record<string, number> = {};
  if (x.client_identified) b.client_identified = 35;
  if (x.amount_found) b.amount_found = 25;
  if (x.txid_found) b.txid_found = 15;
  if (x.name_compatible) b.name_compatible = 10;
  if (x.payer_known) b.payer_known = 10;
  if (x.single_open_match) b.single_open_match = 5;
  if (x.match_source === "phone" || x.match_source === "lid_map") b.phone_match_bonus = 5;

  const raw = Object.values(b).reduce((s, v) => s + v, 0);
  const score = Math.min(100, raw);
  let decision: ScoreResult["decision"];
  if (score >= 95) decision = "auto_high";
  else if (score >= 80) decision = "auto_ok";
  else if (score >= 60) decision = "review_recommended";
  else decision = "review_required";
  return { score, breakdown: b, decision };
}

export function decisionAllowsAuto(d: ScoreResult["decision"]): boolean {
  return d === "auto_high" || d === "auto_ok";
}
