const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY";
const leadEmail = "bc@swanstravel.com";

async function verifiedLeadEmail(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
  if (!response.ok) return null;
  const body = await response.json();
  return body.users?.[0]?.email?.toLowerCase() || null;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const idToken = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!idToken || await verifiedLeadEmail(idToken) !== leadEmail) return response.status(403).json({ error: "Only the operations lead can send task-assignment email." });
  const { recipientEmail, taskTitle, detail, dueAt } = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
  if (typeof recipientEmail !== "string" || !recipientEmail.endsWith("@swanstravel.com") || typeof taskTitle !== "string") return response.status(400).json({ error: "A Swans Travel recipient and task title are required." });
  if (!process.env.RESEND_API_KEY || !process.env.TASK_EMAIL_FROM) return response.status(202).json({ emailStatus: "not_configured" });
  const due = typeof dueAt === "number" ? new Date(dueAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }) : "No due time set";
  const emailResponse = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.TASK_EMAIL_FROM, to: [recipientEmail], subject: `Swans Ops: new task assigned — ${taskTitle}`, text: `You have been assigned a new task in Swans Operations Command Centre.\n\nTask: ${taskTitle}\nDue: ${due}\n\n${detail || "Open the workspace to view the full task and update its status."}` }) });
  if (!emailResponse.ok) return response.status(502).json({ error: "The email provider could not accept the assignment alert." });
  return response.status(200).json({ emailStatus: "sent" });
}
