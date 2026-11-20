import { useRef, useState } from 'react';
import { View } from 'react-native';
import type Svg from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { Progress } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ProgressShareArt, SHARE_ART_RATIO } from '@/components/progress-share-art';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { shareSvgImage } from '@/lib/share-image';

// The box the picture is drawn in, so the web can find it (it has no picture object to hand).
const ART_ID = 'konvami-share-art';
// The file's name when it is shared or saved.
const FILE_NAME = 'konvami-progress';

/**
 * "Share my progress": a picture of the minutes spoken, the streak, the milestones and the level
 * path, previewed first and shared only when the learner taps Share. Then-vs-Now recordings are
 * never part of it: a voice is not something to post by accident.
 */
export function ShareProgress({ progress }: { progress: Progress }) {
  const { t, i18n } = useTranslation();
  const art = useRef<Svg>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const language = t(`onboarding.languagesInText.${progress.language}` as 'common.appName', {
    defaultValue: progress.language.toUpperCase(),
  });
  const numbers = {
    heading: t('motivation.share.heading', { language }),
    appName: t('common.appName'),
    minutes: Math.floor(progress.activity.seconds / 60),
    streakDays: progress.longestStreakDays,
    milestones: progress.milestones.filter((milestone) => milestone.reached).length,
    level: progress.level?.level ?? null,
    labels: {
      minutes: t('motivation.share.minutes'),
      streak: t('motivation.share.streak'),
      milestones: t('motivation.share.milestones'),
    },
    locale: i18n.language,
  };
  const share = async () => {
    commitFeedback();
    setBusy(true);
    setFailed(false);
    try {
      await shareSvgImage(art.current, FILE_NAME, ART_ID);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="gap-3 p-4">
      <Button
        variant="secondary"
        label={t('motivation.share.action')}
        onPress={() => {
          setFailed(false);
          setOpen(true);
        }}
      />
      <Sheet
        visible={open}
        title={t('motivation.share.action')}
        icon="send"
        onClose={() => setOpen(false)}
      >
        <View className="gap-4">
          <View nativeID={ART_ID} className="w-full" style={{ aspectRatio: SHARE_ART_RATIO }}>
            <ProgressShareArt ref={art} numbers={numbers} />
          </View>
          {failed ? (
            <Text variant="small" tone="muted" accessibilityRole="alert">
              {t('motivation.share.failed')}
            </Text>
          ) : null}
          <Button label={t('motivation.share.send')} loading={busy} onPress={() => void share()} />
        </View>
      </Sheet>
    </Card>
  );
}
