export type CompletionActor = {
  teamMemberId: number;
  userId: string;
  displayName: string;
};

export function buildTaskCompletionAttribution(actor: CompletionActor, completedAt: number) {
  return {
    completedAt,
    completedByTeamMemberId: actor.teamMemberId,
    completedByUserId: actor.userId,
    completedByName: actor.displayName,
  };
}

export function clearTaskCompletionAttribution() {
  return {
    completedAt: null,
    completedByTeamMemberId: null,
    completedByUserId: null,
    completedByName: null,
  };
}
