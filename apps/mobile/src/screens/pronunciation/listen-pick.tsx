import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { PronunciationSoundDetail } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Pop } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { labFailureKey } from './lab';
import { ListenButton } from './listen-button';

/**
 * Which word was it? The learner hears one word of a pair and picks between the two. The word
 * played goes round the pairs and alternates between their two sides, so it is the same
 * sequence on every visit and a word is not heard twice in a row. Hearing a difference comes
 * before saying it. A wrong pick is not an alarm: it says what the word was and lets them hear
 * it again.
 */
export function ListenPick({
  soundId,
  pairs,
}: {
  soundId: string;
  pairs: PronunciationSoundDetail['pairs'];
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { pickPronunciationWord } = usePracticeServices();
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<{ word: string; right: boolean } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const pair = pairs[round % pairs.length];
  if (!pair) return null;
  const sides = [pair.first, pair.second] as const;
  const played = sides[(round + Math.floor(round / pairs.length)) % 2] ?? pair.first;

  async function pick(word: string) {
    commitFeedback();
    setFailure(null);
    try {
      const right = await pickPronunciationWord(soundId, played, word);
      setPicked({ word, right });
      if (right) successFeedback();
    } catch (error) {
      setFailure(t(labFailureKey(apiErrorCode(error))));
    }
  }

  return (
    <Card className="gap-4 p-4">
      <View className="flex-row items-center gap-3">
        {/* Keyed by the word, so a new word starts a sound of its own. */}
        <ListenButton key={played} text={played} />
        <Text tone="muted" className="flex-1">
          {t('pronunciation.listen.hint')}
        </Text>
      </View>
      <View className="gap-2.5" accessibilityRole="radiogroup">
        {sides.map((word) => (
          <Button
            key={word}
            variant="secondary"
            label={word}
            disabled={picked !== null}
            onPress={() => void pick(word)}
          />
        ))}
      </View>
      {failure ? (
        <NoticeBox icon="alert" tone="danger">
          {failure}
        </NoticeBox>
      ) : null}
      {picked ? (
        <View className="gap-3" accessibilityLiveRegion="polite">
          {picked.right ? (
            <Pop>
              <View className="flex-row items-center gap-2">
                <Icon name="check" color={color.success} size={size.iconMd} />
                <Text variant="labelMedium">
                  {t('pronunciation.listen.right', { word: played })}
                </Text>
              </View>
            </Pop>
          ) : (
            <Text variant="labelMedium">{t('pronunciation.listen.wrong', { word: played })}</Text>
          )}
          <Button
            label={t('pronunciation.listen.next')}
            onPress={() => {
              setPicked(null);
              setRound((n) => n + 1);
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}
