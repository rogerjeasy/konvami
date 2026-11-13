import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Button } from '@/components/button';
import { NoticeBox } from '@/components/notice-box';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { successFeedback } from '@/lib/haptics';

export interface CaptionMeaning {
  word: string;
  meaning: string;
  article: string | null;
  plural: string | null;
  unsure: boolean;
  saved: boolean;
}

export interface CaptionSelection {
  language: string;
  word: string;
  caption: string;
}

// Keep the sheet title and save action reachable even on a compact landscape window.
const CONTENT_HEIGHT_SHARE = 0.45;

type Labels = Record<
  'loading' | 'failed' | 'save' | 'saved' | 'uncertain' | 'saveFailed' | 'plural',
  string
>;
type Lookup = (language: string, word: string, caption: string) => Promise<CaptionMeaning>;
type Save = (language: string, word: string, meaning: string) => Promise<unknown>;
interface Props {
  selection: CaptionSelection | null;
  labels: Labels;
  lookup: Lookup;
  save: Save;
  onClose: () => void;
}

/** A keyed request prevents an older response from replacing the word just selected. */
export function CaptionLookupSheet(props: Props) {
  if (!props.selection) return null;
  return (
    <LookupSheet {...props} key={JSON.stringify(props.selection)} selection={props.selection} />
  );
}

function LookupSheet({
  selection,
  labels,
  lookup,
  save,
  onClose,
}: Props & {
  selection: CaptionSelection;
}) {
  const { height } = useWindowDimensions();
  const [meaning, setMeaning] = useState<CaptionMeaning | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const mounted = useRef(true);
  const savingNow = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let current = true;
    void lookup(selection.language, selection.word, selection.caption).then(
      (found) => {
        if (current) setMeaning(found);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
      mounted.current = false;
    };
  }, [lookup, selection]);

  async function keep() {
    if (!meaning || meaning.unsure || meaning.saved || savingNow.current) return;
    savingNow.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      await save(selection.language, meaning.word, meaning.meaning);
      if (mounted.current) {
        setMeaning({ ...meaning, saved: true });
        successFeedback();
      }
    } catch {
      if (mounted.current) setSaveFailed(true);
    } finally {
      savingNow.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <Sheet visible title={selection.word} onClose={onClose}>
      <ScrollView
        style={{ maxHeight: height * CONTENT_HEIGHT_SHARE }}
        contentContainerClassName="gap-3 pb-3"
      >
        <Text variant="small" tone="subtle">
          {selection.caption}
        </Text>
        {failed ? (
          <NoticeBox icon="alert">{labels.failed}</NoticeBox>
        ) : meaning ? (
          <View className="gap-3">
            <Text variant="emphasis">{meaning.meaning}</Text>
            {meaning.article ? <Text>{`${meaning.article} ${meaning.word}`}</Text> : null}
            {meaning.plural ? <Text>{`${labels.plural}: ${meaning.plural}`}</Text> : null}
            {meaning.unsure ? <NoticeBox icon="info">{labels.uncertain}</NoticeBox> : null}
            {saveFailed ? <NoticeBox icon="alert">{labels.saveFailed}</NoticeBox> : null}
          </View>
        ) : (
          <Text role="status">{labels.loading}</Text>
        )}
      </ScrollView>
      {meaning ? (
        <Button
          label={meaning.saved ? labels.saved : labels.save}
          loading={saving}
          disabled={meaning.saved || meaning.unsure}
          onPress={() => void keep()}
        />
      ) : null}
    </Sheet>
  );
}
