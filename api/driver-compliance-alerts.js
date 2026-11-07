import { createSign, randomUUID } from "node:crypto";

const PROJECT_ID = "swans-ops-command-centre";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APP_URL = (process.env.APP_BASE_URL || "https://swans-ops-command-centre-barry-s-projects22.vercel.app").replace(/\/$/, "");
const RECIPIENTS = ["bc@swanstravel.com", "swh@swanstravel.com", "rdp@swanstravel.com", "clt@swanstravel.com"];
const TEST_RECIPIENT = "bc@swanstravel.com";
async function verifiedLeadEmail(idToken) {
  if (!idToken) return null;
  const apiKey = process.env.FIREBASE_WEB_API_KEY;\n  if (!apiKey) return null;
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
export function buildReport(records, drivers, now = new Date()) {
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
      return days !== null && days <= 7 ? [{ label, value, days }] : [];
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
    `Drivers with compliance dates due within 7 days or expired: ${complianceDue.length}`,
    `Drivers missing a licence expiry date: ${missing.length}`,
    `New endorsements recorded/updated in last 24 hours: ${newEndorsements.length}`,
  ];
  const detail = lines.length ? lines.join("\n") : "No points thresholds, upcoming point expiries or compliance date warnings were identified.";
  const section = (title, subtitle, items, tone = "normal") => {
    const colours = tone === "urgent" ? { bg:"#FDECEC", border:"#D92D20", title:"#B42318" } : tone === "warning" ? { bg:"#FFF5E5", border:"#F79009", title:"#B54708" } : { bg:"#F1F7FB", border:"#B8D6E8", title:"#173B56" };
    const content = items.length
      ? items.map(item => `<tr><td style="padding:10px 12px;border-bottom:1px solid #E7EEF3;font-size:14px;line-height:1.5;color:#243B4A">${escapeHtml(item)}</td></tr>`).join("")
      : `<tr><td style="padding:12px;font-size:13px;color:#667B8A">No items to report.</td></tr>`;
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;border:1px solid ${colours.border};border-radius:10px;overflow:hidden"><tr><td style="background:${colours.bg};padding:12px 14px"><div style="font-size:15px;font-weight:700;color:${colours.title}">${escapeHtml(title)}</div><div style="font-size:12px;color:#536B7A;margin-top:3px">${escapeHtml(subtitle)}</div></td></tr>${content}</table>`;
  };
  const pointItems = thresholds.map(row => `${row.name}, ${row.points} current points${row.points >= 12 ? " , urgent review required" : row.points >= 9 ? " , 9+ point threshold" : " , 6+ point threshold"}`);
  const expiringPointItems = pointsExpiring.flatMap(row => row.expiringPoints.map(item => `${row.name}, ${item.points} points (${item.offenceCode || "endorsement"}) expire ${dateLabel(item.expiryDate)}`));
  const dateItems = complianceDue.flatMap(row => row.dateAlerts.map(item => `${row.name}, ${item.label}: ${item.days < 0 ? "EXPIRED" : item.days === 0 ? "expires today" : `due in ${item.days} days`} (${dateLabel(item.value)})`));
  const missingItems = missing.map(row => `${row.name}, driving licence expiry date missing`);
  const endorsementItems = newEndorsements.map(item => `${item.name}, new ${item.offenceCode || "endorsement"}, ${item.points || 0} points, offence date ${dateLabel(item.offenceDate)}`);
  const metric = (value, label, accent) => `<td width="33.33%" valign="top" style="padding:6px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border:1px solid #DCE7EF;border-top:4px solid ${accent};border-radius:8px"><tr><td style="padding:12px 10px"><div style="font-size:25px;line-height:1.2;font-weight:700;color:#102F46">${value}</div><div style="font-size:11px;line-height:1.4;color:#60798B;margin-top:5px">${escapeHtml(label)}</div></td></tr></table></td>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#EEF4F8;font-family:Arial,Helvetica,sans-serif;color:#243B4A"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#EEF4F8"><tr><td align="center" style="padding:22px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:720px;background:#FFFFFF;border:1px solid #DCE7EF;border-radius:14px;overflow:hidden"><tr><td style="background:#102F46;padding:26px 24px 24px"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#9DE8E5">SWANS TRAVEL&nbsp; | &nbsp;DRIVER MANAGEMENT</div><div style="font-size:25px;line-height:1.25;font-weight:700;color:#FFFFFF;margin-top:12px">Daily compliance report</div><div style="font-size:14px;color:#C8DCE7;margin-top:8px">${escapeHtml(now.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}))}</div></td></tr><tr><td style="padding:22px 18px 8px"><div style="font-size:17px;font-weight:700;color:#102F46;margin:0 0 10px">At a glance</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${metric(activeDrivers.length,"Active drivers checked","#35C9C3")}${metric(thresholds.length,"Drivers at 6+ points","#D92D20")}${metric(complianceDue.length,"Documents due or expired","#F79009")}</tr><tr>${metric(pointsExpiring.length,"Drivers with points expiring","#F79009")}${metric(missing.length,"Missing licence expiry","#D92D20")}${metric(newEndorsements.length,"New endorsements in 24 hours","#35C9C3")}</tr></table></td></tr><tr><td style="padding:12px 18px 4px"><div style="font-size:17px;font-weight:700;color:#102F46;margin:0 0 12px">Items requiring attention</div>${section("Points thresholds","Drivers with 6, 9 or 12+ current points",pointItems,"urgent")}${section("Endorsement points expiring","Points due to expire within the next 30 days",expiringPointItems,"warning")}${section("Compliance dates","Licence, DVLA consent, CPC, tachograph card and training dates due within 7 days or already expired",dateItems,"warning")}${section("Missing information","Records requiring completion",missingItems,"urgent")}${section("New endorsements","Endorsements added or updated in the last 24 hours",endorsementItems,"normal")}</td></tr><tr><td style="padding:10px 24px 24px;text-align:center"><a href="${escapeHtml(APP_URL)}/compliance" style="display:inline-block;background:#35C9C3;color:#102F46;text-decoration:none;font-size:14px;font-weight:700;padding:13px 22px;border-radius:8px">Open Compliance Centre</a><div style="font-size:11px;line-height:1.5;color:#71879A;margin-top:16px">Automated daily report. Check the underlying driver record before taking action.</div></td></tr></table></td></tr></table></body></html>`;
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
  const required = ["FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "GOOGLE_MAILER_URL", "GOOGLE_MAILER_SHARED_SECRET"];
  if (required.some(key => !process.env[key])) return response.status(503).json({ error: "Firebase or the existing Ops email service is not configured." });
  let stage = "firebase-service-account";
  try {
    console.info("[driver-compliance-alerts] request accepted", { mode: testMode ? "test" : "scheduled", mailerConfigured: Boolean(process.env.RESEND_API_KEY && process.env.TASK_EMAIL_FROM), mailer: "resend" });
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
