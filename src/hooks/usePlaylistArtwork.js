import { useCallback, useEffect, useRef, useState } from 'react';
import { musicArtworkUrls } from '../domain/musicArtwork';

const candidateKey = (item) => musicArtworkUrls(item).join('\n');
const libraryPlaylist = (item) =>
  item?.type === 'playlist' && /^p\.[A-Za-z0-9._-]+$/.test(item.id || '');
const secureImage = (value) =>
  typeof value === 'string' && /^https:\/\/[^/\s]+(?:\/\S*)?$/i.test(value) && value.length <= 4096;
const maxCovers = 128;

/** Optional, visible-row-only enrichment. Artwork never changes the playlist selection. */
export default function usePlaylistArtwork({ active, enabled, items, request, source }) {
  const latest = useRef(null);
  latest.current = { active, enabled, items, request, source };
  const generation = useRef(0);
  const previousSource = useRef({ source, request });
  const cache = useRef(new Map());
  const exhausted = useRef(new WeakMap());
  const attempted = useRef(new WeakMap());
  const visible = useRef(null);
  const inFlight = useRef(null);
  const pendingView = useRef(false);
  const timer = useRef(null);
  const blocked = useRef(false);
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => {
    generation.current++;
    blocked.current = true;
    visible.current = null;
    pendingView.current = false;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => {
    generation.current++;
    blocked.current = !active;
    attempted.current = new WeakMap();
    if (
      !active ||
      visible.current?.items !== items ||
      visible.current?.source !== source ||
      visible.current?.request !== request
    ) {
      visible.current = null;
      pendingView.current = false;
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (
      !active ||
      previousSource.current.source !== source ||
      previousSource.current.request !== request
    ) {
      cache.current.clear();
      exhausted.current = new WeakMap();
      setRevision((value) => value + 1);
    }
    previousSource.current = { source, request };
  }, [active, enabled, items, request, source]);
  useEffect(() => invalidate, [invalidate]);

  const schedule = useCallback(() => {
    const current = latest.current;
    if (
      !current.active ||
      !current.enabled ||
      blocked.current ||
      typeof current.request !== 'function'
    )
      return;
    if (inFlight.current) {
      pendingView.current = true;
      return;
    }
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const current = latest.current;
      if (
        !current.active ||
        !current.enabled ||
        blocked.current ||
        inFlight.current ||
        typeof current.request !== 'function' ||
        visible.current?.items !== current.items ||
        visible.current?.source !== current.source ||
        visible.current?.request !== current.request
      )
        return;
      const byID = new Map(current.items.map((item) => [item.id, item]));
      const ids = [...visible.current.ids]
        .filter((id) => {
          const item = byID.get(id);
          if (!libraryPlaylist(item)) return false;
          const key = candidateKey(item);
          return (
            (!key || exhausted.current.get(item) === key) && attempted.current.get(item) !== key
          );
        })
        .slice(0, 8);
      if (!ids.length) return;
      const signatures = new Map(ids.map((id) => [id, candidateKey(byID.get(id))]));
      ids.forEach((id) => attempted.current.set(byID.get(id), signatures.get(id)));
      const ticket = { ...current, generation: generation.current };
      inFlight.current = ticket;
      Promise.resolve()
        .then(() => {
          const latestValue = latest.current;
          if (
            blocked.current ||
            !latestValue.active ||
            !latestValue.enabled ||
            ticket.generation !== generation.current ||
            ticket.items !== latestValue.items ||
            ticket.source !== latestValue.source ||
            ticket.request !== latestValue.request
          )
            return [];
          return current.request(ids);
        })
        .then((result) => {
          const current = latest.current;
          if (
            ticket.generation !== generation.current ||
            !current.active ||
            !current.enabled ||
            blocked.current ||
            ticket.items !== current.items ||
            ticket.source !== current.source ||
            ticket.request !== current.request
          )
            return;
          let changed = false;
          for (const value of Array.isArray(result) ? result : []) {
            if (!signatures.has(value?.id) || !secureImage(value?.image)) continue;
            cache.current.delete(value.id);
            cache.current.set(value.id, {
              key: signatures.get(value.id),
              artwork: { image: value.image },
            });
            if (cache.current.size > maxCovers)
              cache.current.delete(cache.current.keys().next().value);
            changed = true;
          }
          if (changed) setRevision((value) => value + 1);
        })
        .catch(() => {
          // The optional lookup gets one attempt per visible item/candidate set.
        })
        .finally(() => {
          if (inFlight.current !== ticket) return;
          inFlight.current = null;
          const queued = pendingView.current;
          pendingView.current = false;
          // A user view/failure event may queue one latest visible batch.
          if (queued) schedule();
        });
    }, 0);
  }, []);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems = [] }) => {
      const current = latest.current;
      if (!current.active || !current.enabled || blocked.current) return;
      const byID = new Map(current.items.map((item) => [item.id, item]));
      visible.current = {
        items: current.items,
        source: current.source,
        request: current.request,
        ids: new Set(
          viewableItems
            .filter(
              (token) => token.isViewable !== false && byID.get(token.item?.id) === token.item,
            )
            .map((token) => token.item.id),
        ),
      };
      schedule();
    },
    [schedule],
  );
  const onUnavailable = useCallback(
    (item) => {
      const current = latest.current;
      if (
        !current.active ||
        !current.enabled ||
        blocked.current ||
        !current.items.includes(item) ||
        !libraryPlaylist(item)
      )
        return;
      exhausted.current.set(item, candidateKey(item));
      schedule();
    },
    [schedule],
  );
  const artworkFor = useCallback(
    (item) => {
      if (
        !active ||
        previousSource.current.source !== source ||
        previousSource.current.request !== request
      )
        return null;
      const value = cache.current.get(item?.id);
      if (value?.key !== candidateKey(item)) return null;
      cache.current.delete(item.id);
      cache.current.set(item.id, value);
      return value.artwork;
    },
    [active, source, request, revision],
  );
  return { artworkFor, onViewableItemsChanged, onUnavailable, invalidate, revision };
}
