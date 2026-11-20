import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HalvesCase } from '@konvami/api-client';
import { Badge } from '@/components/badge';
import { Text } from '@/components/text';

/** The other player: their codename (or the stand-in's name, with the AI chip) and place. */
export function PartnerLine({ partner }: { partner: HalvesCase['partner'] }) {
  const { t } = useTranslation();
  const place = partner.place?.split(':')[1];
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="labelMedium">{t('halves.case.against', { name: partner.name })}</Text>
      {partner.ai ? <Badge label={t('halves.ai')} tone="chip" /> : null}
      {place ? (
        <Text variant="small" tone="muted">
          {place}
        </Text>
      ) : null}
    </View>
  );
}

/** A language's name as the interface writes it. */
export function useLanguageName() {
  const { t } = useTranslation();
  return (code: string) => t(`onboarding.languages.${code}`, { defaultValue: code.toUpperCase() });
}

const KNOWN = [
  'too_short',
  'too_long',
  'limit',
  'consent_required',
  'not_your_turn',
  'unavailable',
] as const;

/** The message for a move that could not be sent (7.6). */
export function recordFailureKey(code: string) {
  const known = KNOWN.find((one) => one === code) ?? 'unavailable';
  return `halves.record.failed.${known}` as const;
}

const GENERAL = [
  'unavailable',
  'too_many_cases',
  'paused',
  'suspended',
  'no_language',
  'consent_required',
] as const;

/** The message for anything else Two Halves refused. */
export function failureKey(code: string) {
  const known = GENERAL.find((one) => one === code) ?? 'unavailable';
  return `halves.failed.${known}` as const;
}

const INVITE = [
  'not_found',
  'own_code',
  'limit',
  'adults_only',
  'no_shared_language',
  'too_many_cases',
  'paused',
  'unavailable',
] as const;

export function inviteFailureKey(code: string) {
  const known = INVITE.find((one) => one === code) ?? 'unavailable';
  return `halves.inviteScreen.failed.${known}` as const;
}

const REASONS = [
  'contact_or_meetup',
  'romance',
  'personal_probe',
  'harassment',
  'self_harm',
  'off_task',
  'unsafe',
  'link',
  'instructions',
  'unavailable',
] as const;

/** Why a move was held, in the interface language. */
export function reasonKey(reason: string) {
  const known = REASONS.find((one) => one === reason) ?? 'unavailable';
  return `halves.reasons.${known}` as const;
}
