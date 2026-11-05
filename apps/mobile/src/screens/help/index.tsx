import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ListGroup, ListRow } from '@/components/list';
import { Reveal } from '@/components/motion';
import { Section } from '@/components/section';
import { openSupportEmail } from '@/lib/external';
import { staggerDelay } from '@/lib/motion';
import { SUPPORT_EMAIL } from '@/lib/support';
import { ProfilePage } from '@/screens/profile/page';
import { FaqItem } from './faq-item';
import { FeedbackForm } from './feedback-form';

/** The questions of the FAQ, in the order they are shown; the words are in the locales. */
const FAQ = [
  'start',
  'partner',
  'mistakes',
  'minutes',
  'recordings',
  'wrong',
  'settings',
  'delete',
] as const;

/**
 * 6.20 Help and feedback (spec §6.21.4): answers to the questions learners ask, the support
 * address when the build has one, and a form to tell the owner about a problem or an idea.
 */
export function HelpScreen() {
  const { t } = useTranslation();
  const email = SUPPORT_EMAIL;
  return (
    <ProfilePage title={t('help.title')} body={t('help.body')}>
      <Reveal delay={staggerDelay(1)}>
        <Section title={t('help.faqTitle')}>
          <ListGroup>
            {FAQ.map((key) => (
              <FaqItem
                key={key}
                question={t(`help.faq.${key}.q`)}
                answer={t(`help.faq.${key}.a`)}
              />
            ))}
          </ListGroup>
        </Section>
      </Reveal>
      {email ? (
        <Reveal delay={staggerDelay(2)}>
          <Section title={t('help.supportTitle')}>
            <ListGroup>
              <ListRow
                icon="mail"
                title={t('help.supportEmail')}
                value={email}
                onPress={() => openSupportEmail(email, t('help.title'))}
              />
            </ListGroup>
          </Section>
        </Reveal>
      ) : null}
      <Reveal delay={staggerDelay(3)}>
        <Section title={t('help.feedbackTitle')}>
          <View className="gap-3">
            <FeedbackForm />
          </View>
        </Section>
      </Reveal>
    </ProfilePage>
  );
}
