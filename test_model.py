#!/usr/bin/env python3
"""Test the ONNX model directly to verify it works"""

import onnxruntime as ort
import numpy as np
from PIL import Image
import sys

# Load model
model_path = "models/billboard-detector.onnx"
session = ort.InferenceSession(model_path)

print("Model loaded successfully!")
print(f"Input name: {session.get_inputs()[0].name}")
print(f"Input shape: {session.get_inputs()[0].shape}")
print(f"Output name: {session.get_outputs()[0].name}")
print(f"Output shape: {session.get_outputs()[0].shape}")

# Load and preprocess a test image
if len(sys.argv) > 1:
    image_path = sys.argv[1]
else:
    image_path = "/Users/dhwajgoyal/Downloads/in-gaming-ads-cyprus-2.jpg"

print(f"\nLoading image: {image_path}")
img = Image.open(image_path).convert('RGB')
print(f"Original size: {img.size}")

# Resize with letterbox padding (like the JS code)
target_size = 640
scale = min(target_size / img.width, target_size / img.height)
new_w = int(img.width * scale)
new_h = int(img.height * scale)

img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

# Create padded image
padded = Image.new('RGB', (target_size, target_size), (128, 128, 128))
offset_x = (target_size - new_w) // 2
offset_y = (target_size - new_h) // 2
padded.paste(img_resized, (offset_x, offset_y))

# Convert to numpy array and normalize
img_array = np.array(padded).astype(np.float32) / 255.0

# Convert to CHW format (channels first)
img_array = np.transpose(img_array, (2, 0, 1))

# Add batch dimension
img_array = np.expand_dims(img_array, axis=0)

print(f"Input tensor shape: {img_array.shape}")
print(f"Input min/max: {img_array.min():.3f} / {img_array.max():.3f}")

# Run inference
outputs = session.run(None, {"images": img_array})
output = outputs[0]

print(f"\nOutput shape: {output.shape}")
print(f"Output min/max: {output.min():.3f} / {output.max():.3f}")

# Parse detections
num_classes = 1
num_predictions = 8400
confidence_threshold = 0.005  # Model outputs very low scores

detections = []

for i in range(num_predictions):
    # Get bbox (already in pixel space 0-640)
    x_center = output[0, 0, i]
    y_center = output[0, 1, i]
    width = output[0, 2, i]
    height = output[0, 3, i]

    # Get class score (no sigmoid needed)
    score = output[0, 4, i]

    if score >= confidence_threshold:
        # Coords are already in pixel space (0-640), no multiplication needed
        x1 = x_center - width/2
        y1 = y_center - height/2
        x2 = x_center + width/2
        y2 = y_center + height/2

        # Convert from padded image back to original
        x1_orig = (x1 - offset_x) / scale
        y1_orig = (y1 - offset_y) / scale
        x2_orig = (x2 - offset_x) / scale
        y2_orig = (y2 - offset_y) / scale

        detections.append({
            'bbox': [x1_orig, y1_orig, x2_orig - x1_orig, y2_orig - y1_orig],
            'score': float(score)
        })

print(f"\nFound {len(detections)} detections (before NMS)")

# Show top 10 by score
detections.sort(key=lambda x: x['score'], reverse=True)
for i, det in enumerate(detections[:10]):
    print(f"  {i+1}. Score: {det['score']:.3f}, BBox: [{det['bbox'][0]:.1f}, {det['bbox'][1]:.1f}, {det['bbox'][2]:.1f}, {det['bbox'][3]:.1f}]")

if detections:
    print(f"\n✅ Model is working! Detected {len(detections)} billboards")
else:
    print(f"\n❌ No detections found. Try lowering confidence threshold.")
