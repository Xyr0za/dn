import subprocess
import time
import webbrowser
import sys
import shutil
import platform

def open_web_app(url):
    print(f"Opening web app mode for {url}...")
    os_name = platform.system()

    try:
        if os_name == "Windows":
            subprocess.Popen(["cmd", "/c", "start", "chrome", f"--app={url}", "--incognito"])

        elif os_name == "Darwin":
            subprocess.Popen(["open", "-na", "Google Chrome", "--args", f"--app={url}", "--incognito"])

        elif os_name == "Linux":
            if shutil.which("google-chrome"):
                subprocess.Popen(["google-chrome", f"--app={url}", "--incognito"])
            elif shutil.which("chromium"):
                subprocess.Popen(["chromium", f"--app={url}", "--incognito"])
            elif shutil.which("chromium-browser"):
                subprocess.Popen(["chromium-browser", f"--app={url}", "--incognito"])
            else:
                print("Chrome not found, falling back to default browser.")
                webbrowser.open(url)
        else:
            webbrowser.open(url)

    except Exception as e:
        print(f"App mode failed ({e}). Falling back to default browser.")
        webbrowser.open(url)


def run_servers():
    backend_dir = "engine"
    frontend_dir = "frontend"

    fastapi_command = ["uvicorn", "main:app", "--reload", "--port", "8004"]
    vite_url = "http://localhost:5173"


    npm_path = shutil.which("npm")
    if not npm_path:
        print("Error: npm is not installed or not in your system PATH.")
        sys.exit(1)


    vite_command = [npm_path, "run", "dev"]

    print("Starting FastAPI server...")
    fastapi_process = subprocess.Popen(
        fastapi_command,
        cwd=backend_dir
    )

    print("Starting Vite dev server...")
    vite_process = subprocess.Popen(
        vite_command,
        cwd=frontend_dir
    )

    print("Waiting for servers to initialize...")
    time.sleep(3)

    print(f"Opening browser to {vite_url}...")

    open_web_app(url=vite_url)

    try:
        fastapi_process.wait()
        vite_process.wait()


    except KeyboardInterrupt:
        print("\nShutting down servers...")
        fastapi_process.terminate()
        vite_process.terminate()
        fastapi_process.wait()
        vite_process.wait()
        print("Servers stopped.")


if __name__ == "__main__":
    run_servers()