const crypto = require("node:crypto");

const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

function getSecret() {
  const secret = process.env.APPROVAL_LINK_SECRET;
  if (!secret) throw new Error("APPROVAL_LINK_SECRET is not configured");
  return secret;
}

function sign(body) {
  return crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
}

// payload: { tid, action, email, name }
function signToken(payload, opts = {}) {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const full = {
    ...payload,
    iat: now,
    exp: now + ttl,
    jti: crypto.randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function verifyToken(token, opts = {}) {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof token !== "string") return { valid: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [body, sig] = parts;

  const expected = sign(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (typeof payload.exp !== "number" || now > payload.exp) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, payload };
}

module.exports = { signToken, verifyToken, DEFAULT_TTL_SECONDS };
