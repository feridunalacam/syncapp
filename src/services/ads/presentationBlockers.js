// Independent features can hold presentation without blocking core app actions.
// Notify synchronously so an old native callback cannot beat React's next render.
export function createPresentationBlockers(onChange = () => {}) {
  const leases = new Set();
  let disposed = false;
  return {
    isBlocked: () => leases.size > 0,
    acquire() {
      if (disposed) return () => {};
      const lease = {};
      leases.add(lease);
      onChange(true);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        leases.delete(lease);
        if (!disposed) onChange(leases.size > 0);
      };
    },
    dispose() {
      disposed = true;
      leases.clear();
    },
  };
}
