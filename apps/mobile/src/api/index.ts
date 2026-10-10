import { createApiClient } from '@konvami/api-client';
import { authServices } from '@/auth';

/**
 * The Konvami API for the signed-in user. The address is the public `EXPO_PUBLIC_API_URL` from
 * `.env` (printed by Terraform: `terraform output -raw mobile_env`); without it every call fails
 * with `not_configured` instead of reaching a wrong server.
 */
export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  getAccessToken: () => authServices.session.getAccessToken(),
});
