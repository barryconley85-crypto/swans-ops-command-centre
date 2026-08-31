import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const priority = z.enum(["low", "normal", "high", "critical"]);
const teamRole = z.enum(["lead", "coordinator", "support"]);

const assignmentType = z.enum([
  "early",
  "core",
  "late",
  "on_call",
  "leave",
  "unavailable",
]);

const managerProcedure = protectedProcedure.use(
  ({ ctx, next }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Management access is required for this action.",
      });
    }

    return next({ ctx });
  },
);

const teamMemberProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const teamMember =
      await db.resolveTeamMemberForUser(ctx.user);

    if (
      !teamMember ||
      teamMember.status !== "active"
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Your account is not linked to an active operations-team profile. Ask the operations lead to add your work email to the team directory.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        teamMember,
      },
    });
  },
);

const teamMemberInput = z.object({
  displayName: z.string().min(2).max(120),

  email: z
    .string()
    .email()
    .max(320)
    .optional()
    .or(z.literal("")),

  jobTitle: z.string().min(2).max(120),

  memberRole: teamRole,

  initials: z
    .string()
    .min(1)
    .max(4)
    .transform(value =>
      value.toUpperCase(),
    ),

  colour: z.string().regex(
    /^#[0-9A-Fa-f]{6}$/,
  ),
});

function dateKeysBetween(
  startDate: string,
  endDate: string,
) {
  const dates: string[] = [];

  const current = new Date(
    `${startDate}T12:00:00`,
  );

  const end = new Date(
    `${endDate}T12:00:00`,
  );

  while (current <= end) {
    dates.push(
      `${current.getFullYear()}-${String(
        current.getMonth() + 1,
      ).padStart(2, "0")}-${String(
        current.getDate(),
      ).padStart(2, "0")}`,
    );

    current.setDate(
      current.getDate() + 1,
    );
  }

  return dates;
}

export const operationsRouter = router({
  /* ---------------------------------------------------------------------- */
  /* Access                                                                 */
  /* ---------------------------------------------------------------------- */

  access: router({
    me: protectedProcedure.query(
      ({ ctx }) =>
        db.resolveTeamMemberForUser(
          ctx.user,
        ),
    ),
  }),

  /* ---------------------------------------------------------------------- */
  /* Dashboard                                                              */
  /* ---------------------------------------------------------------------- */

  dashboard: protectedProcedure
    .input(
      z.object({
        date: dateInput,
      }),
    )
    .query(({ input }) =>
      db.getDashboardSnapshot(
        input.date,
      ),
    ),

  /* ---------------------------------------------------------------------- */
  /* Team                                                                    */
  /* ---------------------------------------------------------------------- */

  team: router({
    list: protectedProcedure.query(
      () => db.listTeamMembers(),
    ),

    create: managerProcedure
      .input(teamMemberInput)
      .mutation(({ ctx, input }) =>
        db.createTeamMember({
          ...input,
          email: input.email || null,
          createdByUserId:
            ctx.user.id,
        }),
      ),

    update: managerProcedure
      .input(
        teamMemberInput.extend({
          id: z.number().int().positive(),
          status: z.enum([
            "active",
            "inactive",
          ]),
        }),
      )
      .mutation(({ input }) =>
        db.updateTeamMember({
          ...input,
          email: input.email || null,
        }),
      ),
  }),

  /* ---------------------------------------------------------------------- */
  /* Checklist templates                                                    */
  /* ---------------------------------------------------------------------- */

  templates: router({
    list: protectedProcedure.query(
      () =>
        db.listChecklistTemplates(),
    ),

    create: managerProcedure
      .input(
        z.object({
          name: z.string().min(3).max(160),

          description: z
            .string()
            .max(2000)
            .optional(),

          items: z
            .array(
              z.object({
                title: z
                  .string()
                  .min(3)
                  .max(240),

                detail: z
                  .string()
                  .max(2000)
                  .optional(),

                priority:
                  priority.default(
                    "normal",
                  ),

                defaultAssigneeId:
                  z
                    .number()
                    .int()
                    .positive()
                    .optional(),

                dueTime: z
                  .string()
                  .regex(
                    /^([01]\d|2[0-3]):[0-5]\d$/,
                  )
                  .optional(),
              }),
            )
            .min(1)
            .max(30),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.createChecklistTemplate({
          ...input,
          createdByUserId:
            ctx.user.id,
        }),
      ),

    update: managerProcedure
      .input(
        z.object({
          templateId:
            z.number().int().positive(),

          name: z
            .string()
            .min(3)
            .max(160),

          description: z
            .string()
            .max(2000)
            .optional(),
        }),
      )
      .mutation(({ input }) =>
        db.updateChecklistTemplate(
          input,
        ),
      ),

    updateItem: managerProcedure
      .input(
        z.object({
          itemId:
            z.number().int().positive(),

          title: z
            .string()
            .min(3)
            .max(240),

          detail: z
            .string()
            .max(2000)
            .optional(),

          priority,

          defaultAssigneeId:
            z
              .number()
              .int()
              .positive()
              .nullable()
              .optional(),

          dueTime: z
            .string()
            .regex(
              /^([01]\d|2[0-3]):[0-5]\d$/,
            )
            .nullable()
            .optional(),
        }),
      )
      .mutation(({ input }) =>
        db.updateChecklistTemplateItem(
          input,
        ),
      ),

    removeItem: managerProcedure
      .input(
        z.object({
          itemId:
            z.number().int().positive(),
        }),
      )
      .mutation(({ input }) =>
        db.removeChecklistTemplateItem(
          input.itemId,
        ),
      ),

    remove: managerProcedure
      .input(
        z.object({
          templateId:
            z.number().int().positive(),
        }),
      )
      .mutation(({ input }) =>
        db.removeChecklistTemplate(
          input.templateId,
        ),
      ),

    applyTemplate: managerProcedure
      .input(
        z
          .object({
            templateId:
              z.number().int().positive(),

            workDate:
              dateInput.optional(),

            startDate:
              dateInput.optional(),

            endDate:
              dateInput.optional(),

            assignedTeamMemberId:
              z
                .number()
                .int()
                .positive()
                .optional(),
          })
          .refine(
            value =>
              Boolean(
                value.workDate ||
                  (
                    value.startDate &&
                    value.endDate
                  ),
              ),
            {
              message:
                "A work date or date range is required.",
            },
          ),
      )
      .mutation(
        async ({ ctx, input }) => {
          const startDate =
            input.startDate ??
            input.workDate!;

          const endDate =
            input.endDate ??
            input.workDate!;

          if (endDate < startDate) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Choose an end date on or after the start date.",
            });
          }

          const dates =
            dateKeysBetween(
              startDate,
              endDate,
            );

          if (dates.length > 21) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Choose a template run of up to 21 days.",
            });
          }

          let created = 0;

          for (
            const workDate of dates
          ) {
            const result =
              await db.applyChecklistTemplate(
                input.templateId,
                workDate,
                ctx.user.id,
                input.assignedTeamMemberId,
              );

            created += result.created;
          }

          return {
            created,
            days: dates.length,
          };
        },
      ),
  }),

  /* ---------------------------------------------------------------------- */
  /* Tasks                                                                   */
  /* ---------------------------------------------------------------------- */

  tasks: router({
    list: protectedProcedure
      .input(
        z.object({
          date: dateInput,
        }),
      )
      .query(({ input }) =>
        db.listDailyTasks(
          input.date,
        ),
      ),

    activity: protectedProcedure
      .input(
        z.object({
          taskId:
            z.number().int().positive(),
        }),
      )
      .query(({ input }) =>
        db.listTaskActivity(
          input.taskId,
        ),
      ),

    create: managerProcedure
      .input(
        z.object({
          workDate: dateInput,

          title: z
            .string()
            .min(3)
            .max(240),

          detail: z
            .string()
            .max(2000)
            .optional(),

          priority:
            priority.default(
              "normal",
            ),

          dueAt: z
            .number()
            .int()
            .positive()
            .optional(),

          assignedTeamMemberId:
            z
              .number()
              .int()
              .positive()
              .optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.createDailyTask({
          ...input,
          createdByUserId:
            ctx.user.id,
        }),
      ),

    /*
     * Manager-only reassignment of an
     * individual daily task.
     *
     * null removes the current assignee.
     */
    updateAssignment: managerProcedure
      .input(
        z.object({
          taskId:
            z.number().int().positive(),

          assignedTeamMemberId:
            z
              .number()
              .int()
              .positive()
              .nullable(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.updateDailyTaskAssignment(
          input.taskId,
          input.assignedTeamMemberId,
          ctx.user.id,
        ),
      ),

    updateStatus: teamMemberProcedure
      .input(
        z.object({
          taskId:
            z.number().int().positive(),

          status: z.enum([
            "pending",
            "in_progress",
            "blocked",
            "complete",
          ]),

          note: z
            .string()
            .max(2000)
            .optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.updateDailyTaskStatus({
          ...input,
          actorTeamMemberId:
            ctx.teamMember.id,
          actorUserId:
            ctx.user.id,
        }),
      ),

    comment: teamMemberProcedure
      .input(
        z.object({
          taskId:
            z.number().int().positive(),

          body: z
            .string()
            .min(1)
            .max(2000),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.addTaskComment({
          ...input,
          actorTeamMemberId:
            ctx.teamMember.id,
          actorUserId:
            ctx.user.id,
        }),
      ),
  }),

  /* ---------------------------------------------------------------------- */
  /* Rota                                                                    */
  /* ---------------------------------------------------------------------- */

  rota: router({
    week: protectedProcedure
      .input(
        z.object({
          weekStart: dateInput,
        }),
      )
      .query(({ input }) =>
        db.getRotaWeek(
          input.weekStart,
        ),
      ),

    create: managerProcedure
      .input(
        z.object({
          workDate: dateInput,

          teamMemberId:
            z.number().int().positive(),

          assignmentType,

          startTime: z
            .string()
            .regex(
              /^([01]\d|2[0-3]):[0-5]\d$/,
            )
            .optional(),

          endTime: z
            .string()
            .regex(
              /^([01]\d|2[0-3]):[0-5]\d$/,
            )
            .optional(),

          note: z
            .string()
            .max(500)
            .optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.createRotaAssignment({
          ...input,
          createdByUserId:
            ctx.user.id,
        }),
      ),

    remove: managerProcedure
      .input(
        z.object({
          id:
            z.number().int().positive(),
        }),
      )
      .mutation(({ input }) =>
        db.removeRotaAssignment(
          input.id,
        ),
      ),
  }),

  /* ---------------------------------------------------------------------- */
  /* Handovers                                                               */
  /* ---------------------------------------------------------------------- */

  handovers: router({
    list: protectedProcedure
      .input(
        z.object({
          query: z
            .string()
            .max(160)
            .optional(),

          status: z
            .enum([
              "open",
              "acknowledged",
              "resolved",
            ])
            .optional(),
        }),
      )
      .query(({ input }) =>
        db.listHandovers(input),
      ),

    create: protectedProcedure
      .input(
        z.object({
          title: z
            .string()
            .min(3)
            .max(240),

          detail: z
            .string()
            .min(3)
            .max(5000),

          priority:
            priority.default(
              "normal",
            ),

          ownerTeamMemberId:
            z
              .number()
              .int()
              .positive()
              .optional(),

          deadlineAt: z
            .number()
            .int()
            .positive()
            .optional(),

          decisionRecord: z
            .string()
            .max(5000)
            .optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.createHandover({
          ...input,
          createdByUserId:
            ctx.user.id,
        }),
      ),

    acknowledge: protectedProcedure
      .input(
        z.object({
          id:
            z.number().int().positive(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.acknowledgeHandover(
          input.id,
          ctx.user.id,
        ),
      ),

    resolve: protectedProcedure
      .input(
        z.object({
          id:
            z.number().int().positive(),

          decisionRecord: z
            .string()
            .max(5000)
            .optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.resolveHandover(
          input.id,
          ctx.user.id,
          input.decisionRecord,
        ),
      ),
  }),

  /* ---------------------------------------------------------------------- */
  /* Issues                                                                  */
  /* ---------------------------------------------------------------------- */

  issues: router({
    list: protectedProcedure
      .input(
        z.object({
          status: z
            .enum([
              "open",
              "monitoring",
              "resolved",
            ])
            .optional(),
        }),
      )
      .query(({ input }) =>
        db.listOperationalIssues(
          input.status,
        ),
      ),

    create: protectedProcedure
      .input(
        z.object({
          title: z
            .string()
            .min(3)
            .max(240),

          category: z.enum([
            "breakdown",
            "customer_concern",
            "late_running",
            "staffing",
            "other",
          ]),

          impact: z.enum([
            "low",
            "medium",
            "high",
            "critical",
          ]),

          ownerTeamMemberId:
            z
              .number()
              .int()
              .positive()
              .optional(),

          nextAction: z
            .string()
            .min(3)
            .max(5000),

          recurringCause: z
            .string()
            .max(240)
            .optional(),

          detectedAt:
            z.number().int().positive(),

          targetAt: z
            .number()
            .int()
            .positive()
            .optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.createOperationalIssue({
          ...input,
          createdByUserId:
            ctx.user.id,
        }),
      ),

    update: protectedProcedure
      .input(
        z.object({
          id:
            z.number().int().positive(),

          status: z.enum([
            "open",
            "monitoring",
            "resolved",
          ]),

          ownerTeamMemberId:
            z
              .number()
              .int()
              .positive()
              .optional(),

          nextAction: z
            .string()
            .min(3)
            .max(5000),

          resolution: z
            .string()
            .max(5000)
            .optional(),
        }),
      )
      .mutation(({ input }) =>
        db.updateOperationalIssue(
          input,
        ),
      ),
  }),

  /* ---------------------------------------------------------------------- */
  /* Readiness                                                               */
  /* ---------------------------------------------------------------------- */

  readiness: router({
    list: protectedProcedure
      .input(
        z.object({
          date: dateInput,
        }),
      )
      .query(({ input }) =>
        db.listReadinessPulses(
          input.date,
        ),
      ),

    submit: teamMemberProcedure
      .input(
        z.object({
          pulseDate: dateInput,

          capacity: z.enum([
            "green",
            "amber",
            "red",
          ]),

          riskNote: z
            .string()
            .max(2000)
            .optional(),

          supportNeeded: z
            .string()
            .max(2000)
            .optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.upsertReadinessPulse({
          ...input,
          teamMemberId:
            ctx.teamMember.id,
          submittedAt: Date.now(),
        }),
      ),
  }),

  /* ---------------------------------------------------------------------- */
  /* Performance                                                             */
  /* ---------------------------------------------------------------------- */

  performance: router({
    overview: managerProcedure
      .input(
        z.object({
          rangeStart: dateInput,
          rangeEnd: dateInput,
        }),
      )
      .query(({ input }) =>
        db.getPerformanceOverview(
          input,
        ),
      ),

    notes: managerProcedure
      .input(
        z.object({
          teamMemberId:
            z.number().int().positive(),
        }),
      )
      .query(({ input }) =>
        db.listPerformanceNotes(
          input.teamMemberId,
        ),
      ),

    createNote: managerProcedure
      .input(
        z.object({
          teamMemberId:
            z.number().int().positive(),

          noteType: z.enum([
            "coaching",
            "recognition",
          ]),

          note: z
            .string()
            .min(3)
            .max(4000),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.createPerformanceNote({
          ...input,
          recordedByUserId:
            ctx.user.id,
          recordedAt: Date.now(),
        }),
      ),
  }),
});