import * as ImagePicker from 'expo-image-picker';

import type { PickedImage } from './profileApi';

/** Opens the system photo picker with a square crop. Null when cancelled. */
export async function pickAvatar(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize };
}
