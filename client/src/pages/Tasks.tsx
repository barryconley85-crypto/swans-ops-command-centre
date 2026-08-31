import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { LoadError } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColleagueMarker } from "@/components/ColleagueMarker";
import { trpc } from "@/lib/trpc";
import {
  compactTime,
  dateTitle,
  labelForStatus,
  localDateKey,
  priorityStyle,
  statusStyle,
} from "@/lib/operations";
import { dateKeysBetween } from "@/lib/bulkOperations";
import { format } from "date-fns";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileText,
  MessageSquareText,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type TaskRow = {
  id: number;
  title: string;
  detail: string | null;
  priority: "low" | "normal" | "high" | "critical";
  status: "pending" | "in_progress" | "blocked" | "complete";
  dueAt: number | null;
  blockedReason: string | null;
  assignedTeamMemberId: number | null;
  completedAt?: number | null;
  completedByTeamMemberId?: number | null;
  assignee: {
    id: number;
    displayName: string;
    initials: string;
    colour: string;
  } | null;
};

function TaskStatusBadge({
  status,
}: {
  status: TaskRow["status"];
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyle[status]}`}
    >
      {labelForStatus(status)}
    </span>
  );
}

function TaskDetail({
  task,
  selectedDate,
}: {
  task: TaskRow;
  selectedDate: string;
}) {
  const utils = trpc.useUtils();
  const [comment, setComment] = useState("");

  const activity =
    trpc.operations.tasks.activity.useQuery({
      taskId: task.id,
    });

  const commentMutation =
    trpc.operations.tasks.comment.useMutation({
      onSuccess: async () => {
        setComment("");
        await activity.refetch();
        toast.success("Comment added to task history.");
      },
      onError: error =>
        toast.error(error.message),
    });

  const statusMutation =
    trpc.operations.tasks.updateStatus.useMutation({
      onSuccess: async () => {
        await Promise.all([
          utils.operations.tasks.list.invalidate({
            date: selectedDate,
          }),
          activity.refetch(),
        ]);

        toast.success("Task status updated.");
      },
      onError: error =>
        toast.error(error.message),
    });

  const setTaskStatus = (
    status: TaskRow["status"],
  ) => {
    const note =
      status === "blocked"
        ? window.prompt(
            "What is blocking this task?",
          ) || undefined
        : undefined;

    statusMutation.mutate({
      taskId: task.id,
      status,
      note,
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="min-w-0 text-left">
          <p className="truncate text-[15px] font-semibold text-[#1E2A27] hover:text-[#1D5C63]">
            {task.title}
          </p>

          {task.detail ? (
            <p className="mt-1 line-clamp-1 text-xs text-[#6D7774]">
              {task.detail}
            </p>
          ) : null}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-xl border-0 bg-[#FCFCFA] p-0 shadow-2xl">
        <div className="border-b border-[#E5E9E6] px-6 pb-5 pt-6">
          <div className="mb-4 flex items-center gap-2">
            <TaskStatusBadge status={task.status} />

            <Badge
              className={`border-0 text-[10px] uppercase tracking-[0.12em] ${priorityStyle[task.priority]}`}
            >
              {task.priority}
            </Badge>
          </div>

          <DialogTitle className="text-xl font-semibold tracking-tight text-[#17211E]">
            {task.title}
          </DialogTitle>

          <DialogDescription className="mt-2 text-sm leading-6 text-[#66706D]">
            {task.detail ||
              "No additional instructions were added to this task."}
          </DialogDescription>
        </div>

        <div className="grid gap-5 px-6 py-5 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#87918D]">
              Assignee
            </p>

            <div className="mt-1.5">
              <ColleagueMarker
                member={task.assignee}
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#87918D]">
              Due
            </p>

            <p className="mt-1.5 text-sm font-medium text-[#28332F]">
              {compactTime(task.dueAt)}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#87918D]">
              Progress
            </p>

            <p className="mt-1.5 text-sm font-medium capitalize text-[#28332F]">
              {labelForStatus(task.status)}
            </p>
          </div>
        </div>

        {task.status === "complete" ? (
          <div className="mx-6 mb-5 rounded-xl border border-[#D7E8DE] bg-[#F3FAF5] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#5A8470]">
              Completion evidence
            </p>

            <p className="mt-1 text-sm font-semibold text-[#245C42]">
              Task completed
            </p>

            <p className="mt-1 text-xs text-[#5B7668]">
              {task.completedAt
                ? format(
                    new Date(task.completedAt),
                    "d MMM yyyy, HH:mm",
                  )
                : "Completion recorded"}
            </p>
          </div>
        ) : null}

        {task.blockedReason ? (
          <div className="mx-6 rounded-xl border border-[#F4CCC5] bg-[#FFF1EF] px-4 py-3 text-sm text-[#9E4035]">
            <strong>Blocker:</strong>{" "}
            {task.blockedReason}
          </div>
        ) : null}

        <div className="border-t border-[#E5E9E6] px-6 py-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#28332F]">
              Activity
            </p>

            <div className="flex gap-1.5">
              {task.status !==
              "in_progress" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    statusMutation.isPending
                  }
                  onClick={() =>
                    setTaskStatus(
                      "in_progress",
                    )
                  }
                >
                  Start
                </Button>
              ) : null}

              {task.status !==
              "complete" ? (
                <Button
                  size="sm"
                  disabled={
                    statusMutation.isPending
                  }
                  className="bg-[#1D5C63] hover:bg-[#164B50]"
                  onClick={() =>
                    setTaskStatus(
                      "complete",
                    )
                  }
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Complete
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    statusMutation.isPending
                  }
                  onClick={() =>
                    setTaskStatus(
                      "pending",
                    )
                  }
                >
                  Reopen
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 max-h-40 space-y-3 overflow-y-auto pr-1">
            {activity.data?.length ? (
              activity.data.map(item => (
                <div
                  key={item.id}
                  className="rounded-lg bg-[#F4F6F4] px-3 py-2.5"
                >
                  <p className="text-xs font-semibold capitalize text-[#45504C]">
                    {labelForStatus(
                      item.action,
                    )}

                    <span className="ml-1 font-normal text-[#87918D]">
                      {format(
                        new Date(
                          item.createdAt,
                        ),
                        "d MMM, HH:mm",
                      )}
                    </span>
                  </p>

                  {item.body ? (
                    <p className="mt-1 text-xs leading-5 text-[#65706C]">
                      {item.body}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="py-3 text-center text-xs text-[#8C9692]">
                No activity yet.
              </p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Textarea
              value={comment}
              onChange={event =>
                setComment(
                  event.target.value,
                )
              }
              placeholder="Add a handover note or update..."
              className="min-h-10 resize-none border-[#DCE3DF] bg-white text-sm"
            />

            <Button
              disabled={
                !comment.trim() ||
                commentMutation.isPending
              }
              onClick={() =>
                commentMutation.mutate({
                  taskId: task.id,
                  body: comment,
                })
              }
            >
              <MessageSquareText className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Tasks() {
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] =
    useState(localDateKey());

  const [showTaskForm, setShowTaskForm] =
    useState(false);

  const [showTemplateForm, setShowTemplateForm] =
    useState(false);

  const [showMine, setShowMine] =
    useState(false);

  const [showApplyForm, setShowApplyForm] =
    useState(false);

  const [
    selectedTemplateId,
    setSelectedTemplateId,
  ] = useState<number | null>(null);

  const [taskForm, setTaskForm] =
    useState({
      startDate: selectedDate,
      endDate: selectedDate,
      title: "",
      detail: "",
      priority:
        "normal" as TaskRow["priority"],
      dueTime: "",
      assignee: "",
    });

  const [templateForm, setTemplateForm] =
    useState({
      name: "",
      description: "",
      items: "",
    });

  const [templateApplyForm, setTemplateApplyForm] =
    useState({
      startDate: selectedDate,
      endDate: selectedDate,
      assignee: "",
    });

  const isManager =
    user?.role === "admin";

  const utils = trpc.useUtils();

  const tasksQuery =
    trpc.operations.tasks.list.useQuery({
      date: selectedDate,
    });

  const accessQuery =
    trpc.operations.access.me.useQuery();

  const teamQuery =
    trpc.operations.team.list.useQuery();

  const templatesQuery =
    trpc.operations.templates.list.useQuery();

  const taskMutation =
    trpc.operations.tasks.create.useMutation({
      onError: error =>
        toast.error(error.message),
    });

  const statusMutation =
    trpc.operations.tasks.updateStatus.useMutation(
      {
        onSuccess: async () => {
          await utils.operations.tasks.list.invalidate(
            { date: selectedDate },
          );

          await utils.operations.dashboard.invalidate();

          toast.success("Task updated.");
        },
        onError: error =>
          toast.error(error.message),
      },
    );

  const templateMutation =
    trpc.operations.templates.create.useMutation({
      onSuccess: async () => {
        await templatesQuery.refetch();

        setShowTemplateForm(false);

        setTemplateForm({
          name: "",
          description: "",
          items: "",
        });

        toast.success(
          "Checklist template saved.",
        );
      },
      onError: error =>
        toast.error(error.message),
    });

  const applyTemplateMutation =
    trpc.operations.templates.applyTemplate.useMutation(
      {
        onSuccess: async result => {
          await utils.operations.tasks.list.invalidate(
            { date: selectedDate },
          );

          setShowApplyForm(false);

          toast.success(
            `${result.created} tasks added across ${result.days} day${
              result.days === 1 ? "" : "s"
            }.`,
          );
        },
        onError: error =>
          toast.error(error.message),
      },
    );

  const removeTemplateMutation =
    trpc.operations.templates.remove.useMutation(
      {
        onSuccess: async () => {
          await templatesQuery.refetch();

          toast.success(
            "Checklist template removed.",
          );
        },
        onError: error =>
          toast.error(error.message),
      },
    );

  const tasks =
    (tasksQuery.data ?? []) as TaskRow[];

  const personalProfile =
    accessQuery.data;

  const visibleTasks =
    showMine && personalProfile
      ? tasks.filter(
          task =>
            task.assignedTeamMemberId ===
            personalProfile.id,
        )
      : tasks;

  const grouped = useMemo(
    () => ({
      action: visibleTasks.filter(
        task =>
          task.status !== "complete" &&
          task.status !== "blocked",
      ),

      blocked: visibleTasks.filter(
        task => task.status === "blocked",
      ),

      complete: visibleTasks.filter(
        task => task.status === "complete",
      ),
    }),
    [visibleTasks],
  );

  const changeDay = (days: number) => {
    const date = new Date(
      `${selectedDate}T12:00:00`,
    );

    date.setDate(
      date.getDate() + days,
    );

    setSelectedDate(
      localDateKey(date),
    );
  };

  const submitTask = async () => {
    if (!taskForm.title.trim()) {
      toast.error(
        "Give the task a clear title.",
      );
      return;
    }

    if (
      taskForm.endDate <
      taskForm.startDate
    ) {
      toast.error(
        "Choose an end date on or after the start date.",
      );
      return;
    }

    const dates = dateKeysBetween(
      taskForm.startDate,
      taskForm.endDate,
    );

    if (dates.length > 21) {
      toast.error(
        "Choose a task run of up to 21 days.",
      );
      return;
    }

    try {
      for (const workDate of dates) {
        await taskMutation.mutateAsync({
          workDate,
          title: taskForm.title,
          detail:
            taskForm.detail || undefined,
          priority: taskForm.priority,
          dueAt: taskForm.dueTime
            ? new Date(
                `${workDate}T${taskForm.dueTime}:00`,
              ).getTime()
            : undefined,
          assignedTeamMemberId:
            taskForm.assignee
              ? Number(taskForm.assignee)
              : undefined,
        });
      }

      await utils.operations.tasks.list.invalidate(
        { date: selectedDate },
      );

      setShowTaskForm(false);

      setTaskForm({
        startDate: selectedDate,
        endDate: selectedDate,
        title: "",
        detail: "",
        priority: "normal",
        dueTime: "",
        assignee: "",
      });

      toast.success(
        `${dates.length === 1 ? "Task added" : `${dates.length} task days added`} to the control board.`,
      );
    } catch {
      // The mutation's own error handler displays
      // the server error.
    }
  };

  const submitTemplate = () => {
    const items =
      templateForm.items
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean);

    if (
      !templateForm.name.trim() ||
      !items.length
    ) {
      toast.error(
        "Add a template name and at least one checklist item.",
      );
      return;
    }

    templateMutation.mutate({
      name: templateForm.name,
      description:
        templateForm.description ||
        undefined,
      items: items.map(title => ({
        title,
        priority: "normal",
      })),
    });
  };

  const openTemplateApply = (
    templateId: number,
  ) => {
    setSelectedTemplateId(
      templateId,
    );

    setTemplateApplyForm({
      startDate: selectedDate,
      endDate: selectedDate,
      assignee: "",
    });

    setShowApplyForm(true);
  };

  const submitTemplateApply = () => {
    if (!selectedTemplateId) {
      return;
    }

    if (
      templateApplyForm.endDate <
      templateApplyForm.startDate
    ) {
      toast.error(
        "Choose an end date on or after the start date.",
      );
      return;
    }

    const dates = dateKeysBetween(
      templateApplyForm.startDate,
      templateApplyForm.endDate,
    );

    if (dates.length > 21) {
      toast.error(
        "Choose a template run of up to 21 days.",
      );
      return;
    }

    applyTemplateMutation.mutate({
      templateId: selectedTemplateId,
      startDate:
        templateApplyForm.startDate,
      endDate:
        templateApplyForm.endDate,
      assignedTeamMemberId:
        templateApplyForm.assignee
          ? Number(
              templateApplyForm.assignee,
            )
          : undefined,
    });
  };

  if (
    tasksQuery.isError ||
    teamQuery.isError ||
    templatesQuery.isError
  ) {
    return (
      <LoadError
        message="The task board could not be loaded. No work has been changed."
        onRetry={() =>
          void Promise.all([
            tasksQuery.refetch(),
            teamQuery.refetch(),
            templatesQuery.refetch(),
          ])
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1450px] pb-10">
      <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#74817B]">
            Daily work control
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#1B2723]">
            Tasks & checklists
          </h1>

          <p className="mt-2 text-sm text-[#68746E]">
            Make every operational
            obligation visible, owned
            and evidenced.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center rounded-xl border border-[#DFE6E1] bg-white p-1 shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                changeDay(-1)
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="min-w-36 px-3 text-center text-sm font-semibold text-[#34413C]">
              {dateTitle(selectedDate)}
            </span>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                changeDay(1)
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {personalProfile ? (
            <Button
              variant="outline"
              className="h-10 border-[#D6E2DE] bg-white"
              onClick={() =>
                setShowMine(
                  value => !value,
                )
              }
            >
              {showMine
                ? "All work"
                : "My work"}
            </Button>
          ) : null}

          {isManager ? (
            <>
              <Dialog
                open={showTemplateForm}
                onOpenChange={
                  setShowTemplateForm
                }
              >
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 border-[#D6E2DE] bg-white"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    New template
                  </Button>
                </DialogTrigger>

                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>
                      Create a reusable
                      checklist
                    </DialogTitle>

                    <DialogDescription>
                      Use one item per
                      line. Individual
                      owners and due
                      times can be set
                      after creation.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>
                        Checklist name
                      </Label>

                      <Input
                        value={
                          templateForm.name
                        }
                        onChange={event =>
                          setTemplateForm(
                            {
                              ...templateForm,
                              name: event
                                .target
                                .value,
                            },
                          )
                        }
                        placeholder="Morning control checks"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Purpose
                      </Label>

                      <Input
                        value={
                          templateForm.description
                        }
                        onChange={event =>
                          setTemplateForm(
                            {
                              ...templateForm,
                              description:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        placeholder="What does this make sure is ready?"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Checklist items
                      </Label>

                      <Textarea
                        value={
                          templateForm.items
                        }
                        onChange={event =>
                          setTemplateForm(
                            {
                              ...templateForm,
                              items: event
                                .target
                                .value,
                            },
                          )
                        }
                        className="min-h-36"
                        placeholder={
                          "Review driver availability\nConfirm vehicle and job changes\nComplete afternoon cover check"
                        }
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={
                        submitTemplate
                      }
                      disabled={
                        templateMutation.isPending
                      }
                      className="bg-[#1D5C63] hover:bg-[#164B50]"
                    >
                      Save checklist
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={showTaskForm}
                onOpenChange={
                  setShowTaskForm
                }
              >
                <DialogTrigger asChild>
                  <Button className="h-10 bg-[#1D5C63] shadow-sm hover:bg-[#164B50]">
                    <Plus className="mr-2 h-4 w-4" />
                    Add task
                  </Button>
                </DialogTrigger>

                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>
                      Add a daily task
                    </DialogTitle>

                    <DialogDescription>
                      Give the team an
                      unambiguous
                      action, owner and
                      deadline.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>
                          From
                        </Label>

                        <Input
                          type="date"
                          value={
                            taskForm.startDate
                          }
                          onChange={event =>
                            setTaskForm(
                              {
                                ...taskForm,
                                startDate:
                                  event
                                    .target
                                    .value,
                                endDate:
                                  taskForm.endDate <
                                  event
                                    .target
                                    .value
                                    ? event
                                        .target
                                        .value
                                    : taskForm.endDate,
                              },
                            )
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>
                          To
                        </Label>

                        <Input
                          type="date"
                          min={
                            taskForm.startDate
                          }
                          value={
                            taskForm.endDate
                          }
                          onChange={event =>
                            setTaskForm(
                              {
                                ...taskForm,
                                endDate:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Task
                      </Label>

                      <Input
                        value={
                          taskForm.title
                        }
                        onChange={event =>
                          setTaskForm(
                            {
                              ...taskForm,
                              title: event
                                .target
                                .value,
                            },
                          )
                        }
                        placeholder="Confirm late-cover driver"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Notes
                      </Label>

                      <Textarea
                        value={
                          taskForm.detail
                        }
                        onChange={event =>
                          setTaskForm(
                            {
                              ...taskForm,
                              detail:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        placeholder="Context or completion standard..."
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>
                          Priority
                        </Label>

                        <select
                          value={
                            taskForm.priority
                          }
                          onChange={event =>
                            setTaskForm(
                              {
                                ...taskForm,
                                priority:
                                  event
                                    .target
                                    .value as TaskRow["priority"],
                              },
                            )
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="low">
                            Low
                          </option>
                          <option value="normal">
                            Normal
                          </option>
                          <option value="high">
                            High
                          </option>
                          <option value="critical">
                            Critical
                          </option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label>
                          Due time
                        </Label>

                        <Input
                          type="time"
                          value={
                            taskForm.dueTime
                          }
                          onChange={event =>
                            setTaskForm(
                              {
                                ...taskForm,
                                dueTime:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>
                          Owner
                        </Label>

                        <select
                          value={
                            taskForm.assignee
                          }
                          onChange={event =>
                            setTaskForm(
                              {
                                ...taskForm,
                                assignee:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">
                            Unassigned
                          </option>

                          {teamQuery.data
                            ?.filter(
                              member =>
                                member.status ===
                                "active",
                            )
                            .map(
                              member => (
                                <option
                                  key={
                                    member.id
                                  }
                                  value={
                                    member.id
                                  }
                                >
                                  {
                                    member.displayName
                                  }
                                </option>
                              ),
                            )}
                        </select>
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={
                        submitTask
                      }
                      disabled={
                        taskMutation.isPending
                      }
                      className="bg-[#1D5C63] hover:bg-[#164B50]"
                    >
                      Add task
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Open actions"
          value={grouped.action.length}
          description="Pending or in progress"
          tone="teal"
        />

        <SummaryCard
          label="Blocked"
          value={grouped.blocked.length}
          description={
            grouped.blocked.length
              ? "Needs a removal plan"
              : "No reported blockers"
          }
          tone="red"
        />

        <SummaryCard
          label="Completed"
          value={`${grouped.complete.length}/${visibleTasks.length}`}
          description="Completion evidenced today"
          tone="green"
        />
      </section>

      {templatesQuery.data?.length ? (
        <section className="mt-6 overflow-hidden rounded-2xl border border-[#E1E7E3] bg-white shadow-[0_16px_36px_-30px_rgba(22,53,45,0.38)]">
          <div className="flex flex-col gap-3 border-b border-[#EDF0EE] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E6F0ED] text-[#317168]">
                <Sparkles className="h-4 w-4" />
              </div>

              <div>
                <p className="text-sm font-semibold text-[#23302B]">
                  Start from a
                  checklist
                </p>

                <p className="text-xs text-[#72807A]">
                  Apply an approved
                  routine across one
                  or more days.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {templatesQuery.data.map(
                template => (
                  <div
                    key={template.id}
                    className="flex items-center gap-1"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        !isManager ||
                        applyTemplateMutation.isPending
                      }
                      onClick={() =>
                        openTemplateApply(
                          template.id,
                        )
                      }
                    >
                      {template.name}
                    </Button>

                    {isManager ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${template.name} template`}
                        className="h-8 w-8 text-[#A54A40] hover:bg-[#FFF3F1]"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete the ${template.name} checklist template? Existing tasks will stay.`,
                            )
                          ) {
                            removeTemplateMutation.mutate(
                              {
                                templateId:
                                  template.id,
                              },
                            );
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ),
              )}
            </div>
          </div>
        </section>
      ) : null}

      <Dialog
        open={showApplyForm}
        onOpenChange={
          setShowApplyForm
        }
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Apply checklist to a
              date range
            </DialogTitle>

            <DialogDescription>
              Create a fresh task run for
              every day in the selected
              range. Existing tasks are
              not overwritten.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  From
                </Label>

                <Input
                  type="date"
                  value={
                    templateApplyForm.startDate
                  }
                  onChange={event =>
                    setTemplateApplyForm(
                      {
                        ...templateApplyForm,
                        startDate:
                          event.target.value,
                        endDate:
                          templateApplyForm.endDate <
                          event.target.value
                            ? event
                                .target
                                .value
                            : templateApplyForm.endDate,
                      },
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>
                  To
                </Label>

                <Input
                  type="date"
                  min={
                    templateApplyForm.startDate
                  }
                  value={
                    templateApplyForm.endDate
                  }
                  onChange={event =>
                    setTemplateApplyForm(
                      {
                        ...templateApplyForm,
                        endDate:
                          event.target.value,
                      },
                    )
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Assign all items to
              </Label>

              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={
                  templateApplyForm.assignee
                }
                onChange={event =>
                  setTemplateApplyForm(
                    {
                      ...templateApplyForm,
                      assignee:
                        event.target
                          .value,
                    },
                  )
                }
              >
                <option value="">
                  Keep template owners /
                  unassigned
                </option>

                {teamQuery.data
                  ?.filter(
                    member =>
                      member.status ===
                      "active",
                  )
                  .map(member => (
                    <option
                      key={member.id}
                      value={member.id}
                    >
                      {member.displayName}
                    </option>
                  ))}
              </select>

              <p className="text-xs text-[#77827E]">
                Up to 21 days.
                Assigning one person
                here overrides template
                item owners.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={
                submitTemplateApply
              }
              disabled={
                applyTemplateMutation.isPending
              }
              className="bg-[#1D5C63] hover:bg-[#164B50]"
            >
              Apply checklist run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="overflow-hidden rounded-2xl border border-[#E1E7E3] bg-white shadow-[0_16px_36px_-30px_rgba(22,53,45,0.38)]">
          <div className="flex items-center justify-between border-b border-[#EDF0EE] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#22302B]">
                {showMine
                  ? "My work queue"
                  : "Today's task board"}
              </h2>

              <p className="mt-0.5 text-xs text-[#74807B]">
                Work requiring active
                operational attention.
              </p>
            </div>

            <ClipboardCheck className="h-5 w-5 text-[#78918A]" />
          </div>

          <div>
            {tasksQuery.isLoading ? (
              <TaskListSkeleton />
            ) : grouped.action.length ? (
              grouped.action.map(
                task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    selectedDate={
                      selectedDate
                    }
                    onStatus={status =>
                      statusMutation.mutate(
                        {
                          taskId:
                            task.id,
                          status,
                        },
                      )
                    }
                    pending={
                      statusMutation.isPending
                    }
                  />
                ),
              )
            ) : (
              <EmptyTasks
                isManager={isManager}
                onAdd={() =>
                  setShowTaskForm(true)
                }
              />
            )}
          </div>

          {grouped.blocked.length ? (
            <div className="border-t border-[#F0DDDA] bg-[#FFF9F7] px-5 py-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#A54A40]">
                Blocked
              </p>

              {grouped.blocked.map(
                task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    selectedDate={
                      selectedDate
                    }
                    onStatus={status =>
                      statusMutation.mutate(
                        {
                          taskId:
                            task.id,
                          status,
                        },
                      )
                    }
                    pending={
                      statusMutation.isPending
                    }
                  />
                ),
              )}
            </div>
          ) : null}

          {grouped.complete.length ? (
            <div className="border-t border-[#EDF0EE] bg-[#FBFCFB] px-5 py-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#84918B]">
                Completed
              </p>

              {grouped.complete.map(
                task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    selectedDate={
                      selectedDate
                    }
                    onStatus={status =>
                      statusMutation.mutate(
                        {
                          taskId:
                            task.id,
                          status,
                        },
                      )
                    }
                    pending={
                      statusMutation.isPending
                    }
                    compact
                  />
                ),
              )}
            </div>
          ) : null}
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl bg-[#1B3330] p-5 text-white shadow-[0_18px_38px_-22px_rgba(15,48,43,0.75)]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#BBD1C9]">
                Daily standard
              </p>

              <Clock3 className="h-4 w-4 text-[#BBD1C9]" />
            </div>

            <p className="mt-5 text-lg font-medium leading-7">
              Make the next decision
              visible, owned and
              time-bound.
            </p>

            <div className="mt-5 border-t border-white/15 pt-4 text-xs leading-5 text-[#C7D8D2]">
              Completion history
              protects the team as
              much as it protects the
              operation.
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E7E3] bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#27342F]">
                  Blocked work
                </p>

                <p className="mt-0.5 text-xs text-[#76827D]">
                  Remove friction early.
                </p>
              </div>

              <CircleAlert
                className={`h-5 w-5 ${
                  grouped.blocked.length
                    ? "text-[#C84E3E]"
                    : "text-[#87A198]"
                }`}
              />
            </div>

            <div className="mt-4 space-y-3">
              {grouped.blocked.length ? (
                grouped.blocked.map(
                  task => (
                    <div
                      key={task.id}
                      className="rounded-xl bg-[#FFF5F3] px-3 py-3"
                    >
                      <TaskDetail
                        task={task}
                        selectedDate={
                          selectedDate
                        }
                      />

                      <p className="mt-1 line-clamp-1 text-xs text-[#A4574B]">
                        {task.blockedReason ||
                          "Action required"}
                      </p>
                    </div>
                  ),
                )
              ) : (
                <p className="rounded-xl bg-[#F3F8F5] px-3 py-4 text-center text-xs text-[#4C7665]">
                  Nothing is blocked
                  right now.
                </p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string | number;
  description: string;
  tone: "teal" | "red" | "green";
}) {
  const tones = {
    teal: "border-[#DDE8E5] bg-[#F7FAF9] text-[#1D5C63]",
    red: "border-[#F2DAD5] bg-[#FFFAF9] text-[#B64335]",
    green: "border-[#DCE9E1] bg-[#F8FBF8] text-[#2C7453]",
  };

  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${tones[tone]}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {value}
      </p>

      <p className="mt-1 text-xs opacity-75">
        {description}
      </p>
    </div>
  );
}

function TaskItem({
  task,
  selectedDate,
  onStatus,
  pending,
  compact = false,
}: {
  task: TaskRow;
  selectedDate: string;
  onStatus: (
    status: TaskRow["status"],
  ) => void;
  pending: boolean;
  compact?: boolean;
}) {
  const done =
    task.status === "complete";

  return (
    <div
      className={`flex gap-3 px-5 ${
        compact ? "py-2.5" : "py-4"
      } ${
        !compact
          ? "border-b border-[#EDF0EE] last:border-0"
          : ""
      }`}
    >
      <button
        disabled={pending}
        aria-label={
          done
            ? "Reopen task"
            : "Complete task"
        }
        onClick={() =>
          onStatus(
            done
              ? "pending"
              : "complete",
          )
        }
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          done
            ? "border-[#2F7B59] bg-[#2F7B59] text-white"
            : "border-[#BDC9C4] bg-white hover:border-[#1D5C63]"
        }`}
      >
        {done ? (
          <Check className="h-3 w-3" />
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <TaskDetail
          task={task}
          selectedDate={selectedDate}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TaskStatusBadge
            status={task.status}
          />

          <span
            className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ring-inset ${priorityStyle[task.priority]}`}
          >
            {task.priority}
          </span>

          {task.assignee ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#65726D]">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{
                  backgroundColor:
                    task.assignee
                      .colour,
                }}
              >
                {
                  task.assignee
                    .initials
                }
              </span>

              {
                task.assignee
                  .displayName
              }
            </span>
          ) : (
            <span className="text-xs text-[#9AA39F]">
              Unassigned
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end text-right">
        <p
          className={`text-xs font-semibold ${
            task.dueAt &&
            task.dueAt <
              Date.now() &&
            !done
              ? "text-[#B94336]"
              : "text-[#65716C]"
          }`}
        >
          {compactTime(
            task.dueAt,
          )}
        </p>

        {task.status !==
          "complete" &&
        task.status !==
          "in_progress" ? (
          <button
            onClick={() =>
              onStatus(
                "in_progress",
              )
            }
            className="mt-2 text-[11px] font-semibold text-[#31718A] hover:underline"
          >
            Start
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyTasks({
  isManager,
  onAdd,
}: {
  isManager: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF2EF] text-[#3A7D68]">
        <ClipboardCheck className="h-6 w-6" />
      </div>

      <p className="mt-4 text-sm font-semibold text-[#34413C]">
        Today's board is clear
      </p>

      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#77827E]">
        Build your first daily
        routine or add an ad-hoc
        action to start creating
        evidence of control.
      </p>

      {isManager ? (
        <Button
          onClick={onAdd}
          className="mt-4 bg-[#1D5C63] hover:bg-[#164B50]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add first task
        </Button>
      ) : null}
    </div>
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-4 px-5 py-5">
      {[1, 2, 3, 4].map(
        index => (
          <div
            className="h-16 animate-pulse rounded-xl bg-[#F2F5F3]"
            key={index}
          />
        ),
      )}
    </div>
  );
}