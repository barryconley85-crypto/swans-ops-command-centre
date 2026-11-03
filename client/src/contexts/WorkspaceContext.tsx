import { firebaseAuth, firebaseConfigured, firebaseDb } from "@/lib/firebase";
import { omitUndefinedFields } from "@/lib/firestorePayload";
import { buildTaskAssignmentNotification } from "@/lib/collaboration";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { activitySummary } from "@/lib/auditHistory";

type Member = { id: number; userId: string; displayName: string; email: string; jobTitle: string; memberRole: "lead" | "manager" | "coordinator" | "dispatcher" | "on_call" | "viewer" | "support" | "complaints"; initials: string; colour: string; status: "active" | "inactive" | "invited" };
type Task = { id: number; workDate: string; title: string; detail: string | null; priority: "low" | "normal" | "high" | "critical"; status: "pending" | "in_progress" | "blocked" | "complete"; dueAt: number | null; assignedTeamMemberId: number | null; blockedReason: string | null; completedAt: number | null; createdAt: number; updatedAt: number };
type TaskResourceInput = { taskId: number; url: string; title: string; note?: string };
type TaskResource = { _docId: string; id: number; taskId: number; url: string; title: string; note: string | null; addedByUserId: string; addedByTeamMemberId: number; addedByName: string; createdAt: number; };
type State = Record<string, any[]>;

const emptyState: State = { members: [], tasks: [], activities: [], taskAttachments: [], templates: [], rota: [], handovers: [], issues: [], readiness: [], notes: [], chatMessages: [], notifications: [], onCallItems: [], helpRequests: [], shiftPrompts: [], presence: [], reportViews: [], auditLogs: [], drivers: [], signOns: [], attendance: [], complaints: [] };
const leadEmail = "bc@swanstravel.com";

type WorkspaceCollection = keyof typeof collectionMap;
type WorkspaceDateWindow = { from: string; through: string };
type WorkspaceFilters = Partial<Record<WorkspaceCollection, WorkspaceDateWindow>>;
type WorkspaceContextValue = {
  authUser: User | null; profile: Member | null; loading: boolean; error: Error | null; state: State; refresh: () => Promise<void>;
  registerDemand: (id: string, collections: WorkspaceCollection[], filters?: WorkspaceFilters) => void; unregisterDemand: (id: string) => void;
  signIn: (email: string, password: string) => Promise<void>; signUp: (name: string, email: string, password: string) => Promise<void>; resetPassword: (email: string) => Promise<void>; logout: () => Promise<void>;
  add: (collectionName: string, value: Record<string, unknown>) => Promise<any>; patch: (collectionName: string, id: string, value: Record<string, unknown>) => Promise<void>; remove: (collectionName: string, id: string) => Promise<void>; addTaskResource: (input: TaskResourceInput) => Promise<TaskResource>; removeTaskResource: (resource: TaskResource) => Promise<void>; createTeamMember: (value: Record<string, unknown>) => Promise<any>; cancelTeamInvitation: (email: string) => Promise<void>;
};
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const collectionMap: Record<string, string> = { members: "ops_members", tasks: "ops_tasks", activities: "ops_task_activity", taskAttachments: "ops_task_attachments", templates: "ops_templates", rota: "ops_rota", handovers: "ops_handovers", issues: "ops_issues", readiness: "ops_readiness", notes: "ops_performance_notes", chatMessages: "ops_chat_messages", notifications: "ops_notifications", onCallItems: "ops_on_call_items", helpRequests: "ops_help_requests", shiftPrompts: "ops_shift_prompts", presence: "ops_presence", reportViews: "ops_report_views", auditLogs: "ops_audit_logs", drivers: "ops_drivers", signOns: "ops_driver_sign_ons", attendance: "ops_driver_attendance", complaints: "ops_issues" };
const firestoreDiagnosticActive = new Set<string>();
const logFirestoreDiagnostic = (event: string, details: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  // Keep the payload as text so remote browser log viewers preserve the audit
  // fields instead of collapsing them to an opaque "Object" entry.
  console.info("[Firestore read audit]", JSON.stringify({ time: new Date().toISOString(), page: window.location.pathname, event, activeListeners: firestoreDiagnosticActive.size, ...details }));
};
export function trackFirestoreListener(collectionName: string) {
  if (typeof window === "undefined") return () => undefined;
  const key = `${window.location.pathname}:${collectionName}`;
  firestoreDiagnosticActive.add(key);
  logFirestoreDiagnostic("listener-attached", { collection: collectionName });
  return () => {
    if (firestoreDiagnosticActive.delete(key)) logFirestoreDiagnostic("listener-detached", { collection: collectionName });
  };
}
export function logFirestoreSnapshot(event: "initial-snapshot" | "snapshot-update", collectionName: string, snapshot: { size: number; docChanges: () => Array<{ type: string }> }) {
  const changes = snapshot.docChanges();
  logFirestoreDiagnostic(event, {
    collection: collectionName,
    documentsInSnapshot: snapshot.size,
    changedDocuments: changes.length,
    added: changes.filter(change => change.type === "added").length,
    modified: changes.filter(change => change.type === "modified").length,
    removed: changes.filter(change => change.type === "removed").length,
  });
}
const safeArray = (value: any) => Array.isArray(value) ? value : [];
const now = () => Date.now();
const numericId = () => Date.now() + Math.floor(Math.random() * 1_000);
const isAllowedTaskResourceUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "1drv.ms" || host === "onedrive.live.com" || host === "sharepoint.com" || host.endsWith(".sharepoint.com") || host.endsWith(".onedrive.com");
  } catch {
    return false;
  }
};
const asMember = (value: unknown) => value as Member;

async function ensureMemberProfile(database: NonNullable<typeof firebaseDb>, user: User, name = ""): Promise<Member | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  const memberRef = doc(database, "ops_members", user.uid);
  try {
    const existing = await getDoc(memberRef);
    if (existing.exists()) return { userId: user.uid, ...existing.data() } as Member;
  } catch (reason) {
    const code = typeof reason === "object" && reason !== null && "code" in reason ? String(reason.code) : "";
    if (code !== "permission-denied" && code !== "firestore/permission-denied") throw reason;
    // Firestore rules deny reading a not-yet-created member profile. Check the invitation before creating it.
  }

  const invitationSnapshot = email === leadEmail ? null : await getDoc(doc(database, "ops_invites", email));
  const invited = invitationSnapshot?.exists() ? invitationSnapshot.data() : null;
  if (email !== leadEmail && !invited) return null;

  const displayName = invited?.displayName || user.displayName || name.trim() || email.split("@")[0];
  const memberProfile: Member = {
    id: invited?.id || now(),
    userId: user.uid,
    displayName,
    email,
    jobTitle: invited?.jobTitle || "Operations Lead",
    memberRole: email === leadEmail ? "lead" : invited?.memberRole || "support",
    initials: invited?.initials || displayName.split(" ").map(part => part[0]).join("").slice(0, 3).toUpperCase(),
    colour: invited?.colour || "#1D5C63",
    status: "active",
  };

  await setDoc(memberRef, { ...memberProfile, createdAt: now(), updatedAt: now() });
  return memberProfile;
}

async function queueTaskAssignmentEmail(authUser: User | null, task: Record<string, unknown>) {
  const recipientEmail = typeof task.assignedEmail === "string" ? task.assignedEmail : "";
  const taskTitle = typeof task.title === "string" ? task.title : "";
  if (!authUser || !recipientEmail || !taskTitle) return;
  try {
    const idToken = await authUser.getIdToken();
    await fetch("/api/task-assignment-email", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ recipientEmail, taskTitle, detail: typeof task.detail === "string" ? task.detail : "", dueAt: typeof task.dueAt === "number" ? task.dueAt : null }) });
  } catch {
    // In-app notifications remain available even when the optional external email relay is unavailable.
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null); const [profile, setProfile] = useState<Member | null>(null); const [state, setState] = useState<State>(emptyState); const [memberProfiles, setMemberProfiles] = useState<Member[]>([]); const [invitations, setInvitations] = useState<Member[]>([]); const [demands, setDemands] = useState<Record<string, { collections: WorkspaceCollection[]; filters: WorkspaceFilters }>>({}); const [loading, setLoading] = useState(true); const [error, setError] = useState<Error | null>(null); const signedInAuditUid = useRef<string | null>(null); const activeSubscriptions = useRef(new Map<string, { unsubscribe: () => void; keys: WorkspaceCollection[]; rows: any[]; filterKey: string }>());
  const registerDemand = useCallback((id: string, collections: WorkspaceCollection[], filters: WorkspaceFilters = {}) => setDemands(current => { const normalized = Array.from(new Set(collections)).sort(); const filterKey = JSON.stringify(filters); const existing = current[id]; return existing?.collections.join(",") === normalized.join(",") && JSON.stringify(existing.filters) === filterKey ? current : { ...current, [id]: { collections: normalized, filters } }; }), []);
  const unregisterDemand = useCallback((id: string) => setDemands(current => { if (!(id in current)) return current; const next = { ...current }; delete next[id]; return next; }), []);
  const activeKeys = useMemo(() => Array.from(new Set(Object.values(demands).flatMap(demand => demand.collections))).filter(key => (key !== "reportViews" && key !== "auditLogs") || profile?.memberRole === "lead").sort(), [demands, profile?.memberRole]);
  const activeFilters = useMemo(() => Object.fromEntries(Object.values(demands).flatMap(demand => Object.entries(demand.filters))), [demands]);
  const activeKeysSignature = useMemo(() => JSON.stringify({ keys: activeKeys, filters: activeFilters }), [activeKeys, activeFilters]);
  const workspaceState = useMemo(() => { const members = [...memberProfiles, ...invitations.filter(invitation => !memberProfiles.some(member => member.email === invitation.email))]; return { ...state, members }; }, [state, memberProfiles, invitations]);
  const refresh = useCallback(async () => {
    const database = firebaseDb;
    if (!database || !authUser) return;
    if (!activeKeys.length) {
      try {
        const snapshot = await getDoc(doc(database, "ops_members", authUser.uid));
        setProfile(snapshot.exists() ? { userId: authUser.uid, ...snapshot.data() } as Member : null);
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason : new Error("Unable to reload your operations profile."));
      }
      return;
    }
    const grouped = new Map<string, { keys: WorkspaceCollection[]; filter?: WorkspaceDateWindow }>();
    for (const key of activeKeys) {
      const name = collectionMap[key];
      const current = grouped.get(name) || { keys: [] };
      current.keys.push(key);
      current.filter = activeFilters[key] || current.filter;
      grouped.set(name, current);
    }
    const pairs = await Promise.all(Array.from(grouped.entries()).map(async ([name, group]) => {
      const { keys, filter } = group;
      const baseCollection = collection(database, name);
      const source = name === "ops_notifications"
        ? query(baseCollection, where("recipientEmail", "==", profile?.email || authUser.email || ""))
        : filter
          ? query(baseCollection, where("workDate", ">=", filter.from), where("workDate", "<=", filter.through))
          : baseCollection;
      const rows: any[] = (await getDocs(source)).docs.map(snapshot => ({ _docId: snapshot.id, ...snapshot.data() }));
      return [keys, rows] as const;
    }));
    setMemberProfiles(pairs.find(([keys]) => keys.includes("members"))?.[1].map(asMember) || []);
    setState(current => {
      const next = { ...current };
      for (const [keys, rows] of pairs) for (const key of keys) next[key] = key === "complaints" ? rows.filter(row => !row.isDeleted) : rows;
      return next;
    });
    setError(null);
  }, [authUser, profile?.email, activeKeysSignature]);
  useEffect(() => { const database = firebaseDb; if (!firebaseAuth || !database) { setLoading(false); return; } return onAuthStateChanged(firebaseAuth, async user => { setAuthUser(user); setProfile(null); setState(emptyState); setMemberProfiles([]); setInvitations([]); setError(null); if (!user) { signedInAuditUid.current = null; setLoading(false); return; } try { const snapshot = await getDoc(doc(database, "ops_members", user.uid)); if (snapshot.exists()) { const memberProfile = { userId: user.uid, ...snapshot.data() } as Member; setProfile(memberProfile); if (signedInAuditUid.current !== user.uid) { signedInAuditUid.current = user.uid; void addDoc(collection(database, "ops_audit_logs"), { actorUserId: user.uid, actorName: memberProfile.displayName, actorInitials: memberProfile.initials, actorColour: memberProfile.colour, action: "signed_in", targetType: "session", summary: "Signed in to the Command Centre.", createdAt: now() }); } } setLoading(false); } catch (reason) { setError(reason instanceof Error ? reason : new Error("Unable to load your operations profile.")); setLoading(false); } }); }, []);
  // Keep listeners for collections shared between routes alive. The previous
  // implementation tore down every listener whenever the route changed, then
  // re-read all shared collections (members, presence, notifications, etc.).
  useEffect(() => () => {
    for (const [name, subscription] of Array.from(activeSubscriptions.current.entries())) { subscription.unsubscribe(); firestoreDiagnosticActive.delete(name); logFirestoreDiagnostic("listener-detached", { collection: name, reason: "workspace-reset" }); }
    activeSubscriptions.current.clear();
  }, [authUser, profile]);
  useEffect(() => {
    const database = firebaseDb;
    if (!database || !authUser || !profile) return;
    const requested = new Set(activeKeyç[h‘éì¶»§q«^wÛXİ[ÛŠHÈ›İÜÈˆ[\Tİ]VÚÙ^WWJJH\Èİ]JNÃBˆYˆ
\™\]Y\İYš\Ê›Y[X™\œÈŠJHÙ]Y[X™\”›Ùš[\Ê×JNÃBƒBˆÛÛœİÜ›İ\YH™]ÈX\İš[™ËÈÙ^\ÎˆÛÜšÜÜXÙPÛÛXİ[Û–×NÈš[\ÎˆÛÜšÜÜXÙQ]UÚ[™İÈOŠ
NÃBˆ›Üˆ
ÛÛœİÙ^HÙˆXİ]™RÙ^\ÊHÃBˆÛÛœİ˜[YHHÛÛXİ[Û“X\ÚÙ^WNÃBˆÛÛœİİ\œ™[HÜ›İ\Y™Ù]
˜[YJHÈÙ^\Îˆ×HNÃBˆİ\œ™[šÙ^\Ëœ\Ú
Ù^JNÃBˆİ\œ™[™š[\ˆHXİ]™Qš[\œÖÚÙ^WHİ\œ™[™š[\ÃBˆÜ›İ\YœÙ]
˜[YKİ\œ™[
NÃBˆCBƒBˆËÈ™[[İ™HÛ›HÛÛXİ[ÛœÈ›ÈÛ™Ù\ˆ™YYYHHXİ]™H›İ]KƒBˆ›Üˆ
ÛÛœİÛ˜[YKİXœØÜš\[Û—HÙˆ\œ˜^K™œ›ÛJXİ]™TİXœØÜš\[ÛœË˜İ\œ™[™[šY\Ê
JJHÃBˆÛÛœİ™^Ü›İ\HÜ›İ\Y™Ù]
˜[YJNÃBˆÛÛœİ™^š[\’Ù^HH”ÓÓ‹œİš[™ÚYJ™^Ü›İ\Ë™š[\ˆ[
NÃBˆYˆ
[™^Ü›İ\İXœØÜš\[Û‹™š[\’Ù^HOOH™^š[\’Ù^JHÃBˆİXœØÜš\[Û‹[œİXœØÜšX™J
NÃBˆš\™\İÜ™QXYÛ›ÜİXĞXİ]™K™[]J˜[YJNÃBˆÙÑš\™\İÜ™QXYÛ›ÜİXÊ›\İ[™\‹Y]XÚY‹ÈÛÛXİ[Ûˆ˜[YK™X\ÛÛˆ™^Ü›İ\Èœ]Y\K]Ú[™İËXÚ[™ÙYˆˆ[™Yš[™YJNÃBˆXİ]™TİXœØÜš\[ÛœË˜İ\œ™[™[]J˜[YJNÃBˆCBˆCBƒBˆËÈYÛ›H™]ÛH™\]Y\İYÛÛXİ[ÛœËˆ^\İ[™È\İ[™\œÈ\™H™]Z[™YBˆËÈ[™Z\ˆÙ^HX\[™È\È™Yœ™\ÚYÚ]İ][›İ\ˆš\™\İÜ™H™XYƒBˆ›Üˆ
ÛÛœİÛ˜[YKÜ›İ\HÙˆ\œ˜^K™œ›ÛJÜ›İ\Y™[šY\Ê
JJHÃBˆÛÛœİÈÙ^\Ëš[\ˆHHÜ›İ\ÃBˆÛÛœİš[\’Ù^HH”ÓÓ‹œİš[™ÚYJš[\ˆ[
NÃBˆÛÛœİ^\İ[™ÈHXİ]™TİXœØÜš\[ÛœË˜İ\œ™[™Ù]
˜[YJNÃBˆYˆ
^\İ[™ÊHÃBˆ^\İ[™ËšÙ^\ÈHÙ^\ÎÃBˆËÈHÚ\™Yš\™\İÜ™HÛÛXİ[ÛˆØ[ˆ˜XÚÈ[Ü™H[ˆÛ™HÛÜšÜÜXÙHÙ^CBˆËÈ
›Üˆ^[\K\ÜİY\È[™ÛÛ\Z[ÊKˆ™]\ÙH]ÈØXÚYÛ˜\ÚİÚ[ƒBˆËÈHXİ]™H›İ]HÚ[™Ù\Ëİ\Ú\ÙHH™]ÛH™\]Y\İYÙ^HØ[ˆİ^CBˆËÈ[\H[[š\™\İÜ™H[Z]È[›İ\ˆÚ[™ÙKƒBˆÙ]İ]Jİ\œ™[OˆÃBˆÛÛœİ™^HÈ‹‹˜İ\œ™[NÃBˆ›Üˆ
ÛÛœİÙ^HÙˆÙ^\ÊH™^ÚÙ^WHHÙ^HOOH˜ÛÛ\Z[ÈˆÈ^\İ[™Ëœ›İÜË™š[\Š›İÈOˆ\›İËš\Ñ[]Y
Hˆ^\İ[™Ëœ›İÜÎÃBˆ™]\›ˆ™^ÃBˆJNÃBˆYˆ
Ù^\Ëš[˜ÛY\Ê›Y[X™\œÈŠJHÙ]Y[X™\”›Ùš[\Ê^\İ[™Ëœ›İÜË›X\
\ÓY[X™\ŠJNÃBˆÛÛ[YNÃBˆCBˆÛÛœİ˜\ÙPÛÛXİ[ÛˆHÛÛXİ[ÛŠ]X˜\ÙK˜[YJNÃBˆÛÛœİÛİ\˜ÙHH˜[YHOOH›Ü×Û›İYšXØ][ÛœÈƒBˆÈ]Y\J˜\ÙPÛÛXİ[Û‹Ú\™Jœ™XÚ\Y[[XZ[‹OH‹›Ùš[K™[XZ[
JCBˆˆš[\ƒBˆÈ]Y\J˜\ÙPÛÛXİ[Û‹Ú\™JÛÜšÑ]H‹H‹š[\‹™œ›ÛJKÚ\™JÛÜšÑ]H‹H‹š[\‹›İYÚ
JCBˆˆ˜\ÙPÛÛXİ[ÛÃBˆš\™\İÜ™QXYÛ›ÜİXĞXİ]™K˜Y
˜[YJNÃBˆÙÑš\™\İÜ™QXYÛ›ÜİXÊ›\İ[™\‹X]XÚY‹ÈÛÛXİ[Ûˆ˜[YHJNÃBˆ]š\œİÛ˜\ÚİHYNÃBˆÛÛœİ[œİXœØÜšX™HHÛ”Û˜\Úİ
Ûİ\˜ÙKÛ˜\ÚİOˆÃBˆÛÛœİÚ[™Ù\ÈHÛ˜\Úİ™ØĞÚ[™Ù\Ê
NÃBˆÙÑš\™\İÜ™QXYÛ›ÜİXÊš\œİÛ˜\ÚİÈš[š]X[\Û˜\ÚİˆˆœÛ˜\Úİ]\]H‹ÃBˆÛÛXİ[Ûˆ˜[YKBˆØİ[Y[Ò[”Û˜\ÚİˆÛ˜\ÚİœÚ^™KBˆÚ[™ÙYØİ[Y[ÎˆÚ[™Ù\Ë›[™İBˆYYˆÚ[™Ù\Ë™š[\ŠÚ[™ÙHOˆÚ[™ÙK\HOOH˜YYŠK›[™İBˆ[ÙYšYYˆÚ[™Ù\Ë™š[\ŠÚ[™ÙHOˆÚ[™ÙK\HOOH›[ÙYšYYŠK›[™İBˆ™[[İ™YˆÚ[™Ù\Ë™š[\ŠÚ[™ÙHOˆÚ[™ÙK\HOOHœ™[[İ™YŠK›[™İBˆJNÃBˆš\œİÛ˜\ÚİH˜[ÙNÃBˆÛÛœİ›İÜÎˆ[V×HHÛ˜\Úİ™ØÜË›X\
][HOˆ
ÈÙØÒYˆ][KšY‹‹š][K™]J
HJJNÃBˆÛÛœİİXœØÜš\[ÛˆHXİ]™TİXœØÜš\[ÛœË˜İ\œ™[™Ù]
˜[YJNÃBˆYˆ
İXœØÜš\[ÛŠHİXœØÜš\[Û‹œ›İÜÈH›İÜÎÃBˆÛÛœİİ\œ™[Ù^\ÈHİXœØÜš\[ÛËšÙ^\ÈÙ^\ÎÃBˆYˆ
İ\œ™[Ù^\Ëš[˜ÛY\Ê›Y[X™\œÈŠJHÙ]Y[X™\”›Ùš[\Ê›İÜË›X\
\ÓY[X™\ŠJNÃBˆÙ]İ]Jİ\œ™[OˆÃBˆÛÛœİ™^HÈ‹‹˜İ\œ™[NÃBˆ›Üˆ
ÛÛœİÙ^HÙˆİ\œ™[Ù^\ÊH™^ÚÙ^WHHÙ^HOOH˜ÛÛ\Z[ÈˆÈ›İÜË™š[\Š][HOˆZ][Kš\Ñ[]Y
Hˆ›İÜÎÃBˆ™]\›ˆ™^ÃBˆJNÃBˆK™X\ÛÛˆOˆÙ]\œ›ÜŠ™X\ÛÛˆ[œİ[˜Ù[Ùˆ\œ›ÜˆÈ™X\ÛÛˆˆ™]È\œ›ÜŠ•[˜X›HÈØYÛÜšÜÜXÙH]KˆŠJJNÃBˆXİ]™TİXœØÜš\[ÛœË˜İ\œ™[œÙ]
˜[YKÈ[œİXœØÜšX™KÙ^\Ëš[\’Ù^K›İÜÎˆ×HJNÃBˆCBˆKØ]]\Ù\‹›Ùš[KXİ]™RÙ^\ÔÚYÛ˜]\™WJNÃBˆ\ÙQY™™Xİ


HOˆÃBˆÛÛœİ]X˜\ÙHHš\™X˜\ÙQÃBˆYˆ
Y]X˜\ÙH›Ùš[OË›Y[X™\”›ÛHOOH›XYˆXXİ]™RÙ^\Ëš[˜ÛY\Ê›Y[X™\œÈŠJHÈÙ][š]][ÛœÊ×JNÈ™]\›ÈCBˆ™]\›ˆÛ”Û˜\Úİ
ÛÛXİ[ÛŠ]X˜\ÙK›Ü×Ú[š]\ÈŠKÛ˜\ÚİOˆÙ][š]][ÛœÊÛ˜\Úİ™ØÜË›X\
][HOˆ\ÓY[X™\ŠÈÙØÒYˆ][KšY\Ù\’Yˆˆ‹‹‹š][K™]J
Kİ]\Îˆš[š]YˆJJJK™X\ÛÛˆOˆÙ]\œ›ÜŠ™X\ÛÛˆ[œİ[˜Ù[Ùˆ\œ›ÜˆÈ™X\ÛÛˆˆ™]È\œ›ÜŠ•[˜X›HÈØY[š]YX[H›Ùš[\ËˆŠJJNÃBˆKÜ›Ùš[OË›Y[X™\”›ÛKXİ]™RÙ^\Ëš[˜ÛY\Ê›Y[X™\œÈŠWJNÃBˆ\ÙQY™™Xİ


HOˆÈÛÛœİ]X˜\ÙHHš\™X˜\ÙQÈYˆ
Y]X˜\ÙHX]]\Ù\ˆ\›Ùš[JH™]\›ÈÛÛœİ\]T™\Ù[˜ÙHH

HOˆÈYˆ
Øİ[Y[š\ÚXš[]Tİ]HOOHš\ÚX›HŠH›ÚYÙ]ØÊØÊ]X˜\ÙK›Ü×Ü™\Ù[˜ÙH‹]]\Ù\‹ZY
KÈ\Ù\’Yˆ]]\Ù\‹ZYX[SY[X™\’Yˆ›Ùš[KšY\Ü^S˜[YNˆ›Ùš[K™\Ü^S˜[YK[š]X[Îˆ›Ùš[Kš[š]X[ËÛÛİ\ˆ›Ùš[K˜ÛÛİ\‹\İXİ]™P]ˆ›İÊ
HKÈY\™ÙNˆYHJNÈNÈ\]T™\Ù[˜ÙJ
NÈÛÛœİ[\˜[HÚ[™İËœÙ][\˜[
\]T™\Ù[˜ÙKŒÌ
NÈØİ[Y[˜Y]™[\İ[™\Šš\ÚXš[]XÚ[™ÙH‹\]T™\Ù[˜ÙJNÈ™]\›ˆ

HOˆÈÚ[™İË˜ÛX\’[\˜[
[\˜[
NÈØİ[Y[œ™[[İ™Q]™[\İ[™\Šš\ÚXš[]XÚ[™ÙH‹\]T™\Ù[˜ÙJNÈNÈKØ]]\Ù\‹›Ùš[WJNÃBˆÛÛœİÚYÛ’[ˆH\ÙPØ[˜XÚÊ\Ş[˜È
[XZ[ˆİš[™Ë\ÜİÛÜ™ˆİš[™ÊHOˆÃBˆYˆ
Yš\™X˜\ÙP]]Yš\™X˜\ÙQŠH›İÈ™]È\œ›ÜŠ‘š\™X˜\ÙH\È›İÛÛ™šYİ\™YY]ˆŠNÃBˆÛÛœİÜ™Y[X[H]ØZ]ÚYÛ’[•Ú][XZ[[™\ÜİÛÜ™
š\™X˜\ÙP]][XZ[š[J
KÓİÙ\Ø\ÙJ
K\ÜİÛÜ™
NÃBˆÛÛœİY[X™\”›Ùš[HH]ØZ][œİ\™SY[X™\”›Ùš[Jš\™X˜\ÙQ‹Ü™Y[X[\Ù\ŠNÃBˆYˆ
[Y[X™\”›Ùš[JHÃBˆ]ØZ]ÚYÛ“İ]
š\™X˜\ÙP]]
NÃBˆ›İÈ™]È\œ›ÜŠ–[İ\ˆÛÜšÈ[XZ[\È›İ™Y[ˆ[š]YY]ˆ\ÚÈHÜ\˜][ÛœÈXYÈY[İHÈHX[H\™XİÜHš\œİˆŠNÃBˆCBˆÙ]›Ùš[JY[X™\”›Ùš[JNÃBˆK×JNÃBˆÛÛœİÚYÛ•\H\ÙPØ[˜XÚÊ\Ş[˜È
˜[YNˆİš[™Ë[XZ[ˆİš[™Ë\ÜİÛÜ™ˆİš[™ÊHOˆÃBˆYˆ
Yš\™X˜\ÙP]]Yš\™X˜\ÙQŠH›İÈ™]È\œ›ÜŠ‘š\™X˜\ÙH\È›İÛÛ™šYİ\™YY]ˆŠNÃBˆÛÛœİ›Ü›X[^™YH[XZ[š[J
KÓİÙ\Ø\ÙJ
NÃBˆYˆ
[›Ü›X[^™Y™[™ÕÚ]
İØ[œİ˜]™[˜ÛÛHŠJH›İÈ™]È\œ›ÜŠ•\ÈÛÜšÜÜXÙH\È™\İšXİYÈ\›İ™YİØ[œÈ˜]™[ÛÜšËY[XZ[XØÛİ[ËˆŠNÃBƒBˆÛÛœİÜ™Y[X[H]ØZ]Ü™X]U\Ù\•Ú][XZ[[™\ÜİÛÜ™
š\™X˜\ÙP]]›Ü›X[^™Y\ÜİÛÜ™
NÃBˆ]Y[X™\”›Ùš[PÜ™X]YH˜[ÙNÃBˆHÃBˆÛÛœİY[X™\”›Ùš[HH]ØZ][œİ\™SY[X™\”›Ùš[Jš\™X˜\ÙQ‹Ü™Y[X[\Ù\‹˜[YJNÃBˆYˆ
[Y[X™\”›Ùš[JH›İÈ™]È\œ›ÜŠ–[İ\ˆÛÜšÈ[XZ[\È›İ™Y[ˆ[š]YY]ˆ\ÚÈHÜ\˜][ÛœÈXYÈY[İHÈHX[H\™XİÜHš\œİ[ˆHYØZ[‹ˆŠNÃBˆY[X™\”›Ùš[PÜ™X]YHYNÃBˆÙ]›Ùš[JY[X™\”›Ùš[JNÃBˆ]ØZ]Ù[™[XZ[™\šYšXØ][ÛŠÜ™Y[X[\Ù\ŠNÃBˆHØ]Ú
™X\ÛÛŠHÃBˆYˆ
[Y[X™\”›Ùš[PÜ™X]Y
HÃBˆHÈ]ØZ][]U\Ù\ŠÜ™Y[X[\Ù\ŠNÈHØ]ÚÈÊˆ™\Ù\™HHÜšYÚ[˜[\œ›Ü‹ˆH]\ˆÚYÛ‹Z[ˆØ[ˆ™XÛİ™\ˆ[ˆ[š]YXØÛİ[ˆ
‹ÈCBˆCBˆ›İÈ™X\ÛÛÃBˆCBˆK×JNÃBˆÛÛœİ™\Ù]\ÜİÛÜ™H\ÙPØ[˜XÚÊ\Ş[˜È
[XZ[ˆİš[™ÊHOˆÈYˆ
Yš\™X˜\ÙP]]
H›İÈ™]È\œ›ÜŠ‘š\™X˜\ÙH\È›İÛÛ™šYİ\™YY]ˆŠNÈ]ØZ]Ù[™\ÜİÛÜ™™\Ù][XZ[
š\™X˜\ÙP]][XZ[š[J
KÓİÙ\Ø\ÙJ
JNÈK×JNÃBˆÛÛœİÙÛİ]H\ÙPØ[˜XÚÊ\Ş[˜È

HOˆÈYˆ
š\™X˜\ÙP]]
H]ØZ]ÚYÛ“İ]
š\™X˜\ÙP]]
NÈK×JNÃBˆÛÛœİÜš]P]Y]H\ÙPØ[˜XÚÊ
Xİ[Ûˆ˜Ü™X]Yˆ\]Yˆ™[]Y‹ÛÛXİ[Û“˜[YNˆİš[™Ë\™Ù]Yˆİš[™Ë˜[YNˆ™XÛÜ™İš[™Ë[šÛ›İÛˆHßJHOˆÈYˆ
Yš\™X˜\ÙQˆX]]\Ù\ˆ\›Ùš[HXXİ]š]Tİ[[X\HXÛÛXİ[Û“X\ØÛÛXİ[Û“˜[YWJH™]\›È›ÚYYØÊÛÛXİ[ÛŠš\™X˜\ÙQ‹›Ü×Ø]Y]ÛÙÜÈŠKÈXİÜ•\Ù\’Yˆ]]\Ù\‹ZYXİÜ“˜[YNˆ›Ùš[K™\Ü^S˜[YKXİÜ’[š]X[Îˆ›Ùš[Kš[š]X[ËXİÜÛÛİ\ˆ›Ùš[K˜ÛÛİ\‹Xİ[Û‹\™Ù]\NˆÛÛXİ[Û“˜[YK\™Ù]Yİ[[X\NˆXİ]š]Tİ[[X\JXİ[Û‹ÛÛXİ[Û“˜[YK˜[YJKÜ™X]Y]ˆ›İÊ
HJNÈKØ]]\Ù\‹›Ùš[WJNÃBˆÛÛœİYH\ÙPØ[˜XÚÊ\Ş[˜È
ÛÛXİ[Û“˜[YNˆİš[™Ë˜[YNˆ™XÛÜ™İš[™Ë[šÛ›İÛŠHOˆÈYˆ
Yš\™X˜\ÙQŠH›İÈ™]È\œ›ÜŠ‘š\™X˜\ÙH\È›İÛÛ™šYİ\™YY]ˆŠNÈÛÛœİ^[ØYHÛZ][™Yš[™YšY[ÊÈ‹‹˜[YKÜ™X]Y]ˆ›İÊ
K\]Y]ˆ›İÊ
HJNÈÛÛœİ™\İ[H]ØZ]YØÊÛÛXİ[ÛŠš\™X˜\ÙQ‹ÛÛXİ[Û“X\ØÛÛXİ[Û“˜[YWJK^[ØY
NÈYˆ
ÛÛXİ[Û“˜[YHOOH˜]Y]ÙÜÈˆ	‰ˆÛÛXİ[Û“˜[YHOOH››İYšXØ][ÛœÈŠHÜš]P]Y]
˜Ü™X]Y‹ÛÛXİ[Û“˜[YK™\İ[šY^[ØY
NÈYˆ
ÛÛXİ[Û“˜[YHOOH\ÚÜÈˆ	‰ˆ\[Ùˆ^[ØY˜\ÜÚYÛ™Y[XZ[OOHœİš[™Èˆ	‰ˆ^[ØY˜\ÜÚYÛ™Y[XZ[
HÈHÈÛÛœİÜ™X]Y]H›İÊ
NÈ]ØZ]YØÊÛÛXİ[ÛŠš\™X˜\ÙQ‹ÛÛXİ[Û“X\››İYšXØ][ÛœÊKZ[\ÚĞ\ÜÚYÛ›Y[›İYšXØ][ÛŠÈYˆ\[Ùˆ^[ØYšYOOH›[X™\ˆˆÈ^[ØYšYˆ[\ÜÚYÛ™Y[XZ[ˆ^[ØY˜\ÜÚYÛ™Y[XZ[]Nˆİš[™Ê^[ØY]HH™]È\ÚÈŠHK[Y\šXÒY

KÜ™X]Y]
JNÈHš[˜[HÈ›ÚY]Y]YU\ÚĞ\ÜÚYÛ›Y[[XZ[
]]\Ù\‹^[ØY
NÈHH™]\›ˆÈÙØÒYˆ™\İ[šY‹‹œ^[ØYNÈKØ]]\Ù\‹Üš]P]Y]JNÃBˆÛÛœİ]ÚH\ÙPØ[˜XÚÊ\Ş[˜È
ÛÛXİ[Û“˜[YNˆİš[™ËYˆİš[™Ë˜[YNˆ™XÛÜ™İš[™Ë[šÛ›İÛŠHOˆÈYˆ
Yš\™X˜\ÙQŠH›İÈ™]È\œ›ÜŠ‘š\™X˜\ÙH\È›İÛÛ™šYİ\™YY]ˆŠNÈÛÛœİÚ[™Ù\ÈHÛZ][™Yš[™YšY[ÊÈ‹‹˜[YK\]Y]ˆ›İÊ
HJNÈ]ØZ]\]QØÊØÊš\™X˜\ÙQ‹ÛÛXİ[Û“X\ØÛÛXİ[Û“˜[YWKY
KÚ[™Ù\ÊNÈYˆ
ÛÛXİ[Û“˜[YHOOH˜]Y]ÙÜÈˆ	‰ˆÛÛXİ[Û“˜[YHOOH››İYšXØ][ÛœÈˆ	‰ˆÛÛXİ[Û“˜[YHOOHœ™\Ù[˜ÙHŠHÜš]P]Y]
\]Y‹ÛÛXİ[Û“˜[YKYÚ[™Ù\ÊNÈYˆ
ÛÛXİ[Û“˜[YHOOH›Y[X™\œÈˆ	‰ˆYOOH]]\Ù\ËZY
HÙ]›Ùš[Jİ\œ™[Oˆİ\œ™[ÈÈ‹‹˜İ\œ™[‹‹˜Ú[™Ù\ÈH\ÈY[X™\ˆˆİ\œ™[
NÈKØ]]\Ù\‹Üš]P]Y]JNÃBˆÛÛœİ™[[İ™HH\ÙPØ[˜XÚÊ\Ş[˜È
ÛÛXİ[Û“˜[YNˆİš[™ËYˆİš[™ÊHOˆÈYˆ
Yš\™X˜\ÙQŠH›İÈ™]È\œ›ÜŠ‘š\™X˜\ÙH\È›İÛÛ™šYİ\™YY]ˆŠNÈ]ØZ][]QØÊØÊš\™X˜\ÙQ‹ÛÛXİ[Û“X\ØÛÛXİ[Û“˜[YWKY
JNÈYˆ
ÛÛXİ[Û“˜[YHOOH˜]Y]ÙÜÈˆ	‰ˆÛÛXİ[Û“˜[YHOOH››İYšXØ][ÛœÈŠHÜš]P]Y]
™[]Y‹ÛÛXİ[Û“˜[YKY
NÈKİÜš]P]Y]JNÃBˆÛÛœİY\ÚÔ™\Ûİ\˜ÙHH\ÙPØ[˜XÚÊ\Ş[˜È
È\ÚÒY\›]K›İHNˆ\ÚÔ™\Ûİ\˜ÙR[œ]
HOˆÃBˆYˆ
Yš\™X˜\ÙQˆX]]\Ù\ˆ\›Ùš[JH›İÈ™]È\œ›ÜŠ–[İH]\İ™HÚYÛ™Y[ˆÈYH™\Ûİ\˜ÙH[šËˆŠNÃBˆÛÛœİ›Ü›X[^™Y\›H\›š[J
NÃBˆÛÛœİ›Ü›X[^™Y]HH]Kš[J
NÃBˆYˆ
Z\Ğ[İÙY\ÚÔ™\Ûİ\˜ÙU\›
›Ü›X[^™Y\›
JH›İÈ™]È\œ›ÜŠ•\ÙHHÙXİ\™HÚ\™TÚ[ÜˆÛ™Qš]™H[šËˆŠNÃBˆYˆ
[›Ü›X[^™Y]JH›İÈ™]È\œ›ÜŠ‘Ú]™HH™\Ûİ\˜ÙHHÛX\ˆ]KˆŠNÃBˆÛÛœİ^[ØYHÈYˆ[Y\šXÒY

K\ÚÒY\›ˆ›Ü›X[^™Y\›]Nˆ›Ü›X[^™Y]K›İNˆ›İOËš[J
H[YYU\Ù\’Yˆ]]\Ù\‹ZYYYUX[SY[X™\’Yˆ›Ùš[KšYYYS˜[YNˆ›Ùš[K™\Ü^S˜[YHNÃBˆÛÛœİÜ™X]YH]ØZ]YØÊÛÛXİ[ÛŠš\™X˜\ÙQ‹ÛÛXİ[Û“X\\ÚĞ]XÚY[ÊKÈ‹‹œ^[ØYÜ™X]Y]ˆ›İÊ
K\]Y]ˆ›İÊ
HJNÃBˆÜš]P]Y]
˜Ü™X]Y‹\ÚĞ]XÚY[È‹Ü™X]YšY^[ØY
NÃBˆ™]\›ˆÈÙØÒYˆÜ™X]YšY‹‹œ^[ØYÜ™X]Y]ˆ›İÊ
HH\È\ÚÔ™\Ûİ\˜ÙNÃBˆKØ]]\Ù\‹›Ùš[KÜš]P]Y]JNÃBˆÛÛœİ™[[İ™U\ÚÔ™\Ûİ\˜ÙHH\ÙPØ[˜XÚÊ\Ş[˜È
™\Ûİ\˜ÙNˆ\ÚÔ™\Ûİ\˜ÙJHOˆÃBˆYˆ
Yš\™X˜\ÙQˆ\›Ùš[HVÈ›XY‹›X[˜YÙ\ˆ—Kš[˜ÛY\Ê›Ùš[K›Y[X™\”›ÛJJH›İÈ™]È\œ›ÜŠ“Û›H[ˆÜ\˜][ÛœÈX[˜YÙ\ˆØ[ˆ™[[İ™H\ÚÈ™\Ûİ\˜ÙH[šÜËˆŠNÃBˆ]ØZ][]QØÊØÊš\™X˜\ÙQ‹ÛÛXİ[Û“X\\ÚĞ]XÚY[Ë™\Ûİ\˜ÙK—ÙØÒY
JNÃBˆÜš]P]Y]
™[]Y‹\ÚĞ]XÚY[È‹™\Ûİ\˜ÙK—ÙØÒYÈ\ÚÒYˆ™\Ûİ\˜ÙK\ÚÒY]Nˆ™\Ûİ\˜ÙK]K\›ˆ™\Ûİ\˜ÙK\›JNÃBˆKÜ›Ùš[KÜš]P]Y]JNÃBˆÛÛœİÜ™X]UX[SY[X™\ˆH\ÙPØ[˜XÚÊ\Ş[˜È
˜[YNˆ™XÛÜ™İš[™Ë[šÛ›İÛŠHOˆÈYˆ
Yš\™X˜\ÙQˆ\›Ùš[H›Ùš[K›Y[X™\”›ÛHOOH›XYŠH›İÈ™]È\œ›ÜŠ“Û›HHÜ\˜][ÛœÈXYØ[ˆYHX[HY[X™\‹ˆŠNÈÛÛœİ[XZ[Hİš[™Ê˜[YK™[XZ[ˆŠKš[J
KÓİÙ\Ø\ÙJ
NÈYˆ
Y[XZ[™[™ÕÚ]
İØ[œİ˜]™[˜ÛÛHŠJH›İÈ™]È\œ›ÜŠ•\ÙHHÛÛXYİYx &\ÈİØ[œÈ˜]™[ÛÜšÈ[XZ[ˆŠNÈÛÛœİY[X™\’YH[Y\šXÒY

NÈÛÛœİ[š]][ÛˆY[X™\ˆ	ˆÈÜ™X]Y]ˆ[X™\ÈÜ™X]YNˆİš[™ÈHHÈYˆY[X™\’Y\Ù\’Yˆˆ‹[XZ[\Ü^S˜[YNˆİš[™Ê˜[YK™\Ü^S˜[YJK›Ø•]Nˆİš[™Ê˜[YKš›Ø•]JKY[X™\”›ÛNˆ˜[YK›Y[X™\”›ÛH\ÈY[X™\–È›Y[X™\”›ÛH—K[š]X[Îˆİš[™Ê˜[YKš[š]X[ÊKÛÛİ\ˆİš[™Ê˜[YK˜ÛÛİ\ŠKİ]\Îˆš[š]Y‹Ü™X]Y]ˆ›İÊ
KÜ™X]YNˆ›Ùš[K\Ù\’YNÈ]ØZ]Ù]ØÊØÊš\™X˜\ÙQ‹›Ü×Ú[š]\È‹[XZ[
K[š]][ÛŠNÈÜš]P]Y]
˜Ü™X]Y‹›Y[X™\œÈ‹[XZ[[š]][ÛŠNÈÙ][š]][ÛœÊİ\œ™[OˆË‹‹˜İ\œ™[™š[\ŠY[X™\ˆOˆY[X™\‹™[XZ[OOH[XZ[
K[š]][Û—JNÈ™]\›ˆ[š]][ÛÈKÜ›Ùš[KÜš]P]Y]JNÃBˆÛÛœİØ[˜Ù[X[R[š]][ÛˆH\ÙPØ[˜XÚÊ\Ş[˜È
[XZ[ˆİš[™ÊHOˆÈYˆ
Yš\™X˜\ÙQˆ›Ùš[OË›Y[X™\”›ÛHOOH›XYŠH›İÈ™]È\œ›ÜŠ“Û›HHÜ\˜][ÛœÈXYØ[ˆØ[˜Ù[[ˆ[š]][Û‹ˆŠNÈ]ØZ][]QØÊØÊš\™X˜\ÙQ‹›Ü×Ú[š]\È‹[XZ[
JNÈÜš]P]Y]
™[]Y‹›Y[X™\œÈ‹[XZ[È[XZ[JNÈÙ][š]][ÛœÊİ\œ™[Oˆİ\œ™[™š[\ŠY[X™\ˆOˆY[X™\‹™[XZ[OOH[XZ[
JNÈKÜ›Ùš[KÜš]P]Y]JNÃBˆÛÛœİ˜[YHH\ÙSY[[Ê

HOˆ
È]]\Ù\‹›Ùš[KØY[™Ë\œ›Ü‹İ]NˆÛÜšÜÜXÙTİ]K™Yœ™\Ú™YÚ\İ\‘[X[™[œ™YÚ\İ\‘[X[™ÚYÛ’[‹ÚYÛ•\™\Ù]\ÜİÛÜ™ÙÛİ]Y]Ú™[[İ™KY\ÚÔ™\Ûİ\˜ÙK™[[İ™U\ÚÔ™\Ûİ\˜ÙKÜ™X]UX[SY[X™\‹Ø[˜Ù[X[R[š]][ÛˆJKØ]]\Ù\‹›Ùš[KØY[™Ë\œ›Ü‹ÛÜšÜÜXÙTİ]K™Yœ™\Ú™YÚ\İ\‘[X[™[œ™YÚ\İ\‘[X[™ÚYÛ’[‹ÚYÛ•\™\Ù]\ÜİÛÜ™ÙÛİ]Y]Ú™[[İ™KY\ÚÔ™\Ûİ\˜ÙK™[[İ™U\ÚÔ™\Ûİ\˜ÙKÜ™X]UX[SY[X™\‹Ø[˜Ù[X[R[š]][Û—JNÈ™]\›ˆÛÜšÜÜXÙPÛÛ^”›İšY\ˆ˜[YO^İ˜[Y_OØÚ[™[ŸOÕÛÜšÜÜXÙPÛÛ^”›İšY\ÃBŸCB™^Ü[˜İ[Ûˆ\ÙUÛÜšÜÜXÙJÛÛXİ[ÛœÎˆÛÜšÜÜXÙPÛÛXİ[Û–×HH×Kš[\œÎˆÛÜšÜÜXÙQš[\œÈHßJHÈÛÛœİÛÛ^H\ÙPÛÛ^
ÛÜšÜÜXÙPÛÛ^
NÈÛÛœİ[X[™YH\ÙRY

NÈÛÛœİÛÛXİ[ÛœÔÚYÛ˜]\™HH\œ˜^K™œ›ÛJ™]ÈÙ]
ÛÛXİ[ÛœÊJKœÛÜ

Kš›Ú[Š‹ŠNÈÛÛœİš[\œÔÚYÛ˜]\™HH”ÓÓ‹œİš[™ÚYJš[\œÊNÈÛÛœİ™YÚ\İ\‘[X[™HÛÛ^Ëœ™YÚ\İ\‘[X[™ÈÛÛœİ[œ™YÚ\İ\‘[X[™HÛÛ^Ë[œ™YÚ\İ\‘[X[™È\ÙQY™™Xİ


HOˆÈÛÛœİ™\]Y\İYHÛÛXİ[ÛœÔÚYÛ˜]\™HÈÛÛXİ[ÛœÔÚYÛ˜]\™KœÜ]
‹ŠH\ÈÛÜšÜÜXÙPÛÛXİ[Û–×Hˆ×NÈ™YÚ\İ\‘[X[™ËŠ[X[™Y™\]Y\İY”ÓÓ‹œ\œÙJš[\œÔÚYÛ˜]\™JJNÈ™]\›ˆ

HOˆ[œ™YÚ\İ\‘[X[™ËŠ[X[™Y
NÈKÜ™YÚ\İ\‘[X[™[œ™YÚ\İ\‘[X[™[X[™YÛÛXİ[ÛœÔÚYÛ˜]\™Kš[\œÔÚYÛ˜]\™WJNÈYˆ
XÛÛ^
H›İÈ™]È\œ›ÜŠ•ÛÜšÜÜXÙT›İšY\ˆ\ÈZ\ÜÚ[™ËˆŠNÈ™]\›ˆÛÛ^ÈCB™^Ü[˜İ[Ûˆ™\]Z\™SXY
›Ùš[NˆY[X™\ˆ[
HÈYˆ
\›Ùš[H›Ùš[K›Y[X™\”›ÛHOOH›XYŠH›İÈ™]È\œ›ÜŠ“Û›HHÜ\˜][ÛœÈXYØ[ˆ\™›Ü›H]Xİ[Û‹ˆŠNÈCB™^Ü[˜İ[Ûˆ™\]Z\™SÜ\˜][ÛœÓX[˜YÙ\Š›Ùš[NˆY[X™\ˆ[
HÈYˆ
\›Ùš[HVÈ›XY‹›X[˜YÙ\ˆ—Kš[˜ÛY\Ê›Ùš[K›Y[X™\”›ÛJJH›İÈ™]È\œ›ÜŠ“Û›H[ˆÜ\˜][ÛœÈXYÜˆX[˜YÙ\ˆØ[ˆ\™›Ü›H]Xİ[Û‹ˆŠNÈCB™^Ü[˜İ[ÛˆY˜]SY[X™\Šİ]Nˆİ]KY[X™\’YÎˆ[X™\ˆ[
HÈ™]\›ˆİ]K›Y[X™\œË™š[™
Y[X™\ˆOˆY[X™\‹šYOOHY[X™\’Y
HÏÈ[ÈCB