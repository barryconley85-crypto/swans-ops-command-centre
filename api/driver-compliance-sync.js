import { createSign, createVerify } from "node:crypto";

const OPS_PROJECT_ID = "swans-ops-command-centre";
const GATECHECK_PROJECT_ID = "swans-gate-check";
const GATECHECK_DRIVER_ID = "leesimpson";
const PILOT_NAME = "Lee Simpson";
const OPS_DRIVER_ID = "X2trNneYQ72QpAwUfNNz";
const OPS_COMPLIANCE_ID = "xq5VUSqkC6VzbbLG73oQ";
const ALLOWED_ORIGIN = "https://swans-gate-check.vercel.app";
const isAllowedOrigin = origin => origin === ALLOWED_ORIGIN || /^https:\/\/swans-gate-check-[a-z0-9-]+-barry-s-projects22\.vercel\.app$/.test(origin);
const FIRESTORE = project => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

const DATE_FIELDS = [
  { gate: "licenceExpiry", ops: "licenceValidTo", label: "Driving licence" },
  { gate: "cpcExpiry", ops: "cpcExpiry", label: "Driver CPC" },
  { gate: "tachoExpiry", ops: "tachoCardExpiry", label: "Tachograph card" },
];

function decodeValue(value) {
  if (!value || typeof value !== "object") return "";
  if ("stringValue" in value) return value.stringValue || "";
  if ("integerValue" in value) return String(value.integerValue);
  if ("doubleValue" in value) return String(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  return "";
}
function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}
function encodeFields(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { stringValue: String(value) }]));
}
function normaliseName(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function validDate(value, label) {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(label + " has an invalid date: " + value);
  const [year, month, day] = String(value).split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(label + " has an invalid date: " + value);
  }
  return String(value);
}

export function buildSyncPlan(gateFields = {}, opsFields = {}) {
  const changes = DATE_FIELDS.map(field => {
    const gateDate = validDate(gateFields[field.gate] || "", field.label + " in Gate Check");
    const opsDate = validDate(opsFields[field.ops] || "", field.label + " in Ops");
    const selectedDate = !gateDate ? opsDate : !opsDate ? gateDate : gateDate > opsDate ? gateDate : opsDate;
    let target = "No change";
    if (!gateDate && opsDate) target = "Gate Check";
    else if (!opsDate && gateDate) target = "Ops";
    else if (gateDate > opsDate) target = "Ops";
    else if (opsDate > gateDate) target = "Gate Check";
    return {
      label: field.label,
      gateCheckDate: gateDate || "Not recorded",
      opsDate: opsDate || "Not recorded",
      selectedDate: selectedDate || "Not recorded",
      target,
    };
  });
  return {
    changes,
    updatesRequired: changes.filter(item => item.target !== "No change").length,
  };
}

function decodeBase64Json(key, expectedProject) {
  const raw = String(process.env[key] || "").trim();
  if (!raw) throw new Error("The Ops integration is missing the " + key + " Vercel secret.");
  const candidates = [raw];
  try {
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""), "base64").toString("utf8").trim();
    if (decoded && decoded !== raw) candidates.push(decoded);
  } catch {}
  for (const candidate of candidates) {
    try {
      const account = JSON.parse(candidate);
      if (account?.client_email && account?.private_key?.includes("PRIVATE KEY") && account.project_id === expectedProject) return account;
    } catch {}
  }
  throw new Error("The " + key + " secret is not a valid service account for " + expectedProject + ".");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}
async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    sub: account.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claim;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + "." + signer.sign(account.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error("Firebase service authentication failed.");
  return body.access_token;
}

let cachedCerts = null;
let certsExpiry = 0;
async function verifyGateCheckToken(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Sign in to Gate Check before using compliance sync.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!header.kid || payload.iss !== "https://securetoken.google.com/" + GATECHECK_PROJECT_ID ||
      payload.aud !== GATECHECK_PROJECT_ID || !payload.sub || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
    throw new Error("Your Gate Check sign-in token is invalid or has expired.");
  }
  if (!cachedCerts || Date.now() >= certsExpiry) {
    const response = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
    if (!response.ok) throw new Error("Could not verify Gate Check sign-in.");
    cachedCerts = await response.json();
    const cacheControl = response.headers.get("cache-control") || "";
    const maxAge = Number((cacheControl.match(/max-age=(\d+)/) || [])[1] || 300);
    certsExpiry = Date.now() + maxAge * 1000;
  }
  const certificate = cachedCerts[header.kid];
  if (!certificate) throw new Error("Gate Check sign-in key is no longer valid. Sign in again.");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(parts[0] + "." + parts[1]);
  verifier.end();
  if (!verifier.verify(certificate, Buffer.from(parts[2], "base64url"))) throw new Error("Gate Check sign-in could not be verified.");
  return payload;
}

async function readDocument(project, collection, id, token) {
  const response = await fetch(`${FIRESTORE(project)}/${collection}/${encodeURIComponent(id)}`, {
    headers: { Authorization: "Bearer " + token },
  });
  if (response.status === 404) throw new Error("The linked " + collection + " record " + id + " was not found.");
  if (!response.ok) throw new Error("Could not read " + collection + " record " + id + ".");
  const document = await response.json();
  return { id, fields: decodeFields(document.fields || {}) };
}
async function patchDocument(project, collection, id, values, token) {
  const mask = new URLSearchParams();
  Object.keys(values).forEach(key => mask.append("updateMask.fieldPaths", key));
  const response = await fetch(`${FIRESTORE(project)}/${collection}/${encodeURIComponent(id)}?${mask.toString()}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(values) }),
  });
  if (!response.ok) throw new Error("Could not update " + collection + " record (" + response.status + ").");
}

async function buildLivePlan(gateToken, opsToken, gateCheckToken) {
  const [gateDriver, opsDriver, opsCompliance] = await Promise.all([
    readDocument(GATECHECK_PROJECT_ID, "drivers", GATECHECK_DRIVER_ID, gateToken),
    readDocument(OPS_PROJECT_ID, "ops_drivers", OPS_DRIVER_ID, opsToken),
    readDocument(OPS_PROJECT_ID, "ops_driver_compliance", OPS_COMPLIANCE_ID, opsToken),
  ]);
  const gate = gateDriver.fields;
  const opsDirectory = opsDriver.fields;
  const ops = opsCompliance.fields;

  if (normaliseName(gate.name) !== normaliseName(PILOT_NAME) ||
      normaliseName(opsDirectory.name) !== normaliseName(PILOT_NAME) ||
      normaliseName(ops.driverName) !== normaliseName(PILOT_NAME)) {
    throw new Error("The three selected records do not all belong to Lee Simpson. No changes made.");
  }
  if (ops.driverId && ops.driverId !== OPS_DRIVER_ID) throw new Error("The Ops compliance record points to a different driver. No changes made.");
  for (const [fields, key, expected] of [
    [gate, "opsDriverId", OPS_DRIVER_ID],
    [gate, "opsComplianceDocId", OPS_COMPLIANCE_ID],
    [opsDirectory, "gateCheckDriverId", GATECHECK_DRIVER_ID],
    [ops, "gateCheckDriverId", GATECHECK_DRIVER_ID],
  ]) {
    if (fields[key] && fields[key] !== expected) throw new Error("A conflicting permanent driver link already exists. No changes made.");
  }

  const plan = buildSyncPlan(gate, ops);
  return {
    driverName: PILOT_NAME,
    gateCheckDriverId: GATECHECK_DRIVER_ID,
    opsDriverId: OPS_DRIVER_ID,
    opsComplianceDocId: OPS_COMPLIANCE_ID,
    changes: plan.changes,
    updatesRequired: plan.updatesRequired,
    linkRequired: !gate.opsDriverId || !gate.opsComplianceDocId ||
      opsDirectory.gateCheckDriverId !== GATECHECK_DRIVER_ID || ops.gateCheckDriverId !== GATECHECK_DRIVER_ID,
    dvlaConsent: "Excluded, DVLA consent remains in Ops and is never read or changed by this sync.",
  };
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) throw new Error("This integration request did not come from the authorised Gate Check app.");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

    const authorization = req.headers.authorization || "";
    const idToken = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!idToken?.startsWith("Bearer ")) throw new Error("Sign in to Gate Check before using compliance sync.");
    const claims = await verifyGateCheckToken(idToken.slice(7));

    const gateAccount = decodeBase64Json("GATECHECK_FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", GATECHECK_PROJECT_ID);
    const opsAccount = decodeBase64Json("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", OPS_PROJECT_ID);
    const [gateToken, opsToken] = await Promise.all([accessToken(gateAccount), accessToken(opsAccount)]);
    const userProfile = await readDocument(GATECHECK_PROJECT_ID, "users", claims.sub, gateToken);
    if (userProfile.fields.active !== true || !["manager", "super_admin"].includes(userProfile.fields.role)) {
      throw new Error("Active Gate Check manager access is required for compliance sync.");
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.driverId !== GATECHECK_DRIVER_ID) return res.status(400).json({ error: "The first live pilot is restricted to Lee Simpson." });
    if (!["preview", "apply"].includes(body.action)) return res.status(400).json({ error: "Choose preview or apply." });
    if (body.action === "apply" && body.confirmed !== true) return res.status(400).json({ error: "Explicit confirmation is required before applying changes." });

    const plan = await buildLivePlan(gateToken, opsToken, idToken.slice(7));
    if (body.action === "preview") return res.status(200).json({ status: "preview", ...plan });

    const gateValues = {
      opsDriverId: OPS_DRIVER_ID,
      opsComplianceDocId: OPS_COMPLIANCE_ID,
      complianceSyncUpdatedAt: new Date().toISOString(),
    };
    const opsDriverValues = { gateCheckDriverId: GATECHECK_DRIVER_ID };
    const opsComplianceValues = { gateCheckDriverId: GATECHECK_DRIVER_ID };

    for (const item of plan.changes) {
      if (item.target === "No change") continue;
      const field = DATE_FIELDS.find(candidate => candidate.label === item.label);
      if (item.target === "Gate Check") gateValues[field.gate] = item.selectedDate;
      if (item.target === "Ops") opsComplianceValues[field.ops] = item.selectedDate;
    }

    // Each project's writes are isolated and idempotent. Re-running the preview after
    // any partial failure recalculates the same latest-date winner from live records.
    await patchDocument(OPS_PROJECT_ID, "ops_drivers", OPS_DRIVER_ID, opsDriverValues, opsToken);
    await patchDocument(OPS_PROJECT_ID, "ops_driver_compliance", OPS_COMPLIANCE_ID, opsComplianceValues, opsToken);
    await patchDocument(GATECHECK_PROJECT_ID, "drivers", GATECHECK_DRIVER_ID, gateValues, gateToken);

    return res.status(200).json({ status: "applied", ...plan, appliedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Driver compliance sync failed.";
    const status = /sign in|manager access|token|authorised/i.test(message) ? 403 : 500;
    return res.status(status).json({ error: message });
  }
}
