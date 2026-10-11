import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { POLL_MS } from '@/practice/report-follower';
import {
  createFakeApi,
  FAKE_PERSONAS,
  FAKE_REPORT,
  FAKE_REPORT_SAYS,
  type FakeApi,
} from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { ReportScreen } from '.';

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
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

afterEach(() => {
  jest.useRealTimers();
});

const ID = 'rtc_1';

/** A learner in the app who talked with Lena for eight minutes an hour ago. */
function talked(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  api.talked(0, { id: ID, minutes: 8, learnerSays: FAKE_REPORT_SAYS });
  return api;
}

async function open(api: FakeApi, { signedIn = true } = {}) {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: ID });
  await renderScreen(<ReportScreen />, { api, signedIn });
  return api;
}

/** Opens the report of a conversation whose report is ready. */
async function openReady(api: FakeApi = talked(), report = FAKE_REPORT) {
  api.reported(ID, report);
  await open(api);
  await screen.findByText(report.summary);
  return api;
}

const asked = (api: FakeApi) =>
  api.calls.filter(([method]) => method === 'requestConversationReport').length;

describe('5.10 Session report', () => {
  it('says what the conversation was about and who it was with', async () => {
    await openReady();

    expect(screen.getByRole('header', { name: 'Your report' })).toBeTruthy();
    expect(screen.getByText('With Lena · Today · 8 min')).toBeTruthy();
    expect(
      screen.getByText('You told Lena about your weekend in Berlin and the museum you visited.'),
    ).toBeTruthy();
  });

  it('shows how much of the talking was the learner’s', async () => {
    await openReady();

    const share = screen.getByRole('progressbar', { name: 'You said 58% of the words' });
    expect(share.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 58 });
    expect(screen.getByText('58%')).toBeTruthy();
    expect(screen.getByText('You: 19 words')).toBeTruthy();
    expect(screen.getByText('Lena: 14 words')).toBeTruthy();
    expect(screen.getByText('Your longest answer: 10 words')).toBeTruthy();
  });

  it('shows each mistake as what was said, how it is right, and why', async () => {
    await openReady();

    expect(screen.getByRole('button', { name: 'Let’s polish this, 2' })).toBeTruthy();
    const card = screen.getByLabelText(
      'You said: Ich habe nach Berlin gefahren. Better: Ich bin nach Berlin gefahren. Verbs of movement such as “fahren” form the Perfekt with “sein”.',
    );
    expect(within(card).getByText('Ich habe nach Berlin gefahren')).toBeTruthy();
    expect(within(card).getByText('Ich bin nach Berlin gefahren')).toBeTruthy();
    expect(within(card).getByText('Perfekt: haben or sein')).toBeTruthy();
    // The one word that changed stands out in both versions.
    expect(within(card).getByText('habe')).toBeTruthy();
    expect(within(card).getByText('bin')).toBeTruthy();
  });

  it('marks a correction the second check could not confirm as a hint, not a fact', async () => {
    await openReady();

    const sure = screen.getByLabelText(/^You said: Ich habe nach Berlin gefahren/);
    const unsure = screen.getByLabelText(/^You said: weil es war sehr interessant/);
    expect(within(unsure).getByText('Not sure')).toBeTruthy();
    expect(
      within(unsure).getByText('We couldn’t confirm this one. Take it as a hint, not as a rule.'),
    ).toBeTruthy();
    expect(within(sure).queryByText('Not sure')).toBeNull();
  });

  it('says so when no mistake stood out', async () => {
    await openReady(talked(), { ...FAKE_REPORT, mistakes: [] });

    expect(screen.getByText('No mistakes stood out this time.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Let’s polish this/ })).toBeNull();
  });

  it('shows more natural wordings, the words to keep, what went well and what comes next', async () => {
    await openReady();

    const natural = screen.getByLabelText(
      'You said: Ich habe ein Museum besucht. More natural: Ich war im Museum. Shorter, and what people usually say.',
    );
    expect(within(natural).getByText('Ich war im Museum')).toBeTruthy();
    expect(screen.getByText('das Wochenende')).toBeTruthy();
    expect(screen.getByText('weekend')).toBeTruthy();
    expect(screen.getByText('Wie war dein Wochenende?')).toBeTruthy();
    expect(screen.getByText('die Ausstellung')).toBeTruthy();
    expect(screen.getByText('You told a whole story in the past tense.')).toBeTruthy();
    expect(screen.getByText('The Perfekt with “sein” for verbs of movement')).toBeTruthy();
    expect(screen.getByText('Your partners bring these up as you talk.')).toBeTruthy();
  });

  it('leaves out the parts a report has nothing for', async () => {
    await openReady(talked(), { ...FAKE_REPORT, rewrites: [], words: [], wins: [], nextSteps: [] });

    for (const title of [
      'More natural',
      'Words from this conversation',
      'What went well',
      'Next time',
    ]) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${title}`) })).toBeNull();
    }
  });

  it('folds a part away and opens it again', async () => {
    await openReady();
    const header = screen.getByRole('button', { name: 'Let’s polish this, 2' });
    expect(header.props.accessibilityState).toMatchObject({ expanded: true });

    await fireEvent.press(header);
    expect(screen.queryByText('Ich bin nach Berlin gefahren')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Let’s polish this, 2' }).props.accessibilityState,
    ).toMatchObject({ expanded: false });

    await fireEvent.press(screen.getByRole('button', { name: 'Let’s polish this, 2' }));
    expect(screen.getByText('Ich bin nach Berlin gefahren')).toBeTruthy();
  });

  it('starts another conversation with the same partner', async () => {
    await openReady();

    await fireEvent.press(screen.getByRole('button', { name: 'Talk with Lena again' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: FAKE_PERSONAS[0]?.id },
    });
  });

  it('leads to the transcript', async () => {
    await openReady();

    await fireEvent.press(screen.getByRole('button', { name: 'Read the transcript' }));

    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/conversations/[id]',
      params: { id: ID },
    });
  });

  it('waits while the report is being written and shows it when it is there', async () => {
    jest.useFakeTimers();
    const api = talked();
    api.reported(ID, 'pending');
    await open(api);
    expect(await screen.findByRole('header', { name: 'Writing your report' })).toBeTruthy();

    api.reported(ID);
    await act(() => jest.advanceTimersByTimeAsync(POLL_MS));

    expect(screen.getByText(FAKE_REPORT.summary)).toBeTruthy();
    expect(screen.queryByText('Writing your report')).toBeNull();
  });

  it('offers to write the report of a conversation that has none', async () => {
    const api = talked();
    await open(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Write my report' }));

    expect(await screen.findByRole('header', { name: 'Writing your report' })).toBeTruthy();
    expect(asked(api)).toBe(1);
  });

  it('says so when the conversation was too short for a report', async () => {
    const api = talked();
    api.reported(ID, 'too_short');
    await open(api);

    expect(await screen.findByRole('header', { name: 'Too short for a report' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Write my report' })).toBeNull();
  });

  it('lets the learner ask again for a report that could not be written', async () => {
    const api = talked();
    api.reported(ID, 'failed');
    await open(api);
    expect(
      await screen.findByRole('header', { name: 'Your report couldn’t be written' }),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'Writing your report' })).toBeTruthy();
    expect(asked(api)).toBe(1);
  });

  it('leads to Privacy and AI when the learner has not agreed to the AI provider', async () => {
    const api = talked();
    await open(api);
    api.failNext('requestConversationReport', 'consent_required');

    await fireEvent.press(await screen.findByRole('button', { name: 'Write my report' }));
    expect(await screen.findByRole('header', { name: 'Reports need your agreement' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open “Privacy and AI”' }));

    expect(router.push).toHaveBeenCalledWith('/account/privacy');
  });

  it('says when reports are not available', async () => {
    const api = talked();
    await open(api);
    api.failNext('requestConversationReport', 'unavailable');

    await fireEvent.press(await screen.findByRole('button', { name: 'Write my report' }));

    expect(
      await screen.findByText('Reports aren’t available right now. Try again later.'),
    ).toBeTruthy();
  });

  it('stops offering another try once a report has failed too often', async () => {
    const api = talked();
    api.reported(ID, 'failed');
    await open(api);
    api.failNext('requestConversationReport', 'report_limit');

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByText(
        'This report couldn’t be written, even after several tries. Your conversation is still in your library.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says when the report cannot be loaded and loads it again', async () => {
    const api = talked();
    api.reported(ID);
    api.failNext('getConversationReport', 'network');
    await open(api);
    expect(
      await screen.findByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(FAKE_REPORT.summary)).toBeTruthy();
  });

  it('says when the conversation no longer exists', async () => {
    const api = createFakeApi();
    api.enterApp();
    await open(api);

    expect(await screen.findByText('This conversation no longer exists.')).toBeTruthy();
  });

  it('shows a report whose partner has been removed, without offering to call them', async () => {
    const api = talked();
    await api.removePersona(FAKE_PERSONAS[0]?.id ?? '');
    await openReady(api);

    expect(screen.getByText('Today · 8 min')).toBeTruthy();
    expect(screen.getByText('A former partner: 14 words')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Talk with/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Read the transcript' })).toBeTruthy();
  });

  it('goes back', async () => {
    await openReady();

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(router.back).toHaveBeenCalled();
  });

  it('sends someone who is not signed in to the start', async () => {
    await open(talked(), { signedIn: false });

    await waitFor(() => expect(screen.getByText('redirect:/welcome')).toBeTruthy());
  });
});
