# Quick Training Guide - Billboard Detection Model

## 🎯 Goal
Train a custom YOLOv8 model that detects billboards in game screenshots with 90%+ accuracy.

---

## 📦 Step 1: Install Dependencies (5 minutes)

```bash
cd /Users/dhwajgoyal/Documents/Claude

# Install Python dependencies
pip install -r requirements.txt
```

---

## 📸 Step 2: Collect Training Images (30 minutes)

### Use Your Existing Images
You have 2 images in Downloads:
- `in-gaming-ads-cyprus-2.jpg` (Roblox LOTTO billboard)
- `disney-xd-italy-in-game-advertising-campaign.jpg` (Disney XD billboard)

### Download 48+ More Images

**Method 1: Google Images Search**
Search and download ~20-30 images each from:
- "Roblox billboard screenshot"
- "GTA 5 billboard screenshot"
- "FIFA stadium billboard"
- "Need for Speed billboard"
- "in-game advertising billboard"

**Method 2: Game-Specific Sources**
- Roblox Dev Forum: https://devforum.roblox.com/t/classic-roblox-billboard-ad-remakes-series-1/3162981
- GTA Billboards Catalog: https://gta5billboards.ssstuart.net/
- FIFA/Madden screenshots from Google/YouTube thumbnails

**Target: 50-100 images total** (more = better accuracy)

---

## 🏷️ Step 3: Annotate Images with Roboflow (1-2 hours)

### Option A: Roboflow (Easiest - Recommended)

1. **Create account** at https://roboflow.com (free)

2. **Create project:**
   - Project Type: Object Detection
   - Name: "Billboard Detector"
   - Class: "billboard"

3. **Upload all images** (drag & drop)

4. **Annotate each image:**
   - Click image
   - Press `B` for bounding box
   - Draw rectangle around billboard
   - Type "billboard" as label
   - Press `D` for next image
   - Repeat for all images

5. **Generate dataset:**
   - Train/Val split: 80/20
   - Preprocessing: Resize to 640x640
   - Augmentation:
     - Flip horizontal
     - Rotate ±15°
     - Brightness ±15%
   - Export format: **YOLOv8**

6. **Download:**
   - Click "Download"
   - Format: YOLOv8
   - Extract to: `/Users/dhwajgoyal/Documents/Claude/billboard_dataset/`

### Option B: LabelImg (Local Tool)

1. **Install LabelImg:**
   ```bash
   pip install labelImg
   labelImg
   ```

2. **Setup:**
   - Open Dir: Select folder with images
   - Change Save Dir: `/Users/dhwajgoyal/Documents/Claude/billboard_dataset/labels/train/`
   - Change format to YOLO

3. **Annotate:**
   - Click "Create RectBox"
   - Draw around billboard
   - Enter class: "billboard"
   - Save (creates .txt file)
   - Next Image

4. **Organize files:**
   ```bash
   # Move images
   mv *.jpg billboard_dataset/images/train/
   mv *.png billboard_dataset/images/train/

   # Split 20% for validation
   # Manually move ~10 images and labels to val/ folders
   ```

---

## 🚀 Step 4: Train Model (1-2 hours)

### Automatic Training

```bash
cd /Users/dhwajgoyal/Documents/Claude

# Run training script
python3 train_billboard_model.py
```

The script will:
1. ✓ Create directory structure
2. ✓ Load your annotated dataset
3. ✓ Train YOLOv8-nano for 100 epochs
4. ✓ Export to ONNX format
5. ✓ Save to `models/billboard-detector.onnx`

### Monitor Training

Watch console output for:
- **Epoch progress** (0-100)
- **mAP@50** (target: >0.85 = 85% accuracy)
- **Loss values** (should decrease over time)

Training will auto-stop if accuracy plateaus (early stopping).

### Expected Training Time
- **50 images, CPU:** ~2 hours
- **50 images, GPU:** ~30 minutes
- **100 images, GPU:** ~1 hour

---

## ✅ Step 5: Test Model (5 minutes)

### Automatic Testing

The training script automatically:
1. Validates model performance
2. Exports to ONNX format
3. Places in `models/billboard-detector.onnx`

### Manual Web Testing

1. Open your web app: `index.html`
2. Upload a test screenshot (e.g., your Roblox image)
3. Check console for:
   ```
   ✅ Custom YOLO model loaded successfully
   Custom YOLO detected X billboard(s)
   ```
4. Verify detected billboards are accurate

---

## 🎯 Expected Results

### With 50 Images:
- **Accuracy:** 75-85%
- Works well on games similar to training data
- May miss unusual billboard types

### With 100 Images:
- **Accuracy:** 85-95%
- Strong generalization across game types
- Reliable perspective detection

### With 200+ Images:
- **Accuracy:** 90-98%
- Production-ready detection
- Handles edge cases well

---

## 🔧 Troubleshooting

### "No training images found"
- Check: `billboard_dataset/images/train/` has .jpg/.png files
- Check: `billboard_dataset/labels/train/` has matching .txt files

### "Low mAP score (<0.7)"
- Add more diverse training images
- Check annotations are accurate (boxes tight around billboards)
- Increase epochs to 150-200

### "Model not loading in web app"
- Verify file exists: `models/billboard-detector.onnx`
- Check file size: should be 6-15MB
- Look at browser console for errors

### "Detecting non-billboards"
- Increase confidence threshold in `js/custom-model.js`:
  ```javascript
  confidenceThreshold: 0.35  // Increase from 0.25
  ```

---

## 📊 Training Checklist

- [ ] Install requirements (`pip install -r requirements.txt`)
- [ ] Collect 50+ billboard screenshots
- [ ] Upload to Roboflow
- [ ] Annotate all images (draw bounding boxes)
- [ ] Generate YOLOv8 dataset with augmentation
- [ ] Download and extract to `billboard_dataset/`
- [ ] Run `python3 train_billboard_model.py`
- [ ] Wait for training to complete
- [ ] Verify `models/billboard-detector.onnx` exists
- [ ] Test in web app with your Roblox screenshot

**Total Time: 3-4 hours**

---

## 🚀 Next Steps After Training

1. **Test on your problematic screenshots:**
   - Roblox games
   - Various game types
   - Different billboard styles

2. **Iterate if needed:**
   - Add 20 more examples where model fails
   - Re-annotate and retrain
   - Each iteration improves accuracy

3. **Deploy:**
   - Model is already web-ready (ONNX format)
   - No server needed - runs in browser
   - Fast inference (~50-100ms per image)

---

## 💡 Pro Tips

1. **Annotation Quality > Quantity**
   - 50 perfect annotations > 200 sloppy ones
   - Draw boxes as tight as possible
   - Include entire billboard (including frame)

2. **Diverse Dataset**
   - Different games (Roblox, GTA, FIFA, racing)
   - Different angles (straight, perspective, distant)
   - Different billboard types (wall, freestanding, screen)

3. **Augmentation Helps**
   - Roboflow auto-generates variations
   - 50 images → 150+ augmented samples
   - Improves robustness

4. **Start Small, Iterate**
   - Train with 50 images first
   - Test on your screenshots
   - Add 20 more where it fails
   - Retrain → better accuracy

---

## 📞 Support

**Roboflow Issues:**
- Docs: https://docs.roboflow.com
- Free tier: 10,000 images/month

**YOLOv8 Issues:**
- Ultralytics Docs: https://docs.ultralytics.com
- GitHub: https://github.com/ultralytics/ultralytics

**Training Script Issues:**
- Check Python version: 3.8+
- GPU recommended but not required
- CPU training works but slower

---

Good luck! Once trained, your app will automatically use the custom model for much better billboard detection. 🎯
