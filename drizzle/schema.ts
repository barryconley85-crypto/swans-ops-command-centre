import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core application identities are provisioned by Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** A named operations colleague. Profiles may be linked to a signed-in application user later. */
export const teamMembers = mysqlTable(
  "teamMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    appUserId: int("appUserId"),
    displayName: varchar("displayName", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }),
    jobTitle: varchar("jobTitle", { length: 120 }).notNull().default("Operations Coordinator"),
    memberRole: mysqlEnum("memberRole", ["lead", "coordinator", "support"]).default("coordinator").notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    colour: varchar("colour", { length: 16 }).default("#1D5C63").notNull(),
    initials: varchar("initials", { length: 4 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("teamMembers_appUser_unique").on(table.appUserId),
    index("teamMembers_status_index").on(table.status),
  ],
);

export const checklistTemplates = mysqlTable(
  "checklistTemplates",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    active: boolean("active").default(true).notNull(),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("checklistTemplates_active_index").on(table.active)],
);

export const checklistTemplateItems = mysqlTable(
  "checklistTemplateItems",
  {
    id: int("id").autoincrement().primaryKey(),
    templateId: int("templateId").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    detail: text("detail"),
    priority: mysqlEnum("priority", ["low", "normal", "high", "critical"]).default("normal").notNull(),
    defaultAssigneeId: int("defaultAssigneeId"),
    dueTime: varchar("dueTime", { length: 5 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("checklistTemplateItems_template_index").on(table.templateId)],
);

export const dailyTasks = mysqlTable(
  "dailyTasks",
  {
    id: int("id").autoincrement().primaryKey(),
    workDate: varchar("workDate", { length: 10 }).notNull(),
    templateItemId: int("templateItemId"),
    title: varchar("title", { length: 240 }).notNull(),
    detail: text("detail"),
    priority: mysqlEnum("priority", ["low", "normal", "high", "critical"]).default("normal").notNull(),
    status: mysqlEnum("status", ["pending", "in_progress", "blocked", "complete"]).default("pending").notNull(),
    dueAt: bigint("dueAt", { mode: "number" }),
    assignedTeamMemberId: int("assignedTeamMemberId"),
    completedByTeamMemberId: int("completedByTeamMemberId"),
    completedAt: bigint("completedAt", { mode: "number" }),
    blockedReason: text("blockedReason"),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("dailyTasks_date_status_index").on(table.workDate, table.status),
    index("dailyTasks_assignee_index").on(table.assignedTeamMemberId),
  ],
);

export const taskActivity = mysqlTable(
  "taskActivity",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull(),
    action: mysqlEnum("action", ["created", "commented", "started", "completed", "blocked", "reopened"]).notNull(),
    body: text("body"),
    actorTeamMemberId: int("actorTeamMemberId"),
    actorUserId: int("actorUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("taskActivity_task_index").on(table.taskId, table.createdAt)],
);

export const rotaAssignments = mysqlTable(
  "rotaAssignments",
  {
    id: int("id").autoincrement().primaryKey(),
    workDate: varchar("workDate", { length: 10 }).notNull(),
    teamMemberId: int("teamMemberId").notNull(),
    assignmentType: mysqlEnum("assignmentType", ["early", "core", "late", "on_call", "leave", "unavailable"]).notNull(),
    startTime: varchar("startTime", { length: 5 }),
    endTime: varchar("endTime", { length: 5 }),
    note: varchar("note", { length: 500 }),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("rotaAssignments_date_index").on(table.workDate),
    index("rotaAssignments_member_index").on(table.teamMemberId, table.workDate),
  ],
);

export const handovers = mysqlTable(
  "handovers",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 240 }).notNull(),
    detail: text("detail").notNull(),
    priority: mysqlEnum("priority", ["low", "normal", "high", "critical"]).default("normal").notNull(),
    status: mysqlEnum("status", ["open", "acknowledged", "resolved"]).default("open").notNull(),
    ownerTeamMemberId: int("ownerTeamMemberId"),
    deadlineAt: bigint("deadlineAt", { mode: "number" }),
    decisionRecord: text("decisionRecord"),
    createdByUserId: int("createdByUserId"),
    acknowledgedByUserId: int("acknowledgedByUserId"),
    acknowledgedAt: bigint("acknowledgedAt", { mode: "number" }),
    resolvedByUserId: int("resolvedByUserId"),
    resolvedAt: bigint("resolvedAt", { mode: "number" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("handovers_status_priority_index").on(table.status, table.priority),
    index("handovers_owner_index").on(table.ownerTeamMemberId),
  ],
);

export const operationalIssues = mysqlTable(
  "operationalIssues",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 240 }).notNull(),
    category: mysqlEnum("category", ["breakdown", "customer_concern", "late_running", "staffing", "other"]).notNull(),
    impact: mysqlEnum("impact", ["low", "medium", "high", "critical"]).default("medium").notNull(),
    status: mysqlEnum("status", ["open", "monitoring", "resolved"]).default("open").notNull(),
    ownerTeamMemberId: int("ownerTeamMemberId"),
    nextAction: text("nextAction").notNull(),
    resolution: text("resolution"),
    recurringCause: varchar("recurringCause", { length: 240 }),
    detectedAt: bigint("detectedAt", { mode: "number" }).notNull(),
    targetAt: bigint("targetAt", { mode: "number" }),
    createdByUserId: int("createdByUserId"),
    resolvedAt: bigint("resolvedAt", { mode: "number" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("operationalIssues_status_index").on(table.status, table.impact),
    index("operationalIssues_owner_index").on(table.ownerTeamMemberId),
  ],
);

export const readinessPulses = mysqlTable(
  "readinessPulses",
  {
    id: int("id").autoincrement().primaryKey(),
    pulseDate: varchar("pulseDate", { length: 10 }).notNull(),
    teamMemberId: int("teamMemberId").notNull(),
    capacity: mysqlEnum("capacity", ["green", "amber", "red"]).notNull(),
    riskNote: text("riskNote"),
    supportNeeded: text("supportNeeded"),
    submittedAt: bigint("submittedAt", { mode: "number" }).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("readinessPulses_member_date_unique").on(table.teamMemberId, table.pulseDate),
    index("readinessPulses_date_index").on(table.pulseDate, table.capacity),
  ],
);

export const performanceNotes = mysqlTable(
  "performanceNotes",
  {
    id: int("id").autoincrement().primaryKey(),
    teamMemberId: int("teamMemberId").notNull(),
    noteType: mysqlEnum("noteType", ["coaching", "recognition"]).notNull(),
    note: text("note").notNull(),
    recordedByUserId: int("recordedByUserId").notNull(),
    recordedAt: bigint("recordedAt", { mode: "number" }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("performanceNotes_member_index").on(table.teamMemberId, table.recordedAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
