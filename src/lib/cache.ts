/** One bounded snapshot per warm instance; invalidation is local. */
export function createSnapshotCache<T>(
  load: () => Promise<T>,
  freshMs = 20_000,
  staleMs = 300_000
) {
  let saved: { value: T; at: number } | undefined;
  let pending: Promise<T> | undefined;
  let generation = 0;
  return {
    read(): Promise<T> {
      if (saved && Date.now() - saved.at < freshMs)
        return Promise.resolve(saved.value);
      if (pending) return pending;
      const version = generation;
      const request = Promise.resolve()
        .then(load)
        .then((value) => {
          if (version === generation) saved = { value, at: Date.now() };
          return value;
        })
        .catch((error) => {
          if (
            version === generation &&
            saved &&
            Date.now() - saved.at < staleMs
          ) {
            console.warn(
              'Public content refresh failed; serving last good snapshot.',
              error
            );
            return saved.value;
          }
          throw error;
        })
        .finally(() => {
          if (pending === request) pending = undefined;
        });
      pending = request;
      return request;
    },
    invalidate() {
      generation++;
      saved = undefined;
      pending = undefined;
    },
  };
}
