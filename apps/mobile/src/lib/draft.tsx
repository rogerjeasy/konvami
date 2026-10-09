import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * What the user has entered so far in a flow that spans several screens (sign-up, password
 * reset). A draft lives in memory only: closing the app discards it, so a half-typed password or
 * a code never reaches storage.
 */
export interface Draft<T> {
  draft: T;
  update: (changes: Partial<T>) => void;
  /** Forgets everything entered (when the flow completes). */
  reset: () => void;
}

/** A provider and hook for one flow's draft, starting from `empty`. `name` is for error messages. */
export function createDraft<T extends object>(name: string, empty: T) {
  const Context = createContext<Draft<T> | null>(null);

  function Provider({
    initial,
    children,
  }: {
    /** Starting values, for tests that begin mid-flow. */
    initial?: Partial<T>;
    children: ReactNode;
  }) {
    const [draft, setDraft] = useState<T>({ ...empty, ...initial });
    const update = useCallback(
      (changes: Partial<T>) => setDraft((current) => ({ ...current, ...changes })),
      [],
    );
    const reset = useCallback(() => setDraft(empty), []);
    const value = useMemo(() => ({ draft, update, reset }), [draft, update, reset]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useDraft(): Draft<T> {
    const context = useContext(Context);
    if (!context) throw new Error(`${name} draft used outside its provider`);
    return context;
  }

  return { Provider, useDraft };
}
