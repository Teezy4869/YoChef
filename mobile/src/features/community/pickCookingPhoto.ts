import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export const PHOTO_MAX_EDGE = 1600;
export type PhotoSource = 'camera' | 'library';
/** Always a freshly encoded JPEG on the device. */
export type PickedPhoto = { uri: string };

/**
 * Takes or picks a photo, then re-encodes it: long edge at most 1600 px, JPEG
 * quality 0.8. A new encode carries no EXIF, so GPS and camera data never leave
 * the phone (plan D8; to confirm on a real device). Null when cancelled,
 * 'denied' when the camera permission was refused.
 */
export async function pickCookingPhoto(source: PhotoSource): Promise<PickedPhoto | null | 'denied'> {
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return 'denied';
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) return null;

  const { uri, width, height } = result.assets[0];
  let context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > PHOTO_MAX_EDGE) {
    context = context.resize(width >= height ? { width: PHOTO_MAX_EDGE } : { height: PHOTO_MAX_EDGE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri };
}
