import { NativeModules } from 'react-native';

import { createPlatformRtcSession } from './rtc.native';

// Loading the library without its native module is what crashes Expo Go, so the stand-in counts
// how often it is loaded.
let loads = 0;
jest.mock('react-native-webrtc', () => {
  loads += 1;
  return {
    RTCPeerConnection: class {
      createDataChannel = () => ({ addEventListener: jest.fn(), close: jest.fn() });
    },
    mediaDevices: { getUserMedia: jest.fn() },
  };
});

const modules = NativeModules as Record<string, unknown>;

describe('createPlatformRtcSession (iOS and Android)', () => {
  beforeEach(() => {
    loads = 0;
    jest.resetModules();
  });
  afterEach(() => {
    delete modules.WebRTCModule;
  });

  it('makes no session and never loads the library in a build without the native module', () => {
    delete modules.WebRTCModule;

    expect(createPlatformRtcSession()).toBeNull();
    expect(loads).toBe(0);
  });

  it('makes a session in a build that has the native module', () => {
    modules.WebRTCModule = {};

    expect(createPlatformRtcSession()).not.toBeNull();
    expect(loads).toBe(1);
  });
});
