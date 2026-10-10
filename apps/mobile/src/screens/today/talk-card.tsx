import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { HomePartner } from '@konvami/api-client';
import { Avatar } from '@/components/avatar/avatar';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { relativeDayPhrase } from '@/lib/relative-day';
import { useTheme } from '@/theme';

/**
 * The heart of Today: the partner to talk to next, alive on their card, and one button that
 * starts the conversation (spec §14.3: speaking is the default action, at most two taps away).
 */
export function TalkCard({
  partner,
  now,
  hasOthers,
  onTalk,
  onOthers,
}: {
  partner: HomePartner;
  /** The device's time, for "yesterday". */
  now: Date;
  /** The learner has more partners than this one. */
  hasOthers: boolean;
  onTalk: () => void;
  onOthers: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { persona, lastTalkedAt } = partner;
  return (
    <View className="gap-4 rounded-panel bg-surface p-5">
      <View className="flex-row items-center gap-4">
        <Avatar look={persona.look} size={size.avatarHero} />
        <View className="flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Text variant="heading" className="shrink">
              {persona.name}
            </Text>
            <Badge label={t(`onboarding.partners.roles.${persona.role}`)} />
          </View>
          <Text variant="callout" tone="muted">
            {persona.tagline ?? t(`onboarding.partners.roleLines.${persona.role}`)}
          </Text>
          <Text variant="small" tone="subtle">
            {lastTalkedAt
              ? t('today.talk.last', {
                  when: relativeDayPhrase(t, i18n.language, lastTalkedAt, now),
                })
              : t('today.talk.first')}
          </Text>
        </View>
      </View>
      <View className="gap-1">
        <Button
          label={t('today.talk.start', { name: persona.name })}
          leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
          onPress={onTalk}
        />
        {hasOthers ? (
          <TextButton tone="primary" label={t('today.talk.someoneElse')} onPress={onOthers} />
        ) : null}
      </View>
    </View>
  );
}
