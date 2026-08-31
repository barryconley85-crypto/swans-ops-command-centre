import { and, asc, desc, eq, gte, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  checklistTemplateItems,
  checklistTemplates,
  dailyTasks,
  handovers,
  InsertUser,
  operationalIssues,
  performanceNotes,
  readinessPulses,
  rotaAssignments,
  taskActivity,
  teamMembers,
  users,
} from "../drizzle/schema";
import { calculateMemberPerformance } from "./operations.logic";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }

  return _db;
}

async function requireDb() {
  const database = await getDb();

  if (!database) {
    throw new Error("Database connection is not available.");
  }

  return database;
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const database = await getDb();

  if (!database) {
    return;
  }

  const values: InsertUser = {
    openId: user.openId,
  };

  const updateSet: Record<string, unknown> = {};

  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });

  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await database
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({
      set: updateSet,
    });
}

export async function getUserByOpenId(openId: string) {
  const database = await getDb();

  if (!database) {
    return undefined;
  }

  const result = await database
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result[0];
}

/* -------------------------------------------------------------------------- */
/* Team members                                                               */
/* -------------------------------------------------------------------------- */

export async function listTeamMembers() {
  const database = await requireDb();

  return database
    .select()
    .from(teamMembers)
    .orderBy(asc(teamMembers.displayName));
}

export async function resolveTeamMemberForUser(user: {
  id: number;
  email: string | null;
}) {
  const database = await requireDb();

  const predicates = [eq(teamMembers.appUserId, user.id)];

  if (user.email) {
    predicates.push(eq(teamMembers.email, user.email));
  }

  const profile =
    (await database
      .select()
      .from(teamMembers)
      .where(or(...predicates))
      .limit(1))[0] ?? null;

  if (profile && profile.appUserId === null) {
    await database
      .update(teamMembers)
      .set({
        appUserId: user.id,
      })
      .where(eq(teamMembers.id, profile.id));

    return {
      ...profile,
      appUserId: user.id,
    };
  }

  return profile;
}

export async function createTeamMember(input: {
  displayName: string;
  email: string | null;
  jobTitle: string;
  memberRole: "lead" | "coordinator" | "support";
  initials: string;
  colour: string;
  createdByUserId: number;
}) {
  const database = await requireDb();

  return database
    .insert(teamMembers)
    .values(input)
    .$returningId();
}

export async function updateTeamMember(input: {
  id: number;
  displayName: string;
  email: string | null;
  jobTitle: string;
  memberRole: "lead" | "coordinator" | "support";
  initials: string;
  colour: string;
  status: "active" | "inactive";
}) {
  const database = await requireDb();

  await database
    .update(teamMembers)
    .set(input)
    .where(eq(teamMembers.id, input.id));

  return {
    success: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Checklist templates                                                        */
/* -------------------------------------------------------------------------- */

export async function listChecklistTemplates() {
  const database = await requireDb();

  const templates = await database
    .select()
    .from(checklistTemplates)
    .orderBy(desc(checklistTemplates.updatedAt));

  const items = await database
    .select()
    .from(checklistTemplateItems)
    .orderBy(asc(checklistTemplateItems.sortOrder));

  return templates.map(template => ({
    ...template,
    items: items.filter(
      item => item.templateId === template.id,
    ),
  }));
}

export async function createChecklistTemplate(input: {
  name: string;
  description?: string;
  createdByUserId: number;
  items: Array<{
    title: string;
    detail?: string;
    priority: "low" | "normal" | "high" | "critical";
    defaultAssigneeId?: number;
    dueTime?: string;
  }>;
}) {
  const database = await requireDb();

  const result = await database
    .insert(checklistTemplates)
    .values({
      name: input.name,
      description: input.description,
      createdByUserId: input.createdByUserId,
    })
    .$returningId();

  const templateId = result[0]?.id;

  if (!templateId) {
    throw new Error("Unable to create checklist template.");
  }

  await database
    .insert(checklistTemplateItems)
    .values(
      input.items.map((item, index) => ({
        ...item,
        templateId,
        sortOrder: index,
      })),
    );

  return {
    id: templateId,
  };
}

export async function updateChecklistTemplate(input: {
  templateId: number;
  name: string;
  description?: string;
}) {
  const database = await requireDb();

  await database
    .update(checklistTemplates)
    .set({
      name: input.name,
      description: input.description ?? null,
    })
    .where(
      eq(
        checklistTemplates.id,
        input.templateId,
      ),
    );

  return {
    success: true,
  };
}

export async function updateChecklistTemplateItem(input: {
  itemId: number;
  title: string;
  detail?: string;
  priority: "low" | "normal" | "high" | "critical";
  defaultAssigneeId?: number | null;
  dueTime?: string | null;
}) {
  const database = await requireDb();

  await database
    .update(checklistTemplateItems)
    .set({
      title: input.title,
      detail: input.detail ?? null,
      priority: input.priority,
      defaultAssigneeId:
        input.defaultAssigneeId ?? null,
      dueTime: input.dueTime ?? null,
    })
    .where(
      eq(
        checklistTemplateItems.id,
        input.itemId,
      ),
    );

  return {
    success: true,
  };
}

export async function removeChecklistTemplateItem(
  itemId: number,
) {
  const database = await requireDb();

  await database
    .delete(checklistTemplateItems)
    .where(
      eq(
        checklistTemplateItems.id,
        itemId,
      ),
    );

  return {
    success: true,
  };
}

export async function removeChecklistTemplate(
  templateId: number,
) {
  const database = await requireDb();

  await database
    .delete(checklistTemplateItems)
    .where(
      eq(
        checklistTemplateItems.templateId,
        templateId,
      ),
    );

  await database
    .delete(checklistTemplates)
    .where(
      eq(
        checklistTemplates.id,
        templateId,
      ),
    );

  return {
    success: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Applying templates                                                         */
/* -------------------------------------------------------------------------- */

export async function applyChecklistTemplate(
  templateId: number,
  workDate: string,
  createdByUserId: number,
  assignedTeamMemberId?: number,
) {
  const database = await requireDb();

  const items = await database
    .select()
    .from(checklistTemplateItems)
    .where(
      eq(
        checklistTemplateItems.templateId,
        templateId,
      ),
    )
    .orderBy(
      asc(
        checklistTemplateItems.sortOrder,
      ),
    );

  if (!items.length) {
    return {
      created: 0,
    };
  }

  const offset = new Date(
    `${workDate}T00:00:00Z`,
  ).getTime();

  await database
    .insert(dailyTasks)
    .values(
      items.map(item => ({
        workDate,
        templateItemId: item.id,
        title: item.title,
        detail: item.detail,
        priority: item.priority,
        assignedTeamMemberId:
          assignedTeamMemberId ??
          item.defaultAssigneeId,
        dueAt: item.dueTime
          ? offset +
            (
              Number(
                item.dueTime.slice(0, 2),
              ) *
                60 +
              Number(
                item.dueTime.slice(3),
              )
            ) *
              60_000
          : null,
        createdByUserId,
      })),
    );

  return {
    created: items.length,
  };
}

export async function applyChecklistTemplateRange(
  templateId: number,
  startDate: string,
  endDate: string,
  assignedTeamMemberId: number | undefined,
  createdByUserId: number,
) {
  const start = new Date(
    `${startDate}T12:00:00`,
  );

  const end = new Date(
    `${endDate}T12:00:00`,
  );

  if (end < start) {
    throw new Error(
      "End date must be on or after start date.",
    );
  }

  let created = 0;
  let days = 0;

  const current = new Date(start);

  while (current <= end) {
    const workDate =
      `${current.getFullYear()}-${String(
        current.getMonth() + 1,
      ).padStart(2, "0")}-${String(
        current.getDate(),
      ).padStart(2, "0")}`;

    const result =
      await applyChecklistTemplate(
        templateId,
        workDate,
        createdByUserId,
        assignedTeamMemberId,
      );

    created += result.created;
    days += 1;

    current.setDate(
      current.getDate() + 1,
    );
  }

  return {
    created,
    days,
  };
}

/* -------------------------------------------------------------------------- */
/* Daily tasks                                                                */
/* -------------------------------------------------------------------------- */

export async function listDailyTasks(
  workDate: string,
) {
  const database = await requireDb();

  const [tasks, members] =
    await Promise.all([
      database
        .select()
        .from(dailyTasks)
        .where(
          eq(
            dailyTasks.workDate,
            workDate,
          ),
        )
        .orderBy(
          asc(dailyTasks.dueAt),
          desc(dailyTasks.priority),
        ),
      listTeamMembers(),
    ]);

  return tasks.map(task => ({
    ...task,
    assignee:
      members.find(
        member =>
          member.id ===
          task.assignedTeamMemberId,
      ) ?? null,
  }));
}

export async function createDailyTask(input: {
  workDate: string;
  title: string;
  detail?: string;
  priority:
    | "low"
    | "normal"
    | "high"
    | "critical";
  dueAt?: number;
  assignedTeamMemberId?: number;
  createdByUserId: number;
}) {
  const database = await requireDb();

  const inserted = await database
    .insert(dailyTasks)
    .values(input)
    .$returningId();

  const taskId = inserted[0]?.id;

  if (taskId) {
    await database
      .insert(taskActivity)
      .values({
        taskId,
        action: "created",
        actorUserId:
          input.createdByUserId,
      });
  }

  return {
    id: taskId,
  };
}

/* -------------------------------------------------------------------------- */
/* Task assignment                                                            */
/* -------------------------------------------------------------------------- */

export async function updateDailyTaskAssignment(
  taskId: number,
  assignedTeamMemberId: number | null,
  actorUserId: number,
) {
  const database = await requireDb();

  const existing = await database
    .select()
    .from(dailyTasks)
    .where(eq(dailyTasks.id, taskId))
    .limit(1);

  const task = existing[0];

  if (!task) {
    throw new Error(
      "The task could not be found.",
    );
  }

  const previousAssigneeId =
    task.assignedTeamMemberId;

  await database
    .update(dailyTasks)
    .set({
      assignedTeamMemberId,
    })
    .where(
      eq(
        dailyTasks.id,
        taskId,
      ),
    );

  const message =
    assignedTeamMemberId === null
      ? previousAssigneeId
        ? "Task assignment removed."
        : "Task left unassigned."
      : previousAssigneeId === null
        ? "Task assigned."
        : "Task assignment changed.";

  /*
   * The schema's taskActivity enum does not contain
   * an "assigned" action, so assignment changes are
   * recorded as comments instead of introducing an
   * unsupported enum value.
   */
  await database
    .insert(taskActivity)
    .values({
      taskId,
      action: "commented",
      body: message,
      actorUserId,
    });

  return {
    success: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Task status                                                                */
/* -------------------------------------------------------------------------- */

export async function updateDailyTaskStatus(input: {
  taskId: number;
  status:
    | "pending"
    | "in_progress"
    | "blocked"
    | "complete";
  actorTeamMemberId?: number;
  actorUserId: number;
  note?: string;
}) {
  const database = await requireDb();

  const now = Date.now();

  const action =
    input.status === "complete"
      ? "completed"
      : input.status === "blocked"
        ? "blocked"
        : input.status === "in_progress"
          ? "started"
          : "reopened";

  await database
    .update(dailyTasks)
    .set({
      status: input.status,
      completedAt:
        input.status === "complete"
          ? now
          : null,
      completedByTeamMemberId:
        input.status === "complete"
          ? input.actorTeamMemberId ??
            null
          : null,
      blockedReason:
        input.status === "blocked"
          ? input.note ??
            "Blocked, action required"
          : null,
    })
    .where(
      eq(
        dailyTasks.id,
        input.taskId,
      ),
    );

  await database
    .insert(taskActivity)
    .values({
      taskId: input.taskId,
      action,
      body: input.note,
      actorTeamMemberId:
        input.actorTeamMemberId,
      actorUserId:
        input.actorUserId,
    });

  return {
    success: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Task comments                                                              */
/* -------------------------------------------------------------------------- */

export async function addTaskComment(
  input: {
    taskId: number;
    body: string;
    actorTeamMemberId?: number;
    actorUserId: number;
  },
) {
  const database = await requireDb();

  await database
    .insert(taskActivity)
    .values({
      ...input,
      action: "commented",
    });

  return {
    success: true,
  };
}

export async function listTaskActivity(
  taskId: number,
) {
  const database = await requireDb();

  return database
    .select()
    .from(taskActivity)
    .where(
      eq(
        taskActivity.taskId,
        taskId,
      ),
    )
    .orderBy(
      desc(
        taskActivity.createdAt,
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Rota                                                                       */
/* -------------------------------------------------------------------------- */

export async function createRotaAssignment(
  input: {
    workDate: string;
    teamMemberId: number;
    assignmentType:
      | "early"
      | "core"
      | "late"
      | "on_call"
      | "leave"
      | "unavailable";
    startTime?: string;
    endTime?: string;
    note?: string;
    createdByUserId: number;
  },
) {
  const database = await requireDb();

  return database
    .insert(rotaAssignments)
    .values(input)
    .$returningId();
}

export async function removeRotaAssignment(
  id: number,
) {
  const database = await requireDb();

  await database
    .delete(rotaAssignments)
    .where(
      eq(
        rotaAssignments.id,
        id,
      ),
    );

  return {
    success: true,
  };
}

export async function getRotaWeek(
  weekStart: string,
) {
  const database = await requireDb();

  const end = new Date(
    `${weekStart}T00:00:00Z`,
  );

  end.setUTCDate(
    end.getUTCDate() + 6,
  );

  const weekEnd =
    end.toISOString().slice(0, 10);

  const [assignments, members] =
    await Promise.all([
      database
        .select()
        .from(rotaAssignments)
        .where(
          and(
            gte(
              rotaAssignments.workDate,
              weekStart,
            ),
            lte(
              rotaAssignments.workDate,
              weekEnd,
            ),
          ),
        )
        .orderBy(
          asc(
            rotaAssignments.workDate,
          ),
        ),
      listTeamMembers(),
    ]);

  return {
    assignments,
    members,
    weekEnd,
  };
}

/* -------------------------------------------------------------------------- */
/* Handovers                                                                  */
/* -------------------------------------------------------------------------- */

export async function listHandovers(
  input: {
    query?: string;
    status?:
      | "open"
      | "acknowledged"
      | "resolved";
  },
) {
  const database = await requireDb();

  const predicates = [];

  if (input.status) {
    predicates.push(
      eq(
        handovers.status,
        input.status,
      ),
    );
  }

  if (input.query) {
    predicates.push(
      or(
        sql`LOWER(${handovers.title}) LIKE ${`%${input.query.toLowerCase()}%`}`,
        sql`LOWER(${handovers.detail}) LIKE ${`%${input.query.toLowerCase()}%`}`,
      ),
    );
  }

  const data =
    await database
      .select()
      .from(handovers)
      .where(
        predicates.length
          ? and(...predicates)
          : undefined,
      )
      .orderBy(
        desc(handovers.createdAt),
      );

  const members =
    await listTeamMembers();

  return data.map(item => ({
    ...item,
    owner:
      members.find(
        member =>
          member.id ===
          item.ownerTeamMemberId,
      ) ?? null,
  }));
}

export async function createHandover(
  input: {
    title: string;
    detail: string;
    priority:
      | "low"
      | "normal"
      | "high"
      | "critical";
    ownerTeamMemberId?: number;
    deadlineAt?: number;
    decisionRecord?: string;
    createdByUserId: number;
  },
) {
  const database = await requireDb();

  return database
    .insert(handovers)
    .values(input)
    .$returningId();
}

export async function acknowledgeHandover(
  id: number,
  userId: number,
) {
  const database = await requireDb();

  await database
    .update(handovers)
    .set({
      status: "acknowledged",
      acknowledgedByUserId:
        userId,
      acknowledgedAt: Date.now(),
    })
    .where(
      eq(
        handovers.id,
        id,
      ),
    );

  return {
    success: true,
  };
}

export async function resolveHandover(
  id: number,
  userId: number,
  decisionRecord?: string,
) {
  const database = await requireDb();

  await database
    .update(handovers)
    .set({
      status: "resolved",
      resolvedByUserId:
        userId,
      resolvedAt: Date.now(),
      decisionRecord,
    })
    .where(
      eq(
        handovers.id,
        id,
      ),
    );

  return {
    success: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Issues                                                                     */
/* -------------------------------------------------------------------------- */

export async function listOperationalIssues(
  status?:
    | "open"
    | "monitoring"
    | "resolved",
) {
  const database = await requireDb();

  const data =
    await database
      .select()
      .from(operationalIssues)
      .where(
        status
          ? eq(
              operationalIssues.status,
              status,
            )
          : undefined,
      )
      .orderBy(
        desc(
          operationalIssues.detectedAt,
        ),
      );

  const members =
    await listTeamMembers();

  return data.map(issue => ({
    ...issue,
    owner:
      members.find(
        member =>
          member.id ===
          issue.ownerTeamMemberId,
      ) ?? null,
  }));
}

export async function createOperationalIssue(
  input: {
    title: string;
    category:
      | "breakdown"
      | "customer_concern"
      | "late_running"
      | "staffing"
      | "other";
    impact:
      | "low"
      | "medium"
      | "high"
      | "critical";
    ownerTeamMemberId?: number;
    nextAction: string;
    recurringCause?: string;
    detectedAt: number;
    targetAt?: number;
    createdByUserId: number;
  },
) {
  const database = await requireDb();

  return database
    .insert(operationalIssues)
    .values(input)
    .$returningId();
}

export async function updateOperationalIssue(
  input: {
    id: number;
    status:
      | "open"
      | "monitoring"
      | "resolved";
    ownerTeamMemberId?: number;
    nextAction: string;
    resolution?: string;
  },
) {
  const database = await requireDb();

  await database
    .update(operationalIssues)
    .set({
      ...input,
      resolvedAt:
        input.status === "resolved"
          ? Date.now()
          : null,
    })
    .where(
      eq(
        operationalIssues.id,
        input.id,
      ),
    );

  return {
    success: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Readiness                                                                  */
/* -------------------------------------------------------------------------- */

export async function listReadinessPulses(
  pulseDate: string,
) {
  const database = await requireDb();

  const [pulses, members] =
    await Promise.all([
      database
        .select()
        .from(readinessPulses)
        .where(
          eq(
            readinessPulses.pulseDate,
            pulseDate,
          ),
        ),
      listTeamMembers(),
    ]);

  return pulses.map(pulse => ({
    ...pulse,
    member:
      members.find(
        member =>
          member.id ===
          pulse.teamMemberId,
      ) ?? null,
  }));
}

export async function upsertReadinessPulse(
  input: {
    pulseDate: string;
    teamMemberId: number;
    capacity:
      | "green"
      | "amber"
      | "red";
    riskNote?: string;
    supportNeeded?: string;
    submittedAt: number;
  },
) {
  const database = await requireDb();

  await database
    .insert(readinessPulses)
    .values(input)
    .onDuplicateKeyUpdate({
      set: {
        capacity: input.capacity,
        riskNote:
          input.riskNote,
        supportNeeded:
          input.supportNeeded,
        submittedAt:
          input.submittedAt,
      },
    });

  return {
    success: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Performance                                                                */
/* -------------------------------------------------------------------------- */

export async function getPerformanceOverview(
  input: {
    rangeStart: string;
    rangeEnd: string;
  },
) {
  const database = await requireDb();

  const [
    members,
    tasks,
    rota,
    notes,
  ] = await Promise.all([
    listTeamMembers(),

    database
      .select()
      .from(dailyTasks)
      .where(
        and(
          gte(
            dailyTasks.workDate,
            input.rangeStart,
          ),
          lte(
            dailyTasks.workDate,
            input.rangeEnd,
          ),
        ),
      ),

    database
      .select()
      .from(rotaAssignments)
      .where(
        and(
          gte(
            rotaAssignments.workDate,
            input.rangeStart,
          ),
          lte(
            rotaAssignments.workDate,
            input.rangeEnd,
          ),
        ),
      ),

    database
      .select()
      .from(performanceNotes)
      .orderBy(
        desc(
          performanceNotes.recordedAt,
        ),
      ),
  ]);

  return members.map(member => ({
    member,

    ...calculateMemberPerformance(
      member.id,
      tasks,
      rota,
    ),

    notes: notes
      .filter(
        note =>
          note.teamMemberId ===
          member.id,
      )
      .slice(0, 3),
  }));
}

export async function listPerformanceNotes(
  teamMemberId: number,
) {
  const database = await requireDb();

  return database
    .select()
    .from(performanceNotes)
    .where(
      eq(
        performanceNotes.teamMemberId,
        teamMemberId,
      ),
    )
    .orderBy(
      desc(
        performanceNotes.recordedAt,
      ),
    );
}

export async function createPerformanceNote(
  input: {
    teamMemberId: number;
    noteType:
      | "coaching"
      | "recognition";
    note: string;
    recordedByUserId: number;
    recordedAt: number;
  },
) {
  const database = await requireDb();

  return database
    .insert(performanceNotes)
    .values(input)
    .$returningId();
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export async function getDashboardSnapshot(
  workDate: string,
) {
  const database = await requireDb();

  const [
    members,
    tasks,
    readiness,
    handoverRows,
    issueRows,
    rota,
  ] = await Promise.all([
    listTeamMembers(),

    database
      .select()
      .from(dailyTasks)
      .where(
        eq(
          dailyTasks.workDate,
          workDate,
        ),
      )
      .orderBy(
        asc(
          dailyTasks.dueAt,
        ),
      ),

    database
      .select()
      .from(readinessPulses)
      .where(
        eq(
          readinessPulses.pulseDate,
          workDate,
        ),
      ),

    database
      .select()
      .from(handovers)
      .where(
        ne(
          handovers.status,
          "resolved",
        ),
      )
      .orderBy(
        desc(
          handovers.createdAt,
        ),
      )
      .limit(6),

    database
      .select()
      .from(operationalIssues)
      .where(
        ne(
          operationalIssues.status,
          "resolved",
        ),
      )
      .orderBy(
        desc(
          operationalIssues.detectedAt,
        ),
      )
      .limit(6),

    database
      .select()
      .from(rotaAssignments)
      .where(
        eq(
          rotaAssignments.workDate,
          workDate,
        ),
      ),
  ]);

  const enrich = <
    T extends {
      ownerTeamMemberId?:
        | number
        | null;

      assignedTeamMemberId?:
        | number
        | null;

      teamMemberId?:
        | number
        | null;
    },
  >(
    row: T,
  ) => ({
    ...row,

    member:
      members.find(
        member =>
          member.id ===
          (
            row.ownerTeamMemberId ??
            row.assignedTeamMemberId ??
            row.teamMemberId
          ),
      ) ?? null,
  });

  const completeCount =
    tasks.filter(
      task =>
        task.status ===
        "complete",
    ).length;

  const blockedCount =
    tasks.filter(
      task =>
        task.status ===
        "blocked",
    ).length;

  const overdueCount =
    tasks.filter(
      task =>
        task.status !==
          "complete" &&
        task.dueAt &&
        task.dueAt <
          Date.now(),
    ).length;

  return {
    members,

    tasks:
      tasks.map(enrich),

    readiness:
      readiness.map(enrich),

    handovers:
      handoverRows.map(enrich),

    issues:
      issueRows.map(enrich),

    rota:
      rota.map(enrich),

    metrics: {
      totalTasks:
        tasks.length,

      completeCount,

      blockedCount,

      overdueCount,

      readinessSubmitted:
        readiness.length,

      activeTeamMembers:
        members.filter(
          member =>
            member.status ===
            "active",
        ).length,
    },
  };
}