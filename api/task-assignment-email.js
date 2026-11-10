const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY";
const leadEmail = "bc@swanstravel.com";

async function verifiedLeadEmail(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
  if (!response.ok) return null;
  const body = await response.json();
  return body.users?.[0]?.email?.toLowerCase() || null;
}

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const idToken = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!idToken || await verifiedLeadEmail(idToken) !== leadEmail) return response.status(403).json({ error: "Only the operations lead can send task-assignment email." });
  const { recipientEmail, taskTitle, detail, dueAt } = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
  if (typeof recipientEmail !== "string" || !recipientEmail.endsWith("@swanstravel.com") || typeof taskTitle !== "string") return response.status(400).json({ error: "A Swans Travel recipient and task title are required." });
  if (!process.env.GOOGLE_MAILER_URL || !process.env.GOOGLE_MAILER_SHARED_SECRET) return response.status(503).json({ emailStatus: "not_configured", error: "The Google Apps Script mailer is not configured for this project." });
  const due = typeof dueAt === "number" ? new Date(dueAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }) : "No due time set";
  const safeDetail = detail || "Open the workspace to view the full task and update its status.";
  const subject = `Swans Travel | New task assigned: ${taskTitle}`;
  const text = `You have been assigned a new task in Swans Operations Command Centre.\\n\\nTask: ${taskTitle}\\nDue: ${due}\\n\\n${safeDetail}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#eef4f8;font-family:Arial,Helvetica,sans-serif;color:#243b4a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #dce7ef;border-radius:14px;overflow:hidden"><tr><td style="padding:24px;background:#102f46;color:#fff"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#9de8e5">SWANS TRAVEL | OPS COMMAND CENTRE</div><h1 style="font-size:23px;margin:12px 0 0">New task assigned</h1></td></tr><tr><td style="padding:24px"><p style="font-size:14px;line-height:1.6">You have been assigned a new task in Swans Operations Command Centre.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td style="padding:12px;border-bottom:1px solid #e5edf2;font-size:12px;color:#71879a;width:90px">Task</td><td style="padding:12px;border-bottom:1px solid #e5edf2;font-size:14px;font-weight:700">${escapeHtml(taskTitle)}</td></tr><tr><td style="padding:12px;border-bottom:1px solid #e5edf2;font-size:12px;color:#71879a">Due</td><td style="padding:12px;border-bottom:1px solid #e5edf2;font-size:14px">${escapeHtml(due)}</td></tr></table><p style="font-size:14px;line-height:1.6;white-space:pre-line">${escapeHtml(safeDetail)}</p></td></tr><tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e5edf2;font-size:11px;color:#71879a">Automated notification from Swans Travel.</td></tr></table></body></html>`;
  try {
    const mailResponse = await fetch(process.env.GOOGLE_MAILER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.GOOGLE_MAILER_SHARED_SECRET,
        eventKey: `task-assignment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        to: [recipientEmail],
        subject,
        text,
        html,
      }),
    });
    const result = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok || result.ok !== true) {
      return response.status(502).json({ error: result.error || "The Google Apps Script mailer could not accept the assignment alert.", emailStatus: "failed" });
    }
    return response.status(200).json({ emailStatus: "sent", id: result.id });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "The Google Apps Script mailer could not be reached.", emailStatus: "failed" });
  }
}
