import { useEffect, useRef, useState } from 'react';
import { Text } from '@/components/text';
import { useCountdown } from '@/hooks/use-countdown';
import { formatDuration } from '@/lib/format';

/** Mount only after the examiner yields the floor, so instructions consume no speaking time. */
export function StageTimer({
  seconds,
  label,
  onEnd,
}: {
  seconds: number;
  label: string;
  onEnd: () => void;
}) {
  const { secondsLeft } = useCountdown(seconds);
  const ended = useRef(false);
  useEffect(() => {
    if (secondsLeft !== 0 || ended.current) return;
    ended.current = true;
    onEnd();
  }, [secondsLeft, onEnd]);
  return <Text variant="label" role="timer">{`${label} · ${formatDuration(secondsLeft)}`}</Text>;
}

export function SpeakingWindow({
  ready,
  ...props
}: {
  ready: boolean;
  seconds: number;
  label: string;
  onEnd: () => void;
}) {
  const [started, setStarted] = useState(ready);
  // Latch the first handover; later speaking phases must not restart the window.
  if (ready && !started) setStarted(true);
  return started ? <StageTimer {...props} /> : null;
}
