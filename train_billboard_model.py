#!/usr/bin/env python3
"""
Billboard Detection Model Training Script
Trains a custom YOLOv8 model for detecting in-game billboards
"""

import os
from pathlib import Path
from ultralytics import YOLO

# Configuration
PROJECT_ROOT = Path(__file__).parent
DATASET_PATH = PROJECT_ROOT / "billboard_dataset"
MODELS_DIR = PROJECT_ROOT / "models"
TRAINING_IMAGES = DATASET_PATH / "images" / "train"
VALIDATION_IMAGES = DATASET_PATH / "images" / "val"
TRAINING_LABELS = DATASET_PATH / "labels" / "train"
VALIDATION_LABELS = DATASET_PATH / "labels" / "val"

# Training parameters
EPOCHS = 100  # Increase for better accuracy with more data
BATCH_SIZE = 16
IMAGE_SIZE = 640
MODEL_TYPE = "yolov8n.pt"  # Nano model for fast inference

def setup_directories():
    """Create necessary directory structure"""
    dirs = [
        DATASET_PATH,
        TRAINING_IMAGES,
        VALIDATION_IMAGES,
        TRAINING_LABELS,
        VALIDATION_LABELS,
        MODELS_DIR
    ]

    for directory in dirs:
        directory.mkdir(parents=True, exist_ok=True)
        print(f"✓ Created: {directory}")

def create_dataset_yaml():
    """Create dataset configuration file"""
    yaml_content = f"""# Billboard Detection Dataset Configuration
path: {DATASET_PATH.absolute()}
train: images/train
val: images/val

# Classes
nc: 2  # number of classes
names: ['billboard', 'in_game_ad']  # class names
"""

    yaml_path = DATASET_PATH / "dataset.yaml"
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)

    print(f"✓ Created dataset config: {yaml_path}")
    return yaml_path

def train_model():
    """Train YOLOv8 model on billboard dataset"""

    # Check if dataset has images
    train_images = list(TRAINING_IMAGES.glob("*.jpg")) + list(TRAINING_IMAGES.glob("*.png"))
    val_images = list(VALIDATION_IMAGES.glob("*.jpg")) + list(VALIDATION_IMAGES.glob("*.png"))

    if not train_images:
        print("\n⚠️  No training images found!")
        print(f"Please add images to: {TRAINING_IMAGES}")
        print("\nDataset structure should be:")
        print(f"""
{DATASET_PATH}/
├── images/
│   ├── train/     (put training images here)
│   └── val/       (put validation images here)
└── labels/
    ├── train/     (YOLO format .txt annotations)
    └── val/       (YOLO format .txt annotations)
        """)
        return None

    print(f"\n📊 Dataset Summary:")
    print(f"   Training images: {len(train_images)}")
    print(f"   Validation images: {len(val_images)}")

    # Create dataset YAML
    yaml_path = create_dataset_yaml()

    # Load pre-trained YOLOv8 model
    print(f"\n🔄 Loading {MODEL_TYPE} model...")
    model = YOLO(MODEL_TYPE)

    # Train the model
    print(f"\n🚀 Starting training for {EPOCHS} epochs...")
    results = model.train(
        data=str(yaml_path),
        epochs=EPOCHS,
        batch=BATCH_SIZE,
        imgsz=IMAGE_SIZE,
        project=str(PROJECT_ROOT / "runs"),
        name="billboard_detector",
        exist_ok=True,
        patience=20,  # Early stopping
        save=True,
        plots=True,
        verbose=True
    )

    return model

def export_to_onnx(model):
    """Export trained model to ONNX format for web deployment"""
    if model is None:
        print("\n⚠️  No model to export")
        return

    print("\n📦 Exporting model to ONNX format...")

    # Get the best weights from training
    best_weights = PROJECT_ROOT / "runs" / "billboard_detector" / "weights" / "best.pt"

    if not best_weights.exists():
        print(f"⚠️  Best weights not found at: {best_weights}")
        return

    # Load best model
    best_model = YOLO(str(best_weights))

    # Export to ONNX
    onnx_path = best_model.export(
        format="onnx",
        imgsz=IMAGE_SIZE,
        simplify=True,  # Simplify model for better web performance
        opset=12  # ONNX opset version
    )

    # Move to models directory
    final_path = MODELS_DIR / "billboard-detector.onnx"
    if os.path.exists(onnx_path):
        os.rename(onnx_path, final_path)
        print(f"\n✅ Model exported successfully!")
        print(f"   Location: {final_path}")
        print(f"\n🌐 Your web app will now use this custom model!")
    else:
        print(f"\n⚠️  Export failed - ONNX file not found")

def validate_model():
    """Run validation on trained model"""
    best_weights = PROJECT_ROOT / "runs" / "billboard_detector" / "weights" / "best.pt"

    if not best_weights.exists():
        return

    print("\n📊 Running validation...")
    model = YOLO(str(best_weights))
    metrics = model.val()

    print(f"\n📈 Model Performance:")
    print(f"   mAP50: {metrics.box.map50:.3f}")
    print(f"   mAP50-95: {metrics.box.map:.3f}")
    print(f"   Precision: {metrics.box.mp:.3f}")
    print(f"   Recall: {metrics.box.mr:.3f}")

def main():
    """Main training pipeline"""
    print("=" * 60)
    print("  BILLBOARD DETECTION MODEL TRAINING")
    print("=" * 60)

    # Step 1: Setup directories
    print("\n📁 Setting up directories...")
    setup_directories()

    # Step 2: Train model
    model = train_model()

    if model is None:
        print("\n❌ Training aborted - please add training data")
        print("\nTo prepare your dataset:")
        print("1. Add your 2 existing images to billboard_dataset/images/train/")
        print("2. Download 50+ more from:")
        print("   - Google Images: 'in-game billboard advertising'")
        print("   - Roblox Dev Forum billboard examples")
        print("   - FIFA/Madden/NBA2K stadium screenshots")
        print("3. Annotate using Roboflow or LabelImg")
        print("4. Export annotations in YOLO format to billboard_dataset/labels/")
        return

    # Step 3: Validate
    validate_model()

    # Step 4: Export to ONNX
    export_to_onnx(model)

    print("\n" + "=" * 60)
    print("  ✅ TRAINING COMPLETE!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Check training results in: runs/billboard_detector/")
    print("2. Model is ready at: models/billboard-detector.onnx")
    print("3. Refresh your web app - it will auto-detect the new model!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Training interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
