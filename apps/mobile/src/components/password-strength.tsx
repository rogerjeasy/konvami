import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size, space } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { passwordRules, passwordStrength, type PasswordRules } from '@/lib/validation';
import { useTheme } from '@/theme';

// The meter has one segment per strength point (see passwordStrength).
const SEGMENTS = 4;
/** Strength points → the word shown beside the meter. */
const LEVEL = ['weak', 'weak', 'fair', 'strong', 'veryStrong'] as const;
/** From this many points the meter turns from amber to green. */
const GOOD_FROM = 3;

const RULES: readonly (keyof PasswordRules)[] = ['length', 'number', 'symbol'];

/**
 * Feedback under a new-password field: a four-segment meter with a word, and one chip per rule.
 * A weak password is shown in amber, never as an error: red is for things that went wrong.
 */
export function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const rules = passwordRules(password);
  const points = passwordStrength(password);
  const good = points >= GOOD_FROM;
  const level = t(`emailSignUp.strength.${LEVEL[points]}`);

  return (
    <View className="gap-3">
      {password ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('emailSignUp.strengthLabel', { level })}
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2.5"
        >
          <View className="flex-1 flex-row gap-1">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <View
                key={i}
                style={{ height: size.progressHeight }}
                className={`flex-1 rounded-sm ${
                  i >= points ? 'bg-track' : good ? 'bg-success' : 'bg-warn-icon'
                }`}
              />
            ))}
          </View>
          <Text variant="fieldLabel" tone={good ? 'success' : 'warn'}>
            {level}
          </Text>
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {RULES.map((rule) => {
          const met = rules[rule];
          const label = t(`emailSignUp.rules.${rule}`);
          return (
            <View
              key={rule}
              accessible
              accessibilityRole="text"
              accessibilityLabel={t(met ? 'emailSignUp.ruleMet' : 'emailSignUp.ruleNotMet', {
                rule: label,
              })}
              className={`flex-row items-center gap-1.5 rounded-pill px-2.5 py-1.5 ${
                met ? 'bg-success-soft' : 'bg-surface'
              }`}
            >
              {met ? (
                <Icon name="check" color={color.success} size={space.md} strokeWidth={3} />
              ) : null}
              <Text variant="captionStrong" tone={met ? 'success' : 'subtle'}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
