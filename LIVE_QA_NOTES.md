# Live acceptance notes

## 27 August 2026

- Verified that the Vercel-hosted workspace loads and the `bc@swanstravel.com` lead account can sign in to the production dashboard.
- Confirmed the clean command board, navigation, and operations-lead controls are visible in the authenticated production session.
- Found that a newly created invitation did not appear in the active team directory before first sign-in, preventing immediate task and rota assignment. A correction to merge lead-visible invitations into the operational team view was prepared, type-checked, and pushed to the linked GitHub repository.
- Further workflow tests will resume after the latest Vercel deployment and matching Firestore policy are active.
- The Firebase console was available for the original policy publication but is currently rendering an empty main panel after navigation; the repository rule update is committed and awaits the matching live-editor update before a non-lead task-completion test is performed.
- Reopening Firestore through its navigation restored the console shell, but the Rules editor remained in a loading state immediately after navigation. No live policy changes were made during this interval.
