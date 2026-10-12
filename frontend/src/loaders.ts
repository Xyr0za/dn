import * as THREE from 'three';
import * as nifti from 'nifti-reader-js';
import type { VolumeData } from './config';

export async function parseVolume(url: string): Promise<VolumeData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching scan`);

  let buf = await res.arrayBuffer();
  if (nifti.isCompressed(buf)) buf = nifti.decompress(buf) as ArrayBuffer;

  const header = nifti.readHeader(buf);
  if (!header) throw new Error('Invalid NIfTI header');

  const raw = nifti.readImage(header, buf);
  const dims = header.dims.slice(1, 4);
  const total = dims[0] * dims[1] * dims[2];

  const slope = header.scl_slope || 1;
  const intercept = header.scl_inter || 0;

  const ctorMap: Record<number, any> = {
    [nifti.NIFTI1.TYPE_UINT8]: Uint8Array,
    [nifti.NIFTI1.TYPE_INT8]: Int8Array,
    [nifti.NIFTI1.TYPE_INT16]: Int16Array,
    [nifti.NIFTI1.TYPE_UINT16]: Uint16Array,
    [nifti.NIFTI1.TYPE_INT32]: Int32Array,
    [nifti.NIFTI1.TYPE_FLOAT32]: Float32Array,
    [nifti.NIFTI1.TYPE_FLOAT64]: Float64Array,
  };

  const Ctor = ctorMap[header.datatypeCode];
  if (!Ctor) throw new Error(`Unsupported datatype: ${header.datatypeCode}`);

  const src = new Ctor(raw);
  const half = new Uint16Array(total);

  for (let i = 0; i < total; i++) {
    half[i] = THREE.DataUtils.toHalfFloat(src[i] * slope + intercept);
  }

  const texture = new THREE.Data3DTexture(half, dims[0], dims[1], dims[2]);
  texture.format = THREE.RedFormat;
  texture.type = THREE.HalfFloatType;
  texture.internalFormat = 'R16F';
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  const sx = dims[0] * (header.pixDims[1] || 1);
  const sy = dims[1] * (header.pixDims[2] || 1);
  const sz = dims[2] * (header.pixDims[3] || 1);
  const maxDim = Math.max(sx, sy, sz);

  return { texture, scale: [sx / maxDim, sy / maxDim, sz / maxDim] };
}

export async function parseMask(url: string): Promise<THREE.Data3DTexture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching mask`);

  let buf = await res.arrayBuffer();
  if (nifti.isCompressed(buf)) buf = nifti.decompress(buf) as ArrayBuffer;

  const header = nifti.readHeader(buf);
  if (!header) throw new Error('Invalid NIfTI header');

  const raw = nifti.readImage(header, buf);
  const dims = header.dims.slice(1, 4);

  const texture = new THREE.Data3DTexture(new Uint8Array(raw), dims[0], dims[1], dims[2]);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.internalFormat = 'R8';
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  return texture;
}