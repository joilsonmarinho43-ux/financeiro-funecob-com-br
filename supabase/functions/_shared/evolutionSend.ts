import { loadOrganizationLogo } from "./logoMedia.ts";

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

function shouldRetryWithRootText(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const lower = body.toLowerCase();
  return lower.includes("\"text\"") || lower.includes("requires property") || lower.includes("property text");
}


async function postMessage(
  sendUrl: string,
  apiKey: string,
  payload: Record<string, unknown>,
  variant: string,
): Promise<EvolutionSendResult> {
  const instanceName = decodeURIComponent(sendUrl.split("/").pop() || "");
  const maskedKey = apiKey.length > 4 ? `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}` : "***";
  console.log(
    `[evolution] REQUEST variant=${variant} url=${sendUrl} instance=${instanceName} key=${maskedKey} payload=${
      JSON.stringify(payload).slice(0, 400)
    }`,
  );

  let response: Response;
  const startedAt = Date.now();
  try {
    response = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(
      `[evolution] NETWORK ERROR variant=${variant} url=${sendUrl} instance=${instanceName} error=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    throw err;
  }
  const body = await response.text();
  console.log(
    `[evolution] RESPONSE variant=${variant} url=${sendUrl} instance=${instanceName} status=${response.status} ms=${
      Date.now() - startedAt
    } body=${body.slice(0, 800)}`,
  );
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
 * The VPS runs Evolution API v1.6.0, which requires the legacy `textMessage`
 * envelope, so that contract is tried first and the v2 root `text` contract is
 * used only as a fallback when the server rejects the legacy schema.
 */
/**
 * WhatsApp só renderiza negrito quando não há espaço logo após o "*" de
 * abertura nem antes do "*" de fechamento. Nomes cadastrados com espaço
 * sobrando produziam "*Nome *" e o negrito não aparecia.
 */
export function normalizeWhatsAppBold(text: string): string {
  return (text || "").replace(/\*([^*\n]+)\*/g, (full, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed) return full;
    const leading = inner.startsWith(" ") ? " " : "";
    const trailing = inner.endsWith(" ") ? " " : "";
    return `${leading}*${trimmed}*${trailing}`;
  });
}

export async function sendEvolutionText(
  sendUrl: string,
  apiKey: string,
  number: string,
  rawText: string,
  branding?: { supabase: any; organizationId: string },
): Promise<EvolutionSendResult> {
  const text = normalizeWhatsAppBold(rawText);
  if (branding) {
    let logo: Awaited<ReturnType<typeof loadOrganizationLogo>> = null;
    try {
      const { data: org, error } = await branding.supabase.from("organizations")
        .select("name, logo_url").eq("id", branding.organizationId).maybeSingle();
      if (error) throw error;
      if (org) logo = await loadOrganizationLogo(branding.supabase, branding.organizationId, org);
    } catch (error) { console.error("[evolution] Logo unavailable; sending text", error); }
    if (logo) {
      const media = { mediatype: "image", mimetype: logo.mimetype, media: logo.base64,
        fileName: logo.mimetype === "image/png" ? "logo.png" : "logo.jpg", caption: text };
      const mediaUrl = sendUrl.replace("/message/sendText/", "/message/sendMedia/");
      const legacyMedia = await postMessage(mediaUrl, apiKey, {
        number, mediaMessage: media, options: { linkPreview: false },
      }, "v1-branded-image");
      if (legacyMedia.ok || ![400, 422].includes(legacyMedia.status) ||
        !/requires property|mediatype|mediaMessage/i.test(legacyMedia.body)) return legacyMedia;
      // Retry only a definitive schema rejection; never resend on an ambiguous outcome.
      return postMessage(mediaUrl, apiKey, { number, ...media }, "v2-branded-image");
    }
  }
  const legacy = await postMessage(sendUrl, apiKey, {
    number,
    textMessage: { text },
    options: { linkPreview: false },
  }, "v1-textMessage");

  if (legacy.ok || !shouldRetryWithRootText(legacy.status, legacy.body)) return legacy;

  return postMessage(sendUrl, apiKey, {
    number,
    text,
    linkPreview: false,
  }, "v2-text");
}
