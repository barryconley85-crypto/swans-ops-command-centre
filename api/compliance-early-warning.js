import { createHash, createSign } from "node:crypto";
import { evaluateCompliance, reconcileAlertState } from "./compliance-alert-engine.js";

const PROJECT_ID = "swans-ops-command-centre";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APP_URL = (process.env.APP_BASE_URL || "https://swans-ops-command-centre-barry-s-projects22.vercel.app").replace(/\/$/, "");
const RECIPIENTS = ["bc@swanstravel.com", "swh@swanstravel.com", "rdp@swanstravel.com", "clt@swanstravel.com"];
const ALLOWED_TRIGGER_EMAILS = new Set(RECIPIENTS);

function decodeValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decodeValue(v)]));
}
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v) } };
  return { stringValue: String(v) };
}
function encodeFields(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encodeValue(v)]));
}
function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || "").trim();
  const candidates = [raw];
  try { const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""), "base64").toString("utf8").trim(); if (decoded && decoded !== raw) candidates.push(decoded); } catch {}
  for (const candidate of candidates) {
    try { const account = JSON.parse(candidate); if (account?.client_email && account?.private_key?.includes("PRIVATE KEY")) return account; } catch {}
  }
  return null;
}
function b64(value) { return Buffer.from(value).toString("base64url"); }
async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(JSON.stringify({ iss: account.client_email, sub: account.client_email, aud: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/datastore", iat: now, exp: now + 3600 }));
  const unsigned = header + "." + claim;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = unsigned + "." + signer.sign(account.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error("Firebase service authentication failed.");
  return (await response.json()).access_token;
}
async function listCollection(token, collectionName) {
  const items = []; let pageToken = "";
  do {
    const url = `${FIRESTORE}/${collectionName}?pageSize=1000${pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""}`;
    const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (response.status === 404) return items;
    if (!response.ok) throw new Error("Could not read " + collectionName + " from Firestore.");
    const body = await response.json();
    for (const document of body.documents || []) items.push({ _docId: document.name.split("/").pop(), ...decodeFields(document.fields) });
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return items;
}
async function saveDocument(token, collectionName, id, data) {
  const url = `${FIRESTORE}/${collectionName}/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!response.ok) throw new Error("Could not save compliance alert " + id + " (" + response.status + ").");
}
async function verifiedEmail(idToken) {
  if (!idToken || !process.env.FIREBASE_WEB_API_KEY) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  return (await response.json()).users?.[0]?.email?.trim().toLowerCase() || null;
}
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
function emailHtml(items, now) {
  const rows = items.map(item => `<tr><td style="padding:12px;border-bottom:1px solid #e5edf2"><b>${escapeHtml(item.severity.toUpperCase())}, ${escapeHtml(item.driverName)}</b><br>${escapeHtml(item.title)}<br><span style="color:#536b7a">${escapeHtml(item.detail)}</span></td></tr>`).join("");
  return `<!doctype html><html><body style="font-family:Arial;background:#eef4f8;padding:20px;color:#243b4a"><table style="max-width:720px;margin:auto;background:white;border-collapse:collapse;width:100%"><tr><td style="background:#102f46;color:white;padding:22px"><b>SWANS TRAVEL | DRIVER COMPLIANCE</b><h2>Compliance action required</h2>${escapeHtml(now.toLocaleString("en-GB",{timeZone:"Europe/London"}))}</td></tr>${rows}<tr><td style="padding:18px"><a href="${APP_URL}/compliance">Open Compliance Centre</a><p style="font-size:12px;color:#71879a">This alert identifies a condition requiring review. Verify the source record and record the action taken in the Compliance Centre.</p></td></tr></table></body></html>`;
}
async function sendAlertEmail(items, now) {
  const response = await fetch(process.env.GOOGLE_MAILER_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: process.env.GOOGLE_MAILER_SHARED_SECRET,
      eventKey: "driver-compliance-change-" + createHash("sha256").update(items.map(x => x.key + x.lastDetectedAt).join("|")).digest("hex"),
      to: RECIPIENTS, subject: "Swans Compliance | " + items.length + " new or escalated driver issue(s)",
      text: ["SWANS TRAVEL | DRIVER COMPLIANCE", ...items.map(x => `${x.severity.toUpperCase()} | ${x.driverName} | ${x.title}\n${x.detail}\nAction: ${x.action}`), "", APP_URL + "/compliance"].join("\n\n"),
      html: emailHtml(items, now),
    }),
  });
  const raw = await response.text(); let result = {};
  try { result = JSON.parse(raw); } catch {}
  if (!response.ok || result.ok !== true) throw new Error(result.error || "The existing Ops email service rejected the alert.");
  return result;
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const bearer = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const scheduled = request.method === "GET";
  if (scheduled) {
    if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return response.status(401).json({ error: "Unauthorised scheduled check." });
  } else {
    const email = await verifiedEmail(bearer);
    if (!email || !ALLOWED_TRIGGER_EMAILS.has(email)) return response.status(403).json({ error: "An authorised compliance manager must trigger this check." });
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) return response.status(503).json({ error: "Firebase service account is not configured." });
  const now = new Date();
  try {
    const account = serviceAccount();
    if (!account) throw new Error("Firebase service account configuration is invalid.");
    const token = await accessToken(account);
    const [records, drivers, previousDocs] = await Promise.all([
      listCollection(token, "ops_driver_compliance"),
      listCollection(token, "ops_drivers"),
      listCollection(token, "ops_compliance_alerts"),
    ]);
    const previous = Object.fromEntries(previousDocs.map(doc => [doc.key, doc]));
    const evaluated = evaluateCompliance(records, drivers, now);
    const reconciled = reconcileAlertState(evaluated.issues, previous, now);
    const changed = [...reconciled.opened, ...reconciled.escalated];
    const resolvedKeys = new Set(reconciled.resolved.map(item => item.key));
    if (process.env.VERCEL_ENV !== "production") return response.status(200).json({ status: "preview_only", activeDrivers: evaluated.activeDrivers, openIssues: evaluated.issues.length, opened: reconciled.opened.length, escalated: reconciled.escalated.length, persisted: false, notified: false });
    let mail = null;
    if (changed.length) mail = await sendAlertEmail(changed, now);
    for (const issue of Object.values(reconciled.next)) {
      const id = createHash("sha256").update(issue.key).digest("hex");
      await saveDocument(token, "ops_compliance_alerts", id, { ...issue, key: issue.key, evaluatedAt: now.toISOString(), lastNotificationAt: changed.some(item => item.key === issue.key) ? now.toISOString() : (previous[issue.key]?.lastNotificationAt || null) });
    }
    return response.status(200).json({ status: changed.length ? "evaluated" : "no_change", activeDrivers: evaluated.activeDrivers, openIssues: evaluated.issues.length, opened: reconciled.opened.length, escalated: reconciled.escalated.length, resolved: resolvedKeys.size, notified: Boolean(mail), emailAccepted: Boolean(mail), emailId: mail?.id || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compliance evaluation failed.";
    console.error("[compliance-early-warning] failed", message);
    return response.status(502).json({ error: message });
  }
}
