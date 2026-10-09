import { useWindowDimensions } from 'react-native';
import { screenLayout, type ScreenLayout } from '@/lib/layout';

/**
 * The layout for the current window and text size; updates on rotation, split view and text size.
 * `heroShare` is the share of a tall window the screen's hero takes (default: the intro's).
 */
export function useScreenLayout(heroShare?: number): ScreenLayout {
  const { width, height, fontScale } = useWindowDimensions();
  return screenLayout({ width, height, fontScale }, heroShare);
}
