import { Pressable } from 'react-native';
import { size } from '@konvami/design-tokens';
import { UserPhoto } from '@/components/user-photo';

/**
 * The round button in a screen's header that leads to the profile: the learner's photo, or
 * their initial, or a person when the account has no name.
 */
export function AccountButton({
  name,
  pictureUrl = null,
  label,
  onPress,
}: {
  /** The learner's first name; may be empty. */
  name: string;
  /** A (short-lived) address of the learner's photo; null without one. */
  pictureUrl?: string | null;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: size.headerButton, height: size.headerButton }}
      className="items-center justify-center rounded-pill active:opacity-pressed"
    >
      <UserPhoto uri={pictureUrl} name={name} diameter={size.headerButton} />
    </Pressable>
  );
}
