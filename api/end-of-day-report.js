import { SignJWT, importPKCS8 } from "jose";

const projectId = "swans-ops-command-centre";
const leadEmail = "bc@swanstravel.com";
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

async function markSent(accessToken, workDate, totals) {
  const fields = { reportDate: { stringValue: workDate }, status: { stringValue: "sent" }, sentAt: { integerValue: String(Date.now()) }, completedCount: { integerValue: String(totals.completed) }, outstandingCount: { integerValue: String(totals.outstanding) } };
  const response = await fetch(`${firestoreBaseUrl}/ops_end_of_day_reports/${workDate}`, { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error("The report-delivery marker could not be saved.");
}

function reportContent(workDate, tasks, members) {
  const memberById = new Map(members.map(member => [member.id, member.displayName]));
  const completed = tasks.filter(task => task.status === "complete");
  const outstanding = tasks.filter(task => task.status !== "complete");
  const completedLines = completed.length ? completed.map(task => `• ${task.title} — completed by ${task.completedByName || "team member"} at ${timeLabel(task.completedAt)}`).join("\n") : "• No tasks were completed.";
  const outstandingLines = outstanding.length ? outstanding.map(task => `• ${task.title} — ${String(task.status || "pending").replace("_", " ")}; owner: ${memberById.get(task.assignedTeamMemberId) || "unassigned"}${task.blockedReason ? `; blocker: ${task.blockedReason}` : ""}`).join("\n") : "• No outstanding tasks.";
  const label = dateLabel(workDate);
  return { subject: `Swans Ops end-of-day report — ${label}`, text: `SWANS OPERATIONS COMMAND CENTRE\nEND-OF-DAY REPORT\n${label}\n\nCOMPLETED (${completed.length})\n${completedLines}\n\nOUTSTANDING (${outstanding.length})\n${outstandingLines}\n\nOpen the Operations Command Centre for task activity and supporting notes.`, totals: { completed: completed.length, outstanding: outstanding.length } };
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
    const emailResponse = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.TASK_EMAIL_FROM, to: [leadEmail], subject: report.subject, text: report.text }) });
    if (!emailResponse.ok) throw new Error("The email provider could not accept the end-of-day report.");
    await markSent(accessToken, workDate, report.totals);
    return response.status(200).json({ reportStatus: "sent", workDate, ...report.totals });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "The end-of-day report could not be sent." });
  }
}
