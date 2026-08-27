# Firebase and Vercel Setup

The external release uses the Firebase web app registered as **Swans Ops Web** in the Firebase project `swans-ops-command-centre`. Its project is on the Spark tier, which was shown in the console as **No cost ($0/month)**.

## Vercel environment variables

Add the following public variables to the Vercel project before deployment. Firebase Web API keys identify the client project; they are not private credentials and are protected by Firebase Authentication and Firestore rules.

| Variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `AIzaSyAF6KhLk9CJvIbBjM0KHEzPO2dMAc1_OLY` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `swans-ops-command-centre.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `swans-ops-command-centre` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `swans-ops-command-centre.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `875238693473` |
| `VITE_FIREBASE_APP_ID` | `1:875238693473:web:fffefa9b2fe3e79412e820` |

## Access process

The initial operations lead signs up with `bc@swanstravel.com`. The lead then creates the remaining team members in the directory; this creates a private invitation matched to their work email. A colleague can then create an account only with the email already present in the team directory.

## Data protection

Before inviting the team, apply the `firestore.rules` file in Firebase Console → Firestore → Rules. Those rules use a default-deny policy and allow only authenticated, approved Swans Travel work-email users to access the workspace.
