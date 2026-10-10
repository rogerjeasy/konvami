import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Avatar } from '@/components/avatar/avatar';
import { LookEditor } from '@/components/look-editor';
import { Reveal } from '@/components/motion';
import { staggerDelay } from '@/lib/motion';
import type { SectionProps } from './shared';

/** How the partner looks: their portrait, following every choice at once. */
export function LookSection({ draft, change }: SectionProps) {
  return (
    <>
      <Reveal delay={staggerDelay(1)}>
        <View className="items-center">
          <Avatar look={draft.look} size={size.avatarXl} />
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <LookEditor look={draft.look} onChange={(look) => change({ look })} />
      </Reveal>
    </>
  );
}
