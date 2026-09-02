# Firebase and Vercel Setup

The external release uses the Firebase web app registered as **Swans Ops Web** in the Firebase project `swans-ops-command-centre`. Firebase Auth and Firestore power the workspace. Task resources are stored as links to the company’s SharePoint or OneDrive documents; the app does not upload files to Firebase Storage.

## Vercel environment variables

Add the following public variables to the Vercel project before deployment. Firebase Web API keys identify the client project; they are not private credentials and are protected by Firebase Authentication and Firestore rules.

| Variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `swans-ops-command-centre.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `swans-ops-command-centre` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `875238693473` |
| `VITE_FIREBASE_APP_ID` | `1:875238693473:web:fffefa9b2fe3e79412e820` |

## Task resources

The Command Centre stores SharePoint and OneDrive links in Firestore instead of uploading duplicate files to Firebase Storage. This keeps the company’s existing Microsoft 365 permissions authoritative and means the Firebase project does not need a Cloud Storage bucket or Blaze billing for task resources.

## Access process

The initial operations lead signs up with `bc@swanstravel.com`. The lead then creates the remaining team members in the directory; this creates a private invitation matched to their work email. A colleague can then create an account only with the email already present in the team directory.

## Data protection

Before inviting the team, apply the `firestore.rules` file in Firebase Console → Firestore → Rules. Those rules use a default-deny policy and allow only authenticated, approved Swans Travel work-email users to access the workspace.

## Collaborative operations collections

The live workspace now uses `ops_chat_messages` for the shared operations channel, `ops_on_call_items` for out-of-hours actions and `ops_notifications` for task-assignment alerts. The notification rule returns only the intended recipient’s alerts, while the operations lead creates assignment notifications when a task is allocated.

To publish the version-controlled rules after a future change, sign in to the Firebase CLI and run:

```bash
npx firebase-tools deploy --only firestore:rules --project swans-ops-command-centre
```

## Optional task-assignment email

The application already creates an in-app pop-up and retained alert whenever the operations lead assigns a task. It also calls a secure Vercel endpoint that can send a matching email without exposing a provider credential in the browser. Until the following server-side Vercel environment variables are supplied, the endpoint returns a successful `not_configured` response and the in-app alert remains the delivery channel.

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Secret key from a free-tier Resend account. |
| `TASK_EMAIL_FROM` | A Resend-verified sender, such as `Swans Operations <ops@swanstravel.com>`. |

The endpoint accepts only authenticated requests from the configured operations-lead work email and only sends to `@swanstravel.com` recipients.

## Every-day 17:00 end-of-day report

`/api/end-of-day-report` is a server-side endpoint for an unattended report to `bc@swanstravel.com`. It derives the operational date in the **Europe/London** time zone, lists that date’s completed and outstanding tasks, identifies the person who completed each completed task, and stores a private sent-date marker in `ops_end_of_day_reports` to prevent duplicate delivery when a scheduler retries.

It must never receive a Firebase or email-provider secret in the browser or in source control. Add these **server-only** Vercel production environment variables:

| Variable | Purpose |
| --- | --- |
| `REPORT_CRON_SECRET` | A newly generated long random value used only in the external scheduler’s `Authorization: Bearer …` header. |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | Base64 encoding of a dedicated Firebase/Google service-account JSON key. Give that service account the minimum necessary Firestore read/write role; do not use a personal account credential. |
| `RESEND_API_KEY` | Secret key from the free-tier Resend account used to send both report and optional assignment emails. |
| `TASK_EMAIL_FROM` | A Resend-verified sender, such as `Swans Operations <ops@swanstravel.com>`. |
| `EOD_REPORT_TO` | Optional recipient override. For the approved temporary route, set this to `barryconley85@gmail.com`. Remove it after a verified Swans sender is available to return the report recipient to `bc@swanstravel.com`. |

The report remains safely inactive until all four values are configured: a correctly authenticated request returns `not_configured` rather than sending incomplete email.

### Precise external scheduler configuration

Use a free [cron-job.org](https://cron-job.org/en/) job after the endpoint is deployed. Configure **one active job** as follows:

| Setting | Value |
| --- | --- |
| URL | `https://swans-ops-command-centre.vercel.app/api/end-of-day-report` |
| HTTP method | `GET` |
| Schedule | Every day at `17:00` |
| Time zone | `Europe/London` |
| Custom request header | `Authorization: Bearer <the exact REPORT_CRON_SECRET value>` |

Run the scheduler’s test action once after all secrets are present. A successful first execution returns `reportStatus: "sent"`; a second request for the same operational date returns `reportStatus: "already_sent"` and sends no second email. The endpoint also sends Resend’s documented `Idempotency-Key` header (`swans-eod/YYYY-MM-DD`) to protect the same-day retry window even if a function interruption occurs after the provider accepts the email but before the private sent-date marker is updated. Do not use the `date` query parameter in the production scheduler; it exists only to support controlled troubleshooting.
