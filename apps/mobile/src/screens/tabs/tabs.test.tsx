import { screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { TabsScreen } from '.';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

// The navigator itself is the router's; here it is stood in for by plain views, with Today open.
jest.mock('expo-router/ui', () => {
  const { cloneElement } = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');
  return {
    Tabs: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TabSlot: () => <Text>the open tab</Text>,
    TabList: ({ children }: { children: React.ReactNode }) => children,
    TabTrigger: ({ children, name }: { children: React.ReactElement; name: string }) =>
      cloneElement(children, { isFocused: name === 'today' }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('The tabs of the app', () => {
  it('shows the five tabs to a learner who has finished onboarding, with Today open', async () => {
    const api = createFakeApi();
    api.enterApp();
    await renderScreen(<TabsScreen />, { api, signedIn: true });

    expect(await screen.findByText('the open tab')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Today',
      'Talk',
      'Library',
      'Learn',
      'Progress',
    ]);
    expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeTruthy();
  });

  it('sends a learner who has not finished onboarding back to it', async () => {
    const api = createFakeApi();
    api.advanceTo('partners');
    await renderScreen(<TabsScreen />, { api, signedIn: true });

    expect(await screen.findByText('redirect:/onboarding/partners')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<TabsScreen />);

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
