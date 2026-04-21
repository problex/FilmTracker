import type { CorsOptions } from "cors";

function parseExplicitOrigins(): string[] {
  const raw = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isPrivateNetworkOrigin(origin: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (parseExplicitOrigins().includes(origin)) {
    callback(null, true);
    return;
  }
  if (process.env.ALLOW_LAN_ORIGINS !== "false" && isPrivateNetworkOrigin(origin)) {
    callback(null, true);
    return;
  }
  callback(null, false);
}

export function buildCorsOptions(): CorsOptions {
  return { origin: corsOriginCallback };
}
