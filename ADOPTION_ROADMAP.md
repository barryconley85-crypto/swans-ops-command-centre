# Making the Command Centre Useful Enough to Choose

## Design principle

The Command Centre should become the **shortest route to a colleague’s next useful action**, not a place where they duplicate information after work is already complete. Each frontline interaction should either save time, make the next step clearer, obtain help faster, or leave the next person better prepared. The team should not be asked to enter a record merely because management would like one.

The current workspace already provides the foundations: rota/on-call cover, assigned tasks, handovers, issue tracking, readiness, chat, reports and a quick mobile on-call form. The next release should turn those records into a personal, shift-specific experience.

> Effective handover information is concise, relevant and sufficient for the incoming person to take over the work; it should include the current state, open work, stakeholders, deadlines and risks.[1]

> Frontline adoption depends on perceived usefulness and ease of use. Clear, simple, hands-on workflows and a visible route for feedback reduce friction and make a tool more likely to be used.[2]

## Ranked feature roadmap

| Priority | Capability | Why a colleague will choose it | What it uses or adds | Guardrail |
|---|---|---|---|---|
| **Now** | **My shift** | One screen answers: “Am I on duty? What do I need to do? What is still open? Who can help?” | Personal rota, assigned tasks, on-call status, open handovers/issues and quick actions | Do not call it a performance score or require a check-in to see information. |
| **Now** | **Ask for help / request cover** | A colleague can get an owned answer without chasing several people by phone or chat. | Urgency, concise request, optional duty/date, named owner, acknowledgement and resolution | Avoid customer personal data; capture a booking/reference only where necessary. |
| **Now** | **Shift start and shift close** | A fast pre-flight and wrap-up replaces remembering what must be checked or passed on. | Compact essential checklist, acknowledge relevant handovers, flag a risk, pass on one next action | Make it optional and role/shift-specific; no long generic form. |
| **Next** | **Live operations bulletin** | One trusted “what changed today” space removes repeated questions in chat. | Lead/manager-posted changes, expiry date, acknowledgement count | Use short factual updates; retain an archive for handover context. |
| **Next** | **Quick playbook cards** | Staff can find “what do I do now?” in a few taps during disruption. | Lead-editable role-specific checklists, call scripts and escalation contacts | Do not store passwords, access tokens or customer payment data. |
| **Next** | **Rota availability and cover request** | It gives people a respectful way to flag a problem early and helps the lead see an actionable request. | Requested date/duty, reason category, preferred alternative, approval state | It is a request, not an automatic rota change. |
| **Later** | **Weekly “what we fixed” digest** | Visible outcomes show that logging a risk or asking for help leads to action. | Resolved help requests, closed issues, thank-yous and process improvements | Never rank people publicly or fabricate recognition. |
| **Later** | **Operations knowledge improvement queue** | The team can suggest a better checklist/playbook after a real problem. | Suggestion, category, decision and published outcome | Keep it constructive, with lead review before publishing. |

## The first-use journey to build

1. A colleague opens a Home Screen shortcut or the existing workspace link.
2. **My shift** immediately tells them whether they are working, on call or available today, their own action count, and any urgent shared follow-up.
3. They choose one obvious action: complete an assigned task, acknowledge a handover, log an on-call issue, or ask for help.
4. At shift end, the same screen offers a short close-out: confirm the important work is handed over or record the single unfinished next action and owner.
5. The lead sees only **missing operational signals**—for example, an open help request or a duty with no cover—not a punitive activity leaderboard.

## First build scope

The first adoption-focused release will implement the three **Now** capabilities together because they reinforce one another:

| Capability | Release design |
|---|---|
| **My shift** | A dedicated authenticated route with a mobile-first layout. It will identify today’s personal Early/Core/Late/On-call/availability record, show only the colleague’s assigned and relevant shared work, and offer one-tap links to finish a task, log an on-call issue, acknowledge a handover or request help. |
| **Help and cover requests** | A lightweight shared request record with type, urgency, short context, date/duty where relevant, requested owner, acknowledgement, resolution and a complete activity trace. The requester can see its outcome; managers can coordinate resolution. |
| **Start and close prompts** | A compact part of My shift—not a new mandatory form. The opening prompt concentrates on current cover, urgent handovers and assigned work. The closing prompt concentrates on unresolved owned work and a shortcut to record a clear handover or help request. |

The release will preserve the current role model. Viewers remain read-only; On-call responders can create or acknowledge support requests; Coordinators, Dispatchers and Managers can maintain shared requests; and the lead controls operational configuration. It will introduce no external services, cost or background process.

## Measures that indicate value, not surveillance

| Signal | Healthy direction | Interpretation |
|---|---|---|
| Help requests acknowledged | Faster acknowledgement | Shows that the team can get support through the shared process. |
| Shift-relevant handovers acknowledged | Higher proportion before duty start | Indicates incoming colleagues can see and accept important context. |
| Unassigned open work | Lower and shorter-lived | Indicates clearer ownership, not individual productivity. |
| Cover requests raised ahead of duty | Earlier notice | Gives the team more time to solve a genuine cover issue. |
| Playbook-card feedback | More practical suggestions, then fewer repeats of the same question | Shows that the information is useful and improving. |

## Rollout approach

Start with a two-week team trial of **My shift**, **Ask for help** and the **shift close prompt**. In a ten-minute introduction, show each person one real use case: “find your next action,” “ask for help without ringing round,” and “leave the next person a clear next step.” Invite one team member to act as a practical champion and ask for one piece of friction feedback each week. Review the operational signals with the team, explain changes made because of their feedback, and only then promote the short workflow into the normal handover routine.

## Explicitly avoid

- Requiring a daily “I am working” entry when the rota already shows it.
- Public league tables or claims that the system has measured someone’s total productivity.
- Copying information from another operations system merely for reporting.
- Long mandatory forms during an incident.
- Storing customer personal, payment or login information in this internal workspace.

## References

[1]: https://whatfix.com/blog/handover-documentation/ "Whatfix — How to Create Helpful Handover Documentation"
[2]: https://www.overit.ai/blog/improving-technology-acceptance-and-adoption-with-frontline-workers/ "OverIT — Improving Technology Acceptance and Adoption with Frontline Workers"
