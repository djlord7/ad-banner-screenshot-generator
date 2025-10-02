// ===== ML & AUTO-DETECTION FUNCTIONS =====

// ML Model state
let cocoSsdModel = null;
let mlModelReady = false;

// OpenCV ready callback
function onOpenCvReady() {
    openCvReady = true;
    console.log('✅ OpenCV.js loaded successfully');
}

// Load COCO-SSD model
async function loadMLModel() {
    try {
        showDetectionStatus('Loading AI model...');
        console.log('Loading TensorFlow.js COCO-SSD model...');
        cocoSsdModel = await cocoSsd.load();
        mlModelReady = true;
        console.log('✅ AI model loaded successfully');
        hideDetectionStatus();
    } catch (error) {
        console.error('Failed to load ML model:', error);
        console.log('Will use OpenCV fallback');
        mlModelReady = false;
    }
}

// Initialize ML model on page load
if (typeof cocoSsd !== 'undefined') {
    loadMLModel();
}

// Find perspective corners within a region of interest
function findPerspectiveCornersInROI(image, bbox) {
    if (!openCvReady || typeof cv === 'undefined') {
        throw new Error('OpenCV not ready');
    }

    try {
        // Create a canvas to extract ROI
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = bbox.width;
        tempCanvas.height = bbox.height;

        // Draw the ROI
        tempCtx.drawImage(image, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height);

        // Convert to OpenCV matrix
        const src = cv.imread(tempCanvas);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Apply adaptive threshold to enhance edges
        const binary = new cv.Mat();
        cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

        // Find contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let bestQuad = null;
        let bestArea = 0;

        // Look for the largest quadrilateral
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);

            // Must be significant portion of ROI
            if (area > bbox.width * bbox.height * 0.3) {
                const approx = new cv.Mat();
                const peri = cv.arcLength(contour, true);
                cv.approxPolyDP(contour, approx, 0.02 * peri, true);

                // Check if it's a quadrilateral
                if (approx.rows === 4 && area > bestArea) {
                    bestArea = area;

                    // Extract corner points
                    const corners = [];
                    for (let j = 0; j < 4; j++) {
                        corners.push({
                            x: bbox.x + approx.data32S[j * 2],
                            y: bbox.y + approx.data32S[j * 2 + 1]
                        });
                    }

                    bestQuad = sortCorners(corners);
                }
                approx.delete();
            }
            contour.delete();
        }

        // Cleanup
        src.delete();
        gray.delete();
        binary.delete();
        contours.delete();
        hierarchy.delete();

        if (bestQuad) {
            return bestQuad;
        } else {
            throw new Error('No quadrilateral found');
        }

    } catch (error) {
        console.log('Perspective detection failed:', error.message);
        throw error;
    }
}

// ML-based billboard detection using COCO-SSD
async function detectBillboardsWithML(image) {
    showDetectionStatus('AI analyzing screenshot...');

    try {
        // Run COCO-SSD detection
        const predictions = await cocoSsdModel.detect(image);

        console.log('COCO-SSD raw predictions:', predictions);

        // Filter for billboard-like objects and score them
        const billboardCandidates = [];

        // Expanded classes that could be billboards/screens in games
        // Primary: screens and displays
        // Secondary: objects that might be misclassified billboards
        const billboardClasses = {
            primary: ['tv', 'laptop', 'monitor'],  // High confidence - definitely screens
            secondary: ['book', 'clock', 'cell phone', 'refrigerator', 'oven', 'microwave']  // Might be billboards
        };

        const allBillboardClasses = [...billboardClasses.primary, ...billboardClasses.secondary];

        predictions.forEach((prediction, index) => {
            const [x, y, width, height] = prediction.bbox;

            // Only consider billboard-like objects
            if (!allBillboardClasses.includes(prediction.class)) {
                return;
            }

            // Boost score for primary classes
            const isPrimaryClass = billboardClasses.primary.includes(prediction.class);

            // Calculate center position
            const centerY = y + (height / 2);
            const relativeY = centerY / image.height;

            // Filter by position - billboards are in upper/middle portion
            if (relativeY > 0.8) {
                console.log(`Filtered out ${prediction.class} at y=${relativeY.toFixed(2)} (too low)`);
                return;
            }

            // Filter by size
            const imageArea = image.width * image.height;
            const objArea = width * height;
            const areaPercent = objArea / imageArea;

            if (areaPercent < 0.01 || areaPercent > 0.4) {
                console.log(`Filtered out ${prediction.class} - area ${(areaPercent * 100).toFixed(1)}% (too small/large)`);
                return;
            }

            // Calculate aspect ratio
            const aspectRatio = width / height;
            if (aspectRatio < 0.3 || aspectRatio > 8) {
                console.log(`Filtered out ${prediction.class} - aspect ratio ${aspectRatio.toFixed(2)} (invalid)`);
                return;
            }

            // Score the candidate
            let score = 0;

            // Base confidence from ML model (40 points max)
            // Boost primary classes (tv, monitor, laptop)
            const classBoost = isPrimaryClass ? 1.2 : 0.8;
            score += (prediction.score * 40) * classBoost;

            // Position score (30 points max)
            if (relativeY < 0.4) {
                score += 30;
            } else if (relativeY < 0.6) {
                score += 20;
            } else {
                score += 10;
            }

            // Size score (15 points max)
            if (areaPercent >= 0.02 && areaPercent <= 0.3) {
                score += 15;
            } else if (areaPercent >= 0.01 && areaPercent < 0.02) {
                score += 8;
            }

            // Aspect ratio score (15 points max)
            const commonRatios = [16/9, 4/3, 3/2, 2/1, 3/1];
            let bestRatioMatch = 0;
            commonRatios.forEach(ratio => {
                const diff = Math.abs(aspectRatio - ratio) / ratio;
                if (diff < 0.2) {
                    bestRatioMatch = Math.max(bestRatioMatch, 15 - (diff * 75));
                }
            });
            score += bestRatioMatch;

            // Try to find perspective corners within the bounding box
            let corners;
            let hasPerspective = false;
            try {
                corners = findPerspectiveCornersInROI(image, {
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(width),
                    height: Math.round(height)
                });
                hasPerspective = true;
                console.log(`✓ Found perspective corners for ${prediction.class}`);
            } catch (e) {
                // Fallback to simple rectangle if perspective detection fails
                corners = {
                    topLeft: { x: Math.round(x), y: Math.round(y) },
                    topRight: { x: Math.round(x + width), y: Math.round(y) },
                    bottomLeft: { x: Math.round(x), y: Math.round(y + height) },
                    bottomRight: { x: Math.round(x + width), y: Math.round(y + height) }
                };
                console.log(`✗ Using bbox corners for ${prediction.class}`);
            }

            // Boost score if we found actual perspective corners
            if (hasPerspective) {
                score += 5; // Extra confidence for perspective detection
            }

            billboardCandidates.push({
                rect: {
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(width),
                    height: Math.round(height),
                    area: width * height
                },
                corners: corners,
                score: score,
                confidence: prediction.score,
                class: prediction.class,
                method: 'ml-coco-ssd',
                scoreBreakdown: {
                    mlConfidence: prediction.score * 40,
                    position: relativeY < 0.4 ? 30 : (relativeY < 0.6 ? 20 : 10),
                    size: areaPercent >= 0.02 && areaPercent <= 0.3 ? 15 : 8,
                    aspectRatio: bestRatioMatch
                }
            });
        });

        // Sort by score
        billboardCandidates.sort((a, b) => b.score - a.score);

        // Return top 3 candidates
        const topCandidates = billboardCandidates.slice(0, 3);

        console.log('ML Billboard candidates:', topCandidates.map(c => ({
            class: c.class,
            position: `${c.rect.x},${c.rect.y}`,
            size: `${c.rect.width}x${c.rect.height}`,
            score: Math.round(c.score),
            breakdown: c.scoreBreakdown
        })));

        return topCandidates;

    } catch (error) {
        console.error('ML detection error:', error);
        return [];
    }
}

// Setup new screenshot upload listeners
function setupDetectionListeners() {
    const uploadNewScreenshotArea = document.getElementById('upload-new-screenshot-area');
    const newScreenshotUpload = document.getElementById('new-screenshot-upload');

    if (uploadNewScreenshotArea && newScreenshotUpload) {
        uploadNewScreenshotArea.addEventListener('click', () => {
            newScreenshotUpload.click();
        });

        newScreenshotUpload.addEventListener('change', handleNewScreenshotUpload);
    }
}

// Handle new screenshot upload
function handleNewScreenshotUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
        alert('Please upload a valid image file (JPG or PNG)');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
    }

    // Check if either ML or OpenCV is ready
    if (!mlModelReady && !openCvReady) {
        alert('Detection models are still loading. Please wait a moment and try again.');
        return;
    }

    showDetectionStatus('Loading image...');

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = async function() {
            uploadedScreenshot = img;
            await detectBillboards(img);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Show detection status
function showDetectionStatus(message) {
    const statusDiv = document.getElementById('detection-status');
    const statusText = document.getElementById('status-text');
    if (statusDiv && statusText) {
        statusText.textContent = message;
        statusDiv.style.display = 'block';
    }
}

// Hide detection status
function hideDetectionStatus() {
    const statusDiv = document.getElementById('detection-status');
    if (statusDiv) {
        statusDiv.style.display = 'none';
    }
}

// Main detection function - prioritize custom model > COCO-SSD > OpenCV
async function detectBillboards(image) {
    let mlResults = [];
    let openCvResults = [];

    // Priority 1: Try custom YOLO model first (if trained and loaded)
    if (customModelReady && customModel) {
        console.log('Using custom YOLO model (trained on game billboards)...');
        try {
            mlResults = await detectWithCustomYOLO(image);
            console.log(`Custom YOLO detected ${mlResults.length} billboard(s)`);

            // If custom model found good results, use them
            if (mlResults.length > 0) {
                detectedRectangles = mlResults.slice(0, 3);
                showDetectionResults();
                return;
            }
        } catch (error) {
            console.error('Custom YOLO failed, falling back to COCO-SSD:', error);
        }
    }

    // Priority 2: Try COCO-SSD if custom model not available or failed
    if (mlModelReady && cocoSsdModel) {
        console.log('Running ML detection (COCO-SSD fallback)...');
        try {
            mlResults = await detectBillboardsWithML(image);
            console.log(`COCO-SSD detected ${mlResults.length} candidate(s)`);
        } catch (error) {
            console.error('COCO-SSD detection failed:', error);
        }
    }

    // If ML found less than 2 candidates, also run OpenCV for supplemental detection
    if (mlResults.length < 2 && openCvReady && typeof cv !== 'undefined') {
        console.log('Running OpenCV detection for additional candidates...');
        try {
            openCvResults = detectBillboardsWithOpenCV(image);
            console.log(`OpenCV detected ${openCvResults.length} candidate(s)`);
        } catch (error) {
            console.error('OpenCV detection failed:', error);
        }
    }

    // Merge and deduplicate results
    const combinedResults = mergeDetectionResults(mlResults, openCvResults);

    if (combinedResults.length > 0) {
        detectedRectangles = combinedResults;
        console.log(`Final: ${combinedResults.length} billboard(s) after merging`);
        showDetectionResults();
    } else {
        showDetectionStatus('No billboards detected. Try manual selection.');
        setTimeout(() => {
            hideDetectionStatus();
            loadUploadedScreenshotToEditor();
        }, 2000);
    }
}

// Merge ML and OpenCV results, removing duplicates
function mergeDetectionResults(mlResults, openCvResults) {
    const merged = [...mlResults];

    // Add OpenCV results that don't overlap significantly with ML results
    openCvResults.forEach(cvResult => {
        let isDuplicate = false;

        for (const mlResult of mlResults) {
            const overlap = calculateOverlap(cvResult.rect, mlResult.rect);
            if (overlap > 0.5) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            // Boost score slightly since it was found by both methods potentially
            merged.push(cvResult);
        }
    });

    // Sort by score
    merged.sort((a, b) => b.score - a.score);

    // Return top 3
    return merged.slice(0, 3);
}

// OpenCV-based detection (returns results instead of setting global state)
function detectBillboardsWithOpenCV(image) {
    try {
        // Create canvas for OpenCV processing
        const src = cv.imread(image);
        const gray = new cv.Mat();

        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

        let localDetectedRectangles = [];

        // Strategy 1: Edge-based detection
        detectWithEdges(gray, image, localDetectedRectangles);

        // Strategy 2: Color-based detection
        detectWithColor(src, image, localDetectedRectangles);

        // Strategy 3: Feature-based detection
        detectWithFeatures(gray, image, localDetectedRectangles);

        // Remove duplicates
        localDetectedRectangles = removeDuplicates(localDetectedRectangles);

        // Filter for higher quality detections
        localDetectedRectangles = filterHighQualityDetections(localDetectedRectangles, image, src);

        // Sort by score
        localDetectedRectangles.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return b.area - a.area;
        });

        // Clean up
        src.delete();
        gray.delete();

        // Return top 3
        return localDetectedRectangles.slice(0, 3);

    } catch (error) {
        console.error('OpenCV detection error:', error);
        return [];
    }
}

// Strategy 1: Edge-based detection
function detectWithEdges(gray, image, resultsArray) {
    const edges = new cv.Mat();
    const hierarchy = new cv.Mat();
    const contours = new cv.MatVector();

    // Apply bilateral filter to reduce noise while preserving edges
    const filtered = new cv.Mat();
    cv.bilateralFilter(gray, filtered, 9, 75, 75, cv.BORDER_DEFAULT);

    // Try multiple Canny thresholds
    const thresholds = [
        [50, 150],
        [70, 200]
    ];

    thresholds.forEach(([low, high]) => {
        cv.Canny(filtered, edges, low, high, 3, false);

        // Dilate to connect nearby edges
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.dilate(edges, edges, kernel);
        kernel.delete();

        // Find contours
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        // Filter rectangles - stricter area requirements
        const minArea = (image.width * image.height) * 0.01;  // 1% of image (increased from 0.5%)
        const maxArea = (image.width * image.height) * 0.35;  // 35% of image (decreased from 40%)

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);

            if (area > minArea && area < maxArea) {
                // Approximate polygon
                const approx = new cv.Mat();
                const peri = cv.arcLength(contour, true);
                cv.approxPolyDP(contour, approx, 0.02 * peri, true);

                // Check if it's a quadrilateral (4 vertices)
                if (approx.rows === 4) {
                    const rect = cv.boundingRect(approx);

                    // Stricter aspect ratio check for billboards (typically 0.5 to 5)
                    const aspectRatio = rect.width / rect.height;
                    if (aspectRatio > 0.5 && aspectRatio < 5) {
                        const corners = [];
                        for (let j = 0; j < 4; j++) {
                            corners.push({
                                x: approx.data32S[j * 2],
                                y: approx.data32S[j * 2 + 1]
                            });
                        }

                        const sorted = sortCorners(corners);
                        resultsArray.push({
                            rect: rect,
                            corners: sorted,
                            area: area,
                            method: 'edge'
                        });
                    }
                }
                approx.delete();
            }
            contour.delete();
        }
    });

    filtered.delete();
    edges.delete();
    hierarchy.delete();
    contours.delete();
}

// Strategy 2: Color-based detection
function detectWithColor(src, image, resultsArray) {
    const hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);

    // Detect bright regions (common for illuminated billboards)
    const mask = new cv.Mat();
    const lowBright = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 150, 0]);
    const highBright = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 255, 255, 255]);
    cv.inRange(hsv, lowBright, highBright, mask);

    // Morphological operations to clean up
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    kernel.delete();

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = (image.width * image.height) * 0.01;  // Increased from 0.005
    const maxArea = (image.width * image.height) * 0.35;  // Decreased from 0.4

    for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        if (area > minArea && area < maxArea) {
            const rect = cv.minAreaRect(contour);
            const box = cv.RotatedRect.points(rect);

            // Convert to our corner format
            const corners = sortCorners([
                { x: box[0].x, y: box[0].y },
                { x: box[1].x, y: box[1].y },
                { x: box[2].x, y: box[2].y },
                { x: box[3].x, y: box[3].y }
            ]);

            const boundingRect = cv.boundingRect(contour);
            resultsArray.push({
                rect: boundingRect,
                corners: corners,
                area: area,
                method: 'color'
            });
        }
        contour.delete();
    }

    hsv.delete();
    mask.delete();
    lowBright.delete();
    highBright.delete();
    contours.delete();
    hierarchy.delete();
}

// Strategy 3: Feature-based detection
function detectWithFeatures(gray, image, resultsArray) {
    // Adaptive threshold to find text/content regions
    const binary = new cv.Mat();
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = (image.width * image.height) * 0.01;  // Increased from 0.005
    const maxArea = (image.width * image.height) * 0.35;  // Decreased from 0.4

    for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        if (area > minArea && area < maxArea) {
            const rect = cv.boundingRect(contour);
            const aspectRatio = rect.width / rect.height;

            if (aspectRatio > 0.5 && aspectRatio < 5) {
                // Create corners from bounding rect
                const corners = sortCorners([
                    { x: rect.x, y: rect.y },
                    { x: rect.x + rect.width, y: rect.y },
                    { x: rect.x, y: rect.y + rect.height },
                    { x: rect.x + rect.width, y: rect.y + rect.height }
                ]);

                resultsArray.push({
                    rect: rect,
                    corners: corners,
                    area: area,
                    method: 'feature'
                });
            }
        }
        contour.delete();
    }

    binary.delete();
    contours.delete();
    hierarchy.delete();
}

// Remove duplicate detections
function removeDuplicates(rectangles) {
    const unique = [];
    const overlapThreshold = 0.5; // 50% overlap threshold

    rectangles.forEach(rect1 => {
        let isDuplicate = false;

        for (const rect2 of unique) {
            const overlap = calculateOverlap(rect1.rect, rect2.rect);
            if (overlap > overlapThreshold) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            unique.push(rect1);
        }
    });

    return unique;
}

// Advanced billboard detection scoring
function scoreBillboardCandidate(detected, image, srcMat) {
    const { rect, corners } = detected;
    let totalScore = 0;
    const scores = {};

    // 1. Position Score (30%) - Billboards are typically in upper portion of image, not on ground
    const centerY = (corners.topLeft.y + corners.bottomLeft.y) / 2;
    const relativeY = centerY / image.height;

    if (relativeY < 0.4) {
        // Upper 40% - excellent (billboards are elevated)
        scores.position = 30;
    } else if (relativeY < 0.6) {
        // Middle section - good
        scores.position = 20;
    } else if (relativeY < 0.75) {
        // Lower middle - poor
        scores.position = 5;
    } else {
        // Bottom 25% - very unlikely to be billboard (ground level)
        scores.position = 0;
    }

    // 2. Aspect Ratio Score (15%) - Common billboard formats
    const aspectRatio = rect.width / rect.height;
    const commonRatios = [
        { ratio: 16/9, name: '16:9' },
        { ratio: 4/3, name: '4:3' },
        { ratio: 3/2, name: '3:2' },
        { ratio: 2/1, name: '2:1' },
        { ratio: 3/1, name: '3:1' }
    ];

    let bestRatioMatch = 0;
    commonRatios.forEach(({ ratio }) => {
        const diff = Math.abs(aspectRatio - ratio) / ratio;
        if (diff < 0.15) { // Within 15% of common ratio
            bestRatioMatch = Math.max(bestRatioMatch, 15 - (diff * 100));
        }
    });
    scores.aspectRatio = bestRatioMatch;

    // 3. Size Appropriateness (10%) - Billboards should be noticeable but not dominate
    const imageArea = image.width * image.height;
    const rectAreaPercent = rect.area / imageArea;

    if (rectAreaPercent >= 0.02 && rectAreaPercent <= 0.25) {
        // 2-25% of image - appropriate size
        scores.size = 10;
    } else if (rectAreaPercent >= 0.01 && rectAreaPercent < 0.02) {
        // Slightly small
        scores.size = 5;
    } else {
        // Too small or too large
        scores.size = 0;
    }

    // 4. Content Richness (25%) - Billboards have varied colors and details
    try {
        const roi = srcMat.roi(rect);

        // Color variance
        const mean = new cv.Mat();
        const stddev = new cv.Mat();
        cv.meanStdDev(roi, mean, stddev);

        const avgStdDev = (stddev.data64F[0] + stddev.data64F[1] + stddev.data64F[2]) / 3;
        const colorVarianceScore = Math.min(15, avgStdDev / 5); // Higher variance = more content

        // Edge density - billboards have text and graphics
        const grayROI = new cv.Mat();
        cv.cvtColor(roi, grayROI, cv.COLOR_RGBA2GRAY);
        const edges = new cv.Mat();
        cv.Canny(grayROI, edges, 50, 150);
        const edgePixels = cv.countNonZero(edges);
        const edgeDensity = edgePixels / (rect.width * rect.height);
        const edgeScore = Math.min(10, edgeDensity * 100);

        scores.contentRichness = colorVarianceScore + edgeScore;

        mean.delete();
        stddev.delete();
        roi.delete();
        grayROI.delete();
        edges.delete();
    } catch (e) {
        scores.contentRichness = 0;
    }

    // 5. Contrast Score (10%) - Billboards stand out from surroundings
    try {
        const expandedRect = {
            x: Math.max(0, rect.x - 20),
            y: Math.max(0, rect.y - 20),
            width: Math.min(image.width - rect.x + 20, rect.width + 40),
            height: Math.min(image.height - rect.y + 20, rect.height + 40)
        };

        const roi = srcMat.roi(rect);
        const surroundings = srcMat.roi(expandedRect);

        const roiMean = new cv.Mat();
        const surroundingsMean = new cv.Mat();
        cv.mean(roi, roiMean);
        cv.mean(surroundings, surroundingsMean);

        const contrast = Math.abs(
            (roiMean.data64F[0] + roiMean.data64F[1] + roiMean.data64F[2]) -
            (surroundingsMean.data64F[0] + surroundingsMean.data64F[1] + surroundingsMean.data64F[2])
        );

        scores.contrast = Math.min(10, contrast / 30);

        roi.delete();
        surroundings.delete();
        roiMean.delete();
        surroundingsMean.delete();
    } catch (e) {
        scores.contrast = 5; // Default moderate score
    }

    // 6. Geometry Quality (10%) - Clean rectangular shape
    const width1 = Math.abs(corners.topRight.x - corners.topLeft.x);
    const width2 = Math.abs(corners.bottomRight.x - corners.bottomLeft.x);
    const height1 = Math.abs(corners.bottomLeft.y - corners.topLeft.y);
    const height2 = Math.abs(corners.bottomRight.y - corners.topRight.y);

    const widthRatio = Math.max(width1, width2) / Math.min(width1, width2);
    const heightRatio = Math.max(height1, height2) / Math.min(height1, height2);

    if (widthRatio < 1.2 && heightRatio < 1.2) {
        scores.geometry = 10; // Very rectangular
    } else if (widthRatio < 1.5 && heightRatio < 1.5) {
        scores.geometry = 5; // Somewhat rectangular
    } else {
        scores.geometry = 0; // Too distorted
    }

    // Calculate total score
    totalScore = scores.position + scores.aspectRatio + scores.size +
                 scores.contentRichness + scores.contrast + scores.geometry;

    detected.score = totalScore;
    detected.scoreBreakdown = scores;

    return totalScore;
}

// Filter for high-quality detections with intelligent scoring
function filterHighQualityDetections(rectangles, image, srcMat) {
    // Score all candidates
    rectangles.forEach(detected => {
        scoreBillboardCandidate(detected, image, srcMat);
    });

    // Filter by minimum score threshold (50 out of 100)
    const filtered = rectangles.filter(detected => {
        // Basic geometric validation
        const { rect, corners, score } = detected;

        // Must meet minimum size
        if (rect.width < 80 || rect.height < 80) {
            return false;
        }

        // Must have reasonable aspect ratio
        const aspectRatio = rect.width / rect.height;
        if (aspectRatio < 0.3 || aspectRatio > 6) {
            return false;
        }

        // Must meet minimum confidence score
        if (score < 45) {
            return false;
        }

        // Must not be too distorted
        const width1 = Math.abs(corners.topRight.x - corners.topLeft.x);
        const width2 = Math.abs(corners.bottomRight.x - corners.bottomLeft.x);
        const height1 = Math.abs(corners.bottomLeft.y - corners.topLeft.y);
        const height2 = Math.abs(corners.bottomRight.y - corners.topRight.y);

        const widthRatio = Math.max(width1, width2) / Math.min(width1, width2);
        const heightRatio = Math.max(height1, height2) / Math.min(height1, height2);

        if (widthRatio > 2.5 || heightRatio > 2.5) {
            return false;
        }

        return true;
    });

    console.log('Billboard detection scores:', filtered.map(d => ({
        position: `${Math.round(d.rect.x)},${Math.round(d.rect.y)}`,
        score: Math.round(d.score),
        breakdown: d.scoreBreakdown
    })));

    return filtered;
}

// Calculate overlap between two rectangles
function calculateOverlap(rect1, rect2) {
    const x1 = Math.max(rect1.x, rect2.x);
    const y1 = Math.max(rect1.y, rect2.y);
    const x2 = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
    const y2 = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);

    if (x2 < x1 || y2 < y1) return 0;

    const intersectionArea = (x2 - x1) * (y2 - y1);
    const rect1Area = rect1.width * rect1.height;
    const rect2Area = rect2.width * rect2.height;
    const unionArea = rect1Area + rect2Area - intersectionArea;

    return intersectionArea / unionArea;
}

// Sort corners: top-left, top-right, bottom-left, bottom-right
function sortCorners(corners) {
    // Find center point
    const centerX = corners.reduce((sum, p) => sum + p.x, 0) / 4;
    const centerY = corners.reduce((sum, p) => sum + p.y, 0) / 4;

    const sorted = {
        topLeft: null,
        topRight: null,
        bottomLeft: null,
        bottomRight: null
    };

    corners.forEach(corner => {
        if (corner.x < centerX && corner.y < centerY) {
            sorted.topLeft = corner;
        } else if (corner.x >= centerX && corner.y < centerY) {
            sorted.topRight = corner;
        } else if (corner.x < centerX && corner.y >= centerY) {
            sorted.bottomLeft = corner;
        } else {
            sorted.bottomRight = corner;
        }
    });

    return sorted;
}

// Show detection results
function showDetectionResults() {
    if (detectedRectangles.length === 0) {
        showDetectionStatus('No billboards detected. Try manual selection.');
        setTimeout(() => {
            hideDetectionStatus();
            loadUploadedScreenshotToEditor();
        }, 2000);
        return;
    }

    showDetectionStatus(`Found ${detectedRectangles.length} potential billboard(s). Click to select.`);

    // Load screenshot into editor with detection overlay
    loadUploadedScreenshotToEditor();
    showBillboardCandidates();
}

// Load uploaded screenshot to editor
function loadUploadedScreenshotToEditor() {
    // Create temporary screenshot entry
    currentScreenshot = {
        id: 'uploaded-temp',
        filename: 'uploaded-screenshot.png',
        bannerSize: '300x600',
        billboards: [{
            id: 'billboard-1',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            perspective: {
                topLeft: { x: 0, y: 0 },
                topRight: { x: 100, y: 0 },
                bottomLeft: { x: 0, y: 100 },
                bottomRight: { x: 100, y: 100 }
            }
        }]
    };

    currentGame = { name: 'Uploaded Screenshot', id: 'uploaded' };

    // Hide selection panel and gallery
    document.querySelector('.selection-panel').style.display = 'none';
    gallerySection.style.display = 'none';

    // Show editor
    editorSection.style.display = 'block';

    // Update back button text for uploaded screenshot workflow
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.textContent = '← Back to Home';
    }

    // Load the uploaded image
    baseImage = uploadedScreenshot;
    canvas.width = baseImage.width;
    canvas.height = baseImage.height;
    ctx.drawImage(baseImage, 0, 0);

    // Show area selection controls
    const areaSelectionControls = document.getElementById('area-selection-controls');
    if (areaSelectionControls) {
        areaSelectionControls.style.display = 'block';
    }

    // Populate billboard list
    populateBillboardList();
}

// Show billboard candidates overlay
function showBillboardCandidates() {
    // Draw detected rectangles on canvas with green outlines only (no badges)
    detectedRectangles.forEach((detected, index) => {
        const { corners } = detected;

        // Draw rectangle outline
        ctx.strokeStyle = '#10b981'; // Green
        ctx.lineWidth = 3;
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
        ctx.lineTo(corners.topRight.x, corners.topRight.y);
        ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
        ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
        ctx.closePath();
        ctx.stroke();
    });

    // Populate the detected billboards list in sidebar
    const detectedList = document.getElementById('detected-list');
    const detectedBillboardsList = document.getElementById('detected-billboards-list');

    if (detectedList && detectedBillboardsList) {
        detectedList.innerHTML = '';

        detectedRectangles.forEach((detected, index) => {
            const { rect, corners } = detected;

            const btn = document.createElement('div');
            btn.className = 'detected-billboard-btn';
            btn.dataset.billboardIndex = index;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `billboard-checkbox-${index}`;
            checkbox.dataset.billboardIndex = index;

            const billboardInfo = document.createElement('div');
            billboardInfo.className = 'billboard-info';
            billboardInfo.innerHTML = `
                <div><strong>Billboard ${index + 1}</strong></div>
                <div class="billboard-position">Position: ${Math.round(corners.topLeft.x)}, ${Math.round(corners.topLeft.y)} | Size: ${Math.round(rect.width)}×${Math.round(rect.height)}px</div>
            `;

            btn.appendChild(checkbox);
            btn.appendChild(billboardInfo);

            // Checkbox change handler - toggle render selection
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                handleBillboardRenderToggle(index, checkbox.checked);
            });

            // Button click handler (not checkbox) - set active for editing
            btn.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    setActiveBillboard(index);
                }
            });

            detectedList.appendChild(btn);
        });

        detectedBillboardsList.style.display = 'block';
    }
}

// Handle billboard selection from detected candidates
function handleBillboardSelection(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if clicked inside any detected rectangle
    for (let i = 0; i < detectedRectangles.length; i++) {
        const { corners } = detectedRectangles[i];

        // Simple point-in-polygon test
        if (isPointInRectangle(x, y, corners)) {
            applyDetectedBillboard(i);
            return;
        }
    }
}

// Check if point is inside rectangle
function isPointInRectangle(x, y, corners) {
    const minX = Math.min(corners.topLeft.x, corners.bottomLeft.x);
    const maxX = Math.max(corners.topRight.x, corners.bottomRight.x);
    const minY = Math.min(corners.topLeft.y, corners.topRight.y);
    const maxY = Math.max(corners.bottomLeft.y, corners.bottomRight.y);

    return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

// Set active billboard for editing
function setActiveBillboard(index) {
    // Remove active class from all buttons
    document.querySelectorAll('.detected-billboard-btn').forEach(b => b.classList.remove('active'));

    // Add active class to clicked button
    const activeBtn = document.querySelector(`.detected-billboard-btn[data-billboard-index="${index}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Store active billboard index globally
    window.activeBillboardIndex = index;

    const detected = detectedRectangles[index];
    const { corners } = detected;

    // Update current screenshot billboard
    currentScreenshot.billboards[0].perspective = {
        topLeft: { x: Math.round(corners.topLeft.x), y: Math.round(corners.topLeft.y) },
        topRight: { x: Math.round(corners.topRight.x), y: Math.round(corners.topRight.y) },
        bottomLeft: { x: Math.round(corners.bottomLeft.x), y: Math.round(corners.bottomLeft.y) },
        bottomRight: { x: Math.round(corners.bottomRight.x), y: Math.round(corners.bottomRight.y) }
    };

    currentScreenshot.billboards[0].x = Math.round(corners.topLeft.x);
    currentScreenshot.billboards[0].y = Math.round(corners.topLeft.y);
    currentScreenshot.billboards[0].width = Math.round(corners.topRight.x - corners.topLeft.x);
    currentScreenshot.billboards[0].height = Math.round(corners.bottomLeft.y - corners.topLeft.y);

    selectedBillboard = currentScreenshot.billboards[0];
    selectedBillboardIndex = 0;

    // Redraw canvas with all billboards and highlight active one
    redrawDetectedBillboards();

    // Update status
    hideDetectionStatus();

    // Show upload controls
    billboardControls.style.display = 'block';
}

// Handle billboard render toggle (checkbox)
function handleBillboardRenderToggle(index, isChecked) {
    if (!window.selectedBillboardsForRender) {
        window.selectedBillboardsForRender = [];
    }

    const detected = detectedRectangles[index];

    if (isChecked) {
        // Add to render list with banner placeholder
        window.selectedBillboardsForRender.push({
            index: index,
            corners: detected.corners,
            rect: detected.rect,
            bannerImage: null // Will be set when banner is uploaded for active billboard
        });
    } else {
        // Remove from render list
        window.selectedBillboardsForRender = window.selectedBillboardsForRender.filter(b => b.index !== index);
    }

    // Redraw to show checked billboards
    redrawDetectedBillboards();
}

// Redraw canvas with all detected billboards
function redrawDetectedBillboards() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0);

    // Draw all detected rectangles with green outlines
    detectedRectangles.forEach((detected, index) => {
        const { corners } = detected;

        // Check if this billboard is checked for rendering
        const isChecked = window.selectedBillboardsForRender &&
                         window.selectedBillboardsForRender.some(b => b.index === index);

        // Check if this is the active billboard
        const isActive = window.activeBillboardIndex === index;

        // Set outline color based on state
        if (isActive) {
            ctx.strokeStyle = '#2563eb'; // Blue for active
            ctx.lineWidth = 4;
        } else if (isChecked) {
            ctx.strokeStyle = '#10b981'; // Green for checked
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = '#94a3b8'; // Gray for unchecked
            ctx.lineWidth = 2;
        }

        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
        ctx.lineTo(corners.topRight.x, corners.topRight.y);
        ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
        ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
        ctx.closePath();
        ctx.stroke();
    });
}

// Apply detected billboard coordinates (legacy function - now using setActiveBillboard)
function applyDetectedBillboard(index) {
    setActiveBillboard(index);
}
