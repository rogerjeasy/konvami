import { size } from '@konvami/design-tokens';
import { Avatar } from '@/components/avatar/avatar';
import type { AvatarLook } from '@/components/avatar/look';

/**
 * A persona's portrait at list and card size: the same drawing as the live avatar, held still
 * (small moving faces in a list would only distract).
 */
export function PersonaAvatar({
  look,
  diameter = size.avatarSm,
}: {
  look: AvatarLook;
  diameter?: number;
}) {
  return <Avatar look={look} size={diameter} still />;
}
