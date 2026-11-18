import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { PressScale, Reveal } from '@/components/motion';
import { Text } from '@/components/text';
import type { TileColor } from '@/components/tile';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useTheme, type ColorToken } from '@/theme';

/** The coloured square behind a tool's icon: each tool keeps its feature's colour block. */
const BLOB: Record<TileColor, { box: string; ink: ColorToken }> = {
  forest: { box: 'bg-forest', ink: 'lime' },
  butter: { box: 'bg-butter', ink: 'onButter' },
  tomato: { box: 'bg-tomato', ink: 'onTomato' },
  pink: { box: 'bg-pink', ink: 'onPink' },
  ink: { box: 'bg-inverse', ink: 'onInverse' },
  card: { box: 'border border-border bg-surface', ink: 'fg' },
};

// The blob's side (pt), as on the prototype.
const BLOB_SIZE = 50;

/** Learn's tools, in the prototype's order: grammar, tutor, phrases, sounds, exams, material. */
const TOOLS: readonly {
  key: 'grammar' | 'tutor' | 'phrasebook' | 'pronunciation' | 'exams' | 'import';
  icon: IconName;
  color: TileColor;
  href: Href;
}[] = [
  { key: 'grammar', icon: 'target', color: 'forest', href: ROUTES.grammar },
  { key: 'tutor', icon: 'message', color: 'butter', href: ROUTES.tutor },
  { key: 'phrasebook', icon: 'book', color: 'tomato', href: ROUTES.phrasebook },
  { key: 'pronunciation', icon: 'volume', color: 'pink', href: ROUTES.pronunciation },
  { key: 'exams', icon: 'award', color: 'ink', href: ROUTES.exams },
  { key: 'import', icon: 'file', color: 'card', href: ROUTES.import },
];

function Tool({
  icon,
  color: look,
  title,
  hint,
  onPress,
}: {
  icon: IconName;
  color: TileColor;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const { color } = useTheme();
  const blob = BLOB[look];
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
    >
      <View className="min-h-tap flex-1 gap-3 rounded-card border border-border bg-chip p-3.5">
        <View
          aria-hidden
          style={{ width: BLOB_SIZE, height: BLOB_SIZE }}
          className={`items-center justify-center rounded-field ${blob.box}`}
        >
          <Icon name={icon} color={color[blob.ink]} size={size.iconLg} />
        </View>
        <View className="gap-0.5">
          <Text variant="heading">{title}</Text>
          <Text variant="small" tone="subtle">
            {hint}
          </Text>
        </View>
      </View>
    </PressScale>
  );
}

/** A two-column grid of tool cards; one column when the text is large or the phone narrow. */
export function LearnTools({ first, columns }: { first: number; columns: 1 | 2 }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap gap-2.5">
      {TOOLS.map((tool, i) => (
        <View key={tool.key} className={columns === 2 ? 'min-w-[45%] flex-1' : 'w-full'}>
          <Reveal delay={staggerDelay(first + i)} style={{ flex: 1 }}>
            <Tool
              icon={tool.icon}
              color={tool.color}
              title={t(`learn.${tool.key}Row`)}
              hint={t(`learn.${tool.key}Hint`)}
              onPress={() => router.push(tool.href)}
            />
          </Reveal>
        </View>
      ))}
    </View>
  );
}
