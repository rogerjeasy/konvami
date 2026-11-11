import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { createPictureSender } from '@/profile/pictures';
import { IMPORT_PHOTO_QUALITY, shrinkTo, type ImportPhotos } from './photos';

/**
 * The photo to read on a real device: the system's photo picker, then a JPEG of at most
 * `IMPORT_PHOTO_SIDE` px. The picker runs outside the app and needs no permission to the whole
 * library. Camera capture asks for permission only after the learner chooses it.
 */
export const deviceImportPhotos: ImportPhotos = {
  async pick(source = 'library') {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return { status: 'cancelled' };
      }
      const launch =
        source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await launch({
        mediaTypes: ['images'],
        allowsEditing: false,
        // The picture is re-encoded below; nothing is lost by taking the original here.
        quality: 1,
        exif: false,
      });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset) return { status: 'cancelled' };
      // Re-encoding drops the camera data (location) and makes any picture a JPEG.
      const context = ImageManipulator.manipulate(asset.uri);
      const size = shrinkTo(asset.width, asset.height);
      const image = await (size ? context.resize(size) : context).renderAsync();
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: IMPORT_PHOTO_QUALITY,
      });
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
          { uri, name: 'page.jpg', type: 'image/jpeg' },
  }),
};
