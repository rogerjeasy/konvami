/**
 * Who a conversation was with, as one phrase: the partner's name, or both names for a
 * two-partner conversation (5.24). A partner removed since is `former`.
 */
export function partnerNames(
  conversation: { partner: { name: string } | null; guest?: { name: string } | null },
  { together, former }: { together: (first: string, second: string) => string; former: string },
): string {
  const first = conversation.partner?.name ?? former;
  return conversation.guest ? together(first, conversation.guest.name) : first;
}
