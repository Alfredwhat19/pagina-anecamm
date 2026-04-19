const ADMIN_USERNAME = "Admin";
const ADMIN_PASSWORD = "A14What*";
const ADMIN_COOKIE_NAME = "anecamm_admin_session";
const ADMIN_SESSION_SECRET = "anecamm-admin-session-v1";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;

const encoder = new TextEncoder();

export const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
    ...init,
  });

const toBase64Url = (value) =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const fromBase64Url = (value) => {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(`${normalized}${padding}`);
};

const sign = async (value) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ADMIN_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const bytes = new Uint8Array(signature);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return toBase64Url(binary);
};

const parseCookieHeader = (cookieHeader) =>
  String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return acc;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      acc[key] = value;
      return acc;
    }, {});

export const getAdminSession = async (request) => {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const rawToken = cookies[ADMIN_COOKIE_NAME];
  if (!rawToken) return null;

  const [payloadPart, signaturePart] = rawToken.split(".");
  if (!payloadPart || !signaturePart) return null;

  const expectedSignature = await sign(payloadPart);
  if (expectedSignature !== signaturePart) return null;

  try {
    const payload = JSON.parse(fromBase64Url(payloadPart));
    if (
      payload?.u !== ADMIN_USERNAME ||
      !Number.isFinite(payload?.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

export const requireAdminSession = async (request) => {
  const session = await getAdminSession(request);
  if (!session) {
    return {
      ok: false,
      response: json(
        { ok: false, error: "Sesion de administrador no valida o expirada." },
        { status: 401 }
      ),
    };
  }

  return { ok: true, session };
};

export const validateAdminCredentials = (username, password) =>
  String(username || "").trim() === ADMIN_USERNAME &&
  String(password || "") === ADMIN_PASSWORD;

const shouldUseSecureCookie = (request) => {
  try {
    const url = new URL(request.url);
    return url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return true;
  }
};

export const createAdminSessionCookie = async (request) => {
  const payload = {
    u: ADMIN_USERNAME,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE,
  };
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signature = await sign(payloadPart);
  const cookieValue = `${payloadPart}.${signature}`;
  const secureFlag = shouldUseSecureCookie(request) ? "; Secure" : "";

  return `${ADMIN_COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${ADMIN_SESSION_MAX_AGE}`;
};

export const clearAdminSessionCookie = (request) => {
  const secureFlag = shouldUseSecureCookie(request) ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=0`;
};
