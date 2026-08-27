# Swans Operations Command Centre report catalogue

## Purpose and reporting safeguards

The report centre should turn the existing operational record into management prompts, not automated personnel judgements. It will clearly distinguish **recorded activity** from performance: a person with little logged task activity may have been undertaking work that has not been entered in the workspace. Each report will therefore show its date window, source records and any missing evidence.

All reports use only live workspace data. No sample tasks, absence records, ratings, customer feedback or synthetic performance data will be created to populate a report.

| Report family | Report | What it answers | Live source data |
| --- | --- | --- | --- |
| Daily control | Daily operational summary | What was completed, remains open, is overdue or is blocked today? | Tasks, task activity |
| Daily control | End-of-day assurance | Which daily tasks have completion evidence, and who completed them? | Tasks, task activity |
| Task control | Outstanding and overdue work | What needs action first, including owner, priority, due time and blocker? | Tasks |
| Task control | Blocked-work register | Which tasks are blocked, for how long, and why? | Tasks |
| Task control | Unassigned or untimed work | Which tasks need an owner or a due time before control is possible? | Tasks |
| Task control | Completion-evidence exceptions | Which completed tasks pre-date person-attribution or lack a completer stamp? | Tasks |
| Team contribution | Recorded completions by person | Who completed recorded tasks in the selected period, with contextual workload counts? | Tasks, task activity |
| Team contribution | Workload and allocation balance | Is planned task ownership concentrated with one colleague? | Tasks, team members |
| Team contribution | Low recorded activity prompt | Which active colleague has no task completion, rota duty or on-call duty in the selected period? | Tasks, rota, team members |
| Team contribution | Timeliness and recurring blockers | Where are due times missed and which blockers recur? | Tasks, task activity |
| Team support | Coaching and recognition record | What factual management notes exist by colleague and type? | Performance notes |
| Rota | Weekly rota coverage matrix | Which dates lack each configured required shift or a named on-call lead? | Rota, coverage settings |
| Rota | Duty distribution and fairness | How are Early, Core, Late and on-call duties distributed? | Rota, team members |
| Rota | Holiday and availability calendar | Who is on holiday, leave or unavailable and on which dates? | Rota |
| Rota | Holiday-related coverage risk | Does an absence coincide with a required shift or on-call slot that is not covered? | Rota, coverage settings |
| On-call | On-call action log | What was logged out of hours, its owner, priority and lifecycle state? | On-call items |
| On-call | Open on-call follow-ups | Which on-call actions remain open or acknowledged at the next shift? | On-call items, rota |
| On-call | On-call response and closure | How many events were acknowledged or resolved in the selected period? | On-call items |
| Handover | Open handover register | What handover information still needs acknowledgement, ownership or resolution? | Handovers |
| Handover | Handover ageing | Which unresolved handovers have been open longest? | Handovers |
| Issues | Operational issues and impact | Which issue records remain open or monitoring, and who owns the next action? | Issues |
| Issues | Stale issue register | Which unresolved issues have not been updated recently? | Issues |
| Readiness | Daily capacity and risk pulse | Who has submitted a readiness update and what capacity/risk pattern is recorded? | Readiness, team members |
| Readiness | Missing readiness responses | Which expected active colleagues have not supplied a readiness pulse for the selected date? | Readiness, team members |
| Leadership | Combined risk radar | What needs leadership attention now: critical/overdue/blocked tasks, cover gaps, open handovers, issues and on-call actions? | Tasks, rota, handovers, issues, on-call items |
| Administration | Active, inactive and invited access | Who has a live account, pending invitation, inactive access or an assigned permission level? | Team members, invitations |
| Data assurance | Operational data-quality checks | Which records are missing a needed owner, due date, completion attribution, resolution or rota coverage expectation? | All operational collections |

## Report centre scope

The first report-centre release will make the task, team contribution, rota/absence, on-call, handover, issue, readiness, risk radar and data-assurance families directly runnable. It will provide a shared date window, date-specific coverage view, expandable source rows, CSV export, and lead-owned saved report views. The existing scheduled end-of-day report uses the daily-control report content and remains inactive until its independently documented mail and scheduler credentials are provided.

## Permission model

| Workspace level | Intended access |
| --- | --- |
| **Lead / superuser** | Full access: report views and exports, staff and invitation lifecycle, user levels, rota/holiday and coverage expectations, templates, data deletion and all operating modules. This remains `bc@swanstravel.com`. |
| **Operations manager** | Can run reports; create and maintain tasks, rota, holidays, templates, handovers, issues and on-call records. They cannot change team access, roles or permanent workspace controls. |
| **Coordinator** | Can read operational registers; update assigned tasks; create and maintain handovers, issues, readiness and on-call items. They cannot amend rota, templates, reports or access controls. |
| **On-call responder** | Uses the quick on-call route to capture, acknowledge and resolve out-of-hours items, and can read the rota and related operational context. They cannot alter staff, coverage requirements, reports, rota or templates. |
| **Viewer** | Read-only access to the operational information and approved reports, with no ability to create, edit or delete records. |

The role label will be visible to the lead and stored on the member profile. Rules will constrain every protected write independently of the user interface. A person will not be able to promote their own role or reactivate their own access.

## Holiday and coverage model

Holiday will become a first-class rota assignment alongside Early, Core, Late, On-call, Leave and Unavailable. The rota and reports will identify holiday by person and date, while a lead-owned coverage setup controls which shift types and on-call are expected before a coverage gap is reported. This avoids treating every absence as a failure and avoids assuming a standard shift pattern is required every day.

## Fast on-call mobile route

`/quick-on-call` will be a stripped-down, authenticated work-email route intended to be saved on a phone’s home screen. It will default to today, show the named on-call lead and open-action count, and reduce logging to a short headline, event type, brief context, priority and optional follow-up owner. The detailed on-call portal remains available for full context, acknowledgement and resolution.
