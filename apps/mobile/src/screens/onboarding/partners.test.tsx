import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_PERSONAS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { PartnerEditScreen } from './partner-edit';
import { PartnersScreen } from './partners';
import { ReadyScreen } from './ready';

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

const NETWORK = 'Can’t reach Konvami. Check your connection and try again.';
const [LENA, JONAS] = FAKE_PERSONAS as [(typeof FAKE_PERSONAS)[0], (typeof FAKE_PERSONAS)[0]];

/** An API whose learner has settled their level and is choosing partners. */
function atPartners({ exam = false } = {}): FakeApi {
  const api = createFakeApi();
  api.advanceTo('partners');
  if (exam) api.answer([{ field: 'exam', value: { type: 'goethe', target_level: 'B1' } }]);
  return api;
}

describe('4.7 Starter partners', () => {
  async function open(api: FakeApi = atPartners()) {
    await renderScreen(<PartnersScreen />, { api, signedIn: true });
    await screen.findByRole('header', { name: 'Meet your partners' });
    await screen.findByText('Lena');
    return api;
  }

  it('says that partners are being chosen while they load', async () => {
    const api = atPartners();
    const release = api.hold('proposeStarterPersonas');
    await renderScreen(<PartnersScreen />, { api, signedIn: true });

    expect(await screen.findByText('Choosing partners for your goals')).toBeTruthy();
    release();

    expect(await screen.findByText('Lena')).toBeTruthy();
  });

  it('introduces each partner: who they are, their role and what talking with them is like', async () => {
    await open();

    expect(screen.getByText('27 · Berlin')).toBeTruthy();
    expect(screen.getByText('Friend')).toBeTruthy();
    // A built-in partner has no line of her own: the role's line stands in.
    expect(screen.getByText('Easy chats about everyday life.')).toBeTruthy();
    expect(screen.getByText('34 · Zürich')).toBeTruthy();
    expect(screen.getByText('Teacher')).toBeTruthy();
    expect(screen.getByText('Clear explanations and plenty of patience.')).toBeTruthy();
    expect(screen.queryByText('Frau Weber')).toBeNull();
  });

  it('adds an exam coach for a learner who is preparing an exam', async () => {
    await open(atPartners({ exam: true }));

    expect(screen.getByText('Frau Weber')).toBeTruthy();
    expect(screen.getByText('Exam coach')).toBeTruthy();
  });

  it('opens a partner for editing', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit Lena' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/onboarding/partners/[id]',
      params: { id: LENA.id },
    });
  });

  it('asks before removing a partner, and keeps them when the learner changes their mind', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove Lena' }));
    expect(screen.getByText('Remove Lena?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));

    expect(screen.queryByText('Remove Lena?')).toBeNull();
    expect(api.calls.map(([method]) => method)).not.toContain('removePersona');
  });

  it('removes a partner once confirmed, and never offers to remove the last one', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove Lena' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() => expect(screen.queryByText('Lena')).toBeNull());
    expect(api.calls).toContainEqual(['removePersona', LENA.id]);
    expect(screen.getByText('Jonas')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Jonas' })).toBeNull();
  });

  it('says so when a partner cannot be removed', async () => {
    const api = await open();
    api.failNext('removePersona', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove Lena' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, remove' }));

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    expect(screen.getByText('Lena')).toBeTruthy();
  });

  it('confirms the partners and moves on', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/ready'));
    expect(api.calls).toContainEqual(['confirmPartners']);
  });

  it('says so when confirming fails, and stays', async () => {
    const api = await open();
    api.failNext('confirmPartners', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('offers to try again when the partners cannot be loaded', async () => {
    const api = atPartners();
    api.failNext('proposeStarterPersonas', 'network');
    await renderScreen(<PartnersScreen />, { api, signedIn: true });

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Lena')).toBeTruthy();
  });

  it('sends a learner who is somewhere else in onboarding there', async () => {
    const api = createFakeApi();
    api.advanceTo('placement');
    await renderScreen(<PartnersScreen />, { api, signedIn: true });

    expect(await screen.findByText('redirect:/onboarding/placement')).toBeTruthy();
  });
});

describe('4.7 Edit a partner', () => {
  async function open(id: string = LENA.id, api: FakeApi = atPartners()) {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id });
    await renderScreen(<PartnerEditScreen />, { api, signedIn: true });
    await waitFor(() => expect(screen.queryByText('Getting things ready')).toBeNull());
    return api;
  }
  /** The choices for one part of the look (a radio group named after the part). */
  const group = (name: string) => screen.getByLabelText(name);

  it('shows the partner’s name and look as they are', async () => {
    await open();

    expect(await screen.findByDisplayValue('Lena')).toBeTruthy();
    expect(within(group('Hair')).getByRole('radio', { name: 'Bob' })).toBeChecked();
    expect(within(group('Skin')).getByRole('radio', { name: 'Sand' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Glasses' })).not.toBeChecked();
  });

  it('saves a new name and look, then goes back', async () => {
    const api = await open();

    await fireEvent.changeText(await screen.findByDisplayValue('Lena'), ' Leni ');
    await fireEvent.press(within(group('Hair')).getByRole('radio', { name: 'Curls' }));
    await fireEvent.press(within(group('Top')).getByRole('radio', { name: 'Amber' }));
    await fireEvent.press(screen.getByRole('switch', { name: 'Glasses' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(api.calls).toContainEqual([
      'changePersona',
      LENA.id,
      { name: 'Leni', look: { ...LENA.look, hair: 'curls', top: 'amber', glasses: true } },
    ]);
  });

  it('needs a name', async () => {
    await open();

    await fireEvent.changeText(await screen.findByDisplayValue('Lena'), '  ');

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says so when saving fails and keeps the changes on screen', async () => {
    const api = await open();
    api.failNext('changePersona', 'network');

    await fireEvent.changeText(await screen.findByDisplayValue('Lena'), 'Leni');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    expect(screen.getByDisplayValue('Leni')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('offers a beard and glasses as switches', async () => {
    await open(JONAS.id);

    await screen.findByDisplayValue('Jonas');
    expect(screen.getByRole('switch', { name: 'Beard' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Glasses' })).toBeChecked();
  });

  it('goes back to the partners when the partner does not exist', async () => {
    await open('00000000-0000-4000-8000-000000000000');

    expect(await screen.findByText('redirect:/onboarding/partners')).toBeTruthy();
  });
});

describe('4.8 Ready', () => {
  function atReady(): FakeApi {
    const api = createFakeApi();
    api.advanceTo('ready');
    return api;
  }

  async function open(api: FakeApi = atReady()) {
    await renderScreen(<ReadyScreen />, { api, signedIn: true });
    await screen.findByRole('header', { name: 'You’re ready, Amara' });
    return api;
  }

  it('sums up what was set up', async () => {
    await open();

    expect(screen.getByText('German')).toBeTruthy();
    expect(screen.getByText('A2 · Elementary')).toBeTruthy();
    expect(screen.getByText('Your estimate')).toBeTruthy();
    expect(await screen.findByText('Lena, Jonas')).toBeTruthy();
  });

  it('says that the level was measured when it comes from the test', async () => {
    const api = createFakeApi();
    api.advanceTo('placement');
    api.assess('decided');
    api.advanceTo('ready');
    await open(api);

    expect(screen.getByText('B1 · Intermediate')).toBeTruthy();
    expect(screen.getByText('Measured')).toBeTruthy();
  });

  it('completes onboarding and enters the app', async () => {
    const api = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Start practising' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    expect(api.calls).toContainEqual(['completeOnboarding']);
  });

  it('says so when that fails, and stays', async () => {
    const api = await open();
    api.failNext('completeOnboarding', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'Start practising' }));

    expect(await screen.findByText(NETWORK)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sends a learner who is somewhere else in onboarding there', async () => {
    const api = createFakeApi();
    api.advanceTo('partners');
    await renderScreen(<ReadyScreen />, { api, signedIn: true });

    expect(await screen.findByText('redirect:/onboarding/partners')).toBeTruthy();
  });
});
