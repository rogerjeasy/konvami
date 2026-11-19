import { collectedDataTypes, optionalServicesFrom } from './privacy-manifest';

const NONE = { crashReports: false, analytics: false, purchases: false };

function types(services = NONE) {
  return collectedDataTypes(services).map((t) =>
    t.NSPrivacyCollectedDataType.replace('NSPrivacyCollectedDataType', ''),
  );
}

describe('the iOS privacy manifest', () => {
  it('declares the nine types every build collects, for the app, never for tracking', () => {
    expect(types()).toEqual([
      'EmailAddress',
      'Name',
      'UserID',
      'DeviceID',
      'PhotosorVideos',
      'AudioData',
      'OtherUserContent',
      'OtherDataTypes',
      'ProductInteraction',
    ]);
    for (const type of collectedDataTypes(NONE)) {
      expect(type.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(type.NSPrivacyCollectedDataTypePurposes).toEqual([
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
      ]);
    }
  });

  it('adds unlinked crash data only to a build with crash reports', () => {
    const crash = collectedDataTypes({ ...NONE, crashReports: true }).find(
      (t) => t.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeCrashData',
    );
    expect(crash?.NSPrivacyCollectedDataTypeLinked).toBe(false);
  });

  it('adds analytics as a purpose of product interaction, once', () => {
    const list = collectedDataTypes({ ...NONE, analytics: true });
    const interaction = list.filter((t) =>
      t.NSPrivacyCollectedDataType.endsWith('ProductInteraction'),
    );
    expect(interaction).toHaveLength(1);
    expect(interaction[0]?.NSPrivacyCollectedDataTypePurposes).toContain(
      'NSPrivacyCollectedDataTypePurposeAnalytics',
    );
  });

  it('adds the purchase history only to a build that can sell', () => {
    expect(types({ ...NONE, purchases: true })).toContain('PurchaseHistory');
    expect(types()).not.toContain('PurchaseHistory');
  });

  it('reads which services a build carries from its keys', () => {
    expect(optionalServicesFrom({})).toEqual(NONE);
    expect(
      optionalServicesFrom({
        EXPO_PUBLIC_SENTRY_DSN: 'https://key@o0.ingest.de.sentry.io/1',
        EXPO_PUBLIC_POSTHOG_KEY: ' ',
        EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_x',
      }),
    ).toEqual({ crashReports: true, analytics: false, purchases: true });
  });
});
