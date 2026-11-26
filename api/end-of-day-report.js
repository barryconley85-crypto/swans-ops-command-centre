import { SignJWT, importPKCS8 } from "jose";

const projectId = "swans-ops-command-centre";
const defaultReportRecipient = "bc@swanstravel.com";
const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const dateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const dateLabel = (value) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "full" }).format(new Date(`${value}T12:00:00Z`));
const timeLabel = (value) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "time not recorded";
const decodeFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.stringValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.nullValue !== undefined ? null : value.booleanValue ?? null)]));

function configuredServiceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) return null;
  try { return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); } catch { return null; }
}

async function googleAccessToken(serviceAccount) {
  const key = await importPKCS8(serviceAccount.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(serviceAccount.client_email).setSubject(serviceAccount.client_email).setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(key);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!tokenResponse.ok) throw new Error("Firebase service authentication was not accepted.");
  return (await tokenResponse.json()).access_token;
}

async function fetchTasks(accessToken, workDate) {
  const query = { structuredQuery: { from: [{ collectionId: "ops_tasks" }], where: { fieldFilter: { field: { fieldPath: "workDate" }, op: "EQUAL", value: { stringValue: workDate } } } } };
  const response = await fetch(`${firestoreBaseUrl}:runQuery`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(query) });
  if (!response.ok) throw new Error("Tasks could not be read for the report.");
  const rows = await response.json();
  return rows.filter(row => row.document).map(row => decodeFields(row.document.fields));
}

async function fetchMembers(accessToken) {
  const response = await fetch(`${firestoreBaseUrl}/ops_members?pageSize=100`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error("Team members could not be read for the report.");
  const body = await response.json();
  return (body.documents || []).map(document => decodeFields(document.fields));
}

async function sentAlready(accessToken, workDate) {
  const response = await fetch(`${firestoreBaseUrl}/ops_end_of_day_reports/${workDate}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("The report-delivery marker could not be checked.");
  return decodeFields((await response.json()).fields).status === "sent";
}

async function markSent(accessToken, workDate, totals, emailId) {
  const fields = { reportDate: { stringValue: workDate }, status: { stringValue: "sent" }, sentAt: { integerValue: String(Date.now()) }, completedCount: { integerValue: String(totals.completed) }, outstandingCount: { integerValue: String(totals.outstanding) }, ...(emailId ? { emailId: { stringValue: emailId } } : {}) };
  const response = await fetch(`${firestoreBaseUrl}/ops_end_of_day_reports/${workDate}`, { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error("The report-delivery marker could not be saved.");
}

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function reportContent(workDate, tasks, members) {
  const memberById = new Map(members.map(member => [member.id, member.displayName]));
  const completed = tasks.filter(task => task.status === "complete");
  const outstanding = tasks.filter(task => task.status !== "complete");
  const completedLines = completed.length ? completed.map(task => `• ${task.title} — completed by ${task.completedByName || "team member"} at ${timeLabel(task.completedAt)}`).join("\\n") : "• No tasks were completed.";
  const outstandingLines = outstanding.length ? outstanding.map(task => `• ${task.title} — ${String(task.status || "pending").replace("_", " ")}; owner: ${memberById.get(task.assignedTeamMemberId) || "unassigned"}${task.blockedReason ? `; blocker: ${task.blockedReason}` : ""}`).join("\\n") : "• No outstanding tasks.";
  const label = dateLabel(workDate);
  const taskRows = (items, isComplete) => items.length ? items.map(task => {
    const owner = isComplete ? (task.completedByName || "Team member") : (memberById.get(task.assignedTeamMemberId) || "Unassigned");
    const status = isComplete ? `Completed at ${timeLabel(task.completedAt)}` : String(task.status || "pending").replace(/_/g, " ");
    return `<tr><td style="padding:13px 14px;border-bottom:1px solid #e8eeeb;color:#24352e;font-size:13px;font-weight:600">${escapeHtml(task.title)}</td><td style="padding:13px 14px;border-bottom:1px solid #e8eeeb;color:#52635c;font-size:12px">${escapeHtml(owner)}</td><td style="padding:13px 14px;border-bottom:1px solid #e8eeeb;font-size:12px;color:${isComplete ? "#18745c" : "#a45a19"}">${escapeHtml(status)}${!isComplete && task.blockedReason ? `<br><span style="color:#7a6250">Blocker: ${escapeHtml(task.blockedReason)}</span>` : ""}</td></tr>`;
  }).join("") : `<tr><td colspan="3" style="padding:18px 14px;color:#718078;font-size:13px">${isComplete ? "No tasks were completed today." : "No outstanding tasks. Everything is clear."}</td></tr>`;
  const appUrl = (process.env.APP_BASE_URL || "https://swans-ops-command-centre-barry-s-projects22.vercel.app").replace(/\/$/, "");
  const taskCards = (items, isComplete) => items.length ? items.map(task => {
    const owner = isComplete ? (task.completedByName || "Team member") : (memberById.get(task.assignedTeamMemberId) || "Unassigned");
    const status = isComplete ? `Completed at ${timeLabel(task.completedAt)}` : String(task.status || "pending").replace(/_/g, " ");
    const accent = isComplete ? "#23845f" : (task.status === "blocked" ? "#b4473d" : "#b97826");
    const detail = !isComplete && task.blockedReason ? `<tr><td style="padding:0 14px 13px;color:#8b5145;font-size:12px;line-height:1.5">Blocker: ${escapeHtml(task.blockedReason)}</td></tr>` : "";
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5ece8;border-radius:10px;margin:0 0 9px;background:#ffffff"><tr><td style="padding:13px 14px 4px;font-size:14px;line-height:1.45;font-weight:700;color:#243b34">${escapeHtml(task.title)}</td></tr><tr><td style="padding:3px 14px 12px;font-size:12px;line-height:1.5;color:#65766e">${isComplete ? "Completed by" : "Assigned to"} <strong style="color:#344d43">${escapeHtml(owner)}</strong><span style="color:#a1aaa5"> &nbsp;·&nbsp; </span><span style="color:${accent};font-weight:700">${escapeHtml(status)}</span></td></tr>${detail}</table>`;
  }).join("") : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5ece8;border-radius:10px;background:#f8fbf9"><tr><td style="padding:18px 14px;color:#718078;font-size:13px;line-height:1.5">${isComplete ? "No tasks were completed today." : "No outstanding tasks. Everything is clear."}</td></tr></table>`;
  const appUrl = (process.env.APP_BASE_URL || "https://ops.swansapps.co.uk").replace(/\\/$/, "");
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Swans Ops end-of-day report</title></head>
<body style="margin:0;padding:0;background:#f0f4f2;font-family:Arial,Helvetica,sans-serif;color:#263a32;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f0f4f2"><tr><td align="center" style="padding:22px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:660px">
<tr><td style="background:#102f46;padding:25px 23px 23px;border-radius:14px 14px 0 0">
<div style="font-size:11px;line-height:1.4;letter-spacing:1.8px;font-weight:700;color:#8edbd7">SWANS TRAVEL&nbsp; | &nbsp;OPS COMMAND CENTRE</div>
<div style="font-size:24px;line-height:1.25;font-weight:700;color:#ffffff;margin-top:12px">End-of-day report</div>
<div style="font-size:14px;line-height:1.5;color:#d2e2e9;margin-top:6px">${escapeHtml(label)}</div>
</td></tr>
<tr><td style="background:#ffffff;padding:21px 18px 24px;border:1px solid #e0e8e3;border-top:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 23px"><tr>
<td width="50%" style="padding:0 5px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf5f0;border-radius:10px"><tr><td style="padding:14px"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#587067;font-weight:700">Completed</div><div style="font-size:31px;line-height:1.2;font-weight:700;color:#18745c;margin-top:5px">${completed.length}</div></td></tr></table></td>
<td width="50%" style="padding:0 0 0 5px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff3e6;border-radius:10px"><tr><td style="padding:14px"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#80664c;font-weight:700">Outstanding</div><div style="font-size:31px;line-height:1.2;font-weight:700;color:#a45a19;margin-top:5px">${outstanding.length}</div></td></tr></table></td>
</tr></table>
<h2 style="font-size:16px;line-height:1.3;color:#174b46;margin:0 0 11px">Completed today <span style="font-size:12px;color:#718078;font-weight:400">(${completed.length})</span></h2>
${taskCards(completed, true)}
<h2 style="font-size:16px;line-height:1.3;color:#174b46;margin:24px 0 11px">Still outstanding <span style="font-size:12px;color:#a45a19;font-weight:400">(${outstanding.length})</span></h2>
${taskCards(outstanding, false)}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0"><tr><td align="center" bgcolor="#1d5c63" style="border-radius:8px"><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:13px 21px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">Open Ops Command Centre</a></td></tr></table>
<p style="font-size:11px;line-height:1.6;color:#718078;margin:20px 0 0">This is an automatic end-of-day summary from the Swans Travel Ops Command Centre.</p>
</td></tr>
<tr><td align="center" style="padding:14px 8px;color:#829089;font-size:11px;line-height:1.5">Swans Travel&nbsp; | &nbsp;Operations</td></tr>
</table></td></tr></table>
</body></html>`;

  return { subject: `Swans Ops end-of-day report — ${label}`, text: `SWANS OPERATIONS COMMAND CENTRE\\nEND-OF-DAY REPORT\\n${label}\\n\\nCOMPLETED (${completed.length})\\n${completedLines}\\n\\nOUTSTANDING (${outstanding.length})\\n${outstandingLines}\\n\\nOpen the Operations Command Centre for task activity and supporting notes.`, html, totals: { completed: completed.length, outstanding: outstanding.length } };
}

export default async function handler(request, response) {
  const cronSecret = process.env.REPORT_CRON_SECRET;
  const suppliedSecret = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  if (!cronSecret || suppliedSecret !== cronSecret) return response.status(401).json({ error: "Unauthorised report trigger" });
  const serviceAccount = configuredServiceAccount();
  if (!serviceAccount || !process.env.RESEND_API_KEY || !process.env.TASK_EMAIL_FROM) return response.status(202).json({ reportStatus: "not_configured" });
  const workDate = /^\d{4}-\d{2}-\d{2}$/.test(request.query?.date || "") ? request.query.date : dateKey();
  try {
    const accessToken = await googleAccessToken(serviceAccount);
    if (await sentAlready(accessToken, workDate)) return response.status(200).json({ reportStatus: "already_sent", workDate });
    const [tasks, members] = await Promise.all([fetchTasks(accessToken, workDate), fetchMembers(accessToken)]);
    const report = reportContent(workDate, tasks, members);
    const recipient = process.env.EOD_REPORT_TO || defaultReportRecipient;
    const emailResponse = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `swans-eod/${workDate}` }, body: JSON.stringify({ from: process.env.TASK_EMAIL_FROM, to: [recipient], subject: report.subject, text: report.text, html: report.html }) });
    if (!emailResponse.ok) throw new Error("The email provider could not accept the end-of-day report.");
    const email = await emailResponse.json();
    await markSent(accessToken, workDate, report.totals, email.id);
    return response.status(200).json({ reportStatus: "sent", workDate, ...report.totals });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "The end-of-day report could not be sent." });
  }
}
