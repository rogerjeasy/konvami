import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { HomePartner } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PersonaAvatar } from '@/components/persona-avatar';
import { Text } from '@/components/text';
import { Tile, TileChip, useTileInk, type TileColor } from '@/components/tile';
import { commitFeedback } from '@/lib/haptics';
import { relativeDayPhrase } from '@/lib/relative-day';
import { useTheme } from '@/theme';

/** Partners take the colour blocks in turn: tomato, pink, forest (v4 Talk). */
const POSTER_COLORS: readonly TileColor[] = ['tomato', 'pink', 'forest'];

/** The colour of the partner at `index` in the learner's list. */
export function posterColor(index: number): TileColor {
  return POSTER_COLORS[index % POSTER_COLORS.length] ?? 'tomato';
}

// The portrait on a poster: the poster is about the person (pt, as on the prototype).
const POSTER_AVATAR = 148;

/** What sits inside the tile, so it can read the tile's colours. */
function PosterBody({
  partner,
  now,
  onTalk,
}: {
  partner: HomePartner;
  now: Date;
  onTalk: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const tile = useTileInk();
  const tone = tile?.tone ?? 'fg';
  // On a dark block the action is lime; on a light one it is ink.
  const variant = tile?.dark ? 'lime' : 'primary';
  const { persona, lastTalkedAt } = partner;
  return (
    <View className="flex-1 gap-3">
      <TileChip>
        <Text variant="labelSmall" tone={tone}>
          {t(`onboarding.partners.roles.${persona.role}`)}
        </Text>
      </TileChip>
      <View className="items-center py-1">
        <PersonaAvatar look={persona.look} diameter={POSTER_AVATAR} />
      </View>
      <Text variant="hero" tone={tone} accessibilityRole="header">
        {persona.name}
      </Text>
      <View className="gap-1">
        <Text variant="labelSmall" tone={tone}>
          {t('onboarding.partners.ageOrigin', { age: persona.age, origin: persona.origin })}
        </Text>
        <Text variant="callout" tone={tone}>
          {persona.tagline ?? t(`onboarding.partners.roleLines.${persona.role}`)}
        </Text>
        <Text variant="small" tone={tone} className="opacity-decorative">
          {lastTalkedAt
            ? t('talk.last', { when: relativeDayPhrase(t, i18n.language, lastTalkedAt, now) })
            : t('talk.never')}
        </Text>
      </View>
      <View className="mt-auto pt-2">
        <Button
          variant={variant}
          label={t('talk.start')}
          accessibilityLabel={t('talk.startLabel', { name: persona.name })}
          leading={
            <Icon
              name="mic"
              color={variant === 'lime' ? color.onLime : color.onPrimary}
              size={size.iconMd}
            />
          }
          onPress={() => {
            commitFeedback();
            onTalk();
          }}
        />
      </View>
    </View>
  );
}

/** One partner as a colour-block poster: role, a big portrait, their name, and the way to call. */
export function PartnerPoster({
  partner,
  index,
  now,
  onTalk,
}: {
  partner: HomePartner;
  index: number;
  now: Date;
  onTalk: () => void;
}) {
  return (
    <Tile color={posterColor(index)} bubble="bottom-left" className="flex-1 rounded-panel">
      <PosterBody partner={partner} now={now} onTalk={onTalk} />
    </Tile>
  );
}
