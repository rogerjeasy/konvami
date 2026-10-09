import { readAuthConfig } from './config';
import { createAuthServices } from './services';

export * from './messages';
export * from './routing';
export * from './services';
export * from './types';
export type { SessionState, SessionStore } from './session';

/**
 * The app's auth services, from the `EXPO_PUBLIC_AUTH_*` values in `.env` (printed by Terraform:
 * `terraform output -raw mobile_env`). Each variable is named in full so Expo can inline it.
 */
export const authServices = createAuthServices(
  readAuthConfig({
    region: process.env.EXPO_PUBLIC_AUTH_REGION,
    clientId: process.env.EXPO_PUBLIC_AUTH_CLIENT_ID,
  }),
);
