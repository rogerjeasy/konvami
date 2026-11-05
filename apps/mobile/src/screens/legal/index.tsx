import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { DEFAULT_LANGUAGE, isLanguage } from '@/i18n/languages';
import { fillSpans, missingLegalSettings } from '@/legal/fill';
import { LEGAL_DOCUMENTS, LEGAL_SETTINGS } from '@/legal/documents.generated';
import type { Block, LegalPage, LegalSettings, Span } from '@/legal/types';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';

/** A run of text; the parts in bold are nested, so the paragraph wraps as one. */
function Spans({ spans }: { spans: readonly Span[] }) {
  return (
    <>
      {spans.map((span, index) =>
        span.bold ? (
          <Text key={index} variant="label" tone="inherit">
            {span.text}
          </Text>
        ) : (
          span.text
        ),
      )}
    </>
  );
}

function BlockView({
  block,
  settings,
  language,
  unset,
}: {
  block: Block;
  settings: LegalSettings;
  language: string;
  unset: string;
}) {
  const fill = (spans: readonly Span[]) => fillSpans(spans, settings, language, unset);
  if (block.kind === 'heading') {
    return (
      <Text variant="heading" accessibilityRole="header" className="pt-3">
        {fillSpans([{ text: block.text }], settings, language, unset)[0]?.text}
      </Text>
    );
  }
  if (block.kind === 'paragraph') {
    return (
      <Text tone="muted">
        <Spans spans={fill(block.spans)} />
      </Text>
    );
  }
  return (
    <View className="gap-2" role="list">
      {block.items.map((item, index) => (
        <View key={index} className="flex-row gap-2.5" role="listitem">
          <Text tone="muted" aria-hidden>
            •
          </Text>
          <Text tone="muted" className="flex-1">
            <Spans spans={fill(item)} />
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * 6.18 Terms of Use and Privacy Policy, in the app language: the same text the website
 * publishes, drawn from `apps/site` by `pnpm legal:generate`. It opens before sign-up (the
 * links under "Create account"), so it needs no account. While the provider's name, address or
 * email are not filled in, a notice says the text is a draft and the gaps read "not set".
 */
export function LegalScreen({ page }: { page: LegalPage }) {
  const { t, i18n } = useTranslation();
  const { status } = useSession();
  const language = isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const document = LEGAL_DOCUMENTS[language][page];
  const draft = missingLegalSettings(LEGAL_SETTINGS).length > 0;
  const unset = t('legal.unset');

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(status === 'signedIn' ? ROUTES.accountPrivacy : ROUTES.welcome)}
          />
        </View>
      }
    >
      <View className="gap-3.5">
        <Reveal>
          <Text variant="title" accessibilityRole="header">
            {document.title}
          </Text>
        </Reveal>
        {draft ? (
          <Reveal delay={staggerDelay(1)}>
            <NoticeBox icon="info" title={t('legal.draftTitle')}>
              {t('legal.draftBody')}
            </NoticeBox>
          </Reveal>
        ) : null}
        {document.blocks.map((block, index) => (
          <BlockView
            key={index}
            block={block}
            settings={LEGAL_SETTINGS}
            language={language}
            unset={unset}
          />
        ))}
      </View>
    </StepLayout>
  );
}
