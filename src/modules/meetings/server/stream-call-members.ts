/** Builds per-call membership updates without assuming a configured role name. */
export const callMemberUpdates = (...userIds: string[]) => ({
  update_members: userIds.map((user_id) => ({ user_id })),
});
