// ログインセッションの発行・検証。
// Next.jsのmiddleware（Edgeランタイム）でも使えるよう、Node専用APIではなく
// Web Crypto (crypto.subtle) のみを使って実装する。

const encoder = new TextEncoder();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日間ログイン状態を保持

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  arr.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const withPadding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const str = atob(withPadding);
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
}

export async function createSessionToken(
  username: string,
  secret: string
): Promise<string> {
  const payload = JSON.stringify({
    u: username,
    exp: Date.now() + SESSION_TTL_MS,
  });
  const payloadB64 = base64url(encoder.encode(payload));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64url(sig)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<{ username: string } | null> {
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  const key = await getKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlDecode(sigB64) as BufferSource,
    encoder.encode(payloadB64)
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(payloadB64))
    );
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return null;
    }
    return { username: payload.u };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "immigration_app_session";
