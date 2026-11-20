import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_PERSONAS } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { DrillScreen } from '.';

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('5.30 Commute drill', () => {
  it('explains the drill and starts it with the suggested partner, in walking mode', async () => {
    const api = createFakeApi();
    api.enterApp();
    await renderScreen(<DrillScreen />, { api, signedIn: true });

    expect(await screen.findByRole('header', { name: 'Commute drill' })).toBeTruthy();
    expect(screen.getByText(/Use headphones/)).toBeTruthy();
    const partner = FAKE_PERSONAS.find((p) => screen.queryByText(`With ${p.name}`));
    expect(partner).toBeDefined();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the drill' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: partner!.id, practise: 'drill', walking: '1' },
    });
  });
});
