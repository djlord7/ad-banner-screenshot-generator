#!/usr/bin/env python3
"""
Export trained YOLOv8 model to ONNX format for web deployment
"""

from ultralytics import YOLO
from pathlib import Path
import shutil

# Paths
PROJECT_ROOT = Path(__file__).parent
BEST_WEIGHTS = PROJECT_ROOT / "runs" / "billboard_detector" / "weights" / "best.pt"
MODELS_DIR = PROJECT_ROOT / "models"
FINAL_PATH = MODELS_DIR / "billboard-detector.onnx"

def export_model():
    """Export best trained model to ONNX"""

    if not BEST_WEIGHTS.exists():
        print(f"❌ Best weights not found at: {BEST_WEIGHTS}")
        print("   Training may still be in progress.")
        print(f"   Check training.log for status")
        return False

    print("=" * 60)
    print("  EXPORTING MODEL TO ONNX")
    print("=" * 60)

    # Create models directory
    MODELS_DIR.mkdir(exist_ok=True)

    # Load best model
    print(f"\n📦 Loading best weights: {BEST_WEIGHTS}")
    model = YOLO(str(BEST_WEIGHTS))

    # Export to ONNX
    print("\n🔄 Exporting to ONNX format...")
    onnx_file = model.export(
        format="onnx",
        imgsz=640,
        simplify=True,
        opset=12
    )

    # Move to models directory with correct name
    if Path(onnx_file).exists():
        shutil.move(onnx_file, FINAL_PATH)
        print(f"\n✅ Model exported successfully!")
        print(f"   Location: {FINAL_PATH}")
        print(f"   Size: {FINAL_PATH.stat().st_size / 1024 / 1024:.1f} MB")
        print("\n🌐 Your web app will now use this custom model!")
        print("   Just refresh index.html and upload a test image!")
        return True
    else:
        print(f"\n❌ Export failed")
        return False

if __name__ == "__main__":
    export_model()
