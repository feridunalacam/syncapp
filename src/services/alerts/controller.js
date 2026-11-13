/** A cancellable cue lane, independent of the music command queue. */
export function createCueController({
  output,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let revision = 0;
  let owner = null;
  let previewRevision = 0;
  let previewDone = null;
  const timers = new Set();
  const clearPreview = () => {
    previewRevision++;
    timers.forEach(cancel);
    timers.clear();
    previewDone?.({ cancelled: true });
    previewDone = null;
  };
  const stop = async (onlyOwner) => {
    if (onlyOwner === 'preview') clearPreview();
    if (onlyOwner && owner !== onlyOwner) return;
    if (!onlyOwner) clearPreview();
    revision++;
    owner = null;
    await output.stop();
  };
  const play = async (cue, nextOwner = 'workout', externallyCancelled = () => false) => {
    if (nextOwner === 'workout') clearPreview();
    const version = ++revision;
    owner = nextOwner;
    const cancelled = () => version !== revision || externallyCancelled();
    await output.stop();
    if (cancelled() || (cue.expiresAt != null && now() > cue.expiresAt)) return { cancelled: true };
    try {
      return await output.play(
        cue,
        () => cancelled() || (cue.expiresAt != null && now() > cue.expiresAt),
      );
    } catch (error) {
      if (!cancelled()) throw error;
      return { cancelled: true };
    }
  };
  const preview = async (events, externallyCancelled = () => false) => {
    clearPreview();
    const sequence = previewRevision;
    await stop('preview');
    // stop invalidates previews; this invocation owns the newest generation below.
    if (previewRevision !== sequence + 1 || externallyCancelled()) return { cancelled: true };
    const token = previewRevision;
    if (!events.length) return { completed: true };
    owner = 'preview';
    const startedAt = now();
    return new Promise((resolve, reject) => {
      previewDone = resolve;
      const finish = (result, error) => {
        if (token !== previewRevision) return;
        timers.forEach(cancel);
        timers.clear();
        previewDone = null;
        if (error) {
          revision++;
          output.stop().catch(() => {});
          reject(error);
        } else resolve(result);
      };
      events.forEach((event, index) => {
        const timer = schedule(
          async () => {
            timers.delete(timer);
            if (token !== previewRevision || externallyCancelled()) return;
            // A backgrounded preview must not play a backlog of stale numbers.
            if (now() - startedAt - event.atMs > 400) {
              if (index === events.length - 1) finish({ cancelled: true });
              return;
            }
            try {
              // Check the deadline again after native/audio-file loading as well.
              // A slow final sound has no later timer to supersede it.
              const result = await play(
                { ...event, expiresAt: startedAt + event.atMs + 400 },
                'preview',
                externallyCancelled,
              );
              if (index === events.length - 1) finish(result || { completed: true });
            } catch (error) {
              finish(null, error);
            }
          },
          Math.max(0, event.atMs - (now() - startedAt)),
        );
        timers.add(timer);
      });
    });
  };
  return { play, preview, stop };
}
