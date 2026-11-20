import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { router, useLocalSearchParams } from 'expo-router';
import { createFakeApi, type FakeApi } from '@/test/fake-api';
import { FAKE_FRIEND_CODE } from '@/test/fake-halves';
import { createFakeRecorder } from '@/test/fake-recorder';
import { renderScreen } from '@/test/render';
import { HalvesQueue } from '@/screens/flags/halves-queue';
import { HalvesScreen } from '.';
import { HalvesCaseScreen } from './case';
import { HalvesInviteScreen } from './invite';
import { HalvesJoinScreen } from './join';
import { HalvesMoveScreen } from './move';
import { HalvesRecordScreen } from './record';
import { HalvesSettingsScreen } from './settings';

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

const JOIN = { nativeLanguage: 'fr', place: null, veilDefault: true, voiceConsent: true };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

/** A learner in the app with Two Halves open, joined, and one case against the AI. */
async function playing(): Promise<{ api: FakeApi; caseId: string }> {
  const api = createFakeApi();
  api.enterApp();
  api.halvesOpen();
  await api.joinHalves(JOIN);
  const found = await api.startHalvesCase({});
  return { api, caseId: found.id };
}

describe('7.1 Two Halves', () => {
  it('says it is not open yet for an account it is not open to', async () => {
    const api = createFakeApi();
    api.enterApp();
    await renderScreen(<HalvesScreen />, { api, signedIn: true });

    expect(await screen.findByText(/isn’t open for your account yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join Two Halves' })).toBeNull();
  });

  it('explains the game and leads to joining', async () => {
    const api = createFakeApi();
    api.enterApp();
    api.halvesOpen();
    await renderScreen(<HalvesScreen />, { api, signedIn: true });

    expect(await screen.findByText('How it works')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Join Two Halves' }));
    expect(router.push).toHaveBeenCalledWith('/halves/join');
  });

  it('lists the learner’s cases and starts one against an AI', async () => {
    const { api, caseId } = await playing();
    await renderScreen(<HalvesScreen />, { api, signedIn: true });

    expect(await screen.findByText('You play as Linde-7')).toBeTruthy();
    expect(screen.getByRole('button', { name: /The Lost Cello, Your turn/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Play with an AI' }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/halves/[id]',
        params: { id: 'case-2' },
      }),
    );
    expect(caseId).toBe('case-1');
  });
});

describe('7.2 Join', () => {
  it('needs a first language and the voice-sharing agreement', async () => {
    const api = createFakeApi();
    api.enterApp();
    api.halvesOpen();
    await renderScreen(<HalvesJoinScreen />, { api, signedIn: true });

    const join = await screen.findByRole('button', { name: 'Join' });
    expect(join).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'French' }));
    expect(join).toBeDisabled();
    await fireEvent(
      screen.getByRole('switch', {
        name: 'I agree that the other player of a case hears my moves.',
      }),
      'valueChange',
      true,
    );
    await fireEvent.press(join);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/halves'));
    expect(api.calls).toContainEqual([
      'joinHalves',
      { nativeLanguage: 'fr', place: null, veilDefault: true, voiceConsent: true },
    ]);
  });
});

describe('7.4 A case', () => {
  it('shows the clue to tell, the other half labelled AI, and leads to recording', async () => {
    const { api, caseId } = await playing();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: caseId });
    await renderScreen(<HalvesCaseScreen />, { api, signedIn: true });

    expect(await screen.findByText(/Ein Schaffner hat um 14:20 Uhr/)).toBeTruthy();
    expect(screen.getByText('With Julien')).toBeTruthy();
    expect(screen.getByText('AI')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Record your clue for round 1' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/halves/[id]/record',
      params: { id: caseId },
    });
  });

  it('opens the briefing as a call with the learner’s partner', async () => {
    const { api, caseId } = await playing();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: caseId });
    await renderScreen(<HalvesCaseScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: /Rehearse with .* first/ }));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/call/[personaId]',
        params: expect.objectContaining({ scenario: `halves:${caseId.replaceAll('-', '')}` }),
      }),
    );
  });

  it('ends with the result, the recap and a share card', async () => {
    const { api, caseId } = await playing();
    await api.solveHalvesCase(caseId, 0);
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: caseId });
    await renderScreen(<HalvesCaseScreen />, { api, signedIn: true });

    expect(await screen.findByText('Case solved!')).toBeTruthy();
    expect(screen.getByText('Wir haben es!')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Share the case card' }));
    await waitFor(() => expect(api.calls).toContainEqual(['getHalvesShareCard', caseId]));
  });
});

describe('7.6 Record a move', () => {
  it('sends the move veiled as the learner chose, then goes back to the case', async () => {
    const { api, caseId } = await playing();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: caseId });
    const recorder = createFakeRecorder();
    await renderScreen(<HalvesRecordScreen />, { api, signedIn: true, recorder });

    await fireEvent(
      await screen.findByRole('switch', { name: 'Veil my voice for this move' }),
      'valueChange',
      false,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Record' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop' }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/halves/[id]',
        params: { id: caseId },
      }),
    );
    expect(api.calls).toContainEqual([
      'sendHalvesMove',
      caseId,
      { audio: 'AAEC', format: 'm4a', durationMs: 2400, veiled: false },
    ]);
  });
});

describe('7.7 A move heard', () => {
  it('answers the board’s question, wrong and then right', async () => {
    const { api, caseId } = await playing();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: caseId, move: `${caseId}-theirs-1` });
    await renderScreen(<HalvesMoveScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('radio', { name: 'In Bern' }));
    expect(await screen.findByText(/Not that one/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'In Geneva' }));

    expect(await screen.findByText('The answer: In Geneva')).toBeTruthy();
  });

  it('reports a move: hidden at once, and the player blocked when asked', async () => {
    const { api, caseId } = await playing();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: caseId, move: `${caseId}-theirs-1` });
    await renderScreen(<HalvesMoveScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Report this move' }));
    await fireEvent.press(await screen.findByText('Asked for personal details or contact'));
    await fireEvent(
      screen.getByRole('switch', { name: 'Also block this player' }),
      'valueChange',
      true,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() =>
      expect(api.calls).toContainEqual([
        'reportHalvesMove',
        `${caseId}-theirs-1`,
        { reason: 'personal', note: null },
      ]),
    );
    expect(api.calls).toContainEqual(['blockHalvesPartner', caseId]);
  });
});

describe('7.12 Invite a friend', () => {
  it('makes a code to share and starts a case with a friend’s code', async () => {
    const { api } = await playing();
    await renderScreen(<HalvesInviteScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Make a code' }));
    expect(await screen.findByText('Your code: ABC234')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Friend’s code'), 'WRONG1');
    await fireEvent.press(screen.getByRole('button', { name: 'Start the case' }));
    expect(await screen.findByText(/That code doesn’t work/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Friend’s code'), 'TOOMANY');
    await fireEvent.press(screen.getByRole('button', { name: 'Start the case' }));
    expect(await screen.findByText(/a lot of codes for today/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Friend’s code'), FAKE_FRIEND_CODE);
    await fireEvent.press(screen.getByRole('button', { name: 'Start the case' }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/halves/[id]',
        params: { id: 'case-2' },
      }),
    );
  });
});

describe('7.11 Settings', () => {
  it('leaves Two Halves after a confirmation', async () => {
    const { api } = await playing();
    await renderScreen(<HalvesSettingsScreen />, { api, signedIn: true });

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Leave Two Halves and delete my data' }),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave and delete' }));

    await waitFor(() => expect(api.calls).toContainEqual(['leaveHalves']));
    expect(router.replace).toHaveBeenCalledWith('/halves');
  });
});

describe('6.15 The owner’s Two Halves queue', () => {
  it('shows a held move and removes it', async () => {
    const { api } = await playing();
    api.halvesHeld({
      kind: 'held',
      id: 'move-9',
      moveId: 'move-9',
      transcript: 'Gib mir deine Nummer',
      reasons: ['contact_or_meetup'],
      sender: 'Vega-3',
      reporter: null,
      note: null,
      band: 'adult',
      createdAt: '2026-11-20T12:00:00Z',
      strikes: 0,
      suspended: false,
    });
    await renderScreen(<HalvesQueue />, { api, signedIn: true });

    expect(await screen.findByText('Gib mir deine Nummer')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove (strike)' }));

    await waitFor(() =>
      expect(api.calls).toContainEqual(['decideHalvesItem', 'held', 'move-9', 'remove']),
    );
  });
});
