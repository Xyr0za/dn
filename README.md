# Lucent

Lucent is a full-stack medical imaging platform that combines a high performance 3D rendering engine with an automated AI segmentation backend. 

The frontend was built with Vite, React, and ThreeJS, with a backend powered by FastAPI and TotalSegmentator.
Lucent allows users to upload a DICOM series; converts it NIfTI volumes, and visualises them with auto-generated anatomical overlays in a 3d environment. 

![abdomen_fullUI.png](images/abdomen_fullUI.png)

## Features

### Front End

- Intensity Window Presets: Quick-select HU presets for viewing of Soft Tissue, Bone, etc.

- Manual HU Adjustment: Fine-tune the visualization with min/max HU sliders.

- Segment Overlay: A dynamic slider that controls the opacity of the multi-label segment mask.

- Spatial Controls: Dedicated controls to flip the X, Y, and Z axes.

- Direct Uploads: Upload zipped DICOM series directly from the interface.

- Persistent Storage: Load previously processed series from memory using an ID.

### Back End 

- DICOM Pipeline: Extracts zipped DICOM archives, locates the imaging files, and converts them to .nii.gz format via dicom2nifti.

- Runs deep-learning-based segmentation on processed NIfTI files to generate multi-label anatomical masks using TotalSegmentator. 

- Static Asset Hosting: Serves processed NIfTI volumes and segmentation masks directly to the frontend renderer.

## Technology Stack
> Frontend: React, Vite, Three.js

> Backend: Python, FastAPI, Uvicorn, PyTorch

> Data & ML Processing: TotalSegmentator, dicom2nifti

## Prerequisites
- Node.js: v16+
- Python: 3.9+
- Hardware: A CUDA-capable GPU is highly recommended for PyTorch and TotalSegmentator inference.

## Structure

```text
lucent/
├── run.py                 
├── engine/                
│   ├── main.py            
│   └── data/              
│       ├── uploads/       
│       ├── nifti/         
│       └── masks/         
└── frontend/              
    ├── package.json
    └── src/
```

## Installation & Setup

### Backend Setup
```bash
python3 -m venv .venv
pip install requirements.txt
```

### Frontend Setup
```bash
cd ../frontend
npm install
```

### Running the Application
To launch both the FastAPI backend and the Vite frontend simultaneously, simply run the setup script from the root of your project:
```bash
python run.py
```

### What run.py does:
- Starts the FastAPI server on Port 8004 in the background.
- Starts the Vite development server on Port 5173.
- Waits for initialization, then automatically opens Google Chrome in an isolated, incognito "app mode" directly to the UI.
- Provides graceful shutdown; pressing Ctrl+C in the terminal will cleanly terminate both the frontend and backend servers.
> Important First-Run Note: The very first time you trigger a segmentation via the UI, TotalSegmentator will download its model weights (~12GB) to your system's ~/.totalsegmentator directory. This initial process will take significantly longer than subsequent runs.

## API Reference (Port 8004)
The backend exposes the following endpoints:

- POST /api/upload-dicom
Accepts a multipart/form-data payload containing a .zip file. Extracts and converts the DICOM series to NIfTI format. Returns the generated scan_id.

- POST /api/segment/{scan_id} Runs TotalSegmentator in fast=True and ml=True mode on the specified scan. Returns the path to the generated mask.

- GET /api/list_nifti
Returns a list of all currently available processed NIfTI scan IDs.

#### Static Files:
**Volumes:** GET /data/nifti/{scan_id}.nii.gz


**Masks:** GET /data/masks/{scan_id}_mask.nii.gz
