/** Refresh only while visible, with one request and one timer at a time. */
export function createAutoRefresh(
  refresh,
  { intervalMs = 60000, schedule = setTimeout, cancel = clearTimeout } = {},
) {
  let active = false;
  let pending = false;
  let timer = null;
  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  async function run() {
    clear();
    if (!active || pending) return;
    pending = true;
    try {
      await refresh();
    } catch {
      /* The data hook owns the error state. Retry at the normal cadence. */
    } finally {
      pending = false;
      if (active) timer = schedule(run, intervalMs);
    }
  }
  return {
    setActive(value) {
      if (active === value) return;
      active = value;
      clear();
      if (active) void run();
    },
  };
}
