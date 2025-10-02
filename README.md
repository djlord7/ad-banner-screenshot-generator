# 🎮 Ad Banner Screenshot Generator

AI-powered tool for automatically detecting billboards in game screenshots and overlaying custom advertising banners with perspective transformation.

[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://dhwajgoyal.github.io/ad-banner-screenshot-generator/)

## ✨ Features

- **🤖 AI Billboard Detection**: Custom-trained YOLOv8 model (87.6% accuracy) for in-game billboard detection
- **📸 Upload Any Screenshot**: Works with any game - Roblox, GTA, racing games, sports games, etc.
- **🎨 Perspective Transformation**: Smart overlay that matches billboard angles and maintains aspect ratio
- **✏️ Manual Editing**: Rectangle and perspective editing modes for fine-tuning
- **💾 Instant Export**: Download your customized screenshots instantly

## 🚀 Live Demo

Visit **[https://dhwajgoyal.github.io/ad-banner-screenshot-generator/](https://dhwajgoyal.github.io/ad-banner-screenshot-generator/)** to try it out!

## 🎯 How It Works

1. **Upload** a game screenshot
2. **AI detects** billboards automatically (or manually select)
3. **Upload** your advertising banner
4. **Adjust** perspective if needed
5. **Download** the final composite

## 🧠 Technology

- **Frontend**: Vanilla JavaScript, HTML5 Canvas
- **AI Model**: YOLOv8-nano (custom-trained on game billboards)
- **ML Runtime**: ONNX Runtime Web
- **Computer Vision**: OpenCV.js (fallback detection)

## 📊 Model Performance

- **mAP@50**: 87.6%
- **Precision**: 81%
- **Recall**: 82%
- **Inference**: ~50-150ms per image (browser)

## 🛠️ Local Development

```bash
# Clone the repository
git clone https://github.com/dhwajgoyal/ad-banner-screenshot-generator.git

# Navigate to directory
cd ad-banner-screenshot-generator

# Open in browser
open index.html
```

No build process required - pure client-side application!

## 📝 Training Your Own Model

Want to train on additional games? See [TRAINING_GUIDE.md](TRAINING_GUIDE.md)

```bash
# Install dependencies
pip3 install -r requirements.txt

# Train on your dataset
python3 train_billboard_model.py

# Export to ONNX
python3 export_to_onnx.py
```

## 🎮 Supported Games

Works best with:
- Roblox
- GTA Series
- Racing games (Forza, Need for Speed)
- Sports games (FIFA, NBA 2K, Madden)
- Any game with rectangular billboards/screens

## 📁 Project Structure

```
├── index.html              # Main application
├── css/
│   └── style.css          # Styling
├── js/
│   ├── app.js             # Core application logic
│   ├── detection.js       # AI detection & OpenCV
│   └── custom-model.js    # YOLO model inference
├── models/
│   └── billboard-detector.onnx  # Trained model
├── data/
│   └── games.json         # Pre-configured game templates
└── public/
    └── screenshots/       # Example screenshots
```

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use for commercial or personal projects.

## 👨‍💻 Author

Built by Dhwaj Goyal

---

⭐ Star this repo if you find it useful!
