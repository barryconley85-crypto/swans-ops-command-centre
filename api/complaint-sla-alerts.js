import { SignJWT, importPKCS8 } from "jose";

const PROJECT_ID = "swans-ops-command-centre";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents";
const APP_URL = (process.env.APP_BASE_URL || "https://swans-ops-command-centre-barry-s-projects22.vercel.app").replace(/\/$/, "");
const BANK_HOLIDAYS = new Set([
  "2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28",
  "2027-01-01","2027-03-26","2027-03-29","2027-05-03","2027-05-31","2027-08-30","2027-12-27","2027-12-28"
]);

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
function firestoreValue(value) {
  return { integerValue: String(value) };
}
function londonParts(timestamp) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}
function isWorkingMinute(timestamp) {
  const p = londonParts(timestamp);
  const day = ["Mon","Tue","Wed","Thu","Fri"].includes(p.weekday);
  const date = p.year + "-" + p.month + "-" + p.day;
  const minute = Number(p.hour) * 60 + Number(p.minute);
  return day && !BANK_HOLIDAYS.has(date) && minute >= 540 && minute < 1020;
}
function workingMinutesBetween(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  let cursor = Math.ceil(from / 60000) * 60000;
  let count = 0;
  while (cursor < to) {
    if (isWorkingMinute(cursor)) count++;
    cursor += 60000;
  }
  return count;
}
function configuredServiceAccount() {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
    return raw ? JSON.parse(Buffer.from(raw, "base64").toString("utf8")) : null;
  } catch { return null; }
}
async function googleAccessToken(account) {
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email).setSubject(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(key);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!tokenResponse.ok) throw new Error("Firebase service authentication was not accepted.");
  return (await tokenResponse.json()).access_token;
}
async function listCollection(token, collection) {
  const documents = [];
  let pageToken = "";
  do {
    const url = FIRESTORE + "/" + collection + "?pageSize=1000" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const result = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!result.ok) throw new Error("Could not read the " + collection + " records from Firebase.");
    const body = await result.json();
    for (const doc of body.documents || []) {
      documents.push({ path: doc.name, id: doc.name.split("/").pop(), ...decodeFields(doc.fields) });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return documents;
}
function activeRecipient(members, firstName) {
  const matches = members.filter(member =>
    String(member.status || "").toLowerCase() === "active" &&
    new RegExp("^" + firstName + "\\b", "i").test(String(member.displayName || "")) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(member.email || "").trim())
  );
  return matches.length === 1 ? String(matches[0].email).trim().toLowerCase() : null;
}
async function sendMail(payload) {
  const result = await fetch(process.env.GOOGLE_MAILER_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: process.env.GOOGLE_MAILER_SHARED_SECRET, ...payload })
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok || body.ok !== true) throw new Error(body.error || "Google Apps Script mailer rejected the alert.");
  return body;
}
async function markWarningSent(token, documentPath, field, timestamp) {
  const url = "https://firestore.googleapis.com/v1/" + documentPath + "?updateMask.fieldPaths=" + encodeURIComponent(field);
  const result = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { [field]: firestoreValue(timestamp) } })
  });
  if (!result.ok) throw new Error("The warning was sent but its delivery marker could not be saved.");
}
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
function emailContent(complaint, kind, dueAt, remaining) {
  const acknowledgement = kind === "acknowledgement";
  const label = acknowledgement ? "Client acknowledgement" : "Full client response";
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;
  const remainingText = hours ? hours + "h " + mins + "m of working time remaining" : mins + " working minutes remaining";
  const dueText = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short"
  }).format(new Date(dueAt));
  const subject = "Swans Ops | SLA warning | " + complaint.reference + " | " + label + " due soon";
  const text = [
    "SWANS TRAVEL | OPS COMMAND CENTRE", "COMPLAINT SLA WARNING", "",
    complaint.reference + " | " + (complaint.title || "Complaint"),
    "Client: " + (complaint.client || "Not recorded"),
    "Milestone: " + label,
    "Deadline: " + dueText,
    "Time remaining: " + remainingText,
    "", "Please review the complaint and ensure the required action is completed before the deadline.",
    "Open Complaints Management: " + APP_URL + "/complaints"
  ].join("\n");
  const html = '<!doctype html><html><body style="margin:0;background:#f1f5f3;font-family:Arial,Helvetica,sans-serif;color:#24352e"><div style="max-width:680px;margin:0 auto;padding:24px 12px"><div style="background:#123d3b;border-radius:16px 16px 0 0;padding:26px 28px;color:#fff"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#9ce0d3">SWANS TRAVEL | OPS COMMAND CENTRE</div><h1 style="font-size:24px;margin:13px 0 8px">Complaint SLA warning</h1><p style="margin:0;color:#e0efeb;font-size:14px">Action is required before the complaint deadline.</p></div><div style="background:#fff;padding:24px 22px;border:1px solid #e0e8e3;border-top:0"><div style="border-left:4px solid #d99a42;padding:3px 0 3px 13px;margin-bottom:20px"><div style="font-size:11px;color:#68776f;text-transform:uppercase;letter-spacing:1px">' + escapeHtml(label) + '</div><div style="font-size:20px;font-weight:700;color:#174b46;margin-top:5px">' + escapeHtml(complaint.reference) + '</div><div style="font-size:14px;color:#52635c;margin-top:5px">' + escapeHtml(complaint.title || "Complaint") + '</div></div><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:10px;color:#64736c;border-bottom:1px solid #e8eeeb">Client</td><td style="padding:10px;color:#24352e;font-weight:600;border-bottom:1px solid #e8eeeb">' + escapeHtml(complaint.client || "Not recorded") + '</td></tr><tr><td style="padding:10px;color:#64736c;border-bottom:1px solid #e8eeeb">Deadline</td><td style="padding:10px;color:#24352e;font-weight:600;border-bottom:1px solid #e8eeeb">' + escapeHtml(dueText) + '</td></tr><tr><td style="padding:10px;color:#64736c">Time remaining</td><td style="padding:10px;color:#a45a19;font-weight:700">' + escapeHtml(remainingText) + '</td></tr></table><p style="font-size:13px;line-height:1.6;color:#52635c;margin:20px 0">Please review the complaint and ensure the required action is completed before the deadline.</p><div style="text-align:center;padding:12px 0 8px"><a href="' + escapeHtml(APP_URL + "/complaints") + '" style="display:inline-block;background:#1d5c63;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:8px">Open Complaints Management</a></div><p style="font-size:11px;line-height:1.6;color:#68776f;margin:16px 0 0">This is an automatic warning from the Swans Travel Ops Command Centre.</p></div></div></body></html>';
  return { subject, text, html };
}
export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) return response.status(405).json({ error: "Method not allowed" });
  const secret = process.env.REPORT_CRON_SECRET;
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return response.status(401).json({ error: "Unauthorised complaint SLA trigger" });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || !process.env.GOOGLE_MAILER_URL || !process.env.GOOGLE_MAILER_SHARED_SECRET) {
    return response.status(503).json({ error: "Firebase or the Google Apps Script mailer is not configured." });
  }
  try {
    const account = configuredServiceAccount();
    if (!account?.private_key || !account?.client_email) throw new Error("The Firebase service account configuration is invalid.");
    const token = await googleAccessToken(account);
    const [complaints, members] = await Promise.all([listCollection(token, "ops_issues"), listCollection(token, "ops_members")]);
    const stephen = activeRecipient(members, "Stephen");
    const coral = activeRecipient(members, "Coral");
    if (!stephen || !coral) {
      return response.status(409).json({ error: "Could not uniquely identify the active Stephen and Coral email recipients in ops_members. No alerts were sent." });
    }
    const recipients = [...new Set(["bc@swanstravel.com", stephen, coral])];
    const now = Date.now();
    let sent = 0;
    let skipped = 0;
    const errors = [];
    for (const complaint of complaints.filter(item => item.recordType === "complaint" && item.stage !== "closed")) {
      const receivedAt = Number(complaint.receivedAt);
      if (!Number.isFinite(receivedAt) || receivedAt <= 0) { skipped++; continue; }
      const milestones = [
        {
          kind: "acknowledgement", dueAt: Number(complaint.acknowledgementDueAt),
          complete: Boolean(complaint.acknowledgedAt), marker: "acknowledgementWarningSentAt", threshold: 120
        },
        {
          kind: "response",
          dueAt: Number(complaint.responseDueAt) || Number(complaint.responseDueAt) === 0 ? Number(complaint.responseDueAt) : 0,
          complete: Boolean(String(complaint.clientResponse || "").trim()),
          marker: "responseWarningSentAt", threshold: 240
        }
      ];
      if (!milestones[1].dueAt) {
        // The UI's response SLA is 40 working hours after receipt. Older records may not store responseDueAt.
        let cursor = receivedAt;
        let remaining = 40 * 60;
        while (remaining > 0) {
          cursor += 60000;
          if (isWorkingMinute(cursor)) remaining--;
        }
        milestones[1].dueAt = cursor;
      }
      for (const milestone of milestones) {
        if (milestone.complete || complaint[milestone.marker] || !Number.isFinite(milestone.dueAt) || milestone.dueAt <= now) { skipped++; continue; }
        const remaining = workingMinutesBetween(now, milestone.dueAt);
        if (remaining <= 0 || remaining > milestone.threshold) { skipped++; continue; }
        try {
          const content = emailContent(complaint, milestone.kind, milestone.dueAt, remaining);
          const key = "complaint-sla-" + complaint.reference + "-" + milestone.kind;
          await sendMail({ eventKey: key, subject: content.subject, text: content.text, html: content.html, to: recipients });
          await markWarningSent(token, complaint.path, milestone.marker, now);
          sent++;
        } catch (error) {
          errors.push({ reference: complaint.reference || complaint.id, milestone: milestone.kind, error: error instanceof Error ? error.message : "Alert failed" });
        }
      }
    }
    return response.status(errors.length ? 207 : 200).json({ status: errors.length ? "partial" : "checked", checked: complaints.length, sent, skipped, errors });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Complaint SLA check failed." });
  }
}