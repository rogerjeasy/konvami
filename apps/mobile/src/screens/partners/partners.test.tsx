import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { blankDraft } from '@/profile/persona-draft';
import {
  createFakeApi,
  FAKE_DRAFT,
  FAKE_PERSONAS,
  FAKE_TEMPLATES,
  type FakeApi,
} from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { PartnersScreen } from '.';
import { NewPartnerScreen } from './new';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

const [LENA, JONAS] = FAKE_PERSONAS as [(typeof FAKE_PERSONAS)[0], (typeof FAKE_PERSONAS)[0]];
const WISH = 'A friendly woman from Hamburg who works in marketing';

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

describe('6.4 My partners', () => {
  async function open(api: FakeApi = inApp()) {
    const view = await renderScreen(<PartnersScreen />, { api, signedIn: true });
    await screen.findByText('Lena');
    return { api, view };
  }

  const more = (name: string) =>
    fireEvent.press(screen.getByRole('button', { name: `More for ${name}` }));

  it('lists the partners with who they are and how many there may be', async () => {
    await open();

    expect(screen.getByRole('header', { name: 'My partners' })).toBeTruthy();
    expect(screen.getByText('Friend')).toBeTruthy();
    expect(screen.getByText('27 · Berlin')).toBeTruthy();
    expect(screen.getByText('Easy chats about everyday life.')).toBeTruthy();
    expect(screen.getByText('Jonas')).toBeTruthy();
    expect(screen.getByText('Clear explanations and plenty of patience.')).toBeTruthy();
    expect(screen.getByText('2 of 12')).toBeTruthy();
  });

  it('opens a partner in Persona Studio', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit Lena' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/account/partners/[id]',
      params: { id: LENA.id },
    });
  });

  it('starts a conversation from a partner’s menu', async () => {
    await open();

    await more('Jonas');
    await fireEvent.press(await screen.findByRole('button', { name: 'Talk' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/call/[personaId]',
      params: { personaId: JONAS.id },
    });
  });

  it('makes a copy of a partner', async () => {
    const { api } = await open();

    await more('Lena');
    await fireEvent.press(await screen.findByRole('button', { name: 'Make a copy' }));

    expect(await screen.findByText('Lena 2')).toBeTruthy();
    expect(screen.getByText('Lena 2 was added.')).toBeTruthy();
    expect(screen.getByText('3 of 12')).toBeTruthy();
    expect((await api.getPersonas()).map(({ name }) => name)).toEqual(['Lena', 'Jonas', 'Lena 2']);
  });

  it('removes a partner only after the learner confirms', async () => {
    const { api } = await open();

    await more('Lena');
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('header', { name: 'Remove Lena?' })).toBeTruthy();
    expect(screen.getByText('Your conversations with Lena stay in your library.')).toBeTruthy();
    expect((await api.getPersonas()).length).toBe(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByText('27 · Berlin')).toBeNull());
    expect((await api.getPersonas()).map(({ name }) => name)).toEqual(['Jonas']);
  });

  it('keeps a partner when the learner changes their mind', async () => {
    const { api } = await open();

    await more('Lena');
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Keep' }));

    expect((await api.getPersonas()).length).toBe(2);
  });

  it('does not let the last partner go', async () => {
    const api = inApp();
    await api.removePersona(JONAS.id);
    await open(api);

    await more('Lena');

    expect(await screen.findByText('You need at least one partner to talk to.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('leads to making a new partner', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'New partner' }));

    expect(router.push).toHaveBeenCalledWith('/account/partners/new');
  });

  it('says so when there is no room for another partner', async () => {
    const api = inApp();
    for (let number = 0; number < 10; number += 1) {
      await api.createPersona({ ...FAKE_DRAFT, name: `Greta ${number}` });
    }

    await open(api);

    expect(screen.getByText('12 of 12')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New partner' })).toBeDisabled();
    expect(screen.getByText(/You have twelve partners/)).toBeTruthy();
  });

  it('offers to try again when the partners could not be loaded', async () => {
    const api = inApp();
    api.failNext('getPersonas', 'network');
    await renderScreen(<PartnersScreen />, { api, signedIn: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Lena')).toBeTruthy();
  });

  it('says so when a change did not go through', async () => {
    const { api } = await open();
    api.failNext('duplicatePersona', 'network');

    await more('Lena');
    await fireEvent.press(await screen.findByRole('button', { name: 'Make a copy' }));

    expect(await screen.findByText(/Can’t reach Konvami/)).toBeTruthy();
  });
});

describe('6.5 New partner', () => {
  async function open(api: FakeApi = inApp()) {
    const view = await renderScreen(<NewPartnerScreen />, { api, signedIn: true });
    await screen.findByRole('header', { name: 'Who do you want to talk to?' });
    return { api, view };
  }

  it('has a partner written from a description and opens the studio on the draft', async () => {
    const { api, view } = await open();
    expect(screen.getByRole('button', { name: 'Write my partner' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Your description'), `  ${WISH} `);
    await fireEvent.press(screen.getByRole('button', { name: 'Write my partner' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/account/partners/studio'));
    expect(api.calls.find(([method]) => method === 'draftPersona')).toEqual(['draftPersona', WISH]);
    expect(view.profile.studioStart.get()).toEqual(FAKE_DRAFT);
    // Nothing is saved until the learner has reviewed the draft.
    expect((await api.getPersonas()).length).toBe(2);
  });

  it('asks for more than a word or two', async () => {
    await open();

    await fireEvent.changeText(screen.getByLabelText('Your description'), 'A woman');

    expect(screen.getByRole('button', { name: 'Write my partner' })).toBeDisabled();
  });

  it('says that the partner is being written while it waits', async () => {
    const { api } = await open();
    const release = api.hold('draftPersona');

    await fireEvent.changeText(screen.getByLabelText('Your description'), WISH);
    // The press is over once the draft has arrived, so it is not awaited before looking.
    const pressed = fireEvent.press(screen.getByRole('button', { name: 'Write my partner' }));

    expect(await screen.findByRole('button', { name: 'Writing your partner…' })).toBeBusy();
    await act(async () => {
      release();
      await pressed;
    });
    expect(router.push).toHaveBeenCalledWith('/account/partners/studio');
  });

  it.each([
    ['draft_limit', /You’ve had twenty partners written today/],
    ['writer_unavailable', /I couldn’t write a partner just now/],
    ['network', /Can’t reach Konvami/],
  ])('explains a draft that failed with %s and stays', async (code, message) => {
    const { api, view } = await open();
    api.failNext('draftPersona', code);

    await fireEvent.changeText(screen.getByLabelText('Your description'), WISH);
    await fireEvent.press(screen.getByRole('button', { name: 'Write my partner' }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(view.profile.studioStart.get()).toBeNull();
    expect(screen.getByLabelText('Your description')).toHaveProp('value', WISH);
  });

  it('offers the ready-made partners of the language', async () => {
    const { view } = await open();

    expect(await screen.findByRole('button', { name: 'Start from Mara' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start from Frau Weber' }));

    expect(router.push).toHaveBeenCalledWith('/account/partners/studio');
    expect(view.profile.studioStart.get()).toEqual(FAKE_TEMPLATES[2]);
  });

  it('goes on without ready-made partners when they cannot be loaded', async () => {
    const api = inApp();
    api.failNext('getPersonaTemplates', 'network');

    await open(api);

    expect(await screen.findByText('The ready-made partners couldn’t be loaded.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start from scratch' })).toBeEnabled();
  });

  it('lets the learner build a partner from scratch', async () => {
    const { view } = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Start from scratch' }));

    expect(router.push).toHaveBeenCalledWith('/account/partners/studio');
    expect(view.profile.studioStart.get()).toEqual(blankDraft());
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<NewPartnerScreen />);

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});
