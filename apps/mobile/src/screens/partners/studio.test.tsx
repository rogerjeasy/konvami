import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import type { PersonaDraft } from '@konvami/api-client';
import { draftOf, ROLE_TEACHING } from '@/profile/persona-draft';
import { createFakeApi, FAKE_DRAFT, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { createFakeProfileDevice } from '@/test/fake-profile-device';
import { renderScreen } from '@/test/render';
import { EditStudioScreen, NewStudioScreen } from './studio';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

const LENA = FAKE_PERSONAS[0]!;

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

const next = () => fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
const created = (api: FakeApi) =>
  api.calls.find(([method]) => method === 'createPersona')?.[1] as PersonaDraft | undefined;

describe('6.6 Persona Studio: a new partner', () => {
  async function open(start: PersonaDraft | null = FAKE_DRAFT, api = inApp()) {
    const studioStart = start ?? undefined;
    const device = createFakeProfileDevice();
    await renderScreen(<NewStudioScreen />, { api, device, studioStart, signedIn: true });
    await screen.findByRole('header', { name: 'Who are they?' });
    return { api, device };
  }

  const STEPS = ['identity', 'look', 'voice', 'personality', 'teaching', 'review'] as const;

  /** Presses Continue from one step (the first, unless said otherwise) to a later one. */
  async function goTo(step: (typeof STEPS)[number], from: (typeof STEPS)[number] = 'identity') {
    for (let i = STEPS.indexOf(from); i < STEPS.indexOf(step); i += 1) await next();
  }

  it('walks through who they are, look, voice, personality and teaching to a review', async () => {
    await open();
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 6' })).toBeTruthy();
    expect(screen.getByLabelText('Name')).toHaveProp('value', 'Greta');

    await next();
    expect(screen.getByRole('header', { name: 'How do they look?' })).toBeTruthy();
    await next();
    expect(screen.getByRole('header', { name: 'How do they sound?' })).toBeTruthy();
    await next();
    expect(screen.getByRole('header', { name: 'What are they like?' })).toBeTruthy();
    await next();
    expect(screen.getByRole('header', { name: 'How do they help you learn?' })).toBeTruthy();
    await next();

    expect(screen.getByRole('header', { name: 'Meet Greta' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 6 of 6' })).toBeTruthy();
    expect(screen.getByText('30 · Hamburg')).toBeTruthy();
    expect(screen.getByText('Marketing-Managerin')).toBeTruthy();
    expect(screen.getByText('Voice: Coral')).toBeTruthy();
    expect(screen.getByText('Corrects: Right away')).toBeTruthy();
  });

  it('adds the partner as reviewed and returns to the partners', async () => {
    const { api } = await open();
    await goTo('review');

    await fireEvent.press(screen.getByRole('button', { name: 'Add partner' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account/partners'));
    expect(created(api)).toEqual(FAKE_DRAFT);
    expect((await api.getPersonas()).map(({ name }) => name)).toEqual(['Lena', 'Jonas', 'Greta']);
  });

  it('goes back a step at a time, and out of the studio from the first', async () => {
    await open();
    await next();

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('header', { name: 'Who are they?' })).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('starts from an empty page when nothing was handed over, and asks for who they are', async () => {
    await open(null);
    expect(screen.getByLabelText('Name')).toHaveProp('value', '');

    await next();

    expect(screen.getByRole('header', { name: 'Who are they?' })).toBeTruthy();
    expect(screen.getByText('Give them a name.')).toBeTruthy();
    expect(screen.getByText('Say where they are from.')).toBeTruthy();
    expect(screen.getByText('Write a line or two about them.')).toBeTruthy();
  });

  it('saves who they are as it was typed', async () => {
    const { api } = await open(null);

    await fireEvent.changeText(screen.getByLabelText('Name'), ' Ole ');
    await fireEvent.press(screen.getByRole('radio', { name: /^Teacher/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Man' }));
    await fireEvent.changeText(screen.getByLabelText('Age'), '41');
    await fireEvent.changeText(screen.getByLabelText('Where they are from'), 'Kiel');
    await fireEvent.changeText(screen.getByLabelText('What they do (optional)'), 'Bootsbauer');
    await fireEvent.changeText(screen.getByLabelText('In one line (optional)'), '  ');
    await fireEvent.changeText(screen.getByLabelText('Their story'), 'Ole baut Boote in Kiel.');
    await goTo('review');
    await fireEvent.press(screen.getByRole('button', { name: 'Add partner' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(created(api)).toMatchObject({
      name: 'Ole',
      role: 'teacher',
      gender: 'male',
      age: 41,
      origin: 'Kiel',
      occupation: 'Bootsbauer',
      tagline: null,
      backstory: 'Ole baut Boote in Kiel.',
      // A teacher corrects as teachers do, because nothing else was chosen.
      teaching: ROLE_TEACHING.teacher,
    });
  });

  it('refuses an age outside the range', async () => {
    await open();

    await fireEvent.changeText(screen.getByLabelText('Age'), '12');
    await next();

    expect(screen.getByText('Their age must be between 18 and 80.')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Who are they?' })).toBeTruthy();
  });

  it('changes the look', async () => {
    const { api } = await open();
    await goTo('look');

    await fireEvent.press(screen.getByRole('radio', { name: 'Curls' }));
    await fireEvent.press(screen.getByRole('switch', { name: 'Glasses' }));
    await goTo('review', 'look');
    await fireEvent.press(screen.getByRole('button', { name: 'Add partner' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(created(api)?.look).toEqual({ ...FAKE_DRAFT.look, hair: 'curls', glasses: false });
  });

  it('plays a voice’s sample and stops when it has ended', async () => {
    const { device } = await open();
    await goTo('voice');
    expect(screen.getByRole('radio', { name: 'Coral' })).toBeChecked();

    await fireEvent.press(screen.getByRole('button', { name: 'Play Cedar' }));

    expect(await screen.findByRole('button', { name: 'Stop Cedar' })).toBeTruthy();
    expect(device.playing).toBe('https://files.test/voices/de/cedar.mp3');

    await act(async () => device.finishSample());

    expect(await screen.findByRole('button', { name: 'Play Cedar' })).toBeTruthy();
  });

  it('plays one sample at a time and stops on request', async () => {
    const { device } = await open();
    await goTo('voice');

    await fireEvent.press(screen.getByRole('button', { name: 'Play Cedar' }));
    await screen.findByRole('button', { name: 'Stop Cedar' });
    await fireEvent.press(screen.getByRole('button', { name: 'Play Marin' }));

    expect(await screen.findByRole('button', { name: 'Stop Marin' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Cedar' })).toBeTruthy();
    expect(device.played).toEqual([
      'https://files.test/voices/de/cedar.mp3',
      'https://files.test/voices/de/marin.mp3',
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Stop Marin' }));

    expect(device.playing).toBeNull();
  });

  it('says so when a sample cannot be played, and still lets the voice be chosen', async () => {
    const { api } = await open();
    await goTo('voice');
    api.failNext('getVoiceSample', 'voice_unavailable');

    await fireEvent.press(screen.getByRole('button', { name: 'Play Cedar' }));

    expect(await screen.findByText(/This voice can’t be played right now/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Cedar' }));
    expect(screen.getByRole('radio', { name: 'Cedar' })).toBeChecked();
  });

  it('saves the chosen voice and speaking speed', async () => {
    const { api } = await open();
    await goTo('voice');

    await fireEvent.press(screen.getByRole('radio', { name: 'Cedar' }));
    await fireEvent.press(screen.getByRole('radio', { name: '0.8×' }));
    await goTo('review', 'voice');
    await fireEvent.press(screen.getByRole('button', { name: 'Add partner' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(created(api)).toMatchObject({ voice: 'cedar', teaching: { speed: 0.8 } });
  });

  it('saves the personality as it was set', async () => {
    const { api } = await open();
    await goTo('personality');
    const scale = (name: string) => within(screen.getByLabelText(name));
    expect(scale('Warmth: Reserved to Warm').getByRole('radio', { name: '5 of 5' })).toBeChecked();

    await fireEvent.press(scale('Humour: Dry to Funny').getByRole('radio', { name: '4 of 5' }));
    await fireEvent.press(screen.getByRole('radio', { name: /^Informal/ }));
    await fireEvent.press(screen.getByRole('radio', { name: /^Likes a debate/ }));
    await goTo('review', 'personality');
    await fireEvent.press(screen.getByRole('button', { name: 'Add partner' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(created(api)?.personality).toEqual({
      ...FAKE_DRAFT.personality,
      humour: 4,
      formOfAddress: 'informal',
      style: 'debate',
    });
  });

  it('saves how they teach, and asks which mistakes only where that makes a difference', async () => {
    const { api } = await open();
    await goTo('teaching');
    expect(screen.getByRole('radio', { name: /^Right away/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Everything' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: /^In passing/ }));
    expect(screen.queryByRole('radio', { name: 'Everything' })).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: /^At the end/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'The important ones' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Never' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'B2' }));
    await fireEvent.changeText(screen.getByLabelText('Something to practise (optional)'), ' ');
    await goTo('review', 'teaching');
    await fireEvent.press(screen.getByRole('button', { name: 'Add partner' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(created(api)?.teaching).toEqual({
      correctionTiming: 'end',
      strictness: 'important',
      explanationUsage: 'never',
      level: 'B2',
      focus: null,
      speed: 0.9,
    });
  });

  it('can hand the way of correcting back to the role', async () => {
    await open();
    await goTo('teaching');

    await fireEvent.press(screen.getByRole('button', { name: 'Back to this role’s usual way' }));

    // Greta is a teacher: teachers correct the important mistakes right away.
    expect(screen.getByRole('radio', { name: /^Right away/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'The important ones' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Back to this role’s usual way' })).toBeNull();
  });

  it('says why a partner could not be added and keeps the draft', async () => {
    const { api } = await open();
    await goTo('review');
    api.failNext('createPersona', 'too_many');

    await fireEvent.press(screen.getByRole('button', { name: 'Add partner' }));

    expect(await screen.findByText(/You have twelve partners/)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Meet Greta' })).toBeTruthy();
  });
});

describe('6.6 Persona Studio: one of the learner’s partners', () => {
  async function open(id: string = LENA.id, api = inApp()) {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id });
    const device = createFakeProfileDevice();
    await renderScreen(<EditStudioScreen />, { api, device, signedIn: true });
    return { api, device };
  }

  const changed = (api: FakeApi) =>
    api.calls
      .filter(([method]) => method === 'changePersona')
      .map(([, id, change]) => [id, change]);

  it('opens on who they are, with every part one tap away', async () => {
    await open();

    expect(await screen.findByRole('header', { name: 'Lena' })).toBeTruthy();
    expect(screen.getByLabelText('Name')).toHaveProp('value', 'Lena');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('tab', { name: 'Voice' }));

    expect(screen.getByRole('radio', { name: 'Marin' })).toBeChecked();
    expect(screen.getByRole('tab', { name: 'Voice' })).toBeSelected();
  });

  it('saves what was changed and says so', async () => {
    const { api } = await open();
    await screen.findByRole('header', { name: 'Lena' });

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Leni');
    await fireEvent.press(screen.getByRole('tab', { name: 'Teaching' }));
    await fireEvent.press(screen.getByRole('radio', { name: /^Not at all/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved')).toBeTruthy();
    // The studio saves the partner as a whole, as it stands on screen.
    expect(changed(api)).toEqual([
      [
        LENA.id,
        {
          ...draftOf(LENA),
          name: 'Leni',
          teaching: { ...LENA.teaching, correctionTiming: 'off' },
        },
      ],
    ]);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('header', { name: 'Leni' })).toBeTruthy();
  });

  it('has Today and Talk read the partners again after a change', async () => {
    const { api } = await open();
    await screen.findByRole('header', { name: 'Lena' });

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Leni');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.calls.some(([method]) => method === 'getHome')).toBe(true));
  });

  it('does not save a partner who lost their name', async () => {
    const { api } = await open();
    await screen.findByRole('header', { name: 'Lena' });

    await fireEvent.changeText(screen.getByLabelText('Name'), ' ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('Give them a name.')).toBeTruthy();
    expect(changed(api)).toEqual([]);
  });

  it('says so when the change could not be saved, and keeps it on screen', async () => {
    const { api } = await open();
    await screen.findByRole('header', { name: 'Lena' });
    api.failNext('changePersona', 'network');

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Leni');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/Can’t reach Konvami/)).toBeTruthy();
    expect(screen.getByLabelText('Name')).toHaveProp('value', 'Leni');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('says so when the partner is no longer there', async () => {
    await open('aaaaaaaa-aaaa-4aaa-8aaa-999999999999');

    expect(await screen.findByText('This partner is no longer there.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('stops a sample that is playing when the learner leaves', async () => {
    const { device } = await open();
    await screen.findByRole('header', { name: 'Lena' });
    await fireEvent.press(screen.getByRole('tab', { name: 'Voice' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Play Cedar' }));
    await screen.findByRole('button', { name: 'Stop Cedar' });

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(device.playing).toBeNull();
    expect(router.back).toHaveBeenCalled();
  });
});
