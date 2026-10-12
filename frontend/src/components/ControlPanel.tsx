import { useState } from 'react';
import { PRESETS, type Status } from '../config/config.ts';
import type { Flip, ViewSettings } from '../config/viewSettings.ts';

interface ControlPanelProps {
  settings: ViewSettings;
  onChange: (patch: Partial<ViewSettings>) => void;
  scanId: string;
  savedScans: string[];
  onScanIdChange: (id: string) => void;
  onLoadSaved: () => void;
  onUpload: (file: File) => void;
  status: Status;
  errorMessage: string;
  notice: string;
  isBusy: boolean;
  hasMask: boolean;
}

const STATUS_TEXT: Partial<Record<Status, string>> = {
  idle: 'No scan loaded',
  uploading: 'Uploading DICOM series…',
  loading: 'Loading scan…',
  segmenting: 'Running segmentation…',
  success: 'Scan loaded',
};

const AXES = ['X', 'Y', 'Z'] as const;

export function ControlPanel({
  settings,
  onChange,
  scanId,
  savedScans,
  onScanIdChange,
  onLoadSaved,
  onUpload,
  status,
  errorMessage,
  notice,
  isBusy,
  hasMask,
}: ControlPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { windowMin, windowMax, maskOpacity, flip } = settings;

  const toggleFlip = (axis: number) => {
    const next = [...flip] as Flip;
    next[axis] = !next[axis];
    onChange({ flip: next });
  };

  const activePreset = Object.entries(PRESETS).find(([, p]) => p.min === windowMin && p.max === windowMax)?.[0];

  return (
    <aside className="panel" aria-label="Viewer controls">
      <header className="panel__header">
        <h1 className="panel__title">
          <a
            className="panel__profile"
            href="https://github.com/xyr0za/lucent"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              className="panel__avatar"
              // src="https://github.com/xyr0za.png?size=64"
              src="../../favicon.svg"
              alt=""
              width={32}
              height={32}
            />
            <span> Lucent</span>
          </a>
        </h1>
        <button
          type="button"
          className="btn btn--quiet"
          aria-expanded={!collapsed}
          aria-controls="panel-body"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? 'Show controls' : 'Hide controls'}
        </button>
      </header>

      <div id="panel-body" hidden={collapsed}>
        <section className="section" aria-labelledby="scan-heading">
          <h2 id="scan-heading" className="section__title">Scan</h2>

          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              onLoadSaved();
            }}
          >
            <input
              className="input input--grow"
              type="text"
              placeholder={savedScans.length ? `Choose or type (${savedScans.length} saved)` : 'Saved scan ID'}
              aria-label="Saved scan ID"
              list="saved-scans"
              value={scanId}
              onChange={(e) => onScanIdChange(e.target.value)}
              disabled={isBusy}
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id="saved-scans">
              {savedScans.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
            <button type="submit" className="btn btn--primary" disabled={isBusy || !scanId.trim()}>
              Load
            </button>
          </form>

          <label className="file">
            <span className="file__label">Upload DICOM series (.zip)</span>
            <input
              type="file"
              accept=".zip"
              disabled={isBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = '';
              }}
            />
          </label>
        </section>

        <section className="section" aria-labelledby="window-heading">
          <h2 id="window-heading" className="section__title">Intensity window</h2>

          <div className="presets" role="group" aria-label="Window presets">
            {Object.entries(PRESETS).map(([name, { min, max }]) => (
              <button
                key={name}
                type="button"
                className="btn btn--chip"
                aria-pressed={activePreset === name}
                onClick={() => onChange({ windowMin: min, windowMax: max })}
              >
                {name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>

          <Slider
            label="Minimum"
            value={windowMin}
            unit="HU"
            min={-1000}
            max={3000}
            onChange={(v) => onChange({ windowMin: Math.min(v, windowMax - 1) })}
          />
          <Slider
            label="Maximum"
            value={windowMax}
            unit="HU"
            min={-1000}
            max={3000}
            onChange={(v) => onChange({ windowMax: Math.max(v, windowMin + 1) })}
          />
        </section>

        <section className="section" aria-labelledby="overlay-heading">
          <h2 id="overlay-heading" className="section__title">Segmentation overlay</h2>

          <Slider
            label="Opacity"
            value={Math.round(maskOpacity * 100)}
            unit="%"
            min={0}
            max={100}
            step={5}
            disabled={!hasMask}
            onChange={(v) => onChange({ maskOpacity: v / 100 })}
          />

          <p className="hint">Set opacity to 0% to disable auto segmentation.</p>
        </section>

        <fieldset className="section fieldset">
          <legend className="section__title">Flip axes</legend>
          <div className="row">
            {AXES.map((axis, i) => (
              <label key={axis} className="check">
                <input type="checkbox" checked={flip[i]} onChange={() => toggleFlip(i)} />
                {axis}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <footer className="status" role="status" aria-live="polite">
        {status === 'error' ? (
          <span className="status__text status--error">{errorMessage || 'Something went wrong'}</span>
        ) : (
          <>
            {isBusy && <span className="spinner" aria-hidden="true" />}
            <span className={`status__text ${status === 'success' ? 'status--ok' : ''}`}>{STATUS_TEXT[status]}</span>
          </>
        )}
        {notice && <span className="status__notice">{notice}</span>}
      </footer>
    </aside>
  );
}

interface SliderProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function Slider({ label, value, unit, min, max, step = 1, disabled, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider__head">
        <span>{label}</span>
        <output className="slider__value">
          {value} {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}