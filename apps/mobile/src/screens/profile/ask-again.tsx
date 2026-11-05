import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ListGroup, ListRow } from '@/components/list';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { recheckCallRoute } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';

/**
 * "Ask me again" (spec §14.2): a short spoken re-check of a group of settings. A partner goes
 * through them in a call, says what each is now and changes what the learner says is no longer
 * right; every change is listed under "Changes made by voice" and can be undone. It is the
 * partner Today suggests who asks.
 */
export function AskAgain() {
  const { t } = useTranslation();
  const { home: store } = usePracticeServices();
  const home = useHome();

  useEffect(() => {
    void store.load();
  }, [store]);

  if (home.phase !== 'ready') return null;
  const partner =
    home.data.partners.find(({ persona }) => persona.id === home.data.suggestedPartnerId) ??
    home.data.partners[0];
  const ask = (group: 'learning' | 'goals') => () => {
    if (!partner) return;
    commitFeedback();
    router.push(recheckCallRoute(partner.persona.id, group));
  };

  return (
    <View className="gap-2.5">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('profile.learningScreen.askAgain.title')}
      </Text>
      {partner ? (
        <>
          <Text variant="small" tone="muted">
            {t('profile.learningScreen.askAgain.body')}
          </Text>
          <ListGroup>
            <ListRow
              icon="mic"
              title={t('profile.learningScreen.askAgain.learning')}
              detail={partner.persona.name}
              onPress={ask('learning')}
            />
            <ListRow
              icon="target"
              title={t('profile.learningScreen.askAgain.goals')}
              detail={partner.persona.name}
              onPress={ask('goals')}
            />
          </ListGroup>
        </>
      ) : (
        <NoticeBox icon="info">{t('profile.learningScreen.askAgain.unavailable')}</NoticeBox>
      )}
    </View>
  );
}
