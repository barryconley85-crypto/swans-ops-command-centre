import { createSign } from "node:crypto";

const PROJECT_ID = "swans-ops-command-centre";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APP_URL = (process.env.APP_BASE_URL || "https://swans-ops-command-centre-barry-s-projects22.vercel.app").replace(/\/$/, "");
const RECIPIENTS = ["bc@swanstravel.com", "swh@swanstravel.com"];
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
  try { return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8")); }
  catch { return null; }
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
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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
  const htmlLines = lines.length ? lines.map(line => `<li style="margin:0 0 9px">${escapeHtml(line.replace(/^• /,""))}</li>`).join("") : "<li>No action required from the records currently held in the Compliance Centre.</li>";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f3;font-family:Arial,Helvetica,sans-serif;color:#24352e"><div style="max-width:760px;margin:0 auto;padding:24px 12px"><div style="background:#123d3b;border-radius:16px 16px 0 0;padding:26px 28px;color:#fff"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#9ce0d3">SWANS TRAVEL | COMPLIANCE CENTRE</div><h1 style="font-size:24px;margin:13px 0 8px">Daily driver compliance alert</h1><p style="margin:0;color:#e0efeb">${escapeHtml(now.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}))}</p></div><div style="background:#fff;padding:24px 22px;border:1px solid #e0e8e3;border-top:0"><h2 style="font-size:16px;color:#174b46">Daily summary</h2><ul style="padding-left:20px;line-height:1.7;font-size:14px">${summary.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul><h2 style="font-size:16px;color:#174b46;margin-top:24px">Items requiring attention</h2><ul style="padding-left:20px;line-height:1.6;font-size:14px">${htmlLines}</ul><p style="margin-top:24px"><a href="${escapeHtml(APP_URL)}/compliance" style="display:inline-block;background:#1d5c63;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:8px">Open Compliance Centre</a></p><p style="font-size:11px;color:#68776f">Automated weekday report. Check the underlying driver record before taking action.</p></div></div></body></html>`;
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
  try {
    const account = serviceAccount();
    if (!account?.private_key || !account?.client_email) throw new Error("Firebase service account configuration is invalid.");
    const token = await accessToken(account);
    const [records, drivers] = await Promise.all([listCollection(token,"ops_driver_compliance"),listCollection(token,"ops_drivers")]);
    const report = buildReport(records, drivers);
    const dryRun = request.query?.dryRun === "1";
    const recipients = testMode ? [TEST_RECIPIENT] : RECIPIENTS;
    if (dryRun) return response.status(200).json({ status:"dry_run", recipients, totals:report.totals, preview:report.summary, detail:report.detail });
    const today = dateKey(new Date());
    const mail = await fetch(process.env.GOOGLE_MAILER_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ secret:process.env.GOOGLE_MAILER_SHARED_SECRET, eventKey:`driver-compliance-daily-${today}`, to:recipients, subject:`Swans Compliance | ${testMode ? "TEST " : ""}Daily driver alert | ${today}`, text:[ "SWANS TRAVEL | COMPLIANCE CENTRE", "DAILY DRIVER COMPLIANCE ALERT", ...report.summary, "", "ITEMS REQUIRING ATTENTION", report.detail, "", `Open Compliance Centre: ${APP_URL}/compliance` ].join("\n"), html:report.html })
    });
    const result = await mail.json().catch(()=>({}));
    if (!mail.ok || result.ok !== true) throw new Error(result.error || "The existing mailer rejected the compliance alert.");
    return response.status(200).json({ status:"sent", recipients, totals:report.totals, emailId:result.id });
  } catch (error) {
    return response.status(502).json({ error:error instanceof Error ? error.message : "Daily compliance alert failed." });
  }
}
