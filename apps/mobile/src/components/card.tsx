import { View, type ViewProps } from 'react-native';

/** A bordered card on a raised surface (chips, correction cards, stat cards). */
export function Card({ className, ...rest }: ViewProps & { className?: string }) {
  return (
    <View {...rest} className={`rounded-card border border-border bg-chip ${className ?? ''}`} />
  );
}
