import { createSign, randomUUID } from "node:crypto";

const PROJECT_ID = "swans-ops-command-centre";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APP_URL = (process.env.APP_BASE_URL || "https://swans-ops-command-centre-barry-s-projects22.vercel.app").replace(/\/$/, "");
const RECIPIENTS = ["bc@swanstravel.com", "swh@swanstravel.com", "rdp@swanstravel.com", "clt@swanstravel.com"];
const TEST_RECIPIENT = "bc@swanstravel.com";
async function verifiedLeadEmail(idToken) {
  if (!idToken) return null;
  const apiKey = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY";
  const result = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
  if (!result.ok) return null;
  const body = await result.json();
  return body.users?.[0]?.email?.trim().toLowerCase() || null;
}

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return Date.parse(value.timestampValue);
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}
function serviceAccount() {
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!configured || typeof configured !== "string") return null;

  const raw = configured.trim();
  const candidates = [raw];

  // Accept both raw service-account JSON and Base64-encoded JSON.
  // Also tolerate URL-safe Base64 and whitespace introduced by secret entry.
  try {
    const normalised = raw.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    const decoded = Buffer.from(normalised, "base64").toString("utf8").trim();
    if (decoded && decoded !== raw) candidates.push(decoded);
  } catch {}

  for (const candidate of candidates) {
    try {
      const account = JSON.parse(candidate);
      if (
        account &&
        typeof account === "object" &&
        typeof account.client_email === "string" &&
        account.client_email.includes("@") &&
        typeof account.private_key === "string" &&
        account.private_key.includes("PRIVATE KEY")
      ) return account;
    } catch {}
  }
  return null;
}
function base64url(value) { return Buffer.from(value).toString("base64url"); }
async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({ iss: account.client_email, sub: account.client_email, aud: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/datastore", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key, "base64url")}`;
  const result = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!result.ok) throw new Error("Firebase service authentication was not accepted.");
  return (await result.json()).access_token;
}
async function listCollection(token, name) {
  const items = []; let pageToken = "";
  do {
    const url = `${FIRESTORE}/${name}?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (result.status === 404) return items;
    if (!result.ok) throw new Error(`Could not read ${name} from Firebase.`);
    const body = await result.json();
    for (const document of body.documents || []) items.push({ _docId: document.name.split("/").pop(), ...decodeFields(document.fields) });
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return items;
}
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
const dateKey = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "Not recorded";
const daysUntil = (value, today) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  return Math.round((Date.parse(value + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
};
function buildReport(records, drivers, now = new Date()) {
  const today = dateKey(now);
  const activeDrivers = drivers.filter(driver => driver.active !== false);
  const byId = new Map(records.map(record => [String(record.driverId || ""), record]));
  const rows = activeDrivers.map(driver => {
    const record = byId.get(String(driver._docId)) || records.find(item => String(item.driverName || "").toLowerCase() === String(driver.name || "").toLowerCase());
    const endorsements = record?.endorsements || [];
    const live = endorsements.filter(item => {
      const expiry = daysUntil(item.expiryDate, today);
      return expiry === null || expiry >= 0;
    });
    const points = live.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
    const expiringPoints = live.filter(item => { const days = daysUntil(item.expiryDate, today); return days !== null && days >= 0 && days <= 30; });
    const dates = [["Driving licence",record?.licenceValidTo],["DVLA consent",record?.consentExpiry],["Driver CPC",record?.cpcExpiry],["Tachograph card",record?.tachoCardExpiry],["Training",record?.trainingExpiry]];
    const dateAlerts = dates.flatMap(([label,value]) => {
      const days = daysUntil(value, today);
      return days !== null && days <= 90 ? [{ label, value, days }] : [];
    });
    return { name: driver.name || record?.driverName || "Unnamed driver", record, points, live, expiringPoints, dateAlerts };
  });
  const thresholds = rows.filter(row => [6,9,12].some(level => row.points >= level));
  const pointsExpiring = rows.filter(row => row.expiringPoints.length);
  const complianceDue = rows.filter(row => row.dateAlerts.length);
  const missing = rows.filter(row => !row.record?.licenceValidTo);
  const newEndorsements = records.flatMap(record => (record.endorsements || []).filter(item => {
    const created = Number(item.createdAt || item.addedAt || 0);
    return created >= now.getTime() - 24*60*60*1000;
  }).map(item => ({ name: record.driverName || "Unknown driver", ...item })));
  const lines = [];
  if (thresholds.length) lines.push(...thresholds.map(row => `• ${row.name}: ${row.points} current points${row.points >= 12 ? " (12+ points, urgent review)" : row.points >= 9 ? " (9+ points)" : " (6+ points)"}`));
  if (pointsExpiring.length) lines.push(...pointsExpiring.flatMap(row => row.expiringPoints.map(item => `• ${row.name}: ${item.points} points (${item.offenceCode || "endorsement"}) expire ${dateLabel(item.expiryDate)}`)));
  if (complianceDue.length) lines.push(...complianceDue.flatMap(row => row.dateAlerts.map(item => `• ${row.name}: ${item.label} ${item.days < 0 ? "EXPIRED" : item.days === 0 ? "expires today" : `due in ${item.days} days`} (${dateLabel(item.value)})`)));
  if (missing.length) lines.push(...missing.map(row => `• ${row.name}: driving licence expiry date missing`));
  if (newEndorsements.length) lines.push(...newEndorsements.map(item => `• ${item.name}: new ${item.offenceCode || "endorsement"}, ${item.points || 0} points, offence date ${dateLabel(item.offenceDate)}`));
  const summary = [
    `Active drivers checked: ${activeDrivers.length}`,
    `Drivers at 6/9/12+ current points: ${thresholds.length}`,
    `Drivers with points expiring in 30 days: ${pointsExpiring.length}`,
    `Drivers with compliance dates due/expired within 90 days: ${complianceDue.length}`,
    `Drivers missing a licence expiry date: ${missing.length}`,
    `New endorsements recorded/updated in last 24 hours: ${newEndorsements.length}`,
  ];
  const detail = lines.length ? lines.join("\n") : "No points thresholds, upcoming point expiries or compliance date warnings were identified.";
  const item = (title, detailText, tone = "normal") => {
    const accent = tone === "urgent" ? "#D94B55" : tone === "warning" ? "#D99A32" : "#20BFC2";
    return `<tr><td style="padding:11px 13px;border-bottom:1px solid #E8EEF5;border-left:3px solid ${accent}"><div style="font-size:13px;font-weight:700;color:#14243D">${escapeHtml(title)}</div><div style="font-size:12px;line-height:1.5;color:#52627A;margin-top:3px">${escapeHtml(detailText)}</div></td></tr>`;
  };
  const section = (heading, entries) => entries.length
    ? `<div style="margin:22px 0 0"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#52627A;margin:0 0 8px">${heading} <span style="color:#20AEB5">(${entries.length})</span></div><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E5EBF2;border-radius:8px;border-collapse:separate;overflow:hidden">${entries.join("")}</table></div>`
    : "";
  const thresholdItems = thresholds.map(row => item(row.name, `${row.points} current points${row.points >= 12 ? " · 12+ points, urgent review" : row.points >= 9 ? " · 9+ points" : " · 6+ points"}`, row.points >= 12 ? "urgent" : "warning"));
  const expiringItems = pointsExpiring.flatMap(row => row.expiringPoints.map(entry => item(row.name, `${entry.points} points (${entry.offenceCode || "endorsement"}) expire ${dateLabel(entry.expiryDate)}`, "warning")));
  const dateItems = complianceDue.flatMap(row => row.dateAlerts.map(entry => item(row.name, `${entry.label}: ${entry.days < 0 ? "EXPIRED" : entry.days === 0 ? "expires today" : `due in ${entry.days} days`} · ${dateLabel(entry.value)}`, entry.days < 0 || entry.days <= 7 ? "urgent" : "warning")));
  const missingItems = missing.map(row => item(row.name, "Driving licence expiry date has not been recorded", "warning"));
  const endorsementItems = newEndorsements.map(entry => item(entry.name, `New ${entry.offenceCode || "endorsement"} · ${entry.points || 0} points · offence date ${dateLabel(entry.offenceDate)}`));
  const hasIssues = thresholdItems.length + expiringItems.length + dateItems.length + missingItems.length + endorsementItems.length > 0;
  const metric = (value, label) => `<td width="33.33%" valign="top" style="padding:12px 10px;background:#F2F7FC;border:1px solid #E1EAF4;border-radius:8px"><div style="font-size:23px;line-height:1.2;font-weight:700;color:#14243D">${value}</div><div style="font-size:11px;line-height:1.4;color:#52627A;margin-top:5px">${label}</div></td>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#EEF3F8;font-family:Arial,Helvetica,sans-serif;color:#14243D"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3F8;padding:24px 10px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#FFFFFF;border:1px solid #DCE5EF;border-radius:12px;overflow:hidden"><tr><td style="background:#14243D;padding:23px 26px;border-bottom:4px solid #20BFC2"><div style="font-size:10px;letter-spacing:2px;font-weight:700;color:#A9D8F4">SWANS TRAVEL</div><div style="font-size:23px;line-height:1.25;font-weight:700;color:#FFFFFF;margin-top:9px">Driver compliance</div><div style="font-size:13px;color:#D8E8F5;margin-top:5px">Daily overview · ${escapeHtml(now.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}))}</div></td></tr><tr><td style="padding:22px 24px 8px"><div style="font-size:15px;font-weight:700;color:#14243D;margin-bottom:12px">At a glance</div><table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>${metric(activeDrivers.length,"Active drivers checked")}${metric(thresholds.length,"Drivers at 6+ points")}${metric(complianceDue.length,"Drivers with compliance dates due")}</tr><tr>${metric(pointsExpiring.length,"Drivers with points expiring in 30 days")}${metric(missing.length,"Missing licence expiry dates")}${metric(newEndorsements.length,"New endorsements in 24 hours")}</tr></table></td></tr><tr><td style="padding:12px 24px 24px"><div style="font-size:15px;font-weight:700;color:#14243D;margin-top:8px">Items requiring attention</div>${hasIssues ? section("Points thresholds",thresholdItems) + section("Points expiring within 30 days",expiringItems) + section("Licence and compliance dates",dateItems) + section("Missing information",missingItems) + section("New endorsements",endorsementItems) : '<div style="margin-top:14px;padding:15px;background:#EAF8F6;border-left:4px solid #20BFC2;border-radius:6px;font-size:13px;color:#155B59">No action items were identified in the records checked today.</div>'}<div style="margin-top:25px"><a href="${escapeHtml(APP_URL)}/compliance" style="display:inline-block;background:#20BFC2;color:#10243B;text-decoration:none;font-size:13px;font-weight:700;padding:12px 18px;border-radius:6px">Open Compliance Centre</a></div><div style="font-size:11px;line-height:1.5;color:#718096;margin-top:18px;padding-top:13px;border-top:1px solid #E8EEF5">Automated daily report, scheduled for 08:00. Please check the driver record in the Compliance Centre before taking action.</div></td></tr></table></td></tr></table></body></html>`;
  return { summary, detail, html, totals: { activeDrivers: activeDrivers.length, thresholds: thresholds.length, expiringPoints: pointsExpiring.length, complianceDue: complianceDue.length, missingLicence: missing.length, newEndorsements: newEndorsements.length } };
}
export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const testMode = request.method === "POST";
  if (testMode) {
    const email = await verifiedLeadEmail(supplied);
    if (email !== "bc@swanstravel.com") return response.status(403).json({ error: "Only the signed-in operations lead can send a test email." });
  } else if (!process.env.CRON_SECRET || supplied !== process.env.CRON_SECRET) {
    return response.status(401).json({ error: "Unauthorised scheduled compliance alert." });
  }
  const required = ["FIREBASE_SERVICE_ACCOUNT_JSON_BASE64","GOOGLE_MAILER_URL","GOOGLE_MAILER_SHARED_SECRET"];
  if (required.some(key => !process.env[key])) return response.status(503).json({ error: "Firebase or the existing Google Apps Script mailer is not configured." });
  let stage = "firebase-service-account";
  try {
    console.info("[driver-compliance-alerts] request accepted", { mode: testMode ? "test" : "scheduled", mailerConfigured: Boolean(process.env.GOOGLE_MAILER_URL), secretConfigured: Boolean(process.env.GOOGLE_MAILER_SHARED_SECRET) });
    const account = serviceAccount();
    if (!account?.private_key || !account?.client_email) throw new Error("Firebase service account configuration is invalid.");
    stage = "firebase-authentication";
    const token = await accessToken(account);
    stage = "firebase-data-read";
    const [records, drivers] = await Promise.all([listCollection(token,"ops_driver_compliance"),listCollection(token,"ops_drivers")]);
    console.info("[driver-compliance-alerts] data loaded", { complianceRecords: records.length, drivers: drivers.length });
    const report = buildReport(records, drivers);
    const dryRun = request.query?.dryRun === "1";
    const recipients = testMode ? [TEST_RECIPIENT] : RECIPIENTS;
    if (dryRun) return response.status(200).json({ status:"dry_run", recipients, totals:report.totals, preview:report.summary, detail:report.detail });
    const today = dateKey(new Date());
    stage = "google-apps-script-mailer";
    const mail = await fetch(process.env.GOOGLE_MAILER_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ secret:process.env.GOOGLE_MAILER_SHARED_SECRET, eventKey:testMode ? `driver-compliance-test-${randomUUID()}` : `driver-compliance-daily-${today}`, to:recipients, subject:`Swans Compliance | ${testMode ? "TEST " : ""}Daily driver alert | ${today}`, text:[ "SWANS TRAVEL | COMPLIANCE CENTRE", "DAILY DRIVER COMPLIANCE ALERT", ...report.summary, "", "ITEMS REQUIRING ATTENTION", report.detail, "", `Open Compliance Centre: ${APP_URL}/compliance` ].join("\n"), html:report.html })
    });
    const responseText = await mail.text();
    let result = {};
    try { result = JSON.parse(responseText); } catch {}
    console.info("[driver-compliance-alerts] mailer response", { httpStatus: mail.status, accepted: result.ok === true, responseKeys: Object.keys(result), error: typeof result.error === "string" ? result.error.slice(0, 240) : undefined });
    if (!mail.ok || result.ok !== true) throw new Error(result.error || `The existing mailer rejected the compliance alert (HTTP ${mail.status}).`);
    return response.status(200).json({ status:"sent", recipients, totals:report.totals, emailId:result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily compliance alert failed.";
    console.error("[driver-compliance-alerts] failed", { stage, message });
    return response.status(502).json({ error:message });
  }
}
