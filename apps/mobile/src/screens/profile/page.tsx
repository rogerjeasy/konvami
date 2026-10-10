import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { IconTile } from '@/components/icon-tile';
import { Pop, Reveal } from '@/components/motion';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';

/**
 * The frame of every screen behind the Profile: only for someone signed in, with the way back
 * at the top, the screen's title and a line under it, and its actions pinned at the bottom.
 */
export function ProfilePage({
  title,
  body,
  lead,
  backTo = ROUTES.account,
  stay = false,
  actions,
  children,
}: {
  title: string;
  body?: string;
  /** Something above the title (a portrait, an icon tile). */
  lead?: ReactNode;
  /** Where Back goes when the screen was opened directly (a reload on the web). */
  backTo?: Href;
  /** Keeps the screen up although nobody is signed in any more (while the app leaves it). */
  stay?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { status } = useSession();
  // The profile belongs to an account.
  if (status !== 'signedIn' && !stay) return <Redirect href={ROUTES.welcome} />;
  return (
    <ProfilePageShell backTo={backTo} actions={actions}>
      <Reveal>
        <View className="gap-3.5">
          {lead}
          <View className="gap-2.5">
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {body ? <Text tone="muted">{body}</Text> : null}
          </View>
        </View>
      </Reveal>
      {children}
    </ProfilePageShell>
  );
}

/**
 * What a form of the Profile shows once it has done its work (a changed password, a changed
 * email): that it worked, in one sentence, and the way back.
 */
export function ProfileDone({ message, backTo }: { message: string; backTo: Href }) {
  const { t } = useTranslation();
  return (
    <ProfilePageShell
      actions={<Button label={t('common.continue')} onPress={() => backOr(backTo)} />}
      backTo={backTo}
    >
      <View className="flex-1 items-center justify-center gap-5 py-10">
        <Pop>
          <IconTile icon="check" />
        </Pop>
        <Reveal delay={staggerDelay(1)}>
          <Text variant="heading" accessibilityLiveRegion="polite" className="text-center">
            {message}
          </Text>
        </Reveal>
      </View>
    </ProfilePageShell>
  );
}

/** The page without a title of its own. */
function ProfilePageShell({
  backTo,
  actions,
  children,
}: {
  backTo: Href;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(backTo)}
          />
        </View>
      }
      actions={actions}
    >
      {children}
    </StepLayout>
  );
}
