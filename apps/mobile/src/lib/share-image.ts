import type Svg from 'react-native-svg';
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

// The picture's width in the saved image (px): sharp in a feed, small enough to send.
export const SHARE_IMAGE_WIDTH = 1080;

/**
 * Shares a drawn picture as a PNG through the phone's share sheet, only when the learner asks.
 * The file lives in the cache and is deleted once the sheet closes. Rejects when the phone
 * cannot share or the picture cannot be drawn.
 */
export async function shareSvgImage(
  svg: Svg | null,
  name: string,
  // The web finds the picture by its box; a phone has the picture itself.
  _containerId: string,
): Promise<void> {
  if (!svg) throw new Error('nothing_to_share');
  if (!(await isAvailableAsync())) throw new Error('sharing_unavailable');
  // react-native-svg draws the picture to a PNG itself (base64, without a data: prefix).
  const base64 = await new Promise<string>((resolve) => {
    svg.toDataURL((data: string) => resolve(data), { width: SHARE_IMAGE_WIDTH });
  });
  const file = new File(Paths.cache, `${name}.png`);
  try {
    file.write(base64, { encoding: 'base64' });
    await shareAsync(file.uri, { mimeType: 'image/png' });
  } finally {
    if (file.exists) file.delete();
  }
}
