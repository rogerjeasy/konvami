import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { ReminderDevice, ReminderPermission } from './device';

interface Reminders {
  device: ReminderDevice;
  /** Whether the app may notify; `null` until first read. */
  permission: ReminderPermission | null;
  /** Asks the phone, and keeps its answer for every screen. */
  ask: (channel: string) => Promise<ReminderPermission>;
}

const RemindersContext = createContext<Reminders | null>(null);

/**
 * The phone's reminders for the whole app, with one reading of the permission that every screen
 * shares: read at launch and again whenever the app comes back to the front (the learner may
 * have changed it in the phone's settings).
 */
export function RemindersProvider({
  device,
  children,
}: {
  device: ReminderDevice;
  children: ReactNode;
}) {
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => void device.permission().then((found) => live && setPermission(found));
    read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      live = false;
      subscription.remove();
    };
  }, [device]);
  const ask = useCallback(
    async (channel: string) => {
      const answer = await device.ask(channel);
      setPermission(answer);
      return answer;
    },
    [device],
  );
  const value = useMemo(() => ({ device, permission, ask }), [device, permission, ask]);
  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

function useReminders(): Reminders {
  const reminders = useContext(RemindersContext);
  if (!reminders) throw new Error('Reminders are used outside RemindersProvider');
  return reminders;
}

export function useReminderDevice(): ReminderDevice {
  return useReminders().device;
}

/** Whether the app may notify (`null` until known), and a way to ask the phone. */
export function useReminderPermission() {
  const { permission, ask } = useReminders();
  return { permission, ask };
}
