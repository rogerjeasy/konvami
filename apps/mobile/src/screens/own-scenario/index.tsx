import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { OwnScenario, Scene, SceneDraft } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey, isModerationCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { useOwnScenarios } from '@/hooks/use-role-plays';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { useSpokenAttempt } from '@/voice/use-spoken-attempt';

/** The levels a scene can be set at; the server's (`StartingLevel`). */
const LEVELS: readonly SceneDraft['level'][] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
// A description said out loud can take a little longer than one sentence (ms).
const DESCRIBE_MS = 45_000;
// As the server bounds them (services/api: domain/real_life.py).
export const SCENE_LIMITS = {
  description: 600,
  title: 80,
  character: 200,
  situation: 400,
  goal: 160,
} as const;

/** The message for a failure while writing or saving a scene. */
function failureKey(code: string) {
  if (isModerationCode(code)) return apiErrorKey(code);
  switch (code) {
    case 'scenario_limit':
      return 'realLife.editor.limit';
    case 'unavailable':
      return 'realLife.editor.unavailable';
    case 'too_many':
      return 'realLife.editor.tooMany';
    case 'invalid_value':
      return 'realLife.editor.incomplete';
    case 'consent_required':
      return 'realLife.editor.consent';
    case 'network':
      return 'errors.network';
    default:
      return 'realLife.editor.failed';
  }
}

/** A scene as the server wrote it, as one to edit: a level it may not name becomes A2. */
export function draftOf(scene: Scene): SceneDraft {
  const level = LEVELS.find((one) => one === scene.level) ?? 'A2';
  return { ...scene, level };
}

/** A rehearsal keeps its standard parts empty: the app words them, and the server knows them. */
const isStandard = (own: OwnScenario | null) => own?.source === 'event';

/** Every part a learner writes is filled in (a rehearsal's standard parts may stay empty). */
export function sceneComplete(scene: SceneDraft, standard: boolean): boolean {
  if (!scene.title.trim() || scene.goals.length !== 3) return false;
  if (standard) return true;
  return (
    scene.character.trim() !== '' &&
    scene.situation.trim() !== '' &&
    scene.goals.every((goal) => goal.text.trim() !== '')
  );
}

/**
 * 5.31 Create a scenario (spec §6.3): the learner describes a situation from their life, by
 * typing or out loud; the server writes it as a scene with three goals; the learner changes any
 * word and saves it, then a partner plays it from 5.13. Opened with an id, it edits one they
 * keep. What they write is read by the moderation check before it is used, like a partner's
 * words, and a refusal is a calm note, never a red one.
 */
export function OwnScenarioScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { draftScene, hearScene, saveScene } = usePracticeServices();
  const own = useOwnScenarios();
  const existing =
    id && own.phase === 'ready' ? (own.data.scenarios.find((one) => one.id === id) ?? null) : null;
  const [description, setDescription] = useState('');
  // What the learner changed; until then, the scene they keep (when editing one).
  const [edited, setScene] = useState<SceneDraft | null>(null);
  const [busy, setBusy] = useState<'writing' | 'saving' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [written, setWritten] = useState(false);

  const spoken = useSpokenAttempt(hearScene, (text) => setDescription(text), DESCRIBE_MS);

  const scene = edited ?? (existing ? draftOf(existing.scene) : null);
  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  const standard = isStandard(existing);

  async function write() {
    commitFeedback();
    setFailure(null);
    setBusy('writing');
    try {
      setScene(draftOf(await draftScene(description.trim())));
      setWritten(true);
    } catch (error) {
      setFailure(failureKey(apiErrorCode(error)));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!scene) return;
    commitFeedback();
    setFailure(null);
    setBusy('saving');
    try {
      await saveScene(scene, existing?.id);
      successFeedback();
      backOr(ROUTES.rolePlays);
    } catch (error) {
      setFailure(failureKey(apiErrorCode(error)));
    } finally {
      setBusy(null);
    }
  }

  const change = (part: Partial<SceneDraft>) => {
    if (scene) setScene({ ...scene, ...part });
  };
  const changeGoal = (index: number, text: string) => {
    if (!scene) return;
    setScene({
      ...scene,
      goals: scene.goals.map((goal, i) => (i === index ? { ...goal, text } : goal)),
    });
  };
  const recording = spoken.step.kind === 'recording';
  const hearing = spoken.step.kind === 'checking';
  const heardFailed = spoken.step.kind === 'failed' ? spoken.step.code : null;

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.rolePlays)}
          />
        </View>
      }
      actions={
        scene ? (
          <Button
            label={t('realLife.editor.save')}
            loading={busy === 'saving'}
            disabled={busy !== null || !sceneComplete(scene, standard)}
            onPress={() => void save()}
          />
        ) : (
          <Button
            label={busy === 'writing' ? t('realLife.editor.writing') : t('realLife.editor.write')}
            loading={busy === 'writing'}
            disabled={busy !== null || recording || hearing || description.trim() === ''}
            onPress={() => void write()}
          />
        )
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="edit"
          title={t(id ? 'realLife.editor.editTitle' : 'realLife.editor.createTitle')}
          body={t('realLife.editor.body')}
        />
      </Reveal>
      {scene === null && !id ? (
        <Reveal delay={staggerDelay(1)}>
          <View className="gap-3">
            <TextField
              label={t('realLife.editor.describe')}
              placeholder={t('realLife.editor.describeHint')}
              value={description}
              onChangeText={setDescription}
              maxLength={SCENE_LIMITS.description}
              multiline
              editable={!recording && !hearing}
            />
            {hearing ? (
              <Text tone="muted">{t('realLife.editor.hearing')}</Text>
            ) : (
              <Button
                variant="secondary"
                label={t(recording ? 'realLife.editor.stop' : 'realLife.editor.speak')}
                leading={
                  <Icon name={recording ? 'stop' : 'mic'} color={color.fg} size={size.iconMd} />
                }
                onPress={() => void (recording ? spoken.stop() : spoken.record())}
              />
            )}
            {heardFailed ? (
              <NoticeBox icon="info">
                {t(
                  heardFailed === 'mic_denied'
                    ? 'realLife.editor.micDenied'
                    : 'realLife.editor.heardFailed',
                )}
              </NoticeBox>
            ) : null}
          </View>
        </Reveal>
      ) : null}
      {scene ? (
        <Reveal delay={staggerDelay(1)}>
          <View className="gap-4">
            {written ? <NoticeBox icon="info">{t('realLife.editor.writtenNote')}</NoticeBox> : null}
            <TextField
              label={t('realLife.editor.title')}
              value={scene.title}
              onChangeText={(title) => change({ title })}
              maxLength={SCENE_LIMITS.title}
            />
            <TextField
              label={t('realLife.character')}
              value={scene.character}
              placeholder={standard ? t('realLife.standardCharacter') : undefined}
              onChangeText={(character) => change({ character })}
              maxLength={SCENE_LIMITS.character}
              multiline
            />
            <TextField
              label={t('realLife.situation')}
              value={scene.situation}
              placeholder={standard ? t('realLife.standardSituation') : undefined}
              onChangeText={(situation) => change({ situation })}
              maxLength={SCENE_LIMITS.situation}
              multiline
            />
            {scene.goals.map((goal, index) => (
              <TextField
                key={goal.id}
                label={t('realLife.editor.goal', { number: index + 1 })}
                value={goal.text}
                placeholder={
                  standard
                    ? t(`realLife.goals.${goal.id}` as 'realLife.goals.explain', {
                        defaultValue: '',
                      })
                    : undefined
                }
                onChangeText={(text) => changeGoal(index, text)}
                maxLength={SCENE_LIMITS.goal}
              />
            ))}
            <ChoiceGroup label={t('realLife.editor.level')} chips>
              {LEVELS.map((level) => (
                <ChoiceChip
                  key={level}
                  label={level}
                  selected={scene.level === level}
                  onPress={() => change({ level })}
                />
              ))}
            </ChoiceGroup>
          </View>
        </Reveal>
      ) : null}
      {failure ? (
        <NoticeBox icon="info" tone="surface">
          {t(failure as 'realLife.editor.failed')}
        </NoticeBox>
      ) : null}
    </StepLayout>
  );
}
