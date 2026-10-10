import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Persona, PersonaDraft } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { LoadState } from '@/components/load-state';
import { Pop, PressScale, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PersonaAvatar } from '@/components/persona-avatar';
import { Pill } from '@/components/pill';
import { HeaderButton, StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback, stepFeedback, successFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import {
  blankDraft,
  draftOf,
  draftProblems,
  tidy,
  type DraftProblem,
} from '@/profile/persona-draft';
import { usePartnerList, useProfileServices } from '@/profile/services';
import { ProfilePage } from '@/screens/profile/page';
import { IdentitySection } from './sections/identity';
import { LookSection } from './sections/look';
import { PersonalitySection } from './sections/personality';
import { ReviewSection } from './sections/review';
import { SectionTitle, type SectionProps } from './sections/shared';
import { TeachingSection } from './sections/teaching';
import { VoiceSection } from './sections/voice';

/** The parts of a partner, in the order the studio asks for them (spec §14.2). */
const PARTS = ['identity', 'look', 'voice', 'personality', 'teaching'] as const;
type Part = (typeof PARTS)[number];
/** A new partner goes through every part and then a review. */
const STEPS = [...PARTS, 'review'] as const;

const SECTION: Record<Part, (props: SectionProps) => ReactNode> = {
  identity: IdentitySection,
  look: LookSection,
  voice: VoiceSection,
  personality: PersonalitySection,
  teaching: TeachingSection,
};
/** Every part but who they are starts complete: only that one can hold a step back. */
const PROBLEMS_OF: Partial<Record<Part, readonly DraftProblem[]>> = {
  identity: ['name', 'age', 'origin', 'backstory'],
};

/** The translation key of the sentence for a partner that could not be saved. */
function problemKey(error: unknown) {
  const code = apiErrorCode(error);
  // The one refusal with a sentence of its own: the list is full.
  return code === 'too_many' ? ('partners.create.problems.too_many' as const) : apiErrorKey(code);
}

function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="pb-2">
      <NoticeBox icon="alert" tone="danger">
        {message}
      </NoticeBox>
    </View>
  );
}

/**
 * 6.6 Persona Studio for a partner still to be added (spec §6.2, §14.2): who they are, how
 * they look and sound, what they are like and how they teach, one part at a time, then a
 * review. Nothing is saved before "Add partner".
 */
export function NewStudioScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const services = useProfileServices();
  // What the screen before handed over (a draft, a template), or an empty page.
  const [draft, setDraft] = useState<PersonaDraft>(
    () => services.studioStart.get() ?? blankDraft(),
  );
  const [index, setIndex] = useState(0);
  /** Whether the learner has tried to move on, so that what is missing may be pointed out. */
  const [pressed, setPressed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const step = STEPS[index] ?? 'identity';
  const missing = draftProblems(draft);
  const change = (changes: Partial<PersonaDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setProblem(null);
  };

  function back() {
    services.samples.stop();
    if (index > 0) setIndex(index - 1);
    else backOr(ROUTES.accountNewPartner);
  }

  function forward() {
    stepFeedback();
    const holding = step === 'review' ? [] : (PROBLEMS_OF[step] ?? []);
    if (missing.some((field) => holding.includes(field))) {
      setPressed(true);
      return;
    }
    setPressed(false);
    setIndex(index + 1);
  }

  async function add() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await services.partners.create(tidy(draft));
      services.studioStart.set(null);
      successFeedback();
      // The steps behind are done with: Back from the partners leads to the profile.
      router.replace(ROUTES.accountPartners);
    } catch (error) {
      setProblem(t(problemKey(error)));
      setSaving(false);
    }
  }

  // The partner belongs to an account.
  if (status !== 'signedIn') return <ProfilePage title="" />;

  const props: SectionProps = { draft, change, problems: pressed ? missing : [] };
  const Section = step === 'review' ? null : SECTION[step];
  return (
    <StepLayout
      header={<StepHeader step={index + 1} total={STEPS.length} onBack={back} />}
      actions={
        <>
          <Problem message={problem} />
          {step === 'review' ? (
            <Button
              label={t('partners.studio.add')}
              disabled={missing.length > 0}
              loading={saving}
              onPress={add}
            />
          ) : (
            <Button label={t('partners.studio.next')} onPress={forward} />
          )}
        </>
      }
    >
      {/* Keyed by the step: each part enters as a new page and starts at its top. */}
      <View key={step} className="gap-6">
        {Section ? (
          <>
            <SectionTitle
              title={t(`partners.studio.${step}.title`)}
              body={t(`partners.studio.${step}.body`)}
            />
            <Section {...props} />
          </>
        ) : (
          <ReviewSection {...props} problems={missing} />
        )}
      </View>
    </StepLayout>
  );
}

/** The parts of a partner as tabs, in a row that wraps when it does not fit. */
function PartTabs({ current, onChoose }: { current: Part; onChoose: (part: Part) => void }) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('partners.studio.sections')}
      className="flex-row flex-wrap gap-2"
    >
      {PARTS.map((part) => {
        const selected = part === current;
        const label = t(`partners.studio.steps.${part}`);
        return (
          <PressScale
            key={part}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => {
              stepFeedback();
              onChoose(part);
            }}
          >
            <View
              className={`min-h-tap items-center justify-center rounded-pill border px-4 py-2 ${
                selected ? 'border-primary bg-primary-soft' : 'border-field-border bg-bg'
              }`}
            >
              <Text variant="labelSmall" tone={selected ? 'primary' : 'fg'}>
                {label}
              </Text>
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}

function Editor({ partner, header }: { partner: Persona; header: ReactNode }) {
  const { t } = useTranslation();
  const { partners } = useProfileServices();
  /** The partner as last saved, to tell whether anything was changed. */
  const [saved, setSaved] = useState<PersonaDraft>(() => draftOf(partner));
  const [draft, setDraft] = useState<PersonaDraft>(saved);
  const [part, setPart] = useState<Part>('identity');
  const [pressed, setPressed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const missing = draftProblems(draft);
  const changed = JSON.stringify(tidy(draft)) !== JSON.stringify(saved);
  const change = (changes: Partial<PersonaDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setProblem(null);
    setJustSaved(false);
  };

  async function save() {
    commitFeedback();
    if (missing.length) {
      // What is missing is said where it is typed.
      setPressed(true);
      setPart('identity');
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      const next = tidy(draft);
      await partners.change(partner.id, next);
      setSaved(next);
      setDraft(next);
      setPressed(false);
      setJustSaved(true);
      successFeedback();
    } catch (error) {
      setProblem(t(problemKey(error)));
    } finally {
      setSaving(false);
    }
  }

  const Section = SECTION[part];
  return (
    <StepLayout
      header={header}
      actions={
        <>
          <Problem message={problem} />
          <Button
            label={t('partners.studio.save')}
            disabled={!changed}
            loading={saving}
            onPress={save}
          />
        </>
      }
    >
      <Reveal>
        <View className="gap-4">
          <View className="flex-row items-center gap-3.5">
            <PersonaAvatar look={draft.look} diameter={size.avatarLg} />
            <View className="flex-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
              <Text variant="title" accessibilityRole="header" className="shrink">
                {saved.name}
              </Text>
              {justSaved ? (
                <View accessibilityLiveRegion="polite">
                  <Pop>
                    <Pill tone="success" label={t('partners.studio.saved')} />
                  </Pop>
                </View>
              ) : null}
            </View>
          </View>
          <PartTabs current={part} onChoose={setPart} />
        </View>
      </Reveal>
      {/* Keyed by the part: each one enters as a new page. */}
      <View key={part} className="gap-6">
        <Section draft={draft} change={change} problems={pressed ? missing : []} />
      </View>
    </StepLayout>
  );
}

/**
 * 6.6 Persona Studio for one of the learner's partners: the same parts as for a new one, each
 * a tap away, and one button that saves the partner as they stand.
 */
export function EditStudioScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { partners: store, samples } = useProfileServices();
  const state = usePartnerList();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <ProfilePage title="" />;

  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => {
          samples.stop();
          backOr(ROUTES.accountPartners);
        }}
      />
    </View>
  );

  if (state.phase !== 'ready') {
    return (
      <StepLayout header={header}>
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('onboarding.partners.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            state.error === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      </StepLayout>
    );
  }

  const partner = state.partners.find((candidate) => candidate.id === id);
  if (!partner) {
    return (
      <StepLayout header={header}>
        <View className="flex-1 justify-center py-10">
          <NoticeBox icon="info">{t('partners.studio.notFound')}</NoticeBox>
        </View>
      </StepLayout>
    );
  }
  // Keyed by the partner: another partner is another editor, with nothing carried over.
  return <Editor key={partner.id} partner={partner} header={header} />;
}
