import { PRESETS } from './config.ts';

export type Flip = [boolean, boolean, boolean];

export interface ViewSettings {
  windowMin: number;
  windowMax: number;
  maskOpacity: number;
  flip: Flip;
  hiddenLabel: number;
}

export const DEFAULT_SETTINGS: ViewSettings = {
  windowMin: PRESETS.softTissue.min,
  windowMax: PRESETS.softTissue.max,
  maskOpacity: 0.5,
  flip: [false, false, false],
  hiddenLabel: 1, // background / unclassified
};