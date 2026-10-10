import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { PersonaDraft } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PressScale, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PersonaSummary } from '@/components/persona-summary';
import { Section } from '@/components/section';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { blankDraft, DESCRIPTION_MAX, DESCRIPTION_MIN } from '@/profile/persona-draft';
import { useProfileServices } from '@/profile/services';
import { ProfilePage } from '@/screens/profile/page';

// Lines the description field shows before it scrolls.
const DESCRIPTION_LINES = 4;
/** Failures of the writer that have their own sentence. */
const WRITER_PROBLEMS = ['draft_limit', 'writer_unavailable', 'too_many'] as const;

/**
 * 6.5 New partner (spec §6.2, §12.4): three ways to begin. A description that a writer turns
 * into a whole person, a ready-made partner of the language, or an empty page. Each leads to
 * Persona Studio, where everything can be changed before anything is saved.
 */
export function NewPartnerScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const services = useProfileServices();
  const [description, setDescription] = useState('');
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** The ready-made partners; null while loading, `failed` when they could not be read. */
  const [templates, setTemplates] = useState<PersonaDraft[] | 'failed' | null>(null);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    services
      .partnerTemplates()
      .then((loaded) => current && setTemplates(loaded))
      .catch(() => current && setTemplates('failed'));
    return () => {
      current = false;
    };
  }, [signedIn, services]);

  function begin(draft: PersonaDraft) {
    commitFeedback();
    services.studioStart.set(draft);
    router.push(ROUTES.accountStudio);
  }

  async function write() {
    setProblem(null);
    setWriting(true);
    try {
      begin(await services.draftPartner(description.trim()));
    } catch (error) {
      const code = apiErrorCode(error);
      const known = WRITER_PROBLEMS.find((candidate) => candidate === code);
      setProblem(t(known ? `partners.create.problems.${known}` : apiErrorKey(code)));
    } finally {
      setWriting(false);
    }
  }

  return (
    <ProfilePage
      title={t('partners.create.title')}
      body={t('partners.create.body')}
      backTo={ROUTES.accountPartners}
    >
      <Reveal delay={staggerDelay(1)}>
        <Section title={t('partners.create.describeTitle')}>
          <View className="gap-3">
            <TextField
              label={t('partners.create.describeLabel')}
              placeholder={t('partners.create.describePlaceholder')}
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                setProblem(null);
              }}
              maxLength={DESCRIPTION_MAX}
              multiline
              numberOfLines={DESCRIPTION_LINES}
              textAlignVertical="top"
              autoCapitalize="sentences"
              editable={!writing}
            />
            {problem ? (
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            ) : (
              <Text variant="small" tone="subtle">
                {t('partners.create.describeHint')}
              </Text>
            )}
            <Button
              label={t(writing ? 'partners.create.writing' : 'partners.create.describe')}
              disabled={description.trim().length < DESCRIPTION_MIN}
              loading={writing}
              onPress={write}
            />
          </View>
        </Section>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <Section title={t('partners.create.templatesTitle')}>
          {templates === 'failed' ? (
            <NoticeBox icon="info">{t('partners.create.templatesFailed')}</NoticeBox>
          ) : (
            <View className="gap-2.5">
              {(templates ?? []).map((template) => (
                <PressScale
                  key={template.name}
                  accessibilityRole="button"
                  accessibilityLabel={t('partners.create.useTemplate', { name: template.name })}
                  disabled={writing}
                  onPress={() => begin(template)}
                >
                  <Card className="p-3.5">
                    <PersonaSummary persona={template} diameter={size.avatarMd} />
                  </Card>
                </PressScale>
              ))}
            </View>
          )}
        </Section>
      </Reveal>

      <Reveal delay={staggerDelay(3)}>
        <Section title={t('partners.create.scratchTitle')}>
          <Button
            variant="secondary"
            label={t('partners.create.scratch')}
            disabled={writing}
            onPress={() => begin(blankDraft())}
          />
        </Section>
      </Reveal>
    </ProfilePage>
  );
}
