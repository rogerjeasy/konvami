import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HalvesBridgeStep, HalvesTheirs } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Pop, Reveal } from '@/components/motion';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';

// The longest phrase a native may suggest (the server takes 120 characters).
const NUDGE_MAX = 120;
const NUDGE_MIN = 2;

/** The move's words under the player, shown only when the listener asks (7.7). */
export function Captions({ text }: { text: string }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  if (!text) return null;
  return (
    <View className="gap-1.5">
      <TextButton
        tone="primary"
        label={shown ? t('halves.captions.hide') : t('halves.captions.show')}
        onPress={() => setShown((now) => !now)}
      />
      {shown ? (
        <Reveal>
          <Text variant="langLine">{text}</Text>
        </Reveal>
      ) : null}
    </View>
  );
}

/**
 * 7.18 The Bridge, in same-language mode: a slower replay, then the move said more simply, then
 * its gist in the listener's explanation language, offered in that order so the listener tries
 * the language first.
 */
export function BridgePanel({
  theirs,
  onSlower,
  onStep,
}: {
  theirs: HalvesTheirs;
  onSlower: () => void;
  onStep: (step: Exclude<HalvesBridgeStep, 'slower'>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (!theirs.bridge) return null;

  async function step(which: 'simpler' | 'gist') {
    commitFeedback();
    setBusy(which);
    setFailed(false);
    try {
      await onStep(which);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text variant="section" accessibilityRole="header">
          {t('halves.bridge.title')}
        </Text>
        <Text variant="small" tone="muted">
          {t('halves.bridge.body')}
        </Text>
      </View>
      <Button variant="secondary" label={t('halves.bridge.slower')} onPress={onSlower} />
      {theirs.simpler ? (
        <Pop>
          <Text variant="langLine">{theirs.simpler}</Text>
        </Pop>
      ) : (
        <Button
          variant="secondary"
          label={t('halves.bridge.simpler')}
          loading={busy === 'simpler'}
          disabled={busy !== null}
          onPress={() => void step('simpler')}
        />
      )}
      {theirs.simpler ? (
        theirs.gist ? (
          <Pop>
            <Text>{theirs.gist}</Text>
          </Pop>
        ) : (
          <Reveal delay={staggerDelay(1)}>
            <Button
              variant="secondary"
              label={t('halves.bridge.gist')}
              loading={busy === 'gist'}
              disabled={busy !== null}
              onPress={() => void step('gist')}
            />
          </Reveal>
        )
      ) : null}
      {failed ? (
        <Text variant="small" tone="muted" accessibilityRole="alert">
          {t('halves.bridge.failed')}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * 7.13 Suggest a better way: a native of the move's language writes a short phrase. It is
 * checked in code and by the verifier before the speaker ever sees it; the one who wrote it is
 * not told whether it passed.
 */
export function NudgeSheet({
  visible,
  name,
  onSend,
  onClose,
}: {
  visible: boolean;
  name: string;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const phrase = text.trim();
  return (
    <Sheet visible={visible} title={t('halves.nudge.title')} icon="edit" onClose={onClose}>
      <View className="gap-3 pt-1">
        <Text tone="muted">{t('halves.nudge.body', { name })}</Text>
        <TextField
          label={t('halves.nudge.field')}
          value={text}
          onChangeText={setText}
          maxLength={NUDGE_MAX}
        />
        {failed ? (
          <Text variant="small" tone="muted" accessibilityRole="alert">
            {t('halves.nudge.failed')}
          </Text>
        ) : null}
        <Button
          label={t('halves.nudge.send')}
          disabled={phrase.length < NUDGE_MIN}
          loading={sending}
          onPress={() => {
            commitFeedback();
            setSending(true);
            setFailed(false);
            onSend(phrase)
              .then(
                () => {
                  successFeedback();
                  setText('');
                },
                () => setFailed(true),
              )
              .finally(() => setSending(false));
          }}
        />
      </View>
    </Sheet>
  );
}
