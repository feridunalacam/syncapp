import { useCallback } from 'react';
import { Alert } from 'react-native';

/**
 * Lightweight wrapper around `Alert.alert` for the very common pattern of
 * asking the user "are you sure?" before running a destructive action.
 *
 * Returns a single `confirm()` function that takes a config object:
 *
 *   confirm({
 *     title: 'Delete Routine',
 *     message: 'Are you sure you want to delete "Endurance"?',
 *     confirmLabel: 'Delete',     // defaults to 'Confirm'
 *     destructive: true,          // defaults to false
 *     cancelLabel: 'Cancel',      // defaults to 'Cancel'
 *     onConfirm: () => deleteIt(),
 *     onCancel: () => {},          // optional
 *   });
 *
 * Centralizing this avoids ~10 places that all hand-rolled the same
 * 8-line `Alert.alert([...])` block with slightly different wording.
 */
const useConfirm = () => {
  const confirm = useCallback(
    ({
      title,
      message,
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      destructive = false,
      onConfirm,
      onCancel,
    }) => {
      Alert.alert(
        title,
        message,
        [
          {
            text: cancelLabel,
            style: 'cancel',
            onPress: onCancel,
          },
          {
            text: confirmLabel,
            style: destructive ? 'destructive' : 'default',
            onPress: onConfirm,
          },
        ],
        { cancelable: true },
      );
    },
    [],
  );

  return confirm;
};

export default useConfirm;
