export function aborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Conversion cancelled', 'AbortError');
}

export function wait<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  // Callers may already have started a backend task before cancellation is observed.
  if (signal.aborted) void promise.catch(() => {});
  aborted(signal);
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      try {
        aborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener('abort', cancel, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', cancel));
  });
}
