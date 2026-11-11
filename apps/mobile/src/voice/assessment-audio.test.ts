import { TurboModuleRegistry } from 'react-native';
import { assessmentAudio } from './assessment-audio';

const mockClose = jest.fn(async () => {});
const mockDecode = jest.fn(async (..._args: unknown[]) => ({
  numberOfChannels: 1,
  sampleRate: 16000,
  duration: 0.1,
  getChannelData: () => new Float32Array(1600),
}));
jest.mock('react-native-audio-api', () => ({
  AudioContext: jest.fn(() => ({
    decodeAudioData: (...args: unknown[]) => mockDecode(...args),
    close: mockClose,
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({});
});
afterEach(() => jest.restoreAllMocks());
it('converts the existing local recording and closes the decoder', async () => {
  const result = await assessmentAudio({
    base64: 'original',
    uri: 'file:///voice.m4a',
    durationMs: 100,
    format: 'm4a',
  });
  expect(mockDecode).toHaveBeenCalledWith('file:///voice.m4a');
  expect(result.format).toBe('wav');
  expect(atob(result.base64).slice(0, 4)).toBe('RIFF');
  expect(result.uri).toBe('file:///voice.m4a');
  expect(mockClose).toHaveBeenCalled();
});
it('releases native resources when decoding fails', async () => {
  mockDecode.mockRejectedValueOnce(new Error('invalid'));
  await expect(
    assessmentAudio({ base64: '', uri: 'file:///bad', format: 'm4a', durationMs: 1 }),
  ).rejects.toThrow('invalid');
  expect(mockClose).toHaveBeenCalled();
});
