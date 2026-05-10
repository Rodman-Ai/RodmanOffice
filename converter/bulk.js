// Multi-file queue + optional .zip bundling.
// The default flow is "download each output as it finishes". If
// the "Bundle in .zip" checkbox is on at the moment Convert is
// clicked, outputs are collected in memory and emitted as a
// single zip at the end.

import { buildZip } from '../lib/docs/docx.js';

let nextId = 1;

export function createQueue() {
  const items = new Map();
  return {
    items,
    add(file, extra = {}) {
      const id = nextId++;
      items.set(id, {
        id, file, status: 'pending', target: null, error: null,
        blocked: false, progress: null, loadingMessage: null, ...extra,
      });
      return id;
    },
    remove(id) { items.delete(id); },
    clear() { items.clear(); },
    setTarget(id, target) {
      const it = items.get(id);
      if (it) it.target = target;
    },
    setStatus(id, status, extra = {}) {
      const it = items.get(id);
      if (it) Object.assign(it, { status }, extra);
    },
    setProgress(id, progress) {
      const it = items.get(id);
      if (it) it.progress = progress;
    },
    setLoadingMessage(id, message) {
      const it = items.get(id);
      if (it) it.loadingMessage = message || null;
    },
    pendingWithTargets() {
      return [...items.values()].filter((it) => (
        it.target && (it.status === 'pending' || it.status === 'error')
        && !it.blocked
      ));
    },
  };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function emitZip(entries, zipName) {
  const files = entries.map(({ name, bytes }) => ({
    name,
    data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  }));
  const zipBytes = buildZip(files);
  downloadBlob(new Blob([zipBytes], { type: 'application/zip' }), zipName);
}
