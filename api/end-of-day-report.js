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
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f3;font-family:Arial,Helvetica,sans-serif;color:#24352e"><div style="max-width:720px;margin:0 auto;padding:24px 12px"><div style="background:#123d3b;border-radius:16px 16px 0 0;padding:26px 28px;color:#fff"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#9ce0d3">SWANS TRAVEL | OPS COMMAND CENTRE</div><h1 style="font-size:25px;line-height:1.25;margin:13px 0 8px">End-of-day operations report</h1><p style="margin:0;color:#e0efeb;font-size:14px">${escapeHtml(label)}</p></div><div style="background:#fff;padding:24px 22px;border:1px solid #e0e8e3;border-top:0"><table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 0 24px"><tr><td style="width:50%;background:#eaf5f0;border-radius:10px;padding:16px"><div style="font-size:11px;color:#587067;text-transform:uppercase;letter-spacing:1px">Completed</div><div style="font-size:30px;font-weight:700;color:#18745c;margin-top:5px">${completed.length}</div></td><td style="width:50%;background:#fff4e8;border-radius:10px;padding:16px"><div style="font-size:11px;color:#80664c;text-transform:uppercase;letter-spacing:1px">Outstanding</div><div style="font-size:30px;font-weight:700;color:#a45a19;margin-top:5px">${outstanding.length}</div></td></tr></table><h2 style="font-size:16px;color:#174b46;margin:22px 0 10px">Completed tasks</h2><table role="presentation" style="width:100%;border-collapse:collapse"><thead><tr style="background:#f2f7f4"><th align="left" style="padding:10px 14px;font-size:10px;color:#68776f;text-transform:uppercase">Task</th><th align="left" style="padding:10px 14px;font-size:10px;color:#68776f;text-transform:uppercase">Completed by</th><th align="left" style="padding:10px 14px;font-size:10px;color:#68776f;text-transform:uppercase">Status</th></tr></thead><tbody>${taskRows(completed, true)}</tbody></table><h2 style="font-size:16px;color:#174b46;margin:26px 0 10px">Outstanding tasks</h2><table role="presentation" style="width:100%;border-collapse:collapse"><thead><tr style="background:#f2f7f4"><th align="left" style="padding:10px 14px;font-size:10px;color:#68776f;text-transform:uppercase">Task</th><th align="left" style="padding:10px 14px;font-size:10px;color:#68776f;text-transform:uppercase">Owner</th><th align="left" style="padding:10px 14px;font-size:10px;color:#68776f;text-transform:uppercase">Status / notes</th></tr></thead><tbody>${taskRows(outstanding, false)}</tbody></table><div style="text-align:center;padding:26px 0 8px"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1d5c63;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:8px">Open Ops Command Centre</a></div><p style="font-size:11px;line-height:1.6;color:#68776f;margin:16px 0 0">This is an automatic end-of-day summary from the Swans Travel Ops Command Centre.</p></div><div style="text-align:center;color:#7b8982;font-size:11px;padding:14px">Swans Travel | Operations</div></div></body></html>`;
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
