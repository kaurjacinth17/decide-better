let seq = 0;

/** Short unique id. Works in insecure contexts where crypto.randomUUID is unavailable. */
export function newId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).padStart(2, '0')).join('')
      : Math.random().toString(36).slice(2, 10);
  return `k${Date.now().toString(36)}${(seq++).toString(36)}${rand}`;
}
