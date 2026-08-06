export interface EvolutionSendResult {
  ok: boolean;
  status: number;
  body: string;
  messageId: string | null;
}

function extractMessageId(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const id = extractMessageId(item);
      if (id) return id;
    }
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, any>;
  const candidates = [
    value.key?.id,
    value.message?.key?.id,
    value.data?.key?.id,
    value.data?.message?.key?.id,
    value.id,
  ];
  return candidates.find((candidate) => typeof candidate === "string" && candidate.trim()) || null;
}

function shouldRetryWithTextMessage(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const lower = body.toLowerCase();
  return lower.includes("textmessage") || lower.includes("requires property");
}

async function postMessage(
  sendUrl: string,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<EvolutionSendResult> {
  const response = await fetch(sendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    // A non-JSON response cannot prove that Evolution accepted the message.
  }
  const messageId = extractMessageId(parsed);
  const providerStatus = parsed && typeof parsed === "object"
    ? String((parsed as Record<string, any>).status || (parsed as Record<string, any>).data?.status || "").toUpperCase()
    : "";

  return {
    ok: response.ok && Boolean(messageId) && providerStatus !== "ERROR",
    status: response.status,
    body,
    messageId,
  };
}

/**
 * Supports both Evolution API sendText contracts found in deployed versions.
 * It starts with the current root `text` contract and retries with the legacy
 * `textMessage` envelope only when the server explicitly requests it.
 */
export async function sendEvolutionText(
  sendUrl: string,
  apiKey: string,
  number: string,
  text: string,
): Promise<EvolutionSendResult> {
  const current = await postMessage(sendUrl, apiKey, {
    number,
    text,
    linkPreview: false,
  });
  if (current.ok || !shouldRetryWithTextMessage(current.status, current.body)) return current;

  return postMessage(sendUrl, apiKey, {
    number,
    textMessage: { text },
    options: { linkPreview: false },
  });
}