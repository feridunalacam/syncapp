import * as FileSystem from 'expo-file-system/legacy';

export const mediaDirectory = () => `${FileSystem.documentDirectory}media/`;
export const persistLocalMedia = async (uri, name = 'media') => {
  const directory = mediaDirectory();
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension = (name.split('.').pop() || uri.split('.').pop() || 'bin')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8);
  const destination = `${directory}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
};
