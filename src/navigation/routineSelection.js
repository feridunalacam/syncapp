// The Timer picker and incoming shortcuts share a confirmation rule.
// A retired dialog cannot select a later account.
export function createRoutineSelectionController({
  getState,
  selectRoutine,
  confirmSwitch,
  onMissing,
  onSelected,
}) {
  let version = 0;
  let disposed = false;
  const exists = (state, id) => state.routines.some((routine) => routine.id === id);
  return {
    request(id) {
      if (disposed) return;
      const requestVersion = ++version;
      const apply = () => {
        if (disposed || requestVersion !== version) return;
        version += 1;
        const latest = getState();
        if (!exists(latest, id)) {
          onMissing();
          return;
        }
        if (!(latest.active && latest.selectedId === id)) selectRoutine(id);
        onSelected();
      };
      const current = getState();
      if (!exists(current, id)) {
        onMissing();
      } else if (current.active && current.selectedId !== id) {
        confirmSwitch(apply);
      } else {
        apply();
      }
    },
    dispose() {
      disposed = true;
      version += 1;
    },
  };
}
