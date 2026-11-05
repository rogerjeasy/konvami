import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authErrorCode, generalErrorKey, useAuthServices, useSession } from '@/auth';
import { NO_OPTIONAL_PROVIDERS, agreedToElevenLabs, consentNamesElevenLabs } from '@/auth/consent';
import { usePremiumVoices, useProfileServices } from './services';

/**
 * The learner's choice about ElevenLabs reading text aloud (consent text v3, spec §6.19), for the
 * screens that change it after sign-up (6.7 Privacy and AI, 6.21 Read-aloud voice).
 *
 * `offered` is false until the server says ElevenLabs is set up: until then nobody is asked about
 * it. A change is written to the account at once and the server's view is read again, because
 * the server reads the consent from the account when it speaks.
 */
export function useElevenLabsConsent() {
  const { t } = useTranslation();
  const { premium } = useProfileServices();
  const state = usePremiumVoices();
  const { session } = useAuthServices();
  const { user } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void premium.load();
  }, [premium]);

  const set = useCallback(
    async (on: boolean) => {
      setSaving(true);
      setError(null);
      try {
        await session.saveAiConsent({ ...NO_OPTIONAL_PROVIDERS, elevenlabs: on });
        await premium.refresh();
      } catch (failure) {
        setError(t(generalErrorKey(authErrorCode(failure))));
      } finally {
        setSaving(false);
      }
    },
    [session, premium, t],
  );

  return {
    offered: state.phase === 'ready' && state.data.offered,
    on: agreedToElevenLabs(user?.aiConsent),
    // False for someone who agreed before ElevenLabs was named: they are asked now.
    seen: consentNamesElevenLabs(user?.aiConsent),
    saving,
    error,
    set,
  };
}
