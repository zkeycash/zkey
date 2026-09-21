// Auth storage for the browser. Uses localStorage only.
export function getPreviewAwareStorage() {
  if (typeof window === "undefined") return undefined;
  return localStorage;
}
