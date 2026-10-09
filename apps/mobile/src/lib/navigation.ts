import { router, type Href } from 'expo-router';

/** Goes back when there is a screen to go back to; otherwise to `fallback` (a deep link, a reload). */
export function backOr(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
