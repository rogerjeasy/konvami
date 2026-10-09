/** Where the auth service lives. Public values (they ship in the app), never secrets. */
export interface AuthConfig {
  region: string;
  clientId: string;
}

/** The auth settings from `EXPO_PUBLIC_AUTH_*`, or null when the app has not been configured. */
export function readAuthConfig(env: { region?: string; clientId?: string }): AuthConfig | null {
  const region = env.region?.trim();
  const clientId = env.clientId?.trim();
  return region && clientId ? { region, clientId } : null;
}
