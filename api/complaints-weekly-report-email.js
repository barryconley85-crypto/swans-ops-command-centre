const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY";
const authorisedReportSenders = new Set(["bc@swanstravel.com", "barryconley85@gmail.com", "barryconley85@gmail.co.uk"]);

async function verifiedLeadEmail(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const body = await response.json();
  return body.users?.[0]?.email?.toLowerCase() || null;
}
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const money = value => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value || 0));
const dateLabel = value => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
};
function reportHtml(data) {
  const s = data.summary || {};
  const cards = [
    ["Complaints received", s.received ?? 0, "#EAF3EF", "#1E6258"],
    ["Still open", s.open ?? 0, "#FFF4DE", "#925D12"],
    ["Closed", s.closed ?? 0, "#E8F3FF", "#245D91"],
    ["Overdue", s.overdue ?? 0, "#FDECEC", "#A22E32"],
    ["Refund / credit value", money(s.refundTotal), "#EEF0FF", "#414C9B"],
  ];
  const cardHtml = cards.map(([label,value,bg,fg]) => `<td style="padding:6px;width:20%;vertical-align:top"><div style="background:${bg};border-radius:10px;padding:14px 10px;min-height:70px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:${fg};font-weight:700">${escapeHtml(label)}</div><div style="font-size:22px;font-weight:700;color:${fg};margin-top:8px">${escapeHtml(value)}</div></div></td>`).join("");
  const patternRows = (items) => items?.length ? items.map(x => `<tr><td style="padding:9px 12px;border-bottom:1px solid #e8eeeb">${escapeHtml(x.name)}</td><td style="padding:9px 12px;border-bottom:1px solid #e8eeeb;text-align:right;font-weight:700">${escapeHtml(x.count)}</td></tr>`).join("") : '<tr><td colspan="2" style="padding:12px;color:#66756e">No repeat links recorded in this period.</td></tr>';
  const complaints = data.complaints || [];
  const complaintRows = complaints.length ? complaints.map((x,i) => `<tr style="background:${i%2?"#f7faf8":"#ffffff"}"><td style="padding:10px;border-bottom:1px solid #e8eeeb;white-space:nowrap"><strong>${escapeHtml(x.reference)}</strong><br><span style="color:#64736c;font-size:12px">${escapeHtml(x.title)}</span></td><td style="padding:10px;border-bottom:1px solid #e8eeeb">${escapeHtml(x.client)}<br><span style="color:#64736c;font-size:12px">${escapeHtml(dateLabel(x.receivedAt))}</span></td><td style="padding:10px;border-bottom:1px solid #e8eeeb">${escapeHtml(x.driverName)}<br><span style="color:#64736c;font-size:12px">${escapeHtml(x.vehicle)}</span></td><td style="padding:10px;border-bottom:1px solid #e8eeeb">${escapeHtml(x.stage)}<br><span style="color:#64736c;font-size:12px">${escapeHtml(x.outcome)}</span></td><td style="padding:10px;border-bottom:1px solid #e8eeeb">${escapeHtml(({none:"No refund recorded",pending_approval:"Awaiting approval",approved:"Approved — payment not confirmed",issued:"Issued",declined:"Declined"})[x.financialStatus] || x.financialStatus)}<br><strong>${escapeHtml(money(x.refundAmount))}</strong>${x.financialNote ? `<br><span style="color:#64736c;font-size:12px">${escapeHtml(x.financialNote)}</span>` : ""}</td></tr>`).join("") : '<tr><td colspan="5" style="padding:18px;text-align:center;color:#66756e">No complaints were logged in the selected period.</td></tr>';
  const actions = [];
  if (Number(s.overdue) > 0) actions.push(`${s.overdue} complaint(s) are flagged as overdue and should be reviewed.`);
  if (Number(s.open) > 0) actions.push(`${s.open} complaint(s) remain open; confirm an owner and next action for each.`);
  if (Number(s.pendingFinancial) > 0) actions.push(`Check approval or payment progress for ${s.pendingFinancial} refund/credit case(s).`);
  const actionHtml = actions.length ? actions.map(x=>`<li style="margin:0 0 8px">${escapeHtml(x)}</li>`).join("") : "<li>No overdue or outstanding financial actions are flagged by the recorded data.</li>";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f3;font-family:Arial,Helvetica,sans-serif;color:#24352e"><div style="max-width:960px;margin:0 auto;padding:24px 12px"><div style="background:#123d3b;border-radius:16px 16px 0 0;padding:28px 30px;color:#fff"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#9ce0d3">SWANS TRAVEL | MANAGEMENT REPORTING</div><h1 style="font-size:26px;line-height:1.25;margin:12px 0 8px">Weekly Complaints Report</h1><div style="font-size:14px;color:#e0efeb">Reporting period: ${escapeHtml(dateLabel(data.period?.start))} – ${escapeHtml(dateLabel(data.period?.end))}</div></div><div style="background:#fff;padding:24px 20px;border:1px solid #e0e8e3;border-top:0"><p style="margin:0 0 16px;color:#586a61;font-size:13px">Prepared ${escapeHtml(dateLabel(Date.now()))}. This report summarises complaint records entered in the Ops Command Centre for the selected period.</p><h2 style="font-size:17px;margin:20px 0 8px;color:#1c4e47">Executive summary</h2><table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;margin:0 -6px"><tr>${cardHtml}</tr></table><table role="presentation" style="width:100%;margin-top:8px;border-collapse:collapse"><tr><td style="padding:8px 0;color:#586a61;font-size:13px">Refunds/credits awaiting approval or approved</td><td style="padding:8px 0;text-align:right;font-weight:700">${escapeHtml(s.pendingFinancial ?? 0)} case(s)</td></tr><tr><td style="padding:8px 0;color:#586a61;font-size:13px">Refunds/credits marked as issued</td><td style="padding:8px 0;text-align:right;font-weight:700">${escapeHtml(s.issuedFinancial ?? 0)} case(s)</td></tr></table><div style="background:#f7faf8;border:1px solid #e5ece7;border-radius:12px;padding:16px;margin-top:20px"><h2 style="font-size:17px;margin:0 0 10px;color:#1c4e47">Management attention</h2><ul style="padding-left:20px;margin:0;line-height:1.6;font-size:14px">${actionHtml}</ul></div><h2 style="font-size:17px;margin:24px 0 10px;color:#1c4e47">Repeat patterns to review</h2><div style="display:block;margin-bottom:14px"><h3 style="font-size:13px;color:#50665b;margin:0 0 6px">Drivers appearing more than once</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${patternRows(data.repeatDrivers)}</tbody></table></div><div><h3 style="font-size:13px;color:#50665b;margin:0 0 6px">Vehicles appearing more than once</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${patternRows(data.repeatVehicles)}</tbody></table></div><p style="font-size:12px;line-height:1.5;color:#68776f;margin:10px 0 0">Repeat appearances are indicators for management review only and are not findings of fault.</p><h2 style="font-size:17px;margin:26px 0 10px;color:#1c4e47">Complaint register</h2><div style="font-size:12px;color:#68776f;margin-bottom:8px">${complaints.length} complaint record(s) in this reporting period</div><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#eaf2ed;text-align:left"><th style="padding:10px">Reference / title</th><th style="padding:10px">Client / date</th><th style="padding:10px">Driver / vehicle</th><th style="padding:10px">Stage / outcome</th><th style="padding:10px">Financial impact</th></tr></thead><tbody>${complaintRows}</tbody></table><div style="border-top:1px solid #e5ece7;margin-top:24px;padding-top:14px;color:#6b7972;font-size:11px;line-height:1.6">Confidential — for internal management review. This report reflects records entered in the Swans Travel Ops Command Centre. Missing outcomes or financial fields have not been assumed. Refund/credit totals reflect amounts recorded on cases and do not necessarily represent payments made during this reporting period.</div></div><div style="text-align:center;color:#7b8982;font-size:11px;padding:14px">Swans Travel | Ops Command Centre</div></div></body></html>`;
}
export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const idToken = request.headers.authorization?.replace(/^Bearer\\s+/i, "");
  if (!idToken || !authorisedReportSenders.has(await verifiedLeadEmail(idToken))) return response.status(403).json({ error: "This account is not authorised to send the management report. Sign in with an authorised Swans account." });
  if (!process.env.GOOGLE_MAILER_URL || !process.env.GOOGLE_MAILER_SHARED_SECRET) return response.status(503).json({ emailStatus: "not_configured", error: "The existing Google Apps Script mailer is not connected to this project yet. Copy GOOGLE_MAILER_URL and GOOGLE_MAILER_SHARED_SECRET from the Swans Accident Management Vercel project into this project." });
  const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
  const recipient = typeof body.recipientEmail === "string" ? body.recipientEmail.trim() : "";
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipient)) return response.status(400).json({ error: "Enter a valid recipient email address." });
  if (!body.period?.start || !body.period?.end || !Array.isArray(body.complaints) || !body.summary) return response.status(400).json({ error: "The reporting period and report data are required." });
  if (body.complaints.length > 500) return response.status(413).json({ error: "This report contains too many complaint records to email in one message." });
  const subject = `Swans Travel | MD Weekly Complaints Report | ${body.period.start} to ${body.period.end}`;
  const textBody = `SWANS TRAVEL | WEEKLY COMPLAINTS MANAGEMENT REPORT\\nReporting period: ${body.period.start} to ${body.period.end}\\nComplaints: ${body.summary.received}; Open: ${body.summary.open}; Closed: ${body.summary.closed}; Overdue: ${body.summary.overdue}; Refund/credit value recorded: ${money(body.summary.refundTotal)}.\\nThe full management report is included in the HTML version of this email.`;
  try {
    const mailResponse = await fetch(process.env.GOOGLE_MAILER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.GOOGLE_MAILER_SHARED_SECRET,
        eventKey: `complaints-weekly-${body.period.start}-${body.period.end}-${recipient.toLowerCase()}`,
        subject,
        text: textBody,
        html: reportHtml(body),
        to: [recipient],
      }),
    });
    const result = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok || result.ok !== true) {
      return response.status(502).json({ error: result.error || "Google mailer could not accept the report." });
    }
    return response.status(200).json({ emailStatus: "sent", id: result.id });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Google mailer could not be reached." });
  }
}
