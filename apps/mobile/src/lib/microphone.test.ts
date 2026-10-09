import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { askForMicrophone, microphoneAllowed } from './microphone';

const permission = (granted: boolean) =>
  ({ granted, canAskAgain: true, status: granted ? 'granted' : 'denied' }) as never;

beforeEach(() => jest.clearAllMocks());

describe('microphone', () => {
  it('knows the microphone is allowed without asking again', async () => {
    jest.mocked(getRecordingPermissionsAsync).mockResolvedValueOnce(permission(true));
    expect(await microphoneAllowed()).toBe(true);
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  it('knows the microphone is not allowed yet', async () => {
    expect(await microphoneAllowed()).toBe(false);
  });

  it('counts a failed check as not allowed', async () => {
    jest.mocked(getRecordingPermissionsAsync).mockRejectedValueOnce(new Error('no audio'));
    expect(await microphoneAllowed()).toBe(false);
  });

  it('asks the system and reports the answer', async () => {
    expect(await askForMicrophone()).toBe(true);
    jest.mocked(requestRecordingPermissionsAsync).mockResolvedValueOnce(permission(false));
    expect(await askForMicrophone()).toBe(false);
  });

  it('counts a failed request as refused', async () => {
    jest.mocked(requestRecordingPermissionsAsync).mockRejectedValueOnce(new Error('no audio'));
    expect(await askForMicrophone()).toBe(false);
  });
});
