import { useEffect, useState } from 'react';
import { API_BASE, type Status } from '../config/config.ts';

interface ListNiftiResponse {
  status: string;
  nifti: string[];
}

function toScanIds(data: ListNiftiResponse): string[] {
  return [...new Set(data.nifti ?? [])].sort();
}

export function useScanList(status: Status) {
  const [scans, setScans] = useState<string[]>([]);

  useEffect(() => {
    if (status !== 'idle' && status !== 'success') return;

    const controller = new AbortController();
    fetch(`${API_BASE}/api/list_nifti`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<ListNiftiResponse>) : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (data.status !== 'success') throw new Error(`list_nifti returned status "${data.status}"`);
        setScans(toScanIds(data));
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') console.warn('Could not load scan list', err);
      });

    return () => controller.abort();
  }, [status]);

  return scans;
}