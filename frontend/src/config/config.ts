import * as THREE from 'three';

export const API_BASE = 'http://localhost:8004';

export const PRESETS = {
  softTissue: { min: -100, max: 300 },
  bone: { min: 200, max: 1500 },
  brain: { min: 0, max: 80 },
  liver: { min: -45, max: 105 },
  abdomen: { min: -160, max: 240 },
  mediastinum: { min: -150, max: 250 },
  subdural: { min: -25, max: 125 },
  angio: { min: -200, max: 400 },
  clothing: { min: -1000, max: -860}
} as const;

export type Status = 'idle' | 'uploading' | 'loading' | 'segmenting' | 'success' | 'error';

export interface VolumeData {
  texture: THREE.Data3DTexture;
  scale: [number, number, number];
}