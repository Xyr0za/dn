import os
from contextlib import asynccontextmanager
import shutil

# FILE MANAGEMENT AND PARSING
import zipfile
import tempfile
import dicom2nifti
import dicom2nifti.settings as settings

# WEB LIBRARIES
from fastapi import FastAPI, File, UploadFile, HTTPException
from pathlib import Path



# Define archive
BASE_DATA_DIR = Path("data")
UPLOAD_DIR = BASE_DATA_DIR / "uploads"
NIFTI_DIR = BASE_DATA_DIR / "nifti"



# Ensure Existence of directories
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Lifespan running")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    NIFTI_DIR.mkdir(parents=True, exist_ok=True)

    assert NIFTI_DIR.exists()
    assert UPLOAD_DIR.exists()
    print(f"Directory existence assertions passed.")

    yield

    # CLEANUP GOES HERE
    pass




# Define app
app = FastAPI(title="Local DICOM Engine API", lifespan=lifespan)




@app.post("/api/test")
def test():
    return "Hello world!"




# task in a worker thread so it doesn't freeze the main server loop
@app.post("/api/upload-dicom")
def upload_dicom(file: UploadFile = File(...)):
    """
    Accepts a .zip containing a DICOM series, converts it to NIfTI,
    and saves the .nii.gz file to local storage.
    """

    print(f"Uploading {file.filename}")

    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported.")

    print("File header correct.")

    # Locate output path for file Using scan_id
    scan_id = Path(file.filename).stem
    nifti_filename = f"{scan_id}.nii.gz"

    nifti_output_path = NIFTI_DIR / nifti_filename



    # Create temporary directory and complete file operations
    with tempfile.TemporaryDirectory() as temp_dir:

        # Define path for zip file
        temp_dir = Path(temp_dir)
        zip_path = temp_dir / file.filename

        # Save .zip locally
        print(f"Saving {nifti_filename} to {zip_path}")
        try:
            with open(zip_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        finally:
            file.file.close()
            print(f"Saved to {nifti_filename}")



        # Define path for extraction
        extract_dir = temp_dir / "dicoms"
        extract_dir.mkdir()

        # Extract DICOMs from directory
        print(f"Extracting {nifti_filename} to {extract_dir}")
        try:

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
                print(f"Extracted to {extract_dir}")

        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip archive.")



        # Bypass nested folders to find actual DICOM files
        dicom_source_dir = extract_dir
        for root, dirs, files in os.walk(extract_dir):
            # Only trigger if actual DICOM files are present
            if any(f.endswith('.dcm') for f in files):
                dicom_source_dir = Path(root)
                break

        # Convert DICOM to NIfTI
        print(f"Converting to {nifti_filename}")
        try:
            for f in dicom_source_dir.iterdir():
                if f.is_file() and not f.name.endswith('.dcm'):
                    f.unlink()


            settings.disable_validate_slice_increment()

            temp_nifti_out = temp_dir / "nifti_out"
            temp_nifti_out.mkdir()

            # convert_directory forces the conversion even if slices are imperfect
            dicom2nifti.convert_directory(
                str(dicom_source_dir),
                str(temp_nifti_out),
                compression=True,
                reorient=True
            )


            # Safely move the resulting file to the persistent directory
            generated_files = list(temp_nifti_out.glob("*.nii.gz"))
            if not generated_files:
                raise HTTPException(status_code=400, detail="dicom2nifti silently rejected the dataset.")

            shutil.move(str(generated_files[0]), str(nifti_output_path))

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

        print(f"Converted to {nifti_filename}")
        return {
            "status": "success",
            "scan_id": scan_id,
            "nifti_path": str(nifti_output_path)
        }