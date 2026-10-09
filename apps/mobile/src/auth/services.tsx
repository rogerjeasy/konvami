import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { createCognitoClient } from './cognito-client';
import { createCognitoProvider } from './cognito-provider';
import type { AuthConfig } from './config';
import { createSessionStore, type SessionState, type SessionStore } from './session';
import { AuthError, type AuthProvider } from './types';

/** Everything a screen needs for accounts. Provided once at the root; tests provide a fake. */
export interface AuthServices {
  provider: AuthProvider;
  session: SessionStore;
}

/** A build without auth settings: every call fails clearly instead of reaching a wrong server. */
const notConfigured = async (): Promise<never> => {
  throw new AuthError('notConfigured');
};
const UNCONFIGURED: AuthProvider = {
  signUp: notConfigured,
  confirmSignUp: notConfigured,
  resendCode: notConfigured,
  signIn: notConfigured,
  refresh: notConfigured,
  getUser: notConfigured,
  saveAiConsent: notConfigured,
  signOut: notConfigured,
  requestPasswordReset: notConfigured,
  confirmPasswordReset: notConfigured,
  signOutEverywhere: notConfigured,
};

export function createAuthServices(config: AuthConfig | null): AuthServices {
  const provider = config
    ? createCognitoProvider({
        clientId: config.clientId,
        call: createCognitoClient({ region: config.region }),
      })
    : UNCONFIGURED;
  return { provider, session: createSessionStore(provider) };
}

const AuthContext = createContext<AuthServices | null>(null);

export function AuthServicesProvider({
  services,
  children,
}: {
  services: AuthServices;
  children: ReactNode;
}) {
  return <AuthContext.Provider value={services}>{children}</AuthContext.Provider>;
}

export function useAuthServices(): AuthServices {
  const services = useContext(AuthContext);
  if (!services) throw new Error('useAuthServices must be used inside AuthServicesProvider');
  return services;
}

/** The signed-in state; re-renders when it changes. */
export function useSession(): SessionState {
  const { session } = useAuthServices();
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
