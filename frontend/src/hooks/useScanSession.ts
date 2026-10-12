import { useCallback, useEffect, useRef, useState } from 'react';
import { parseMask, parseVolume } from '../utils/loaders.ts';
import { API_BASE, type Status, type VolumeData } from '../config/config.ts';
import type * as THREE from 'three';

const volumeUrl = (id: string) => `${API_BASE}/data/nifti/${id}.nii.gz`;
const maskUrl = (id: string) => `${API_BASE}/data/masks/${id}_mask.nii.gz`;

async function request(url: string, init: RequestInit, failureMessage: string) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${failureMessage} (HTTP ${res.status})`);
  return res;
}

export function useScanSession() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [volume, setVolume] = useState<VolumeData | null>(null);
  const [mask, setMask] = useState<THREE.Data3DTexture | null>(null);
  const [scanId, setScanId] = useState('');

  // Incremented on every new request
  const runId = useRef(0);

  // Dispose GPU textures
  useEffect(() => () => volume?.texture.dispose(), [volume]);
  useEffect(() => () => mask?.dispose(), [mask]);

  const begin = useCallback((nextStatus: Status) => {
    const id = ++runId.current;
    setVolume(null);
    setMask(null);
    setErrorMessage('');
    setNotice('');
    setStatus(nextStatus);
    return () => id !== runId.current;
  }, []);

  const fail = useCallback((err: unknown, fallback: string) => {
    setStatus('error');
    setErrorMessage(err instanceof Error ? err.message : fallback);
  }, []);

  const uploadDicom = useCallback(
    async (file: File) => {
      const isStale = begin('uploading');
      try {
        const body = new FormData();
        body.append('file', file);
        const upload = await request(`${API_BASE}/api/upload-dicom`, { method: 'POST', body }, 'DICOM upload failed');
        const { scan_id: id } = (await upload.json()) as { scan_id: string };
        if (isStale()) return;
        setScanId(id);

        const loadedVolume = await parseVolume(volumeUrl(id));
        if (isStale()) return loadedVolume.texture.dispose();
        setVolume(loadedVolume);

        setStatus('segmenting');
        await request(`${API_BASE}/api/segment/${id}`, { method: 'POST' }, 'Segmentation failed');
        if (isStale()) return;

        // Cache-bust: the mask file is overwritten when a scan is re-segmented.
        const loadedMask = await parseMask(`${maskUrl(id)}?t=${Date.now()}`);
        if (isStale()) return loadedMask.dispose();
        setMask(loadedMask);
        setStatus('success');
      } catch (err) {
        if (!isStale()) fail(err, 'Upload failed');
      }
    },
    [begin, fail],
  );

  const loadSaved = useCallback(
    async (rawId: string) => {
      const id = rawId.trim();
      if (!id) return;

      const isStale = begin('loading');
      try {
        const loadedVolume = await parseVolume(volumeUrl(id));
        if (isStale()) return loadedVolume.texture.dispose();
        setVolume(loadedVolume);

        try {
          const loadedMask = await parseMask(maskUrl(id));
          if (isStale()) return loadedMask.dispose();
          setMask(loadedMask);
        } catch {

          setNotice('No segmentation found for this scan.');
        }
        setStatus('success');
      } catch (err) {
        if (!isStale()) fail(err, `Could not load scan "${id}"`);
      }
    },
    [begin, fail],
  );

  const isBusy = status === 'uploading' || status === 'loading' || status === 'segmenting';

  return { status, errorMessage, notice, volume, mask, scanId, setScanId, uploadDicom, loadSaved, isBusy };
}