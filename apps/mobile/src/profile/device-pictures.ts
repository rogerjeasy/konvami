import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  centeredSquare,
  createPictureSender,
  PICTURE_QUALITY,
  PICTURE_SIDE,
  type PictureDevice,
} from './pictures';

/**
 * The learner's photo on a real device: the system's photo picker, then a small square JPEG.
 * The picker runs outside the app and needs no permission to the whole library. The camera is
 * not offered: Konvami never opens it (see app.config.ts).
 */
export const devicePictures: PictureDevice = {
  async pick() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // Where the system offers a crop step (phones), the learner frames the square.
        allowsEditing: true,
        aspect: [1, 1],
        // The picture is re-encoded below; nothing is lost by taking the original here.
        quality: 1,
        exif: false,
      });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset) return { status: 'cancelled' };
      // Re-encoding drops the camera data (location) and makes any picture a JPEG. The cut is
      // for the web, which has no crop step; after one, it changes nothing.
      const image = await ImageManipulator.manipulate(asset.uri)
        .crop(centeredSquare(asset.width, asset.height))
        .resize({ width: PICTURE_SIDE, height: PICTURE_SIDE })
        .renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PICTURE_QUALITY });
      return { status: 'picked', picture: { uri: saved.uri } };
    } catch {
      return { status: 'failed' };
    }
  },

  send: createPictureSender({
    fetch: (url, init) => fetch(url, init),
    filePart: async ({ uri }) =>
      Platform.OS === 'web'
        ? // In a browser the picture is a blob address; the form needs the blob itself.
          await (await fetch(uri)).blob()
        : // React Native's form takes a file by its address.
          { uri, name: 'picture.jpg', type: 'image/jpeg' },
  }),
};
