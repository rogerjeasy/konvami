import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { space } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { FocusRing } from '@/components/focus-ring';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { WheelPicker, wheelRowHeight, WHEEL_VISIBLE_ROWS } from '@/components/wheel-picker';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { monthNames } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { ageBracket, ageOn, daysInMonth, isOldEnough, type BirthDate } from '@/lib/validation';
import { useSignUpDraft } from './draft';
import { SIGN_UP_STEPS } from './steps';

// The wheel opens this many years back. It is only a starting point: Continue stays off until the
// user has set the date themselves, so nobody passes the check on a date they never chose.
const START_YEARS_BACK = 18;
// The oldest birth year offered, counted back from this year.
const OLDEST_YEARS_BACK = 100;
// From this OS text scale, month names are shortened so they fit their column.
const SHORT_MONTHS_FROM_SCALE = 1.3;
// Padding inside the wheel panel (pt), as on the design.
const WHEEL_PAD = { x: 10, y: 5 } as const;

type Part = keyof BirthDate;
const PARTS: readonly Part[] = ['day', 'month', 'year'];

/** 2.1 Age check: the user sets their birthday on a wheel. The date itself stays on the device. */
export function AgeCheckScreen({ today: givenToday }: { today?: Date }) {
  const { t, i18n } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const { compact } = useScreenLayout();
  const { update } = useSignUpDraft();
  // Read once, so the list of years cannot change under the user at midnight.
  const [today] = useState(() => givenToday ?? new Date());
  const [birth, setBirth] = useState<BirthDate>({
    year: today.getFullYear() - START_YEARS_BACK,
    month: today.getMonth() + 1,
    day: today.getDate(),
  });
  const [touched, setTouched] = useState(false);
  const [active, setActive] = useState<Part>('month');

  const months = useMemo(
    () =>
      monthNames(i18n.language, compact || fontScale >= SHORT_MONTHS_FROM_SCALE ? 'short' : 'long'),
    [i18n.language, compact, fontScale],
  );

  const items = useMemo(() => {
    const thisYear = today.getFullYear();
    return {
      day: Array.from({ length: daysInMonth(birth.year, birth.month) }, (_, i) => ({
        value: i + 1,
        label: String(i + 1),
      })),
      month: months.map((label, i) => ({ value: i + 1, label })),
      year: Array.from({ length: OLDEST_YEARS_BACK + 1 }, (_, i) => {
        const year = thisYear - OLDEST_YEARS_BACK + i;
        return { value: year, label: String(year) };
      }),
    };
  }, [birth.year, birth.month, months, today]);

  function change(part: Part, value: number) {
    setTouched(true);
    setActive(part);
    setBirth((current) => {
      const next = { ...current, [part]: value };
      // 31 March → February: keep the day inside the new month.
      return { ...next, day: Math.min(next.day, daysInMonth(next.year, next.month)) };
    });
  }

  function onContinue() {
    commitFeedback();
    if (isOldEnough(birth, today)) {
      update({ ageBracket: ageBracket(ageOn(birth, today)) });
      router.push(ROUTES.signUpOptions);
    } else {
      router.push(ROUTES.ageRestricted);
    }
  }

  const row = wheelRowHeight(fontScale);
  const readOut = { day: String(birth.day), month: months[birth.month - 1], year: birth.year };

  return (
    <StepLayout
      header={
        <StepHeader
          step={SIGN_UP_STEPS.ageCheck}
          total={SIGN_UP_STEPS.total}
          onBack={() => router.back()}
        />
      }
      actions={<Button label={t('common.continue')} disabled={!touched} onPress={onContinue} />}
    >
      <Reveal>
        <View className="gap-2.5">
          <Text variant="title" accessibilityRole="header">
            {t('ageCheck.title')}
          </Text>
          <Text tone="muted">{t('ageCheck.body')}</Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        {/* A summary of the wheel below; the wheel is the control, so readers skip this copy. */}
        <View aria-hidden className="flex-row gap-2.5">
          {PARTS.map((part) => (
            <View key={part} className="flex-1 gap-1.5">
              <Text variant="fieldLabel">{t(`ageCheck.${part}`)}</Text>
              <FocusRing active={active === part}>
                <View
                  className={`min-h-field items-center justify-center rounded-field border px-1 ${
                    active === part ? 'border-primary bg-bg' : 'border-field-border bg-field'
                  }`}
                >
                  <Text variant="emphasis" numberOfLines={1} adjustsFontSizeToFit>
                    {readOut[part]}
                  </Text>
                </View>
              </FocusRing>
            </View>
          ))}
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <View
          className="overflow-hidden rounded-card bg-surface"
          style={{ paddingHorizontal: WHEEL_PAD.x, paddingVertical: WHEEL_PAD.y }}
        >
          {/* The band marking the selected row: a drawing behind the wheels, sized by its box. */}
          <View
            aria-hidden
            className="absolute rounded-md border border-border bg-bg"
            style={{
              pointerEvents: 'none',
              left: WHEEL_PAD.x,
              right: WHEEL_PAD.x,
              top: WHEEL_PAD.y + (row * (WHEEL_VISIBLE_ROWS - 1)) / 2,
              height: row,
            }}
          />
          <View className="flex-row" style={{ gap: space.xs }}>
            {PARTS.map((part) => (
              <View key={part} className="flex-1">
                <WheelPicker
                  label={t(`ageCheck.${part}`)}
                  items={items[part]}
                  value={birth[part]}
                  onChange={(value) => change(part, value)}
                />
              </View>
            ))}
          </View>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(3)}>
        <NoticeBox icon="lock" tone="primary">
          {t('ageCheck.privacy')}
        </NoticeBox>
      </Reveal>
    </StepLayout>
  );
}
