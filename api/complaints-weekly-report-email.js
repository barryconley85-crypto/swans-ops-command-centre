const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY";

async function verifiedWorkEmail(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const body = await response.json();
  const email = body.users?.[0]?.email?.toLowerCase();
  return email?.endsWith("@swanstravel.com") ? email : null;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const idToken = request.headers.authorization?.replace(/^Bearer\\s+/i, "");
  const signedInEmail = idToken ? await verifiedWorkEmail(idToken) : null;
  if (!signedInEmail) return response.status(403).json({ error: "Sign in with an approved Swans Travel work account to email this report." });

  const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
  const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim().toLowerCase() : "";
  const subject = typeof body.subject === "string" ? body.subject.slice(0, 180) : "Weekly complaints management report";
  const html = typeof body.html === "string" ? body.html : "";
  const text = typeof body.text === "string" ? body.text : "";
  if (recipientEmail !== signedInEmail) return response.status(403).json({ error: "The report can only be sent to your own signed-in work email address." });
  if (!html || html.length > 500000 || !text) return response.status(400).json({ error: "The report content is missing or too large." });
  if (!process.env.RESEND_API_KEY || !process.env.TASK_EMAIL_FROM) return response.status(202).json({ emailStatus: "not_configured" });

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.TASK_EMAIL_FROM, to: [signedInEmail], subject, html, text }),
  });
  if (!emailResponse.ok) return response.status(502).json({ error: "The email provider could not accept the weekly complaints report." });
  return response.status(200).json({ emailStatus: "sent" });
}
