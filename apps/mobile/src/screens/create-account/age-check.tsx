import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { DateWheels, useWheelMonths } from '@/components/date-wheels';
import { FocusRing } from '@/components/focus-ring';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { calendarDateOf, withDatePart, type DatePart } from '@/lib/dates';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { ageBracket, ageOn, isOldEnough, type BirthDate } from '@/lib/validation';
import { useSignUpDraft } from './draft';
import { SIGN_UP_STEPS } from './steps';

// The wheel opens this many years back. It is only a starting point: Continue stays off until the
// user has set the date themselves, so nobody passes the check on a date they never chose.
const START_YEARS_BACK = 18;
// The oldest birth year offered, counted back from this year.
const OLDEST_YEARS_BACK = 100;

const PARTS: readonly DatePart[] = ['day', 'month', 'year'];

/** 2.1 Age check: the user sets their birthday on a wheel. The date itself stays on the device. */
export function AgeCheckScreen({ today: givenToday }: { today?: Date }) {
  const { t } = useTranslation();
  const { update } = useSignUpDraft();
  // Read once, so the list of years cannot change under the user at midnight.
  const [today] = useState(() => givenToday ?? new Date());
  const [birth, setBirth] = useState<BirthDate>(() => {
    const now = calendarDateOf(today);
    return { ...now, year: now.year - START_YEARS_BACK };
  });
  const [touched, setTouched] = useState(false);
  const [active, setActive] = useState<DatePart>('month');
  const months = useWheelMonths();

  function change(part: DatePart, value: number) {
    setTouched(true);
    setActive(part);
    // 31 March → February: the day stays inside the new month.
    setBirth((current) => withDatePart(current, part, value));
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

  const thisYear = today.getFullYear();
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
              <Text variant="fieldLabel">{t(`common.${part}`)}</Text>
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
        <DateWheels
          value={birth}
          years={{ from: thisYear - OLDEST_YEARS_BACK, to: thisYear }}
          onChange={change}
        />
      </Reveal>

      <Reveal delay={staggerDelay(3)}>
        <NoticeBox icon="lock" tone="primary">
          {t('ageCheck.privacy')}
        </NoticeBox>
      </Reveal>
    </StepLayout>
  );
}
