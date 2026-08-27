# Live acceptance notes

## 27 August 2026

- Verified that the Vercel-hosted workspace loads and the `bc@swanstravel.com` lead account can sign in to the production dashboard.
- Confirmed the clean command board, navigation, and operations-lead controls are visible in the authenticated production session.
- Found that a newly created invitation did not appear in the active team directory before first sign-in, preventing immediate task and rota assignment. A correction to merge lead-visible invitations into the operational team view was prepared, type-checked, and pushed to the linked GitHub repository.
- Further workflow tests will resume after the latest Vercel deployment and matching Firestore policy are active.
- The Firebase console was available for the original policy publication but is currently rendering an empty main panel after navigation; the repository rule update is committed and awaits the matching live-editor update before a non-lead task-completion test is performed.
- Reopening Firestore through its navigation restored the console shell, but the Rules editor remained in a loading state immediately after navigation. No live policy changes were made during this interval.

## Completed production acceptance results

- The linked Vercel production release was retested after each correction. The latest verified application commit is `1c4685e` (`Show task owners on command board`).
- **Invited-team planning:** the disposable invited profile was visible in the team directory and became selectable in task, rota, handover, issue, and performance-note owner selectors before first sign-in. The profile was then removed as part of QA cleanup.
- **Daily tasks and checklist evidence:** a QA task assigned to the invited profile was created, moved through pending → in progress → complete, received a dated comment, and updated the task-board completion metric. A labelled two-item reusable checklist was saved, applied to today, and each generated task was completed successfully.
- **Rota and on-call:** a disposable core shift and on-call assignment were persisted for the invited profile. Coverage-gap signalling and shift/on-call distribution counts updated correctly. Initial on-call persistence failed because optional times were passed to Firestore as `undefined`; the shared write helper now omits undefined fields, its regression test passes, and the on-call retest succeeded.
- **Handovers:** a labelled high-priority handover with owner and decision record was created, acknowledged, resolved, found under its status filters, and reflected in corrected lifecycle counters. The counter defect was fixed by maintaining an all-records subscription separate from the selected register view.
- **Issues:** a labelled low-impact QA issue was created, moved to monitoring, and resolved with a resolution record. Native browser prompts can delay automation of the optional resolution text; a controlled prompt value confirmed that the underlying resolution write and resolved filter work.
- **Readiness:** the lead submitted a green pulse, then a same-day amber update. The result remained one of two team pulses (rather than duplicating), while the clear/watch counters and note content updated correctly.
- **Performance:** task completion, timeliness, shift and on-call counts rendered on the performance view, and a labelled QA coaching-note write was displayed successfully.
- **Command board:** task owner display was corrected after live QA found the dashboard reading `task.member` while the adapter supplied `task.assignee`. The adapter now provides a consistent member alias. The repaired board shows the task owner and on-call lead correctly.
- **Mobile:** authenticated production routes for dashboard, tasks, rota, and handovers were captured at a true 390 × 844 CSS-pixel viewport. All key controls and panels remained usable without overlap. The rota preserves a deliberate horizontally scrollable seven-day grid.
- **Validation:** `pnpm check` completed successfully. `pnpm test -- --run` completed successfully with four test files and six tests, including the new Firestore optional-field regression test.
- **Cleanup:** all user-visible, explicitly labelled QA records were deleted successfully (HTTP 200 for three tasks, two rota records, one handover, one issue, one readiness pulse, one performance note, one template, and the QA invitation). The production workspace was then visually confirmed clean. Immutable task-activity records remain orphaned by design because production rules prohibit their deletion; they are not displayed without their deleted task.

## Remaining rollout consideration

- The app’s post-invitation self-service task-update rule, which matches a signed-in team member by `assignedEmail`, has not been tested with a real invited colleague completing first-time sign-in. A fresh real work-email invitation should be used for that operational onboarding check.
- Direct client Firestore rules intentionally allow members to update handovers and issues for this small internal workspace. Before broader rollout, this should be hardened with field-level ownership constraints or trusted server-side endpoints.
