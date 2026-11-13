import { useEffect, useState } from 'react';

export type DataKind = 'buildings' | 'rooms' | 'courses' | 'all';
const eventName = 'campus:data-updated';

export function notifyDataUpdated(kind: DataKind = 'all') {
  window.dispatchEvent(new CustomEvent(eventName, { detail: kind }));
}

export function onDataUpdated(callback: (kind: DataKind) => void) {
  const listener = (event: Event) => callback((event as CustomEvent<DataKind>).detail);
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

export function useDataRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => onDataUpdated(() => setRevision((value) => value + 1)), []);
  return revision;
}
