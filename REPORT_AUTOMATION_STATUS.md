# Daily 17:00 Report Automation Status

## Active owner-controlled Google route

| Item | Verified value |
| --- | --- |
| Automation owner | Barry Conley — `barryconley85@gmail.com` |
| Google Apps Script project | **Swans Operations — Daily 17:00 Report** |
| Project editor | `https://script.google.com/home/projects/1OJr3NPWoAmEkP7XymNR8gr1lpXlr30m-vH5kABbZSVIKC5XOtAL2l6vE/edit` |
| Recipient | `bc@swanstravel.com` only |
| Script time zone | `Europe/London` |
| Data source | Firestore project `swans-ops-command-centre`, collection `ops_tasks`, filtered by `workDate` |
| Trigger | One owner-owned, time-driven daily trigger running `sendEndOfDayReport` |
| Trigger window | 5:00 p.m. to 6:00 p.m.; Apps Script time triggers run within a scheduling window, not at an exact minute or second |
| Delivery sender | The Google account or permitted mail alias configured for `barryconley85@gmail.com`; the actual From address must not be assumed to be `bc@swanstravel.com` |

## Verified activation evidence

On **28 August 2026**, the Apps Script manifest was saved with the `Europe/London` project time zone and the narrowly required scopes for Firestore access, outbound requests, mail, and trigger management. The owner completed Google’s consent process for this private, owner-owned script.

The safe `previewEndOfDayReport` function completed at **01:19:49** after querying live Firestore data. It generated the operational report for `2026-08-28` with **0 completed** and **0 outstanding** tasks. This preview did not send an email and did not write a sent-date marker.

The `installDaily17Report` function completed at **01:22:53**. The Apps Script trigger register was then inspected and showed **exactly one** trigger, owned by the Google account, with event type **time-based** and function **`sendEndOfDayReport`**. Its detailed view showed a daily day-timer window of **5:00 p.m. to 6:00 p.m.**

> The automation is active. No manual test email was sent during activation, so as not to generate an unnecessary overnight message or set today’s idempotency marker before the first scheduled run. The first successful delivery must be checked in the recipient mailbox and Apps Script execution history after the scheduled window.

## Day-to-day operation and recovery

The report separates completed and outstanding tasks for the local operational date and includes completion attribution where the stored task data supplies it. Following a successful send, the script stores a date-specific marker in its **private Google Apps Script Properties**. A subsequent execution on the same operational date returns as already sent instead of sending a duplicate. Do not delete that marker merely to repeat a report; doing so risks a duplicate email.

To pause the automation, either remove the `sendEndOfDayReport` trigger from the Apps Script **Triggers** page or run `removeDaily17Report` from the function selector. To restore it, run `installDaily17Report`; it first removes pre-existing triggers for the send function and then creates one replacement daily trigger.

If a scheduled run fails, open the project’s **Executions** page first. Confirm the Google account still owns the script and has the approved permissions. If Firestore reports a `403`, grant the owner account only the least-privilege Firestore read access needed in Google Cloud IAM before retrying a non-sending preview. Do not place passwords, Google tokens, Firebase service-account JSON, or mail-provider keys in GitHub, Firestore, the browser application or Vercel.

## Security boundary

This route uses no Vercel environment variables and contains no provider secret in the GitHub repository or browser application. The schedule, consent, mail capability and idempotency property remain under the owner’s Google account. The older Vercel/Resend route remains inactive and is not part of this live automation.
