import { Text, type AppTextProps } from '@/components/text';

/**
 * A link inside a sentence ("Sign in", "Terms of Use"). It follows the text around it, so it has
 * no 44 pt box of its own: use a button for any action that stands alone.
 */
export function Link({ onPress, children, ...rest }: AppTextProps & { onPress: () => void }) {
  return (
    <Text
      variant="labelSmall"
      tone="primary"
      {...rest}
      role="link"
      onPress={onPress}
      suppressHighlighting
      className={`underline ${rest.className ?? ''}`}
    >
      {children}
    </Text>
  );
}
