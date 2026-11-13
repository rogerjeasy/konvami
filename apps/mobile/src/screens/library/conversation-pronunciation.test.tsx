import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Button } from '@/components/button';
import { createFakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { assessmentAudio } from '@/voice/assessment-audio';
import { ConversationPronunciation } from './conversation-pronunciation';

jest.mock('@/voice/assessment-audio', () => ({
  canAssessAudio: () => true,
  assessmentAudio: jest.fn(async (url) => ({
    uri: url,
    format: 'wav',
    base64: 'AAEC',
    durationMs: 2000,
  })),
}));
beforeEach(() => jest.clearAllMocks());

it('does not send an old recording after navigating to another conversation', async () => {
  const api = createFakeApi();
  api.enterApp();
  const original = api.getPronunciationSounds.bind(api);
  jest.spyOn(api, 'getPronunciationSounds').mockImplementation(async () => ({
    ...(await original()),
    assessmentProvider: 'Test speech',
  }));
  let release!: () => void;
  jest.mocked(assessmentAudio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({ uri: 'old.wav', format: 'wav', base64: 'AAEC', durationMs: 2000 });
      }),
  );
  function Recordings() {
    const [call, setCall] = useState('old');
    return (
      <>
        <ConversationPronunciation
          callId={call}
          turn={1}
          audio={{ url: 'https://files.test/turn.wav', milliseconds: 2000 }}
        />
        <Button label="Next recording" onPress={() => setCall('next')} />
      </>
    );
  }
  await renderScreen(<Recordings />, { api, signedIn: true });
  await fireEvent.press(await screen.findByRole('button', { name: 'Assess this recording' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send and assess' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next recording' }));
  await act(async () => release());
  expect(api.calls.some(([operation]) => operation === 'assessConversationPronunciation')).toBe(
    false,
  );
  expect(screen.queryByText('Accuracy: 80 / 100')).toBeNull();
});

it('opens a consent explanation without sending audio, then assesses only after the explicit action', async () => {
  const api = createFakeApi();
  api.enterApp();
  const original = api.getPronunciationSounds.bind(api);
  jest
    .spyOn(api, 'getPronunciationSounds')
    .mockImplementation(async () => ({ ...(await original()), assessmentProvider: 'Test speech' }));
  await renderScreen(
    <ConversationPronunciation
      callId="call"
      turn={1}
      audio={{ url: 'https://files.test/turn.wav', milliseconds: 2000 }}
    />,
    { api, signedIn: true },
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Assess this recording' }));
  expect(screen.getByText(/Send this recording to Test speech/)).toBeTruthy();
  expect(assessmentAudio).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Send and assess' }));
  expect(await screen.findByText('Accuracy: 80 / 100')).toBeTruthy();
  expect(api.calls).toContainEqual([
    'assessConversationPronunciation',
    'call',
    1,
    expect.objectContaining({
      assessmentConsent: true,
      recording: expect.objectContaining({ format: 'wav' }),
    }),
  ]);
});
