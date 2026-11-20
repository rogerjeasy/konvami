import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { router, useLocalSearchParams } from 'expo-router';
import { HalvesQueue } from '@/screens/flags/halves-queue';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { HalvesScreen } from '.';
import { HalvesCaseScreen } from './case';
import { HalvesFindScreen, searchHours } from './find';
import { HalvesFromImportScreen } from './from-import';
import { HalvesMineScreen } from './mine';
import { HalvesMoveScreen } from './move';
import { HalvesStrandsScreen } from './strands';

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

const JOIN = { nativeLanguage: 'fr', place: 'city:Lyon', veilDefault: true, voiceConsent: true };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

async function joined(): Promise<FakeApi> {
  const api = createFakeApi();
  api.enterApp();
  api.halvesOpen();
  await api.joinHalves(JOIN);
  return api;
}

describe('7.3 Finding a partner', () => {
  it('offers the search lengths the server allows', () => {
    expect(searchHours([2, 12, 48])).toEqual([
      2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48,
    ]);
  });

  it('says calmly that strangers are not matched yet without the switch', async () => {
    const api = await joined();
    await renderScreen(<HalvesFindScreen />, { api, signedIn: true });

    expect(await screen.findByText(/Finding a stranger isn’t open yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start looking' })).toBeNull();
  });

  it('looks for the chosen hours, then stops; an AI can play at once', async () => {
    const api = await joined();
    api.halvesStrangers();
    await renderScreen(<HalvesFindScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'More hours' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start looking' }));
    await waitFor(() =>
      expect(api.calls).toContainEqual(['lookForHalvesPartner', { hours: 14, remind: true }]),
    );
    expect(await screen.findByText('Looking for your other half…')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Stop looking' }));
    await waitFor(() => expect(api.calls).toContainEqual(['stopHalvesSearch']));

    await fireEvent.press(screen.getByRole('radio', { name: /Play now with an AI/ }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/halves/[id]',
        params: { id: 'case-1' },
      }),
    );
  });

  it('opens the case when someone fits at once', async () => {
    const api = await joined();
    api.halvesStrangers();
    api.halvesMatchNext();
    await renderScreen(<HalvesFindScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Start looking' }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/halves/[id]',
        params: { id: 'case-1' },
      }),
    );
  });

  it('is offered on the hub, with the strand map and a case from the course', async () => {
    const api = await joined();
    api.halvesStrangers();
    await renderScreen(<HalvesScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('radio', { name: /Find a partner/ }));
    expect(router.push).toHaveBeenCalledWith('/halves/find');
    await fireEvent.press(screen.getByRole('radio', { name: /Your strand map/ }));
    expect(router.push).toHaveBeenCalledWith('/halves/strands');
    await fireEvent.press(screen.getByRole('radio', { name: /A case from your course/ }));
    expect(router.push).toHaveBeenCalledWith('/halves/from-import');
  });
});

describe('7.7 A move heard, with the Bridge and a nudge', () => {
  it('helps step by step in same-language mode', async () => {
    const api = await joined();
    api.halvesSameLanguage();
    const found = await api.startHalvesCase({});
    const move = `${found.id}-theirs-1`;
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: found.id, move });
    await renderScreen(<HalvesMoveScreen />, { api, signedIn: true });

    expect(await screen.findByText('Need a hand?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'What it means' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Say it more simply' }));
    expect(await screen.findByText('Inès war in Genf.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'What it means' }));
    expect(await screen.findByText('Inès changed trains in Geneva.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show the words' }));
    expect(screen.getByText('Inès ist in Genf umgestiegen.')).toBeTruthy();
  });

  it('lets a native suggest a better way, once', async () => {
    const api = await joined();
    const found = await api.startHalvesCase({});
    const move = `${found.id}-theirs-1`;
    // The fake's stand-in lets the listener nudge.
    const ready = await api.getHalvesCase(found.id);
    const theirs = ready.rounds[0]?.theirs;
    if (!theirs) throw new Error('no clue');
    Object.assign(theirs, { canNudge: true });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: found.id, move });
    await renderScreen(<HalvesMoveScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Suggest a better way' }));
    await fireEvent.changeText(screen.getByLabelText('Your phrase'), ' à Genève ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(api.calls).toContainEqual(['nudgeHalvesMove', move, 'à Genève']));
    expect(await screen.findByText('You suggested a better way.')).toBeTruthy();
  });
});

describe('7.9 and 7.8 What the learner sees about how they did', () => {
  it('shows the nudges natives passed on a move', async () => {
    const api = await joined();
    const found = await api.startHalvesCase({});
    await api.sendHalvesMove(found.id, { audio: 'AA', format: 'm4a' });
    const ready = await api.getHalvesCase(found.id);
    const mine = ready.rounds[0]?.mine;
    if (!mine) throw new Error('no move');
    Object.assign(mine, {
      status: 'delivered',
      nudges: [{ text: 'um 14:20 Uhr', by: 'Orion-12' }],
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: found.id, move: mine.id });
    await renderScreen(<HalvesMineScreen />, { api, signedIn: true });

    expect(await screen.findByText('Natives suggest')).toBeTruthy();
    expect(screen.getByText('um 14:20 Uhr')).toBeTruthy();
    expect(screen.getByText('from Orion-12')).toBeTruthy();
  });

  it('says privately how many clues were understood the first time, and celebrates a duo', async () => {
    const api = await joined();
    const found = await api.startHalvesCase({});
    const ready = await api.getHalvesCase(found.id);
    Object.assign(ready, {
      status: 'solved',
      mode: 'friend',
      partner: { name: 'Vega-3', ai: false, place: null },
      askAgain: true,
      understoodFirst: 2,
      told: 3,
      final: { ...ready.final, solution: 0 },
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: found.id });
    await renderScreen(<HalvesCaseScreen />, { api, signedIn: true });

    expect(
      await screen.findByText('Vega-3 understood 2 of your 3 clues the first time'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Yes' }));
    expect(await screen.findAllByText('You’re a duo now!')).toBeTruthy();
  });
});

describe('7.14 The strand map', () => {
  it('lists the people played with where they shared a place', async () => {
    const api = await joined();
    await renderScreen(<HalvesStrandsScreen />, { api, signedIn: true });

    expect(await screen.findByText('Orion-12')).toBeTruthy();
    expect(screen.getByText('Zürich · Cases together: 3')).toBeTruthy();
    expect(screen.getByText('Duo')).toBeTruthy();
    expect(screen.getByText('People who didn’t share a place: 1')).toBeTruthy();
  });
});

describe('7.17 A case from the course', () => {
  it('starts a case from an import, and says calmly when one has too few words', async () => {
    const api = await joined();
    await api.createImport({ kind: 'text', text: 'Sehr geehrte Frau Müller …' });
    await renderScreen(<HalvesFromImportScreen />, { api, signedIn: true });

    const options = await screen.findAllByRole('radio');
    await fireEvent.press(options[0]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Start a case' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(api.calls.some(([method]) => method === 'startHalvesImportCase')).toBe(true);
  });
});

describe('6.15 The owner’s numbers and decisions', () => {
  it('shows the last 30 days and warns or suspends', async () => {
    const api = await joined();
    api.halvesHeld({
      kind: 'nudge',
      id: 'nudge-1',
      moveId: 'move-1',
      transcript: 'schreib mir: lena@example.com',
      reasons: ['contact'],
      sender: 'Orion-12',
      reporter: null,
      note: null,
      band: 'adult',
      createdAt: '2026-11-20T12:00:00Z',
      strikes: 1,
      suspended: false,
    });
    await renderScreen(<HalvesQueue />, { api, signedIn: true });

    expect(await screen.findByText('Last 30 days')).toBeTruthy();
    expect(screen.getByText('Held suggestion')).toBeTruthy();
    expect(screen.getByText('5.5 h')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Warn' }));
    await waitFor(() =>
      expect(api.calls).toContainEqual(['decideHalvesItem', 'nudge', 'nudge-1', 'warn']),
    );
  });
});
