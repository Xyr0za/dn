import * as THREE from 'three';

export const API_BASE = 'http://localhost:8000';

export const PRESETS = {
  lung: { min: -1000, max: -400 },
  softTissue: { min: -100, max: 300 },
  bone: { min: 200, max: 1500 },
} as const;

export type Status = 'idle' | 'uploading' | 'loading' | 'segmenting' | 'success' | 'error';

export interface VolumeData {
  texture: THREE.Data3DTexture;
  scale: [number, number, number];
}