import { timingSafeEqual } from "node:crypto";

const TEST_RECIPIENT = "barryconley85@gmail.com";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const expectedToken = process.env.COMPLAINT_EMAIL_TEST_TOKEN || "";
  const suppliedToken = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  if (!expectedToken || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return response.status(401).json({ error: "Test authorization failed." });
  }

  const mailerUrl = process.env.GOOGLE_MAILER_URL;
  const sharedSecret = process.env.GOOGLE_MAILER_SHARED_SECRET;
  if (!mailerUrl || !sharedSecret) {
    return response.status(503).json({ error: "The mailer is not configured." });
  }

  const testId = new Date().toISOString();
  const eventKey = "complaint-email-test-" + Date.now();
  const subject = "[TEST ONLY] Swans Ops complaint email alert — " + testId;
  const text = [
    "This is a test of the Swans Ops Command Centre complaint email alert.",
    "No complaint has been created.",
    "This test was sent only to the test recipient.",
    "Test reference: " + eventKey,
  ].join("\n");
  const html = "<!doctype html><html><body style=\"font-family:Arial,sans-serif;color:#24352e\">" +
    "<h1>[TEST ONLY] Complaint email alert</h1>" +
    "<p>This is a test of the Swans Ops Command Centre mailer.</p>" +
    "<p><strong>No complaint has been created.</strong></p>" +
    "<p>This message was sent only to the designated test recipient.</p>" +
    "<p>Test reference: " + eventKey + "</p>" +
    "</body></html>";

  try {
    const mailResponse = await fetch(mailerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: sharedSecret,
        eventKey,
        subject,
        text,
        html,
        to: [TEST_RECIPIENT],
      }),
    });
    const result = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok || result.ok !== true) {
      return response.status(502).json({
        error: result.error || "The email service could not accept the test alert.",
      });
    }
    return response.status(200).json({ emailStatus: "sent", testReference: eventKey });
  } catch {
    return response.status(502).json({ error: "The email service could not be reached." });
  }
}
