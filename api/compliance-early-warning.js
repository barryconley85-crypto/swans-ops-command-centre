import { createHash, createSign, randomUUID } from "node:crypto";
import { evaluateCompliance, reconcileAlertState } from "./compliance-alert-engine.js";

const PROJECT_ID = "swans-ops-command-centre";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY";
const APP_URL = (process.env.APP_BASE_URL || "https://swans-ops-command-centre-barry-s-projects22.vercel.app").replace(/\/$/, "");
const RECIPIENTS = ["bc@swanstravel.com", "swh@swanstravel.com", "rdp@swanstravel.com", "clt@swanstravel.com"];
const ALLOWED_TRIGGER_EMAILS = new Set(RECIPIENTS);
const EVALUATION_LOCK_URL = `${FIRESTORE}/ops_compliance_runtime/early-warning-evaluator`;
const EVALUATION_LOCK_LEASE_MS = 5 * 60 * 1000;
const POINTS_STATE_COLLECTION = "ops_compliance_points_state";

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
export function buildNotificationEventKey(items) {
  const fingerprint = [...items]
    .map(item => [item.key, item.notificationVersion || 1, item.severity, item.state || ""].join("\u001f"))
    .sort()
    .join("\u001e");
  return "driver-compliance-change-" + createHash("sha256").update(fingerprint).digest("hex");
}
export function isAlertActivationEnabled(env = process.env) {
  return env.COMPLIANCE_ALERTS_ENABLED === "true";
}
export function managerIssuePreview(method, issues) {
  if (method !== "POST") return {};
  return { issues: issues.slice(0, 100), issuesTruncated: issues.length > 100 };
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
  const updateMask = new URLSearchParams();
  for (const field of Object.keys(data)) updateMask.append("updateMask.fieldPaths", field);
  const url = `${FIRESTORE}/${collectionName}/${encodeURIComponent(id)}?${updateMask.toString()}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!response.ok) throw new Error("Could not save compliance alert " + id + " (" + response.status + ").");
}

async function saveDocumentsAtomically(token, collectionName, documents) {
  // Firestore commit allows at most 500 writes. Keep each commit under that limit.
  for (let start = 0; start < documents.length; start += 450) {
    const batch = documents.slice(start, start + 450);
    const writes = batch.map(({ id, data }) => ({
      update: {
        name: `projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}/${encodeURIComponent(id)}`,
        fields: encodeFields(data),
      },
      updateMask: { fieldPaths: Object.keys(data) },
    }));
    const response = await fetch(`${FIRESTORE}:commit`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    });
    if (!response.ok) throw new Error("Could not atomically save compliance alert state (" + response.status + ").");
  }
}
export async function acquireEvaluationLease(token, now = Date.now()) {
  const headers = { Authorization: "Bearer " + token };
  const read = await fetch(EVALUATION_LOCK_URL, { headers });
  let document = null;
  if (read.status !== 404) {
    if (!read.ok) throw new Error("Could not read the compliance evaluation lock.");
    document = await read.json();
    const current = decodeFields(document.fields || {});
    if (current.owner && Number(current.leaseUntil || 0) > now) return null;
  }

  const owner = randomUUID();
  const precondition = document?.updateTime
    ? new URLSearchParams({ "currentDocument.updateTime": document.updateTime })
    : new URLSearchParams({ "currentDocument.exists": "false" });
  const response = await fetch(`${EVALUATION_LOCK_URL}?${precondition.toString()}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields({ owner, leaseUntil: now + EVALUATION_LOCK_LEASE_MS }) }),
  });
  if (response.status === 409 || response.status === 412) return null;
  if (!response.ok) {
    let failure = {};
    try { failure = await response.json(); } catch {}
    if (failure.error?.status === "FAILED_PRECONDITION") return null;
    throw new Error("Could not claim the compliance evaluation lock.");
  }
  return owner;
}
async function releaseEvaluationLease(token, owner) {
  try {
    const headers = { Authorization: "Bearer " + token };
    const read = await fetch(EVALUATION_LOCK_URL, { headers });
    if (read.status === 404) return;
    if (!read.ok) throw new Error("Could not read the compliance evaluation lock.");
    const document = await read.json();
    if (decodeFields(document.fields || {}).owner !== owner || !document.updateTime) return;
    const updateMask = new URLSearchParams();
    updateMask.append("updateMask.fieldPaths", "owner");
    updateMask.append("updateMask.fieldPaths", "leaseUntil");
    updateMask.set("currentDocument.updateTime", document.updateTime);
    const response = await fetch(`${EVALUATION_LOCK_URL}?${updateMask.toString()}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: encodeFields({ owner: null, leaseUntil: 0 }) }),
    });
    if (!response.ok && response.status !== 409 && response.status !== 412) throw new Error("Could not release the compliance evaluation lock.");
  } catch (error) {
    console.warn("[compliance-early-warning] lock release failed", error instanceof Error ? error.message : "Unknown error");
  }
}
async function verifiedEmail(idToken) {
  if (!idToken) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
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
      eventKey: buildNotificationEventKey(items),
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
  const production = process.env.VERCEL_ENV === "production";
  if (scheduled) {
    if (!production) return response.status(401).json({ error: "Scheduled compliance checks are production-only." });
    if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) return response.status(401).json({ error: "Unauthorised scheduled check." });
  } else {
    const email = await verifiedEmail(bearer);
    if (!email || !ALLOWED_TRIGGER_EMAILS.has(email)) return response.status(403).json({ error: "An authorised compliance manager must trigger this check." });
  }
  const readOnlyPreview = !scheduled && request.query?.preview === "1";
  if (production && !readOnlyPreview && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) return response.status(503).json({ error: "Firebase service account is not configured." });
  const now = new Date();
  let leaseOwner = null;
  let token = bearer;
  try {
    // A manager's read-only preview always uses their Firebase ID token and never writes.
    // Enabled production evaluations use a service account and an atomic Firestore lease.
    if (production && !readOnlyPreview) {
      const account = serviceAccount();
      if (!account) throw new Error("Firebase service account configuration is invalid.");
      token = await accessToken(account);
    }
    if (production && !readOnlyPreview && isAlertActivationEnabled()) {
      leaseOwner = await acquireEvaluationLease(token, now.getTime());
      if (!leaseOwner) return response.status(202).json({ status: "skipped_busy", persisted: false, notified: false });
    }
    const [records, drivers, previousDocs, previousPointsDocs] = await Promise.all([
      listCollection(token, "ops_driver_compliance"),
      listCollection(token, "ops_drivers"),
      listCollection(token, "ops_compliance_alerts"),
      listCollection(token, POINTS_STATE_COLLECTION),
    ]);
    const previous = Object.fromEntries(previousDocs.map(doc => [doc.key, doc]));
    const previousPoints = Object.fromEntries(previousPointsDocs.map(doc => [doc.driverId, doc]));
    const evaluated = evaluateCompliance(records, drivers, now);
    const reconciled = reconcileAlertState(evaluated.issues, previous, now);
    // The point-threshold record is maintained for the Compliance Centre, but the
    // first scan establishes a baseline rather than emailing the existing known cases.
    // Subsequent total or endorsement changes generate a distinct actionable alert.
    const pointChanges = [];
    const pointSnapshotsToSave = [];
    for (const snapshot of evaluated.pointsSnapshots || []) {
      const old = previousPoints[snapshot.driverId];
      if (!old || Number(old.points) !== Number(snapshot.points) || old.endorsementFingerprint !== snapshot.endorsementFingerprint) {
        pointSnapshotsToSave.push({
          id: createHash("sha256").update(String(snapshot.driverId)).digest("hex"),
          data: { ...snapshot, evaluatedAt: now.toISOString() },
        });
      }
      if (old && (Number(old.points) !== Number(snapshot.points) || old.endorsementFingerprint !== snapshot.endorsementFingerprint)) {
        const transition = createHash("sha256").update([
          snapshot.driverId, old.points, old.endorsementFingerprint || "",
          snapshot.points, snapshot.endorsementFingerprint || "",
        ].join("\u001f")).digest("hex").slice(0, 20);
        const severity = snapshot.points >= 12 ? "critical" : snapshot.points >= 9 ? "high" : "warning";
        pointChanges.push({
          key: `driver:${snapshot.driverId}:points-change:${transition}`,
          notificationVersion: 1,
          driverId: snapshot.driverId,
          driverName: snapshot.driverName,
          category: "licence-endorsements",
          severity,
          title: "Penalty points record changed",
          detail: `Recorded current points changed from ${Number(old.points) || 0} to ${Number(snapshot.points) || 0}. The endorsement record has also been checked for changes.`,
          action: "Verify the updated DVLA record, confirm endorsement details and reassess the driver's suitability to drive.",
          points: snapshot.points,
          state: "changed",
        });
      }
    }
    const newlyOpenedOrEscalated = [...reconciled.opened, ...reconciled.escalated]
      .filter(issue => !issue.key.endsWith(":points-current") && !issue.key.includes(":new-endorsement:"));
    const changed = [...newlyOpenedOrEscalated, ...pointChanges];
    const resolvedKeys = new Set(reconciled.resolved.map(item => item.key));
    if (!production || readOnlyPreview) return response.status(200).json({ status: "preview_only", activeDrivers: evaluated.activeDrivers, openIssues: evaluated.issues.length, opened: reconciled.opened.length, escalated: reconciled.escalated.length, persisted: false, notified: false, ...managerIssuePreview(request.method, evaluated.issues) });
    if (!isAlertActivationEnabled()) return response.status(200).json({ status: "activation_required", activeDrivers: evaluated.activeDrivers, openIssues: evaluated.issues.length, opened: reconciled.opened.length, escalated: reconciled.escalated.length, persisted: false, notified: false, ...managerIssuePreview(request.method, evaluated.issues) });
    const alertDocuments = Object.values(reconciled.next).map(issue => ({
      id: createHash("sha256").update(issue.key).digest("hex"),
      data: { ...issue, key: issue.key, evaluatedAt: now.toISOString(), lastNotificationAt: changed.some(item => item.key === issue.key) ? now.toISOString() : (previous[issue.key]?.lastNotificationAt || null) },
    }));
    const changedKeys = new Set(changed.map(item => item.key));
    const changedDocuments = alertDocuments.filter(document => changedKeys.has(document.data.key));
    const unchangedDocuments = alertDocuments.filter(document => !changedKeys.has(document.data.key));
    if (changedDocuments.length > 450) throw new Error("The alert batch is too large to persist safely; no email was sent.");
    // Save non-notification history first. Then send once, and atomically commit every alert in that email.
    await saveDocumentsAtomically(token, "ops_compliance_alerts", unchangedDocuments);
    let mail = null;
    if (changed.length) mail = await sendAlertEmail(changed, now);
    // Persist point baselines only after any required notification has been accepted.
    // This makes retries deterministic and avoids silently consuming an unsent change.
    await saveDocumentsAtomically(token, POINTS_STATE_COLLECTION, pointSnapshotsToSave);
    await saveDocumentsAtomically(token, "ops_compliance_alerts", changedDocuments);
    return response.status(200).json({ status: changed.length ? "evaluated" : "no_change", activeDrivers: evaluated.activeDrivers, openIssues: evaluated.issues.length, opened: reconciled.opened.length, escalated: reconciled.escalated.length, pointsChanged: pointChanges.length, pointsBaselined: pointSnapshotsToSave.length, resolved: resolvedKeys.size, notified: Boolean(mail), emailAccepted: Boolean(mail), emailId: mail?.id || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compliance evaluation failed.";
    console.error("[compliance-early-warning] failed", message);
    return response.status(502).json({ error: message });
  } finally {
    if (leaseOwner) await releaseEvaluationLease(token, leaseOwner);
  }
}

