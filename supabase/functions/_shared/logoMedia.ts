import { SOL_DA_VIDA_LOGO_BASE64 } from "./solDaVidaLogo.ts";
import { SOL_DA_VIDA_LOGO, isSolDaVida } from "./organizationBranding.ts";

export function logoStoragePath(url: string, organizationId: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/^\/storage\/v1\/object\/public\/logos\/(.+)$/);
    if (!match) return null;
    const path = decodeURIComponent(match[1]);
    const parts = path.split("/");
    return parts.length === 2 && parts[0] === organizationId && /^[a-zA-Z0-9_.-]+\.(png|jpe?g|webp)$/i.test(parts[1]) ? path : null;
  } catch { return null; }
}

export async function loadOrganizationLogo(supabase: any, organizationId: string, org: { name?: string; logo_url?: string | null }) {
  if (!org?.logo_url) return null;
  if (org.logo_url === SOL_DA_VIDA_LOGO && isSolDaVida(org.name)) {
    return { base64: SOL_DA_VIDA_LOGO_BASE64, mimetype: "image/png", bytes: Uint8Array.from(atob(SOL_DA_VIDA_LOGO_BASE64), c => c.charCodeAt(0)) };
  }
  const path = logoStoragePath(org.logo_url, organizationId);
  if (!path) return null;
  // Download from the trusted Storage client, never from the user supplied host.
  const { data, error } = await supabase.storage.from("logos").download(path);
  if (error || !data || data.size > 2 * 1024 * 1024) throw new Error("Logo indisponível ou maior que 2 MB");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const mimetype = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : null;
  if (!mimetype) throw new Error("Formato da logo inválido; use PNG ou JPG");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { bytes, mimetype, base64: btoa(binary) };
}
