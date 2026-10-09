import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@konvami/design-tokens';
import { useScreenLayout } from '@/hooks/use-screen-layout';

/**
 * The layout of every first-launch screen: an illustration (hero), a text block and the actions.
 *
 * - Phones (portrait): hero on top, text below, actions pinned at the bottom. When text is large
 *   or the window is short, hero and text scroll above the actions; nothing is clipped or overlaps.
 * - Wide windows (landscape, tablets, desktop web): hero and text side by side, centered.
 *
 * Screens supply content only; spacing, safe areas and breakpoints live here (one place to change).
 */
export function HeroLayout({
  hero,
  heroHeader,
  screenHeader,
  body,
  actions,
  panel = false,
  centerBody = false,
  heroShare,
}: {
  /** The illustration. */
  hero: ReactNode;
  /** A row drawn at the top of the hero (e.g. Skip). */
  heroHeader?: ReactNode;
  /** A row across the top of the whole screen (e.g. wordmark + language). */
  screenHeader?: ReactNode;
  /** Title and text. */
  body: ReactNode;
  /** Buttons, stacked full width. */
  actions: ReactNode;
  /**
   * Draw the hero on a panel (rounded bottom corners when stacked): `true` for the raised surface,
   * `'splash'` for the brand ground of celebratory screens.
   */
  panel?: boolean | 'splash';
  centerBody?: boolean;
  /**
   * Share of a tall window the hero takes when stacked (as drawn for the screen). Defaults to the
   * intro's; screens with a list or a card under the title use a smaller one so it all fits.
   */
  heroShare?: number;
}) {
  const insets = useSafeAreaInsets();
  const { split, gutter, heroMinHeight } = useScreenLayout(heroShare);
  const topInset = insets.top + space.sm;
  const bottomInset = Math.max(insets.bottom, space.lg) + space.lg;
  const panelClass = panel === 'splash' ? 'bg-splash' : panel ? 'bg-surface' : '';

  const header = screenHeader ? (
    <View
      className="w-full max-w-screen self-center"
      style={{ paddingTop: topInset, paddingHorizontal: gutter }}
    >
      {screenHeader}
    </View>
  ) : null;

  // The panel clips its illustration, so moving drawings (parallax, pops) stay inside its edges.
  const heroBlock = (
    <View
      className={`overflow-hidden ${panelClass} ${split ? 'flex-1 rounded-hero' : 'rounded-b-hero'}`}
      style={{
        minHeight: heroMinHeight,
        paddingTop: !split && !screenHeader ? topInset : space.lg,
        paddingBottom: space['2xl'],
        paddingHorizontal: gutter,
      }}
    >
      {heroHeader ? <View className="flex-row justify-end">{heroHeader}</View> : null}
      <View className="flex-1 items-center justify-center">{hero}</View>
    </View>
  );

  const bodyBlock = (
    <View
      className={`w-full max-w-content gap-3.5 ${centerBody ? 'items-center self-center' : ''}`}
    >
      {body}
    </View>
  );

  const actionsBlock = <View className="w-full max-w-content gap-3">{actions}</View>;

  if (split) {
    return (
      <ScrollView
        className="flex-1 bg-bg"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomInset }}
      >
        {header}
        <View
          className="w-full max-w-screen flex-1 flex-row self-center"
          style={{ gap: gutter * 2, padding: gutter, paddingTop: screenHeader ? gutter : topInset }}
        >
          {heroBlock}
          <View className="flex-1 justify-center gap-8">
            {bodyBlock}
            {actionsBlock}
          </View>
        </View>
      </ScrollView>
    );
  }

  // Stacked: hero and text scroll; the actions stay pinned at the bottom, always reachable.
  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: space['2xl'] }}
      >
        {header}
        {heroBlock}
        <View
          className="items-center"
          style={{ paddingHorizontal: gutter, paddingTop: space['3xl'] }}
        >
          {bodyBlock}
        </View>
      </ScrollView>
      <View
        className="items-center"
        style={{ paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: bottomInset }}
      >
        {actionsBlock}
      </View>
    </View>
  );
}
