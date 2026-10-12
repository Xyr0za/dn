import { useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  PerformanceMonitor,
  GizmoHelper,
  GizmoViewcube,
} from '@react-three/drei';
import { VolumeMesh } from './components/VolumeMesh.tsx';
import { ControlPanel } from './components/ControlPanel';
import { useScanSession } from './hooks/useScanSession';
import { useScanList } from './hooks/useScanList';
import { DEFAULT_SETTINGS, type ViewSettings } from './config/viewSettings.ts';
import './styles.css';
import {Vector3} from "three";

export default function App() {
  const scan = useScanSession();
  const savedScans = useScanList(scan.status);
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_SETTINGS);
  const [dpr, setDpr] = useState(1);


  const updateSettings = useCallback(
    (patch: Partial<ViewSettings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  return (
    <div className="app">
      <ControlPanel
        settings={settings}
        onChange={updateSettings}
        scanId={scan.scanId}
        savedScans={savedScans}
        onScanIdChange={scan.setScanId}
        onLoadSaved={() => scan.loadSaved(scan.scanId)}
        onUpload={scan.uploadDicom}
        status={scan.status}
        errorMessage={scan.errorMessage}
        notice={scan.notice}
        isBusy={scan.isBusy}
        hasMask={scan.mask !== null}
      />

      <div className="viewer">
      <Canvas
        camera={{ position: [0, 0, 1.5] }}
        frameloop="demand"
        dpr={dpr}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
      >
        <PerformanceMonitor onDecline={() => setDpr(0.5)} onIncline={() => setDpr(1)} />
        <OrbitControls makeDefault />

        {scan.volume ? (
          <VolumeMesh
            volume={scan.volume.texture}
            mask={scan.mask}
            scale={scan.volume.scale}
            windowMin={settings.windowMin}
            windowMax={settings.windowMax}
            maskOpacity={settings.maskOpacity}
            flip={settings.flip}
            hiddenLabel={settings.hiddenLabel}
          />
        ) : (
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshBasicMaterial color="#2a2d31" wireframe />
          </mesh>
        )}

        <GizmoHelper alignment="top-right" margin={[80, 80]}>
            <mesh scale={new Vector3(1.5, 1.5, 1.5)}>
                  <GizmoViewcube
                    faces={['X', '-X', 'Y', '-Y', 'Z', '-Z']}
                    color="#2a2e37"
                    hoverColor="#38bdf8"
                    textColor="#ffffff"
                    strokeColor="#525866"
                    opacity={0.9}
                  />
            </mesh>
        </GizmoHelper>
      </Canvas>

    </div>
    </div>
  );
}