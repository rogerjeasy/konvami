import { useEffect, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Transcript } from '@konvami/api-client';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup, ToggleRow } from '@/components/choice-group';
import { NoticeBox } from '@/components/notice-box';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import {
  MAX_NOTE_LENGTH,
  type Annotation,
  type LibraryTools,
  type TranscriptFormat,
} from '@/offline/library';

// The recording library's advertised 0.5–2× range (spec §6.6).
// Leave room for the sheet header and close control on compact landscape windows.
const SHEET_BODY_SHARE = 0.55;
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function RecordingTools({
  transcript,
  tools,
  rate,
  setRate,
  loop,
  setLoop,
  changed,
}: {
  transcript: Transcript;
  tools?: LibraryTools;
  rate: number;
  setRate(value: number): void;
  loop: boolean;
  setLoop(value: boolean): void;
  changed(): void;
}) {
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [audioFormats, setAudioFormats] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void tools
      ?.audioFormats()
      .then((formats) => {
        if (current) setAudioFormats(formats);
      })
      .catch(() => {});
    void tools
      ?.pinned(transcript.conversation.id)
      .then((value) => {
        if (current) setPinned(value);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [tools, transcript.conversation.id]);
  async function pin() {
    if (!tools) return;
    setBusy(true);
    setFailed(false);
    try {
      if (pinned) await tools.unpin(transcript.conversation.id);
      else await tools.pin(transcript);
      setPinned(!pinned);
      changed();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  async function exportFile(format: TranscriptFormat) {
    if (!tools) return;
    setBusy(true);
    setFailed(false);
    try {
      await tools.export(transcript, format, {
        learner: t('offlineLibrary.learner'),
        partner: t('offlineLibrary.persona'),
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <TextButton label={t('offlineLibrary.tools')} onPress={() => setOpen(true)} />
      {pinned ? (
        <Text variant="small" tone="muted">
          {t('offlineLibrary.pinned')}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('offlineLibrary.tools')}>
        <ScrollView style={{ maxHeight: height * SHEET_BODY_SHARE }}>
          <View className="gap-4">
            <ChoiceGroup label={t('offlineLibrary.speed')} chips>
              {RATES.map((value) => (
                <ChoiceChip
                  key={value}
                  label={`${new Intl.NumberFormat(i18n.language).format(value)}×`}
                  selected={rate === value}
                  onPress={() => setRate(value)}
                />
              ))}
            </ChoiceGroup>
            <ToggleRow label={t('offlineLibrary.loop')} value={loop} onChange={setLoop} />
            {tools ? (
              <>
                <Button
                  variant="secondary"
                  label={t(pinned ? 'offlineLibrary.unpin' : 'offlineLibrary.pin')}
                  onPress={() => void pin()}
                  loading={busy}
                />
                <Text variant="label">{t('offlineLibrary.export')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(['txt', 'md', 'json', 'pdf'] as const).map((format) => (
                    <TextButton
                      key={format}
                      label={format.toUpperCase()}
                      onPress={() => void exportFile(format)}
                      disabled={busy}
                    />
                  ))}
                  {(['mp3', 'm4a'] as const)
                    .filter((format) => audioFormats.includes(format))
                    .map((format) => (
                      <TextButton
                        key={format}
                        label={format.toUpperCase()}
                        disabled={busy}
                        onPress={() => {
                          setBusy(true);
                          setFailed(false);
                          void tools
                            .exportAudio(transcript.conversation.id, format)
                            .catch(() => setFailed(true))
                            .finally(() => setBusy(false));
                        }}
                      />
                    ))}
                </View>
                {audioFormats.length ? (
                  <Text variant="small" tone="muted">
                    {t('offlineLibrary.audioExportHint')}
                  </Text>
                ) : null}
              </>
            ) : null}
            {failed ? (
              <NoticeBox icon="info">{t('offlineLibrary.downloadFailed')}</NoticeBox>
            ) : null}
          </View>
        </ScrollView>
      </Sheet>
    </>
  );
}

export function NoteEditor({
  annotation,
  visible,
  onClose,
  save,
}: {
  annotation: Annotation;
  visible: boolean;
  onClose(): void;
  save(value: Annotation): Promise<void>;
}) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const [note, setNote] = useState(annotation.note);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Sheet visible={visible} onClose={onClose} title={t('offlineLibrary.note')}>
      <ScrollView style={{ maxHeight: height * SHEET_BODY_SHARE }}>
        <View className="gap-3">
          <TextField
            label={t('offlineLibrary.note')}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={MAX_NOTE_LENGTH}
          />
          <Text variant="small" tone="muted">
            {t('offlineLibrary.localOnly')}
          </Text>
          {failed ? <NoticeBox icon="info">{t('offlineLibrary.failed')}</NoticeBox> : null}
          <Button
            label={t('offlineLibrary.saveNote')}
            loading={busy}
            onPress={() => {
              setBusy(true);
              setFailed(false);
              void save({ ...annotation, note })
                .then(onClose, () => setFailed(true))
                .finally(() => setBusy(false));
            }}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}
