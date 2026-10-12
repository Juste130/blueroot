"use client";

import { extractExifSegment, insertExifSegment, resetOrientation } from "./jpeg";

const MAX_EDGE = 2048;
const QUALITY = 0.82;

/**
 * Resizes a photo in the browser before upload (a 5 MB phone photo becomes ~400 KB) and carries
 * its EXIF block over, so the server can still check position and date.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  const original = new Uint8Array(await file.arrayBuffer());
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // undecodable here: the server will decide
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob || blob.size >= file.size) return file;

  const exif = extractExifSegment(original);
  if (!exif) return blob;
  resetOrientation(exif);
  return new Blob([insertExifSegment(new Uint8Array(await blob.arrayBuffer()), exif)], { type: "image/jpeg" });
}

// Offline queue (IndexedDB): photos taken without network are kept on the phone and sent later.
const DB = "blueroot-field";
const STORE = "queue";

export interface QueuedPhoto {
  id: string;
  projectId: number;
  name: string;
  blob: Blob;
  queuedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const queue = {
  add: (item: QueuedPhoto) => tx("readwrite", (s) => s.put(item)),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
  all: () => tx<QueuedPhoto[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedPhoto[]>),
};
