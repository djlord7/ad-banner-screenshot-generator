# Custom Billboard Detection Model - Training Guide

This guide will walk you through training a custom YOLOv8 model to detect in-game billboards with high accuracy.

## 📋 Overview

The current system uses COCO-SSD (trained on real-world objects) which doesn't work well for game billboards. By training a custom model on in-game billboard screenshots, we can achieve much higher accuracy across different game types.

**What you'll need:**
- 50-200 screenshots of in-game billboards (more = better accuracy)
- Free Roboflow account
- 2-4 hours for annotation and training

---

## 🚀 Quick Start (50 Images - 3 Hours Total)

### Step 1: Collect Training Images (30 mins)

You already have 8 example images:
1. `/Users/dhwajgoyal/Downloads/in-gaming-ads-cyprus-2.jpg`
2. `/Users/dhwajgoyal/Downloads/disney-xd-italy-in-game-advertising-campaign.jpg`
3. Other examples from your collection

**Add ~42 more images:**
- Google Images: "in-game advertising billboard screenshot"
- Game-specific searches: "Roblox billboard", "GTA advertising", etc.
- Include variety: different angles, games, lighting, billboard sizes

**Image quality tips:**
- Clear billboard visibility
- Various perspectives (straight-on, angled, distant, close-up)
- Different game engines/styles
- Mix of text and image billboards

### Step 2: Create Roboflow Project (10 mins)

1. Go to [roboflow.com](https://roboflow.com) and create free account
2. Click **"Create New Project"**
3. Project settings:
   - **Project Name:** "In-Game Billboard Detector"
   - **Project Type:** Object Detection
   - **What are you detecting:** "billboard"
   - **License:** Private

4. Click **"Create Project"**

### Step 3: Upload Images (5 mins)

1. Click **"Upload"** → **"Select Images"**
2. Select all your training images (50+)
3. Upload settings:
   - **Auto-Orient:** ON
   - **Auto-Contrast:** OFF (keep game colors as-is)
   - **Resize:** 640x640 (matches YOLO input)
4. Click **"Save and Continue"**
5. Skip augmentations for now → **"Finish Upload"**

### Step 4: Annotate Billboards (1.5-2 hours)

This is the most important step - accurate annotations = accurate model.

1. Click on first image in the dataset
2. Press **`B`** key (or click bounding box tool)
3. Draw rectangle around billboard:
   - Click top-left corner
   - Drag to bottom-right corner
   - Release mouse
4. Label appears → type "billboard" → Enter
5. Press **`D`** key to move to next image
6. Repeat for all images

**Annotation tips:**
- Draw tight boxes around billboards (no extra space)
- Include the entire billboard frame if visible
- For perspective/angled billboards: draw axis-aligned rectangle encompassing the whole billboard
- Multiple billboards in one image? Draw separate boxes for each
- Partially visible billboards: still annotate if >50% visible

**Keyboard shortcuts:**
- `B` - Bounding box tool
- `D` - Next image
- `A` - Previous image
- `Delete` - Remove selected box
- `Ctrl+Z` - Undo

### Step 5: Generate Dataset (5 mins)

1. Click **"Generate"** (top right)
2. Split settings:
   - **Train:** 80%
   - **Valid:** 20%
   - **Test:** 0% (optional)
3. Preprocessing:
   - **Auto-Orient:** ON
   - **Resize:** Stretch to 640x640
4. Augmentation (recommended for small dataset):
   - **Flip:** Horizontal
   - **Rotation:** ±15°
   - **Brightness:** ±15%
   - **Blur:** Up to 1px
5. Click **"Generate"**

### Step 6: Train Model (1 hour training time)

#### Option A: Roboflow Cloud Training (Easiest)

1. After generation, click **"Train with Roboflow"**
2. Model settings:
   - **Model Type:** YOLOv8 Nano
   - **Epochs:** 50 (100 if you have 100+ images)
   - **Batch Size:** 16
   - **Image Size:** 640
3. Click **"Start Training"**
4. Wait ~30-60 minutes (you'll get email when done)

#### Option B: Google Colab Training (More Control)

1. Click **"Train with Colab"**
2. Opens Colab notebook
3. Change runtime: Runtime → Change runtime type → GPU → Save
4. Run cells in order:
   - Install dependencies
   - Download dataset (use your API key from Roboflow)
   - Train model
   - Export to ONNX

### Step 7: Export to ONNX (5 mins)

After training completes:

1. Go to **"Versions"** tab in Roboflow
2. Click your trained version
3. Click **"Export"** → **"ONNX"**
4. Download the `.onnx` file
5. Rename to: `billboard-detector.onnx`
6. Place in your project:
   ```
   /Users/dhwajgoyal/Documents/Claude/models/billboard-detector.onnx
   ```

### Step 8: Test in Your App (5 mins)

1. Create `/models/` folder if it doesn't exist
2. Place `billboard-detector.onnx` inside
3. Open your webpage
4. Upload a test screenshot with billboard
5. Check browser console for:
   ```
   ✅ Custom YOLO model loaded successfully
   Custom YOLO detected X billboard(s)
   ```

---

## 📊 Expected Results

**With 50 images:**
- Accuracy: ~70-85%
- Works on similar game styles to training data
- May struggle with very different visual styles

**With 100+ images:**
- Accuracy: ~85-95%
- Better generalization across games
- More robust to lighting/angle variations

**With 200+ images:**
- Accuracy: ~90-98%
- Professional-grade detection
- Works across most game types

---

## 🔧 Troubleshooting

### "Model not loading"
- Check file path: `/Users/dhwajgoyal/Documents/Claude/models/billboard-detector.onnx`
- Check file size: should be 6-15MB
- Check browser console for specific error

### "Low accuracy on new games"
- Add screenshots from that specific game to training set
- Re-annotate with 20+ examples
- Retrain model

### "Detecting non-billboards"
- Increase confidence threshold in `custom-model.js`:
  ```javascript
  confidenceThreshold: 0.35,  // Increase from 0.25
  ```

### "Missing some billboards"
- Decrease confidence threshold:
  ```javascript
  confidenceThreshold: 0.15,  // Decrease from 0.25
  ```
- Add more training examples of similar billboards

---

## 🎯 Best Practices

1. **Quality over quantity:** 50 well-annotated images > 200 poorly annotated
2. **Diverse dataset:** Include multiple games, angles, lighting conditions
3. **Tight annotations:** Draw boxes as close to billboard edges as possible
4. **Consistent labeling:** Always use "billboard" label (case-sensitive)
5. **Test frequently:** Retrain if accuracy drops below 80%

---

## 📈 Iterative Improvement

Your model will improve over time:

1. **Week 1:** Train with 50 images (your 8 + 42 from Google)
2. **Week 2:** Add 20 screenshots from games where it fails
3. **Week 3:** Add 30 more diverse examples
4. **Result:** Professional-grade detection with ~100 total images

Each retraining cycle takes ~1 hour but dramatically improves accuracy.

---

## 🆘 Need Help?

- **Roboflow Docs:** [docs.roboflow.com](https://docs.roboflow.com)
- **YOLOv8 Guide:** [docs.ultralytics.com](https://docs.ultralytics.com)
- **ONNX Export:** Already configured in your `custom-model.js`

---

## ✅ Quick Checklist

- [ ] Collect 50+ billboard screenshots
- [ ] Create Roboflow account and project
- [ ] Upload images
- [ ] Annotate all billboards (draw bounding boxes)
- [ ] Generate dataset (80/20 split)
- [ ] Train YOLOv8-nano model (50 epochs)
- [ ] Export to ONNX format
- [ ] Download and rename to `billboard-detector.onnx`
- [ ] Place in `/models/` folder
- [ ] Test with your Roblox screenshots

**Total time:** 3-4 hours for complete workflow

---

Good luck with training! The infrastructure is ready - as soon as you place the trained model in `/models/billboard-detector.onnx`, it will automatically be used for detection.
