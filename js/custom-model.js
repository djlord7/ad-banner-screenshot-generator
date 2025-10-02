// ===== CUSTOM YOLO MODEL LOADER =====

// Custom model state
let customModel = null;
let customModelReady = false;
let customModelPath = 'models/billboard-detector.onnx'; // Path to your trained model

// Model configuration
const YOLO_CONFIG = {
    inputSize: 640,  // YOLOv8 default input size
    confidenceThreshold: 0.25,  // Minimum confidence for detection
    iouThreshold: 0.45,  // NMS threshold for removing duplicate detections
    classes: ['billboard']  // Class names from your training (single class)
};

// Load custom YOLO model
async function loadCustomModel() {
    try {
        console.log('Attempting to load custom YOLO model...');
        showDetectionStatus('Loading custom billboard detector...');

        // Check if ONNX Runtime is available
        if (typeof ort === 'undefined') {
            throw new Error('ONNX Runtime not loaded');
        }

        // Try to load the custom model
        customModel = await ort.InferenceSession.create(customModelPath);
        customModelReady = true;

        console.log('✅ Custom YOLO model loaded successfully');
        console.log('Model inputs:', customModel.inputNames);
        console.log('Model outputs:', customModel.outputNames);

        hideDetectionStatus();
        return true;

    } catch (error) {
        console.log('Custom model not available:', error.message);
        console.log('Will use COCO-SSD as fallback');
        customModelReady = false;
        return false;
    }
}

// Preprocess image for YOLO (resize to 640x640, normalize, CHW format)
function preprocessImageForYOLO(image) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // YOLOv8 expects 640x640 input
    canvas.width = YOLO_CONFIG.inputSize;
    canvas.height = YOLO_CONFIG.inputSize;

    // Draw image scaled to 640x640 (letterbox with padding)
    const scale = Math.min(
        YOLO_CONFIG.inputSize / image.width,
        YOLO_CONFIG.inputSize / image.height
    );

    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;
    const offsetX = (YOLO_CONFIG.inputSize - scaledWidth) / 2;
    const offsetY = (YOLO_CONFIG.inputSize - scaledHeight) / 2;

    // Fill with gray padding
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, YOLO_CONFIG.inputSize, YOLO_CONFIG.inputSize);

    // Draw scaled image
    ctx.drawImage(image, offsetX, offsetY, scaledWidth, scaledHeight);

    // Get image data
    const imageData = ctx.getImageData(0, 0, YOLO_CONFIG.inputSize, YOLO_CONFIG.inputSize);
    const pixels = imageData.data;

    // Convert to CHW format (channels-height-width) and normalize to 0-1
    const input = new Float32Array(3 * YOLO_CONFIG.inputSize * YOLO_CONFIG.inputSize);

    for (let i = 0; i < YOLO_CONFIG.inputSize; i++) {
        for (let j = 0; j < YOLO_CONFIG.inputSize; j++) {
            const idx = (i * YOLO_CONFIG.inputSize + j) * 4;
            const baseIdx = i * YOLO_CONFIG.inputSize + j;

            // R channel
            input[baseIdx] = pixels[idx] / 255.0;
            // G channel
            input[YOLO_CONFIG.inputSize * YOLO_CONFIG.inputSize + baseIdx] = pixels[idx + 1] / 255.0;
            // B channel
            input[2 * YOLO_CONFIG.inputSize * YOLO_CONFIG.inputSize + baseIdx] = pixels[idx + 2] / 255.0;
        }
    }

    return {
        tensor: input,
        scale: scale,
        offsetX: offsetX,
        offsetY: offsetY
    };
}

// Post-process YOLO output (NMS, convert to bboxes)
function postprocessYOLO(output, originalWidth, originalHeight, preprocessInfo) {
    const detections = [];
    const { scale, offsetX, offsetY } = preprocessInfo;

    // YOLOv8 output format: [1, num_classes+4, 8400] TRANSPOSED
    // Data is organized as: [batch, features, predictions]
    // Features: [x_center, y_center, width, height, class_score_1, ...]

    const numClasses = YOLO_CONFIG.classes.length;
    const numFeatures = 4 + numClasses;  // 4 bbox + class scores
    const numPredictions = 8400;  // YOLOv8 default

    console.log(`Processing YOLO output: ${numFeatures} features x ${numPredictions} predictions`);

    for (let i = 0; i < numPredictions; i++) {
        // YOLOv8 format is TRANSPOSED: data[feature][prediction]
        // We need to access: data[i + feature*8400]
        // Coords are already in pixel space (0-640), NOT normalized
        const xCenterPixels = output[i];
        const yCenterPixels = output[i + numPredictions];
        const widthPixels = output[i + numPredictions * 2];
        const heightPixels = output[i + numPredictions * 3];

        // Get class scores (starting at index 4*8400)
        // Model outputs very small scores directly (no sigmoid needed)
        let maxScore = 0;
        let classId = 0;

        for (let c = 0; c < numClasses; c++) {
            const score = output[i + numPredictions * (4 + c)];
            if (score > maxScore) {
                maxScore = score;
                classId = c;
            }
        }

        // Filter by confidence threshold
        if (maxScore < YOLO_CONFIG.confidenceThreshold) {
            continue;
        }

        // Convert from 640x640 back to original image coordinates
        const x1 = ((xCenterPixels - widthPixels / 2) - offsetX) / scale;
        const y1 = ((yCenterPixels - heightPixels / 2) - offsetY) / scale;
        const x2 = ((xCenterPixels + widthPixels / 2) - offsetX) / scale;
        const y2 = ((yCenterPixels + heightPixels / 2) - offsetY) / scale;

        // Clamp to image bounds
        const clampedX1 = Math.max(0, Math.min(originalWidth, x1));
        const clampedY1 = Math.max(0, Math.min(originalHeight, y1));
        const clampedX2 = Math.max(0, Math.min(originalWidth, x2));
        const clampedY2 = Math.max(0, Math.min(originalHeight, y2));

        // Validate box dimensions
        const boxWidth = clampedX2 - clampedX1;
        const boxHeight = clampedY2 - clampedY1;

        if (boxWidth > 5 && boxHeight > 5) {  // Minimum size filter
            detections.push({
                bbox: [
                    clampedX1,
                    clampedY1,
                    boxWidth,
                    boxHeight
                ],
                class: YOLO_CONFIG.classes[classId],
                score: maxScore
            });
        }
    }

    console.log(`Found ${detections.length} raw detections before NMS`);

    // Apply NMS (Non-Maximum Suppression)
    const finalDetections = applyNMS(detections, YOLO_CONFIG.iouThreshold);
    console.log(`After NMS: ${finalDetections.length} detections`);

    return finalDetections;
}

// Non-Maximum Suppression
function applyNMS(detections, iouThreshold) {
    // Sort by score descending
    detections.sort((a, b) => b.score - a.score);

    const keep = [];
    const suppressed = new Set();

    for (let i = 0; i < detections.length; i++) {
        if (suppressed.has(i)) continue;

        keep.push(detections[i]);

        const boxA = detections[i].bbox;

        for (let j = i + 1; j < detections.length; j++) {
            if (suppressed.has(j)) continue;

            const boxB = detections[j].bbox;
            const iou = calculateIoU(boxA, boxB);

            if (iou > iouThreshold) {
                suppressed.add(j);
            }
        }
    }

    return keep;
}

// Calculate Intersection over Union
function calculateIoU(boxA, boxB) {
    const [x1A, y1A, wA, hA] = boxA;
    const [x1B, y1B, wB, hB] = boxB;

    const x2A = x1A + wA;
    const y2A = y1A + hA;
    const x2B = x1B + wB;
    const y2B = y1B + hB;

    const xInter1 = Math.max(x1A, x1B);
    const yInter1 = Math.max(y1A, y1B);
    const xInter2 = Math.min(x2A, x2B);
    const yInter2 = Math.min(y2A, y2B);

    const interWidth = Math.max(0, xInter2 - xInter1);
    const interHeight = Math.max(0, yInter2 - yInter1);
    const interArea = interWidth * interHeight;

    const areaA = wA * hA;
    const areaB = wB * hB;
    const unionArea = areaA + areaB - interArea;

    return interArea / unionArea;
}

// Detect billboards using custom YOLO model
async function detectWithCustomYOLO(image) {
    if (!customModelReady || !customModel) {
        throw new Error('Custom model not ready');
    }

    try {
        showDetectionStatus('Running custom billboard detection...');

        // Preprocess image
        const preprocessed = preprocessImageForYOLO(image);

        // Create tensor
        const inputTensor = new ort.Tensor('float32', preprocessed.tensor, [
            1,
            3,
            YOLO_CONFIG.inputSize,
            YOLO_CONFIG.inputSize
        ]);

        // Run inference
        const feeds = { images: inputTensor };
        const results = await customModel.run(feeds);

        // Get output (name might vary: output0, output, etc.)
        const outputName = customModel.outputNames[0];
        const outputTensor = results[outputName];
        const output = outputTensor.data;

        // Debug: Log tensor shape and sample values
        console.log('Output tensor shape:', outputTensor.dims);
        console.log('Output tensor size:', output.length);
        console.log('First 20 values:', Array.from(output.slice(0, 20)));
        console.log('Max value in output:', Math.max(...output));
        console.log('Min value in output:', Math.min(...output));

        // Post-process
        const detections = postprocessYOLO(output, image.width, image.height, preprocessed);

        console.log(`Custom YOLO detected ${detections.length} billboard(s)`);

        // Convert to our standard format
        const billboardCandidates = detections.map((det, idx) => {
            const [x, y, width, height] = det.bbox;

            // Try perspective detection
            let corners;
            try {
                corners = findPerspectiveCornersInROI(image, {
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(width),
                    height: Math.round(height)
                });
            } catch (e) {
                corners = {
                    topLeft: { x: Math.round(x), y: Math.round(y) },
                    topRight: { x: Math.round(x + width), y: Math.round(y) },
                    bottomLeft: { x: Math.round(x), y: Math.round(y + height) },
                    bottomRight: { x: Math.round(x + width), y: Math.round(y + height) }
                };
            }

            return {
                rect: {
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(width),
                    height: Math.round(height),
                    area: width * height
                },
                corners: corners,
                score: det.score * 100,  // Convert to 0-100 scale
                confidence: det.score,
                class: det.class,
                method: 'custom-yolo'
            };
        });

        return billboardCandidates;

    } catch (error) {
        console.error('Custom YOLO detection failed:', error);
        throw error;
    }
}

// Initialize custom model on page load (if available)
if (typeof ort !== 'undefined') {
    loadCustomModel();
}
