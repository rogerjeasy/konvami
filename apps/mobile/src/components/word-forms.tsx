import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { WordDetails } from '@konvami/api-client';
import type { TypeToken } from '@konvami/design-tokens';
import { Text } from '@/components/text';

// The class of each article's colour (spec §6.7: der blue, die red, das green).
const ARTICLE_TONE = {
  der: 'text-gender-masc',
  die: 'text-gender-fem',
  das: 'text-gender-neut',
} as const;

/**
 * A word as a card shows it, its article in its gender's colour ("das" green in "das
 * Wochenende"). The colour is a help, never the only sign: a screen reader hears the gender.
 */
export function ArticleWord({
  text,
  article,
  variant = 'emphasis',
  header = false,
}: {
  text: string;
  article: WordDetails['article'] | null;
  variant?: TypeToken;
  /** The word is what the screen is about (a review's question). */
  header?: boolean;
}) {
  const { t } = useTranslation();
  const role = header ? 'header' : undefined;
  const starts = article && text.toLowerCase().startsWith(`${article} `);
  if (!article || !starts) {
    return (
      <Text variant={variant} accessibilityRole={role}>
        {text}
      </Text>
    );
  }
  return (
    <Text
      variant={variant}
      accessibilityRole={role}
      accessibilityLabel={`${text}, ${t(`learn.gender.${article}`)}`}
    >
      <Text variant={variant} tone="inherit" className={ARTICLE_TONE[article]}>
        {text.slice(0, article.length)}
      </Text>
      {text.slice(article.length)}
    </Text>
  );
}

/** A word's forms, each under its name: a noun's plural, a verb's forms, an adjective's comparison. */
export function WordForms({ details }: { details: WordDetails }) {
  const { t } = useTranslation();
  const forms = [
    ['plural', details.plural],
    ['present', details.present],
    ['preterite', details.preterite],
    ['perfect', details.perfect],
    ['case', details.case],
    ['comparative', details.comparative],
    ['superlative', details.superlative],
  ] as const;
  const shown = forms.filter((form): form is [(typeof forms)[number][0], string] => !!form[1]);
  if (shown.length === 0 && details.separable === null) return null;
  return (
    <View className="flex-row flex-wrap gap-x-5 gap-y-2.5">
      {shown.map(([name, value]) => (
        <View key={name} className="gap-0.5">
          <Text variant="caption" tone="subtle">
            {t(`learn.forms.${name}`)}
          </Text>
          <Text variant="callout">{value}</Text>
        </View>
      ))}
      {details.separable ? (
        <View className="gap-0.5">
          <Text variant="caption" tone="subtle">
            {t('learn.forms.verb')}
          </Text>
          <Text variant="callout">{t('learn.forms.separable')}</Text>
        </View>
      ) : null}
    </View>
  );
}
