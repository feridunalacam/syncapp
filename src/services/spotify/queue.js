export function createCommandQueue() {
  let tail = Promise.resolve();
  const pending = new Set();
  const cancelPending = () => {
    for (const controller of pending) controller.abort();
    return { success: true };
  };
  const enqueue = (operation, { interrupt = false } = {}) => {
    // Stop retires both the active transport and starts already waiting behind it.
    // The stop itself still runs in order, after the aborted operation settles.
    if (interrupt) cancelPending();
    const controller = new AbortController();
    pending.add(controller);
    const result = tail
      .then(async () => {
        if (controller.signal.aborted) return { success: true, cancelled: true };
        const value = await operation(controller.signal);
        return controller.signal.aborted ? { success: true, cancelled: true } : value;
      })
      .finally(() => pending.delete(controller));
    tail = result.catch(() => {});
    return result;
  };
  enqueue.cancelPending = cancelPending;
  return enqueue;
}
