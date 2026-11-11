import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, FAKE_IMPORT, type FakeApi } from '@/test/fake-api';
import { createFakeImportPhotos, type FakeImportPhotos } from '@/test/fake-import-photos';
import { renderScreen } from '@/test/render';
import { ImportScreen } from '.';
import { ImportResultScreen } from './result';

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

function inApp(): FakeApi {
  const api = createFakeApi();
  api.enterApp();
  return api;
}

async function openImport(
  api: FakeApi = inApp(),
  photos: FakeImportPhotos = createFakeImportPhotos(),
) {
  await renderScreen(<ImportScreen />, { api, photos, signedIn: true });
  await screen.findByRole('header', { name: 'Bring your own material' });
  await waitFor(() => expect(screen.queryByText('Opening your imports')).toBeNull());
  return { api, photos };
}

const TEXT = 'Sehr geehrter Herr Amara, bitte bringen Sie bis zum 15. März Ihren Mietvertrag mit.';

describe('5.23 Import', () => {
  it('invites a first import and asks for something to work with', async () => {
    await openImport();

    expect(screen.getByText('Nothing brought yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Work it out' })).toBeDisabled();
  });

  it('works out a pasted text and opens the result', async () => {
    const { api } = await openImport();

    await fireEvent.changeText(screen.getByLabelText('Your text'), TEXT);
    await fireEvent.press(screen.getByRole('button', { name: 'Work it out' }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/import/[id]',
        params: { id: 'import_1' },
      }),
    );
    expect(api.calls).toContainEqual([
      'createImport',
      { kind: 'text', text: TEXT, textbook: null, chapter: null },
    ]);
  });

  it('names the textbook and chapter the material is from', async () => {
    const { api } = await openImport();

    await fireEvent.changeText(screen.getByLabelText('Your text'), TEXT);
    await fireEvent.changeText(screen.getByLabelText('Textbook'), ' Menschen A2 ');
    await fireEvent.changeText(screen.getByLabelText('Chapter'), 'Lektion 5');
    await fireEvent.press(screen.getByRole('button', { name: 'Work it out' }));

    await waitFor(() =>
      expect(api.calls).toContainEqual([
        'createImport',
        { kind: 'text', text: TEXT, textbook: 'Menschen A2', chapter: 'Lektion 5' },
      ]),
    );
  });

  it('works out a web address', async () => {
    const { api } = await openImport();

    await fireEvent.press(screen.getByRole('radio', { name: 'Link' }));
    await fireEvent.changeText(screen.getByLabelText('Web address'), 'https://example.org/a');
    await fireEvent.press(screen.getByRole('button', { name: 'Work it out' }));

    await waitFor(() =>
      expect(api.calls).toContainEqual([
        'createImport',
        { kind: 'link', url: 'https://example.org/a', textbook: null, chapter: null },
      ]),
    );
  });

  it('sends a photo with the server’s form, then works it out', async () => {
    const { api, photos } = await openImport();

    await fireEvent.press(screen.getByRole('radio', { name: 'Photo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(photos.sent).toHaveLength(1);
    expect(photos.sent[0]?.upload.uploadId).toBe('upload_1');
    expect(api.calls).toContainEqual([
      'createImport',
      { kind: 'photo', uploadId: 'upload_1', textbook: null, chapter: null },
    ]);
  });

  it('takes a camera photo through the same private import pipeline', async () => {
    const { api, photos } = await openImport();
    await fireEvent.press(screen.getByRole('radio', { name: 'Camera' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
    await waitFor(() => expect(photos.sent).toHaveLength(1));
    expect(api.calls).toContainEqual([
      'createImport',
      {
        kind: 'photo',
        uploadId: 'upload_1',
        textbook: null,
        chapter: null,
      },
    ]);
  });

  it('does nothing when the photo picker is closed', async () => {
    const { api, photos } = await openImport();
    photos.picks({ status: 'cancelled' });

    await fireEvent.press(screen.getByRole('radio', { name: 'Photo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Choose a photo' })).toBeEnabled(),
    );
    expect(api.calls.some(([method]) => method === 'startImportUpload')).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says so when a photo cannot be read or sent', async () => {
    const { photos } = await openImport();

    await fireEvent.press(screen.getByRole('radio', { name: 'Photo' }));
    photos.picks({ status: 'failed' });
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));
    expect(await screen.findByText('That photo couldn’t be read. Try another one.')).toBeTruthy();

    photos.picks({ status: 'picked', picture: { uri: 'file:///page.jpg' } });
    photos.failNextSend();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));
    expect(await screen.findByText(/connection|network/i)).toBeTruthy();
  });

  it.each([
    ['not_in_language', 'That isn’t in the language you’re learning.'],
    ['blocked', 'That address can’t be opened.'],
    ['import_limit', 'You’ve asked a lot today. Imports are back tomorrow.'],
    ['too_many', 'You’ve brought a lot. Remove one to bring something new.'],
    ['consent_required', /needs your agreement/],
  ])('explains a refusal (%s)', async (code, message) => {
    const { api } = await openImport();
    api.failNext('createImport', code);

    await fireEvent.changeText(screen.getByLabelText('Your text'), TEXT);
    await fireEvent.press(screen.getByRole('button', { name: 'Work it out' }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('lists what was brought earlier, with what each holds, and opens one', async () => {
    const api = inApp();
    api.broughtImports([{ textbook: 'Menschen A2', chapter: 'Lektion 5' }]);
    await openImport(api);

    expect(screen.getByText('Brief vom Amt')).toBeTruthy();
    expect(
      screen.getByText('Letter · A2 · 2 words to learn · Menschen A2, Lektion 5'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Brief vom Amt' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/import/[id]',
      params: { id: 'import_1' },
    });
  });
});

describe('5.23 One import worked out', () => {
  async function openResult(api: FakeApi = inApp(), item: Partial<typeof FAKE_IMPORT> = {}) {
    api.broughtImports([item]);
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'import_1' });
    await renderScreen(<ImportResultScreen />, { api, signedIn: true });
    await screen.findByRole('header', { name: 'Brief vom Amt' });
    return api;
  }

  it('shows what it is, the words, the grammar and the hard sentences', async () => {
    await openResult(inApp(), { textbook: 'Menschen A2', chapter: 'Lektion 5' });

    expect(screen.getByText('Level A2')).toBeTruthy();
    expect(screen.getByText('From Menschen A2, Lektion 5')).toBeTruthy();
    expect(screen.getByText(/bring your rental contract by 15 March/)).toBeTruthy();
    expect(screen.getByText('der Mietvertrag')).toBeTruthy();
    expect(screen.getByText('Polite imperative')).toBeTruthy();
    expect(screen.getByText('Bitte bringen Sie … mit.')).toBeTruthy();
    expect(screen.getByText(FAKE_IMPORT.text)).toBeTruthy();
  });

  it('drafts an editable reply without sending it', async () => {
    const api = await openResult();
    await fireEvent.press(screen.getByRole('button', { name: 'Draft a written reply' }));
    await waitFor(() => expect(api.calls).toContainEqual(['draftImportReply', 'import_1']));
    const editor = await screen.findByLabelText('Reply draft');
    await fireEvent.changeText(editor, 'Meine eigene Antwort');
    expect(screen.getByDisplayValue('Meine eigene Antwort')).toBeTruthy();
  });

  it('says what a letter asks and what to do', async () => {
    await openResult();

    expect(screen.getByText('From Das Einwohnermeldeamt')).toBeTruthy();
    expect(screen.getByText('You must bring your rental contract.')).toBeTruthy();
    expect(screen.getByText('• Bring the contract by 15 March')).toBeTruthy();
    expect(screen.getByText('A reply or a call has to: Agree on an appointment.')).toBeTruthy();
  });

  it('saves a word as a flashcard, once', async () => {
    const api = await openResult();

    await fireEvent.press(screen.getByRole('button', { name: 'Save “mitbringen” as a card' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save “mitbringen” as a card' })).toBeNull(),
    );
    expect(api.calls).toContainEqual(['makeImportWordCard', { id: 'import_1', index: 1 }]);
    expect(screen.getAllByText('In your cards')).toHaveLength(1);
  });

  it('talks it over with the partner Today suggests', async () => {
    await openResult();

    await fireEvent.press(await screen.findByRole('button', { name: 'Talk about this' }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/call/[personaId]',
        params: { personaId: expect.any(String), practise: 'import:import_1'.replace(/-/g, '') },
      }),
    );
  });

  it('rehearses the reply to a letter', async () => {
    await openResult();

    await fireEvent.press(await screen.findByRole('button', { name: 'Practise the reply' }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/call/[personaId]',
        params: { personaId: expect.any(String), practise: 'letter:import_1' },
      }),
    );
  });

  it('offers no reply to rehearse for something that is no letter', async () => {
    await openResult(inApp(), { genre: 'menu', letter: null });

    expect(screen.getByRole('button', { name: 'Talk about this' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Practise the reply' })).toBeNull();
    expect(screen.queryByText('The letter')).toBeNull();
  });

  it('removes it and goes back', async () => {
    const api = await openResult();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove “Brief vom Amt”' }));

    await waitFor(() => expect(api.calls).toContainEqual(['removeImport', 'import_1']));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('says so when it is gone', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'nothing' });
    await renderScreen(<ImportResultScreen />, { api: inApp(), signedIn: true });

    expect(await screen.findByText('This one is gone.')).toBeTruthy();
  });
});

describe('document imports', () => {
  it.each([
    ['PDF', 'pdf', 'application/pdf'],
    ['MP3 audio', 'audio', 'audio/mpeg'],
  ] as const)(
    'uploads a %s through the private upload form and releases its local copy',
    async (label, kind, type) => {
      const api = inApp();
      const document = { uri: 'file:///cache/material', type };
      const documents = {
        pick: jest.fn(async () => document),
        send: jest.fn(async () => {}),
        release: jest.fn(async () => {}),
      };
      await renderScreen(<ImportScreen />, { api, signedIn: true, documents });
      await fireEvent.press(await screen.findByRole('radio', { name: label }));
      await fireEvent.press(screen.getByRole('button', { name: 'Choose a file' }));
      await waitFor(() => expect(documents.release).toHaveBeenCalledWith(document));
      expect(documents.pick).toHaveBeenCalledWith(kind);
      expect(documents.send).toHaveBeenCalledTimes(1);
      expect(api.calls).toContainEqual(['createImport', expect.objectContaining({ kind })]);
    },
  );
});
