import { View } from 'react-native';
import { Redirect, usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@/components/icon';
import { TabBar, TabButton } from '@/components/tab-bar';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { ROUTES } from '@/lib/routes';
import { OnboardingGate } from '@/onboarding/gate';
import { routeForOnboarding } from '@/onboarding/routing';
import { ScreenBoundary } from '@/screens/error';

/** The tabs in their order (spec §14.1). `name` is the route file in `src/app/(tabs)`. */
const TABS = [
  { name: 'today', href: ROUTES.today, icon: 'home' },
  { name: 'talk', href: ROUTES.talk, icon: 'message' },
  { name: 'library', href: ROUTES.library, icon: 'archive' },
  { name: 'learn', href: ROUTES.learn, icon: 'book' },
  { name: 'progress', href: ROUTES.progress, icon: 'barChart' },
] as const satisfies readonly { name: string; href: string; icon: IconName }[];

/** The open tab's screen and the tab bar: along the bottom on phones, at the side when wide. */
function Shell() {
  const { t } = useTranslation();
  const { split } = useScreenLayout();
  const pathname = usePathname();
  const bar = (
    <TabList asChild>
      <TabBar label={t('tabs.label')} side={split}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton icon={tab.icon} label={t(`tabs.${tab.name}`)} />
          </TabTrigger>
        ))}
      </TabBar>
    </TabList>
  );
  return (
    <Tabs style={{ flex: 1, flexDirection: split ? 'row' : 'column' }}>
      {split ? bar : null}
      {/* A tab that breaks leaves the bar standing: it is the way out, and opening another tab
          (a new address) clears the error. */}
      <ScreenBoundary leave={false} resetKey={pathname}>
        <TabSlot style={{ flex: 1 }} />
      </ScreenBoundary>
      {split ? null : bar}
    </Tabs>
  );
}

/**
 * The app once onboarding is done: five tabs (Today, Talk, Library, Learn, Progress). Reached
 * through `/home`, and guarded here as well, because on the web any of its addresses can be
 * opened directly: someone who is not signed in goes to the start, and a learner who has not
 * finished onboarding goes back to where they were in it.
 */
export function TabsScreen() {
  return (
    // An empty top row keeps the loading note where a screen's content starts.
    <OnboardingGate header={<View className="min-h-tap" />}>
      {({ status }) => {
        const route = routeForOnboarding(status);
        return route ? <Redirect href={route} /> : <Shell />;
      }}
    </OnboardingGate>
  );
}
