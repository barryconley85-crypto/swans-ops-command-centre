const RECIPIENT = "kbs@swanstravel.com";
const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY";

async function verifiedSignedInUser(idToken) {
  if (!idToken) return false;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return false;
    const body = await response.json();
    return Boolean(body.users?.[0]?.localId && body.users?.[0]?.email);
  } catch {
    return false;
  }
}

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const dateTime = value => {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
};

function emailHtml(complaint, appUrl) {
  const rows = [
    ["Complaint reference", complaint.reference],
    ["Client / organisation", complaint.client],
    ["Category", complaint.category],
    ["Logged by", complaint.createdByName],
    ["Date and time", dateTime(complaint.receivedAt)],
    ["Driver", complaint.driverName || "Not specified"],
    ["Vehicle", complaint.vehicle || "Not specified"],
    ["Service date", complaint.serviceDate || "Not specified"],
    ["Service details", complaint.serviceDetails || "Not specified"],
  ].map(([label, value]) => `<tr><td style="padding:10px 12px;color:#64736c;font-size:12px;border-bottom:1px solid #e8eeeb;width:36%">${escapeHtml(label)}</td><td style="padding:10px 12px;color:#24352e;font-size:13px;font-weight:600;border-bottom:1px solid #e8eeeb">${escapeHtml(value)}</td></tr>`).join("");
  const evidence = complaint.sharePointUrl && /^https:\/\//i.test(complaint.sharePointUrl)
    ? `<p style="margin:16px 0 0;font-size:13px"><a href="${escapeHtml(complaint.sharePointUrl)}" style="color:#1d7168">Open supporting evidence</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f3;font-family:Arial,Helvetica,sans-serif;color:#24352e"><div style="max-width:680px;margin:0 auto;padding:24px 12px"><div style="background:#123d3b;border-radius:16px 16px 0 0;padding:26px 28px;color:#fff"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#9ce0d3">SWANS TRAVEL | OPS COMMAND CENTRE</div><h1 style="font-size:25px;line-height:1.25;margin:13px 0 8px">New Complaint Logged</h1><p style="margin:0;color:#e0efeb;font-size:14px">A new complaint has been recorded and is ready for review.</p></div><div style="background:#fff;padding:24px 22px;border:1px solid #e0e8e3;border-top:0"><div style="border-left:4px solid #278a87;padding:3px 0 3px 13px;margin-bottom:20px"><div style="font-size:11px;color:#68776f;text-transform:uppercase;letter-spacing:1px">Complaint</div><div style="font-size:19px;font-weight:700;color:#174b46;margin-top:5px">${escapeHtml(complaint.title)}</div><div style="font-size:12px;color:#64736c;margin-top:5px">${escapeHtml(complaint.reference)}</div></div><table role="presentation" style="width:100%;border-collapse:collapse;background:#fff">${rows}</table><h2 style="font-size:15px;color:#1c4e47;margin:24px 0 8px">Complaint summary</h2><div style="background:#f7faf8;border:1px solid #e5ece7;border-radius:10px;padding:14px;font-size:13px;line-height:1.65;white-space:pre-line">${escapeHtml(complaint.summary)}</div>${evidence}<div style="text-align:center;padding:24px 0 8px"><a href="${escapeHtml(appUrl)}/complaints" style="display:inline-block;background:#1d5c63;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:8px">Open Complaints Management</a></div><p style="font-size:11px;line-height:1.6;color:#68776f;margin:16px 0 0">Confidential, for internal management review. This is an automatic notification from the Swans Travel Ops Command Centre. Replying to this email will not update the complaint record.</p></div><div style="text-align:center;color:#7b8982;font-size:11px;padding:14px">Swans Travel | Ops Command Centre</div></div></body></html>`;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const idToken = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!idToken || !(await verifiedSignedInUser(idToken))) return response.status(401).json({ error: "Your session could not be verified. Please sign in again." });
  if (!process.env.GOOGLE_MAILER_URL || !process.env.GOOGLE_MAILER_SHARED_SECRET) {
    return response.status(503).json({ emailStatus: "not_configured", error: "The Google Apps Script mailer is not configured for this project." });
  }
  const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
  const c = body.complaint;
  if (!c || typeof c.reference !== "string" || typeof c.title !== "string" || typeof c.summary !== "string" || typeof c.receivedAt !== "number") {
    return response.status(400).json({ error: "The new complaint details are incomplete." });
  }
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "");
  const protocol = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const appUrl = (process.env.APP_BASE_URL || (host ? `${protocol}://${host}` : "")).replace(/\/$/, "");
  if (!appUrl) return response.status(500).json({ error: "The app URL is not configured." });
  const subject = `Swans Ops | New complaint ${c.reference} | ${c.title}`;
  const text = [
    "SWANS TRAVEL | OPS COMMAND CENTRE",
    "NEW COMPLAINT LOGGED",
    `Reference: ${c.reference}`,
    `Title: ${c.title}`,
    `Client: ${c.client || "Not specified"}`,
    `Category: ${c.category || "Not specified"}`,
    `Logged by: ${c.createdByName || "Not specified"}`,
    `Date/time: ${dateTime(c.receivedAt)}`,
    "",
    "Summary:",
    c.summary,
    "",
    `Open Complaints Management: ${appUrl}/complaints`,
  ].join("\n");
  try {
    const mailResponse = await fetch(process.env.GOOGLE_MAILER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.GOOGLE_MAILER_SHARED_SECRET,
        eventKey: `complaint-new-${c.reference}-${RECIPIENT}`,
        subject,
        text,
        html: emailHtml(c, appUrl),
        to: [RECIPIENT],
      }),
    });
    const result = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok || result.ok !== true) {
      return response.status(502).json({ error: result.error || "The email service could not accept the complaint alert." });
    }
    return response.status(200).json({ emailStatus: "sent", id: result.id });
  } catch {
    return response.status(502).json({ error: "The email service could not be reached." });
  }
}
