import { IconButton } from '@/components/icon-button';

/**
 * The round button that reports one line of a conversation (spec §16.1). `label` says what it
 * does: "Report this line", or "Reported" once the learner did (it can still be pressed, to
 * change the reason).
 */
export function FlagButton({
  label,
  flagged,
  onPress,
}: {
  label: string;
  flagged: boolean;
  onPress: () => void;
}) {
  return <IconButton icon="flag" label={label} selected={flagged} onPress={onPress} />;
}
