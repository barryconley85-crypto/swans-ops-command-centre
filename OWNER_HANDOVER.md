# Swans Operations Command Centre — Owner Handover

## Purpose and ownership

This is the externally hosted production system for Swans Travel operations. The source of truth for application code is the private GitHub repository; the production website is deployed by Vercel; Firebase supplies authentication and operational data. No Manus-managed hosting, Supabase project or Manus database is used for the live site.

| Layer | Live service | Owner/recovery location | What it holds |
| --- | --- | --- | --- |
| Source code | Private GitHub repository `barryconley85-crypto/swans-ops-command-centre` | GitHub account → repositories | All React client code, Vercel functions, Firestore rules, deployment configuration and documentation. |
| Production hosting | Vercel project `swans-ops-command-centre` | Vercel dashboard → project settings | Builds from GitHub `main`, production domains, function logs and server-only environment variables. |
| Website | `https://swans-ops-command-centre.vercel.app` | Vercel → project → domains | The public deployment entry point. |
| Identity | Firebase Authentication, project `swans-ops-command-centre` | Firebase console → Authentication | Work-email/password accounts, password-reset messages and account metadata. Passwords are never visible to the app, GitHub or Firestore. |
| Operational records | Cloud Firestore, project `swans-ops-command-centre`, region `europe-west2` | Firebase console → Firestore Database | Every live operational collection listed below. This is document storage, not SQL tables. |
| File bucket | Firebase Storage bucket `swans-ops-command-centre.firebasestorage.app` | Firebase console → Storage | The bucket exists with the Firebase project. The current app does not upload operational files or customer documents, so there are no application-created file objects to recover. |
| Outgoing end-of-day email | Active: owner-controlled Google Apps Script | Google account `barryconley85@gmail.com` → Apps Script project **Swans Operations — Daily 17:00 Report** | Daily completed/outstanding task report to `bc@swanstravel.com`, scheduled in a 5:00–6:00 p.m. Apps Script window. The separate Vercel task-assignment email relay remains inactive. |

> **Important:** the Firebase web API key in the public Vite configuration identifies the Firebase web application; it is not an administrative credential. Firestore rules and Firebase Authentication are the security controls. Never place a Firebase service-account JSON file, a mail-provider key, passwords or recovery codes in GitHub.

## Firestore collections

Cloud Firestore uses **collections of documents**, rather than relational tables. The current production collection map is below.

| Collection | Purpose | Normal readers/writers |
| --- | --- | --- |
| `ops_members` | Approved team profiles, roles, initials and colours | Approved team; lead manages staffing and roles; each colleague can change only their own initials/colour. |
| `ops_invites` | Pre-approved work-email invitations | Lead only, except an invitee may read their own invitation during sign-up. |
| `ops_tasks` | Daily task records, owners, status and completion attribution | Team reads; permitted operational roles update; lead/manager creates and removes. |
| `ops_task_activity` | Immutable task completion/blocking evidence | Team reads; authorised editors append only. |
| `ops_templates` | Reusable daily task templates | Team reads; lead/manager maintains. |
| `ops_rota` | Shifts, on-call, holiday, leave and unavailable records | Team reads; lead/manager maintains. |
| `ops_handovers` | Continuity handovers, acknowledgement and resolution | Team reads; authorised editors maintain; lead removes. |
| `ops_issues` | Operational exceptions and resolutions | Team reads; authorised editors maintain; lead removes. |
| `ops_on_call_items` | Out-of-hours follow-up actions | Team reads; on-call-capable roles maintain; lead removes. |
| `ops_help_requests` | Help and cover request lifecycle | Team reads; authorised roles create/acknowledge/resolve; lead removes. |
| `ops_readiness` | Historic readiness records from the retired manual check-in workflow | Team may read existing records; all writes are blocked. The collection is retained for history rather than deleted. |
| `ops_shift_prompts` | Shift-start and shift-close responses | Team reads; the author submits their own response; lead removes. |
| `ops_chat_messages` | Shared operational chat | Team reads; on-call-capable roles send; lead removes. |
| `ops_notifications` | Recipient-only task-assignment alerts | Only the recipient reads; lead creates/removes; recipient marks read. |
| `ops_presence` | Recent in-app activity for the respectful “Active now” indicator | Approved team reads; each colleague updates only their own record. It is not a work-hours tracker. |
| `ops_report_views` | Lead’s saved report views | Lead only. |
| `ops_performance_notes` | Lead coaching/recognition notes | Lead writes; team reads according to current policy. |
| `ops_audit_logs` | Append-only activity history: sign-ins and material workspace changes | Any approved colleague can append only their own event; **lead only** reads; no one may edit or delete events through normal app rules. |
| `ops_end_of_day_reports` | Private sent-date marker reserved for the deferred Vercel report endpoint | The active Google route instead keeps its sent-date marker in private Google Apps Script Properties. |

## How to avoid losing ownership

Keep recovery access outside the app itself. You should retain personal, two-factor-protected access to the GitHub account that owns the repository, the Vercel account/team owning the deployment, and the Google account that owns the Firebase project. Add a second trusted business owner to each service where company policy permits, but do not share passwords.

| If this fails | First recovery action |
| --- | --- |
| The website is unavailable | Open Vercel → project → Deployments and inspect the latest production deployment/logs. The source remains in GitHub. |
| A code change is wrong | Re-deploy a previous ready Vercel deployment or revert the GitHub commit, then allow the Git-connected deployment to rebuild. |
| A colleague cannot sign in | Use Firebase Console → Authentication → Users to inspect their account and send a password reset, or use the future lead-only recovery feature once its secure server credential is configured. |
| Firestore access is denied | Check `firestore.rules` in GitHub and Firebase Console → Firestore → Rules. Rules are version-controlled and normally deployed with `npx firebase-tools deploy --only firestore:rules --project swans-ops-command-centre`. |
| A data record was deleted | Check the activity history to identify the action and actor. Firestore should also be protected through Google Cloud backup/export policy; document exports should be scheduled separately before relying on them as recovery. |

## Authentication and account recovery

The app currently uses Firebase email/password accounts. The current lead-managed invitation is **not an emailed invite**: it is an approval record that permits the named `@swanstravel.com` email to create its own account. It prevents an unapproved address from joining, but it does mean each colleague chooses their own password.

Firebase administrators can create users, change a user’s password and disable accounts from the Firebase Console or from a secure server using the Firebase Admin SDK. Firebase never exposes an existing password; the secure recovery model is to set a one-time temporary password or send a password-reset link, then require the colleague to choose their own replacement password. [1]

### Recommended lead-only model

Add a lead-only **Account recovery** panel to Team & performance. It should allow you to select an approved colleague and either generate a reset message or set a temporary password. Every action must be written to `ops_audit_logs`. The password must be transmitted only over the authenticated HTTPS session, used once by a server-side Firebase Admin SDK call, never stored in Firestore, never written to logs, and not returned by the system.

This requires a dedicated Firebase service account stored as a **server-only Vercel environment variable**. There is no secure browser-only way for the app to set another person’s Firebase password: doing so would expose full administrator credentials to every browser. The Firebase Admin SDK is designed specifically for privileged user updates from a secure environment. [1]

Until that server credential is configured, you retain the immediate no-code recovery route in Firebase Console → Authentication → Users. This is already lead-controlled through the owner’s Firebase/Google account and requires no new app deployment.

## End-of-day email: active route and fallback

The active end-of-day automation is the Google-owned script documented in `REPORT_AUTOMATION_STATUS.md`. The existing Vercel endpoint remains intentionally inactive because email delivery and service-account access must not be bundled into client code. An email sent directly to `bc@swanstravel.com` still needs a trusted system permitted to send the message and read the tasks.

| Option | What you manage | Advantages | Limitations |
| --- | --- | --- | --- |
| Existing Vercel endpoint with a mail sender | Server-only values in Vercel, an email sender and a small scheduled request | Uses the existing report implementation, idempotency marker and Europe/London report logic. | Requires one-time secure configuration. A verified sending address may be required by the email provider. |
| Google-owned scheduled script **(active)** | A script under your Google account with one daily trigger and permission to read Firestore, sending with your Google/Workspace mailbox | No Vercel environment variables; the schedule and mail permissions stay in your Google account. The verified project is owned by `barryconley85@gmail.com`, sends to `bc@swanstravel.com`, and uses a date-specific idempotency marker. [2] [3] | The 5:00–6:00 p.m. trigger is an Apps Script scheduling window, not exact-to-the-second timing. It can only send as the mail account or permitted alias you own/control, so do not assume its From address is `bc@swanstravel.com`. |
| In-app report only | Nothing further | No credentials and no external delivery route. | You must open the Report centre yourself; it is not a 17:00 email. |

The selected no-Vercel-secret route is the Google-owned scheduled script. It has a successful non-sending live-data preview and one verified daily `sendEndOfDayReport` trigger. The first scheduled email should be checked from both the recipient mailbox and Apps Script execution history. To pause it, remove the trigger on the Apps Script Triggers page or run `removeDaily17Report`; to restore a single trigger, run `installDaily17Report`.

## References

[1] [Firebase Authentication — Manage Users](https://firebase.google.com/docs/auth/admin/manage-users)

[2] [Google Apps Script — Installable Triggers](https://developers.google.com/apps-script/guides/triggers/installable)

[3] [Google Apps Script — `getOAuthToken`](https://developers.google.com/apps-script/reference/script/script-app)
