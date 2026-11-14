// The SDK coordinates refreshes, but explicit session mutations can still save
// a captured session after another operation has replaced or removed it. Keep
// those user actions and incoming link exchanges in their requested order.
// Auth event subscribers must stay synchronous and must not join this queue.
export function createAuthOperationQueue() {
  let pending = Promise.resolve();
  return (action) => {
    const operation = pending.then(action);
    pending = operation.catch(() => {});
    return operation;
  };
}
