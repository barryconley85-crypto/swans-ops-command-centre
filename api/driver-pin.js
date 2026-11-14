import { randomBytes, randomInt, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from "jose";

const projectId = "swans-ops-command-centre";
const base = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents";
const secureTokenKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const scrypt = promisify(scryptCallback);
const decode = fields => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, value.stringValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.doubleValue !== undefined ? Number(value.doubleValue) : value.booleanValue ?? null)]));

async function tokenFor(serviceAccount) {
  const key = await importPKCS8(serviceAccount.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error("Firebase service authentication failed.");
  return (await response.json()).access_token;
}

async function readDoc(token, path) {
  const response = await fetch(base + "/" + path, { headers: { Authorization: "Bearer " + token } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not verify the driver.");
  return decode((await response.json()).fields);
}

async function requireManager(req, serviceToken) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const idToken = authorization.slice(7);
  const verified = await jwtVerify(idToken, secureTokenKeys, {
    audience: projectId,
    issuer: "https://securetoken.google.com/" + projectId,
  });
  const uid = verified.payload.sub;
  if (typeof uid !== "string" || !uid) return null;
  const member = await readDoc(serviceToken, "ops_members/" + encodeURIComponent(uid));
  if (!member || member.status !== "active" || !["lead", "manager"].includes(member.memberRole)) return null;
  return member;
}

async function saveCredential(token, path, fields, exists) {
  const endpoint = exists
    ? base + "/" + path + "?" + Object.keys(fields).map(key => "updateMask.fieldPaths=" + encodeURIComponent(key)).join("&")
    : base + "/ops_driver_credentials?documentId=" + encodeURIComponent(path.split("/").at(-1));
  const response = await fetch(endpoint, {
    method: exists ? "PATCH" : "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error("The driver PIN could not be saved.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { driverId } = body;
  if (typeof driverId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(driverId)) return res.status(400).json({ error: "Select a valid driver." });

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || "", "base64").toString("utf8"));
  } catch {}
  if (!serviceAccount) return res.status(503).json({ error: "Secure PIN issuing is not configured. Please tell the system administrator." });

  try {
    const serviceToken = await tokenFor(serviceAccount);
    let manager;
    try {
      manager = await requireManager(req, serviceToken);
    } catch {
      return res.status(401).json({ error: "Please sign in again with an operations manager account." });
    }
    if (!manager) return res.status(403).json({ error: "Only active operations leads and managers can issue driver PINs." });

    const driver = await readDoc(serviceToken, "ops_drivers/" + encodeURIComponent(driverId));
    if (!driver || driver.active !== true) return res.status(404).json({ error: "This driver is not on the active driver list." });

    const pin = String(randomInt(10000000, 100000000));
    const salt = randomBytes(16).toString("hex");
    const hash = await scrypt(pin, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const path = "ops_driver_credentials/" + encodeURIComponent(driverId);
    const existing = await readDoc(serviceToken, path);
    const fields = {
      driverId: { stringValue: driverId },
      pinSalt: { stringValue: salt },
      pinHash: { stringValue: Buffer.from(hash).toString("hex") },
      failedAttempts: { integerValue: "0" },
      lockedUntil: { integerValue: "0" },
      updatedAt: { integerValue: String(Date.now()) },
      updatedBy: { stringValue: manager.displayName || "Operations manager" },
    };
    await saveCredential(serviceToken, path, fields, existing !== null);
    return res.status(200).json({ ok: true, pin });
  } catch {
    return res.status(502).json({ error: "The driver PIN could not be issued. Please try again." });
  }
}
