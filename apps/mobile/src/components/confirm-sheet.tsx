import { View } from 'react-native';
import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';

/**
 * A question before something that cannot be taken back (removing a partner, signing out
 * everywhere, deleting the account): what will happen, the way out, and the way through.
 */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** The confirming button deletes something for good. */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onCancel}>
      <View className="gap-5 pt-1">
        <Text tone="muted">{body}</Text>
        <View className="gap-2">
          <Button
            variant={danger ? 'danger' : 'primary'}
            label={confirmLabel}
            loading={loading}
            onPress={onConfirm}
          />
          <Button variant="secondary" label={cancelLabel} disabled={loading} onPress={onCancel} />
        </View>
      </View>
    </Sheet>
  );
}
