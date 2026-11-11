import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CourseImportDraft, CourseImportSummary } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { commitFeedback } from '@/lib/haptics';
import { backOr } from '@/lib/navigation';
import { importRoute, ROUTES } from '@/lib/routes';
import { useImports, usePracticeServices } from '@/practice/services';
import { importFailureKey } from './failure';

// The longest a pasted text, an address, a textbook and a chapter are (characters); the server
// holds the same limits.
const TEXT_MAX = 20_000;
const URL_MAX = 500;
const BOOK_MAX = 80;

type Mode = 'text' | 'link' | 'photo' | 'camera' | 'pdf' | 'audio';
const MODES: readonly Mode[] = ['text', 'link', 'photo', 'camera', 'pdf', 'audio'];

/** The second line of an import in the list: what it is, how hard, how many words, where from. */
function ImportRow({ item }: { item: CourseImportSummary }) {
  const { t } = useTranslation();
  const book = item.textbook ? [item.textbook, item.chapter].filter(Boolean).join(', ') : null;
  const detail = [
    t(`import.${item.genre}`),
    item.level,
    t('import.words', { count: item.words }),
    book,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      icon="file"
      title={item.title}
      detail={detail}
      accessibilityLabel={t('import.open', { title: item.title })}
      onPress={() => router.push(importRoute(item.id))}
    />
  );
}

/**
 * 5.23 Import (spec §6.17, the course companion): the learner brings something from their life
 * (a text, a web page, a photo of a menu, a letter, an article or a page of their textbook),
 * optionally says which textbook and chapter it is from, and the Course agent works it out: the
 * words, the grammar and the hard sentences at their level, to read, save as cards and talk
 * over with a partner. Reached from Learn and Talk.
 */
export function ImportScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { imports: store, bringImport, bringPhoto, bringDocument } = usePracticeServices();
  const state = useImports();
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [textbook, setTextbook] = useState('');
  const [chapter, setChapter] = useState('');
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const signedIn = status === 'signedIn';
  const ready = state.phase === 'ready';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  const book = { textbook: textbook.trim() || null, chapter: chapter.trim() || null };
  const input = mode === 'text' ? text.trim() : mode === 'link' ? url.trim() : 'photo';

  async function bring() {
    commitFeedback();
    setWorking(true);
    setFailure(null);
    try {
      const draft: CourseImportDraft =
        mode === 'text'
          ? { kind: 'text', text: input, ...book }
          : { kind: 'link', url: input, ...book };
      const made =
        mode === 'pdf' || mode === 'audio'
          ? await bringDocument(mode, book)
          : mode === 'photo' || mode === 'camera'
            ? await bringPhoto(book, mode === 'camera' ? 'camera' : 'library')
            : await bringImport(draft);
      if (made) {
        setText('');
        setUrl('');
        router.push(importRoute(made.id));
      }
    } catch (error) {
      setFailure(t(importFailureKey(apiErrorCode(error))));
    } finally {
      setWorking(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const items = state.phase === 'ready' ? state.data.imports : [];
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.learn)}
          />
        </View>
      }
      actions={
        ready ? (
          <Button
            label={t(
              mode === 'pdf' || mode === 'audio'
                ? 'import.chooseFile'
                : mode === 'camera'
                  ? 'import.takePhoto'
                  : mode === 'photo'
                    ? 'import.choosePhoto'
                    : 'import.workItOut',
            )}
            disabled={!input}
            loading={working}
            onPress={() => void bring()}
          />
        ) : undefined
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('import.title')}
          </Text>
          <Text tone="muted">{t('import.body')}</Text>
        </View>
      </Reveal>
      {!ready ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('import.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'import.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : (
        <View className="gap-6">
          <Reveal>
            <View className="gap-4">
              <ChoiceGroup label={t('import.modeLabel')} chips>
                {MODES.map((candidate) => (
                  <ChoiceChip
                    key={candidate}
                    label={t(`import.${candidate}`)}
                    selected={mode === candidate}
                    onPress={() => {
                      setMode(candidate);
                      setFailure(null);
                    }}
                  />
                ))}
              </ChoiceGroup>
              {mode === 'text' ? (
                <TextField
                  label={t('import.textField')}
                  placeholder={t('import.textPlaceholder')}
                  value={text}
                  onChangeText={setText}
                  maxLength={TEXT_MAX}
                  multiline
                  numberOfLines={5}
                  autoCapitalize="sentences"
                />
              ) : null}
              {mode === 'link' ? (
                <TextField
                  label={t('import.linkField')}
                  placeholder={t('import.linkPlaceholder')}
                  value={url}
                  onChangeText={setUrl}
                  maxLength={URL_MAX}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : null}
              {mode === 'photo' ? <Text tone="muted">{t('import.photoBody')}</Text> : null}
              <View className="gap-3">
                <Text variant="fieldLabel">{t('import.bookTitle')}</Text>
                <TextField
                  label={t('import.bookField')}
                  placeholder={t('import.bookPlaceholder')}
                  value={textbook}
                  onChangeText={setTextbook}
                  maxLength={BOOK_MAX}
                />
                <TextField
                  label={t('import.chapterField')}
                  placeholder={t('import.chapterPlaceholder')}
                  value={chapter}
                  onChangeText={setChapter}
                  maxLength={BOOK_MAX}
                />
              </View>
            </View>
          </Reveal>
          {failure ? (
            <View accessibilityLiveRegion="polite">
              <NoticeBox icon="alert" tone="danger">
                {failure}
              </NoticeBox>
            </View>
          ) : null}
          {working ? (
            <Text tone="muted" accessibilityLiveRegion="polite">
              {t('import.working')}
            </Text>
          ) : null}
          {items.length === 0 ? (
            <EmptyState icon="file" title={t('import.emptyTitle')} body={t('import.emptyBody')} />
          ) : (
            <Section title={t('import.yours')} count={items.length}>
              <ListGroup>
                {items.map((item) => (
                  <ImportRow key={item.id} item={item} />
                ))}
              </ListGroup>
            </Section>
          )}
        </View>
      )}
    </StepLayout>
  );
}
