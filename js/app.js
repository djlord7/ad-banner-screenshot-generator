// Global state
let gamesData = null;
let currentGame = null;
let currentScreenshot = null;
let uploadedBanner = null;
let selectedBillboard = null;
let selectedBillboardIndex = null;

// Canvas elements
let canvas = null;
let ctx = null;
let baseImage = null;

// Area selection mode
let areaSelectionMode = false;
let perspectiveMode = false;
let isDragging = false;
let isResizing = false;
let dragStart = { x: 0, y: 0 };
let selectionRect = { x: 0, y: 0, width: 0, height: 0 };
let resizeHandle = null;
let activeCorner = null;
let draggedPerspectiveCorner = null;

// Perspective corners
let perspectiveCorners = {
    topLeft: { x: 0, y: 0 },
    topRight: { x: 0, y: 0 },
    bottomLeft: { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 }
};

// Auto-detection
let openCvReady = false;
let detectedRectangles = [];
let uploadedScreenshot = null;

// Multi-billboard support
let activeBillboardIndex = null; // Currently active billboard for editing
let selectedBillboardsForRender = []; // Array of billboards to include in final render
let billboardBanners = {}; // Store banner images per billboard index

// DOM Elements
const gameSelect = document.getElementById('game-select');
const gallerySection = document.getElementById('gallery-section');
const screenshotGallery = document.getElementById('screenshot-gallery');
const editorSection = document.getElementById('editor-section');
const uploadArea = document.getElementById('upload-area');
const bannerUpload = document.getElementById('banner-upload');
const backBtn = document.getElementById('back-btn');
const bannerInfo = document.getElementById('banner-info');
const billboardControls = document.getElementById('billboard-controls');
const billboardList = document.getElementById('billboard-list');
const exportControls = document.getElementById('export-controls');
const downloadBtn = document.getElementById('download-btn');
const removeBannerBtn = document.getElementById('remove-banner-btn');

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    canvas = document.getElementById('preview-canvas');
    ctx = canvas.getContext('2d');

    await loadGamesData();
    setupEventListeners();
    setupDetectionListeners();
});

// Load games data from JSON
async function loadGamesData() {
    try {
        const response = await fetch('data/games.json');
        gamesData = await response.json();
        populateGameDropdown();
    } catch (error) {
        console.error('Error loading games data:', error);
        alert('Failed to load games data. Please check the console.');
    }
}

// Populate game dropdown
function populateGameDropdown() {
    gameSelect.innerHTML = '<option value="">-- Choose a game --</option>';

    gamesData.games.forEach((game, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = game.name;
        gameSelect.appendChild(option);
    });
}

// Setup event listeners
function setupEventListeners() {
    gameSelect.addEventListener('change', handleGameSelection);
    backBtn.addEventListener('click', handleBackToGallery);
    uploadArea.addEventListener('click', () => bannerUpload.click());
    bannerUpload.addEventListener('change', handleBannerUpload);
    downloadBtn.addEventListener('click', handleDownload);
    removeBannerBtn.addEventListener('click', handleRemoveBanner);

    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // Area selection
    const startAreaBtn = document.getElementById('start-area-selection-btn');
    const confirmAreaBtn = document.getElementById('confirm-area-btn');
    const cancelAreaBtn = document.getElementById('cancel-area-btn');
    const startPerspectiveBtn = document.getElementById('start-perspective-mode-btn');
    const confirmPerspectiveBtn = document.getElementById('confirm-perspective-btn');
    const cancelPerspectiveBtn = document.getElementById('cancel-perspective-btn');

    if (startAreaBtn) startAreaBtn.addEventListener('click', startAreaSelection);
    if (confirmAreaBtn) confirmAreaBtn.addEventListener('click', confirmAreaSelection);
    if (cancelAreaBtn) cancelAreaBtn.addEventListener('click', cancelAreaSelection);
    if (startPerspectiveBtn) startPerspectiveBtn.addEventListener('click', startPerspectiveMode);
    if (confirmPerspectiveBtn) confirmPerspectiveBtn.addEventListener('click', confirmPerspectiveMode);
    if (cancelPerspectiveBtn) cancelPerspectiveBtn.addEventListener('click', cancelPerspectiveMode);

    // Canvas mouse events
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
}

// Handle game selection
function handleGameSelection(e) {
    const gameIndex = e.target.value;

    if (gameIndex === '') {
        gallerySection.style.display = 'none';
        return;
    }

    currentGame = gamesData.games[gameIndex];
    displayScreenshotGallery();
}

// Display screenshot gallery
function displayScreenshotGallery() {
    screenshotGallery.innerHTML = '';

    currentGame.screenshots.forEach((screenshot, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.onclick = () => selectScreenshot(index);

        // Create image element for gallery preview
        const imgElement = document.createElement('img');
        imgElement.src = `public/screenshots/${screenshot.filename}`;
        imgElement.alt = screenshot.filename;
        imgElement.style.width = '100%';
        imgElement.style.height = '200px';
        imgElement.style.objectFit = 'cover';
        imgElement.onerror = function() {
            this.parentElement.innerHTML = '<span>Screenshot Preview</span>';
        };

        const imageDiv = document.createElement('div');
        imageDiv.className = 'gallery-item-image';
        imageDiv.appendChild(imgElement);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'gallery-item-info';
        infoDiv.innerHTML = `
            <h3>${screenshot.bannerSize}</h3>
            <div class="billboard-count">
                ${screenshot.billboards.length} billboard${screenshot.billboards.length > 1 ? 's' : ''}
            </div>
        `;

        item.appendChild(imageDiv);
        item.appendChild(infoDiv);
        screenshotGallery.appendChild(item);
    });

    gallerySection.style.display = 'block';
    editorSection.style.display = 'none';
}

// Select screenshot
function selectScreenshot(index) {
    currentScreenshot = currentGame.screenshots[index];
    loadScreenshotEditor();
}

// Load screenshot in editor
function loadScreenshotEditor() {
    gallerySection.style.display = 'none';
    editorSection.style.display = 'block';

    // Reset back button text for pre-configured screenshot workflow
    if (backBtn) {
        backBtn.textContent = '← Back to Gallery';
    }

    // Reset state
    uploadedBanner = null;
    selectedBillboard = null;
    selectedBillboardIndex = null;
    areaSelectionMode = false;
    bannerInfo.style.display = 'none';
    billboardControls.style.display = 'none';
    exportControls.style.display = 'none';

    // Show area selection controls
    const areaSelectionControls = document.getElementById('area-selection-controls');
    if (areaSelectionControls) {
        areaSelectionControls.style.display = 'block';
    }

    // Load base screenshot image
    loadBaseImage();

    // Populate billboard buttons
    populateBillboardList();
}

// Load base image
function loadBaseImage() {
    baseImage = new Image();
    baseImage.onload = function() {
        // Set canvas dimensions to match image
        canvas.width = baseImage.width;
        canvas.height = baseImage.height;

        // Draw the image
        ctx.drawImage(baseImage, 0, 0);

        // Draw billboard outlines
        drawBillboardOutlines();
    };
    baseImage.onerror = function() {
        // Fallback to placeholder if image fails to load
        canvas.width = 1920;
        canvas.height = 1080;

        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#64748b';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Screenshot Not Found', canvas.width / 2, canvas.height / 2 - 50);
        ctx.font = '24px Arial';
        ctx.fillText(`(${currentScreenshot.filename})`, canvas.width / 2, canvas.height / 2 + 10);
        ctx.fillText('Check file exists in /public/screenshots/', canvas.width / 2, canvas.height / 2 + 50);

        drawBillboardOutlines();
    };
    baseImage.src = `public/screenshots/${currentScreenshot.filename}`;
}

// Helper function to redraw canvas based on workflow type
function redrawCanvas(includeOutlines = true) {
    // Check if we're using uploaded screenshot workflow or pre-configured screenshots
    if (uploadedScreenshot && currentGame && currentGame.id === 'uploaded') {
        // Uploaded screenshot workflow - use detectedRectangles
        if (detectedRectangles && detectedRectangles.length > 0) {
            drawAllSelectedBillboards(includeOutlines);
        } else {
            // No detected billboards, just draw the uploaded image
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(uploadedScreenshot, 0, 0);
        }
    } else {
        // Pre-configured screenshot workflow
        loadBaseImage();
    }
}

// Helper function to clamp perspective corners to canvas bounds
function clampCornersToCanvas(corners) {
    const margin = 10; // Keep a small margin from edges

    return {
        topLeft: {
            x: Math.max(margin, Math.min(canvas.width - margin, corners.topLeft.x)),
            y: Math.max(margin, Math.min(canvas.height - margin, corners.topLeft.y))
        },
        topRight: {
            x: Math.max(margin, Math.min(canvas.width - margin, corners.topRight.x)),
            y: Math.max(margin, Math.min(canvas.height - margin, corners.topRight.y))
        },
        bottomLeft: {
            x: Math.max(margin, Math.min(canvas.width - margin, corners.bottomLeft.x)),
            y: Math.max(margin, Math.min(canvas.height - margin, corners.bottomLeft.y))
        },
        bottomRight: {
            x: Math.max(margin, Math.min(canvas.width - margin, corners.bottomRight.x)),
            y: Math.max(margin, Math.min(canvas.height - margin, corners.bottomRight.y))
        }
    };
}

// Helper function to draw banner with perspective transformation
function drawBannerWithPerspective(bannerImage, corners) {
    const { topLeft, topRight, bottomLeft, bottomRight } = corners;

    // Save context
    ctx.save();

    // Create clipping path for the quadrilateral
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    ctx.clip();

    // Fill background with black first
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Calculate billboard dimensions (average of sides)
    const billboardWidth = (
        Math.sqrt(Math.pow(topRight.x - topLeft.x, 2) + Math.pow(topRight.y - topLeft.y, 2)) +
        Math.sqrt(Math.pow(bottomRight.x - bottomLeft.x, 2) + Math.pow(bottomRight.y - bottomLeft.y, 2))
    ) / 2;

    const billboardHeight = (
        Math.sqrt(Math.pow(bottomLeft.x - topLeft.x, 2) + Math.pow(bottomLeft.y - topLeft.y, 2)) +
        Math.sqrt(Math.pow(bottomRight.x - topRight.x, 2) + Math.pow(bottomRight.y - topRight.y, 2))
    ) / 2;

    // Calculate banner aspect ratio
    const bannerAspect = bannerImage.width / bannerImage.height;
    const billboardAspect = billboardWidth / billboardHeight;

    // Determine letterboxing dimensions (maintain aspect ratio)
    let renderWidth, renderHeight, offsetU, offsetV;

    if (bannerAspect > billboardAspect) {
        // Banner is wider - fit to width, letterbox top/bottom
        renderWidth = 1.0;
        renderHeight = billboardAspect / bannerAspect;
        offsetU = 0;
        offsetV = (1.0 - renderHeight) / 2;
    } else {
        // Banner is taller - fit to height, letterbox sides
        renderWidth = bannerAspect / billboardAspect;
        renderHeight = 1.0;
        offsetU = (1.0 - renderWidth) / 2;
        offsetV = 0;
    }

    // Use pixel-level rendering to avoid grid artifacts
    // Create an offscreen canvas for the perspective-corrected banner
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');

    // Set offscreen canvas size to match billboard dimensions
    offCanvas.width = Math.ceil(billboardWidth);
    offCanvas.height = Math.ceil(billboardHeight);

    // Fill with black background
    offCtx.fillStyle = '#000000';
    offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    // Calculate letterbox dimensions in pixels
    let bannerX, bannerY, bannerWidth, bannerHeight;

    if (bannerAspect > billboardAspect) {
        // Fit to width
        bannerWidth = offCanvas.width;
        bannerHeight = offCanvas.width / bannerAspect;
        bannerX = 0;
        bannerY = (offCanvas.height - bannerHeight) / 2;
    } else {
        // Fit to height
        bannerHeight = offCanvas.height;
        bannerWidth = offCanvas.height * bannerAspect;
        bannerX = (offCanvas.width - bannerWidth) / 2;
        bannerY = 0;
    }

    // Draw letterboxed banner on offscreen canvas
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';
    offCtx.drawImage(bannerImage, bannerX, bannerY, bannerWidth, bannerHeight);

    // Now draw the offscreen canvas onto the main canvas with perspective
    // Use smaller segments for the final mapping
    const segments = 25;

    for (let row = 0; row < segments; row++) {
        for (let col = 0; col < segments; col++) {
            // Add slight overlap to prevent gaps (0.5px on each side)
            const overlap = 0.5 / segments;
            const u0 = Math.max(0, (col / segments) - overlap);
            const v0 = Math.max(0, (row / segments) - overlap);
            const u1 = Math.min(1, ((col + 1) / segments) + overlap);
            const v1 = Math.min(1, ((row + 1) / segments) + overlap);

            // Source rectangle on the offscreen canvas
            const sx = u0 * offCanvas.width;
            const sy = v0 * offCanvas.height;
            const sw = (u1 - u0) * offCanvas.width;
            const sh = (v1 - v0) * offCanvas.height;

            // Destination quad corners (interpolated on the billboard)
            const tl = interpolateQuad(topLeft, topRight, bottomLeft, bottomRight, u0, v0);
            const tr = interpolateQuad(topLeft, topRight, bottomLeft, bottomRight, u1, v0);
            const bl = interpolateQuad(topLeft, topRight, bottomLeft, bottomRight, u0, v1);
            const br = interpolateQuad(topLeft, topRight, bottomLeft, bottomRight, u1, v1);

            // Calculate transform matrix for this segment
            ctx.save();

            const dw = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
            const dh = Math.sqrt(Math.pow(bl.x - tl.x, 2) + Math.pow(bl.y - tl.y, 2));

            const scaleX = dw / sw;
            const scaleY = dh / sh;
            const angle = Math.atan2(tr.y - tl.y, tr.x - tl.x);

            ctx.translate(tl.x, tl.y);
            ctx.rotate(angle);
            ctx.scale(scaleX, scaleY);

            // Enable image smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(offCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            ctx.restore();
        }
    }

    ctx.restore();
}

// Helper function to interpolate a point within a quadrilateral
function interpolateQuad(topLeft, topRight, bottomLeft, bottomRight, u, v) {
    // Bilinear interpolation
    const top = {
        x: topLeft.x + (topRight.x - topLeft.x) * u,
        y: topLeft.y + (topRight.y - topLeft.y) * u
    };
    const bottom = {
        x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * u,
        y: bottomLeft.y + (bottomRight.y - bottomLeft.y) * u
    };

    return {
        x: top.x + (bottom.x - top.x) * v,
        y: top.y + (bottom.y - top.y) * v
    };
}

// Draw billboard outlines on canvas
function drawBillboardOutlines() {
    currentScreenshot.billboards.forEach((billboard, index) => {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);

        const { topLeft, topRight, bottomLeft, bottomRight } = billboard.perspective;

        ctx.beginPath();
        ctx.moveTo(topLeft.x, topLeft.y);
        ctx.lineTo(topRight.x, topRight.y);
        ctx.lineTo(bottomRight.x, bottomRight.y);
        ctx.lineTo(bottomLeft.x, bottomLeft.y);
        ctx.closePath();
        ctx.stroke();

        ctx.setLineDash([]);

        // Draw billboard number
        ctx.fillStyle = '#3b82f6';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Billboard ${index + 1}`, (topLeft.x + topRight.x) / 2, topLeft.y - 10);
    });
}

// Populate billboard list
function populateBillboardList() {
    billboardList.innerHTML = '';

    currentScreenshot.billboards.forEach((billboard, index) => {
        const btn = document.createElement('button');
        btn.className = 'billboard-btn';
        btn.textContent = `Billboard ${index + 1}`;
        btn.onclick = () => selectBillboard(index);
        billboardList.appendChild(btn);
    });
}

// Select billboard
function selectBillboard(index) {
    selectedBillboard = currentScreenshot.billboards[index];
    selectedBillboardIndex = index;

    // Update button states
    const buttons = billboardList.querySelectorAll('.billboard-btn');
    buttons.forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    // Redraw canvas with banner if available
    if (uploadedBanner) {
        drawComposite();
    }
}

// Handle banner upload
function handleBannerUpload(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        loadBannerImage(file);
    }
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
}

// Handle drag leave
function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        loadBannerImage(file);
    }
}

// Load banner image
function loadBannerImage(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            uploadedBanner = img;

            // Store banner for the active billboard
            if (window.activeBillboardIndex !== null && window.activeBillboardIndex !== undefined) {
                billboardBanners[window.activeBillboardIndex] = img;

                // Update or add to selectedBillboardsForRender array
                if (window.selectedBillboardsForRender) {
                    const billboardInRenderList = window.selectedBillboardsForRender.find(
                        b => b.index === window.activeBillboardIndex
                    );
                    if (billboardInRenderList) {
                        // Update existing entry
                        billboardInRenderList.bannerImage = img;
                    } else {
                        // Add billboard back to render list if it was removed
                        const detectedBillboard = detectedRectangles[window.activeBillboardIndex];
                        if (detectedBillboard) {
                            window.selectedBillboardsForRender.push({
                                index: window.activeBillboardIndex,
                                corners: detectedBillboard.corners,
                                bannerImage: img
                            });
                        }
                    }
                }
            }

            displayBannerInfo(file, img);
            billboardControls.style.display = 'block';

            // Auto-select first billboard if none selected
            if (!selectedBillboard) {
                selectBillboard(0);
            } else {
                drawComposite();
            }
        };
        img.src = e.target.result;
    };

    reader.readAsDataURL(file);
}

// Display banner info
function displayBannerInfo(file, img) {
    document.getElementById('banner-size-info').textContent = currentScreenshot.bannerSize;
    document.getElementById('banner-dimensions').textContent = `${img.width} × ${img.height}px`;
    bannerInfo.style.display = 'block';
    exportControls.style.display = 'block';
}

// Draw composite (base image + banner)
function drawComposite() {
    // For detected billboards workflow, use drawAllSelectedBillboards
    if (detectedRectangles && detectedRectangles.length > 0) {
        if (baseImage && baseImage.complete) {
            redrawDetectedBillboards();
            drawAllSelectedBillboards(true);
        } else {
            baseImage.onload = function() {
                canvas.width = baseImage.width;
                canvas.height = baseImage.height;
                ctx.drawImage(baseImage, 0, 0);
                redrawDetectedBillboards();
                drawAllSelectedBillboards(true);
            };
        }
        return;
    }

    // Legacy workflow for pre-configured screenshots
    if (!uploadedBanner || !selectedBillboard) return;

    // Wait for base image to load, then draw banner
    if (baseImage && baseImage.complete) {
        drawBannerOnCanvas();
    } else {
        baseImage.onload = function() {
            canvas.width = baseImage.width;
            canvas.height = baseImage.height;
            ctx.drawImage(baseImage, 0, 0);
            drawBannerOnCanvas();
        };
    }
}

// Draw banner on canvas with perspective
function drawBannerOnCanvas(includeOutlines = true) {
    // Clear and redraw base image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0);

    // Draw banner with proper perspective transformation
    drawBannerWithPerspective(uploadedBanner, selectedBillboard.perspective);

    // Optionally redraw billboard outlines (for preview only, not export)
    if (includeOutlines) {
        drawBillboardOutlines();
    }
}

// Draw all selected billboards with their banners
function drawAllSelectedBillboards(includeOutlines = true) {
    // Clear and redraw base image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0);

    // Draw each selected billboard with its banner (if any)
    if (window.selectedBillboardsForRender && window.selectedBillboardsForRender.length > 0) {
        window.selectedBillboardsForRender.forEach(billboard => {
            const bannerImage = billboardBanners[billboard.index];

            if (!bannerImage) {
                return; // Skip if no banner uploaded for this billboard
            }

            // Draw banner with proper perspective transformation
            drawBannerWithPerspective(bannerImage, billboard.corners);
        });
    }

    // Always redraw billboard outlines if requested (even if no banners uploaded)
    if (includeOutlines && detectedRectangles && detectedRectangles.length > 0) {
        // Draw billboard outlines without clearing the canvas
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
}

// Handle remove banner
function handleRemoveBanner() {
    uploadedBanner = null;

    // Remove banner from the active billboard's storage
    if (window.activeBillboardIndex !== null && window.activeBillboardIndex !== undefined) {
        delete billboardBanners[window.activeBillboardIndex];

        // Remove from render list if present
        if (window.selectedBillboardsForRender) {
            const index = window.selectedBillboardsForRender.findIndex(
                b => b.index === window.activeBillboardIndex
            );
            if (index !== -1) {
                window.selectedBillboardsForRender.splice(index, 1);
            }
        }
    }

    selectedBillboard = null;
    bannerUpload.value = '';
    bannerInfo.style.display = 'none';
    billboardControls.style.display = 'none';
    exportControls.style.display = 'none';

    // Clear active states
    const buttons = billboardList.querySelectorAll('.billboard-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // Redraw using helper function
    redrawCanvas(true);
}

// Handle download
function handleDownload() {
    // Render all checked billboards with their banners
    if (window.selectedBillboardsForRender && window.selectedBillboardsForRender.length > 0) {
        drawAllSelectedBillboards(false);
    } else if (uploadedBanner && selectedBillboard) {
        // Fallback to old behavior for non-detected screenshots
        drawBannerOnCanvas(false);
    } else {
        // Just base image without outlines
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseImage, 0, 0);
    }

    // Download the clean image
    const link = document.createElement('a');
    link.download = `${currentGame.name}_${currentScreenshot.filename}_banner.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    // Redraw with outlines for preview
    if (detectedRectangles && detectedRectangles.length > 0) {
        redrawDetectedBillboards();
        drawAllSelectedBillboards(true);
    } else if (uploadedBanner && selectedBillboard) {
        drawBannerOnCanvas(true);
    } else {
        loadBaseImage();
    }
}

// Handle back to gallery
function handleBackToGallery() {
    // If coming from uploaded screenshot workflow, reload the page to go home
    if (currentGame && currentGame.id === 'uploaded') {
        window.location.reload();
        return;
    }

    // For pre-configured screenshots, go back to gallery
    editorSection.style.display = 'none';
    gallerySection.style.display = 'block';
    handleRemoveBanner();
}

// ===== AREA SELECTION FUNCTIONS =====

// Start area selection mode
function startAreaSelection() {
    areaSelectionMode = true;
    canvas.classList.add('area-selection-active');

    // Initialize selection rect with current billboard if exists
    if (selectedBillboard) {
        const { topLeft, bottomRight } = selectedBillboard.perspective;
        selectionRect = {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        };
    } else {
        // Default starting size
        selectionRect = {
            x: canvas.width / 2 - 100,
            y: canvas.height / 2 - 150,
            width: 200,
            height: 300
        };
    }

    document.getElementById('area-adjust-controls').style.display = 'block';
    document.getElementById('start-area-selection-btn').style.display = 'none';

    // Redraw with selection
    redrawWithSelection();
}

// Cancel area selection
function cancelAreaSelection() {
    areaSelectionMode = false;
    canvas.classList.remove('area-selection-active');
    document.getElementById('area-adjust-controls').style.display = 'none';
    document.getElementById('start-area-selection-btn').style.display = 'block';

    // Redraw without selection using helper function
    redrawCanvas(true);
}

// Confirm area selection
function confirmAreaSelection() {
    // Auto-select first billboard if none selected
    if (!selectedBillboard) {
        selectedBillboardIndex = 0;
        selectedBillboard = currentScreenshot.billboards[0];
    }

    // Update the billboard coordinates
    const updatedPerspective = {
        topLeft: { x: Math.round(selectionRect.x), y: Math.round(selectionRect.y) },
        topRight: { x: Math.round(selectionRect.x + selectionRect.width), y: Math.round(selectionRect.y) },
        bottomLeft: { x: Math.round(selectionRect.x), y: Math.round(selectionRect.y + selectionRect.height) },
        bottomRight: { x: Math.round(selectionRect.x + selectionRect.width), y: Math.round(selectionRect.y + selectionRect.height) }
    };

    currentScreenshot.billboards[selectedBillboardIndex].perspective = updatedPerspective;
    currentScreenshot.billboards[selectedBillboardIndex].x = Math.round(selectionRect.x);
    currentScreenshot.billboards[selectedBillboardIndex].y = Math.round(selectionRect.y);
    currentScreenshot.billboards[selectedBillboardIndex].width = Math.round(selectionRect.width);
    currentScreenshot.billboards[selectedBillboardIndex].height = Math.round(selectionRect.height);

    // Update the selected billboard reference
    selectedBillboard = currentScreenshot.billboards[selectedBillboardIndex];

    // Exit selection mode
    areaSelectionMode = false;
    canvas.classList.remove('area-selection-active');
    document.getElementById('area-adjust-controls').style.display = 'none';
    document.getElementById('start-area-selection-btn').style.display = 'block';

    // Show success message
    alert('Billboard area updated! Coordinates:\nTop-Left: (' + updatedPerspective.topLeft.x + ', ' + updatedPerspective.topLeft.y + ')\nSize: ' + Math.round(selectionRect.width) + ' × ' + Math.round(selectionRect.height) + 'px');

    // Redraw - check if using detected billboards workflow or pre-configured screenshots
    if (detectedRectangles && detectedRectangles.length > 0) {
        // Update the detected rectangle for this billboard
        if (window.activeBillboardIndex !== null && window.activeBillboardIndex !== undefined) {
            const detected = detectedRectangles[window.activeBillboardIndex];
            if (detected) {
                detected.corners = updatedPerspective;
                detected.rect = {
                    x: Math.round(selectionRect.x),
                    y: Math.round(selectionRect.y),
                    width: Math.round(selectionRect.width),
                    height: Math.round(selectionRect.height)
                };
            }

            // Update the selectedBillboardsForRender if this billboard is checked
            if (window.selectedBillboardsForRender) {
                const billboardInRenderList = window.selectedBillboardsForRender.find(
                    b => b.index === window.activeBillboardIndex
                );
                if (billboardInRenderList) {
                    billboardInRenderList.corners = updatedPerspective;
                    billboardInRenderList.rect = {
                        x: Math.round(selectionRect.x),
                        y: Math.round(selectionRect.y),
                        width: Math.round(selectionRect.width),
                        height: Math.round(selectionRect.height)
                    };
                }
            }
        }

        // Draw all selected billboards with their banners (this handles redraw internally)
        drawAllSelectedBillboards(true);
    } else {
        // Pre-configured screenshot workflow
        redrawCanvas(true);
    }
}

// Canvas mouse down
function handleCanvasMouseDown(e) {
    if (!areaSelectionMode) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if clicking on a corner handle
    const handleSize = 16;
    const corners = [
        { name: 'topLeft', x: selectionRect.x, y: selectionRect.y },
        { name: 'topRight', x: selectionRect.x + selectionRect.width, y: selectionRect.y },
        { name: 'bottomLeft', x: selectionRect.x, y: selectionRect.y + selectionRect.height },
        { name: 'bottomRight', x: selectionRect.x + selectionRect.width, y: selectionRect.y + selectionRect.height }
    ];

    for (const corner of corners) {
        if (Math.abs(x - corner.x) <= handleSize && Math.abs(y - corner.y) <= handleSize) {
            isResizing = true;
            activeCorner = corner.name;
            dragStart = { x: selectionRect.x, y: selectionRect.y, width: selectionRect.width, height: selectionRect.height };
            return;
        }
    }

    // Check if clicking inside the selection (for moving)
    if (x >= selectionRect.x && x <= selectionRect.x + selectionRect.width &&
        y >= selectionRect.y && y <= selectionRect.y + selectionRect.height) {
        isDragging = true;
        dragStart = { x: x - selectionRect.x, y: y - selectionRect.y };
    } else {
        // Start new selection
        isDragging = true;
        selectionRect = { x, y, width: 0, height: 0 };
        dragStart = { x: 0, y: 0 };
    }
}

// Canvas mouse move
function handleCanvasMouseMove(e) {
    if (!areaSelectionMode) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Update cursor based on position
    if (!isDragging && !isResizing) {
        const handleSize = 16;
        const corners = [
            { name: 'topLeft', x: selectionRect.x, y: selectionRect.y, cursor: 'nw-resize' },
            { name: 'topRight', x: selectionRect.x + selectionRect.width, y: selectionRect.y, cursor: 'ne-resize' },
            { name: 'bottomLeft', x: selectionRect.x, y: selectionRect.y + selectionRect.height, cursor: 'sw-resize' },
            { name: 'bottomRight', x: selectionRect.x + selectionRect.width, y: selectionRect.y + selectionRect.height, cursor: 'se-resize' }
        ];

        let cursorSet = false;
        for (const corner of corners) {
            if (Math.abs(x - corner.x) <= handleSize && Math.abs(y - corner.y) <= handleSize) {
                canvas.style.cursor = corner.cursor;
                cursorSet = true;
                break;
            }
        }

        if (!cursorSet) {
            if (x >= selectionRect.x && x <= selectionRect.x + selectionRect.width &&
                y >= selectionRect.y && y <= selectionRect.y + selectionRect.height) {
                canvas.style.cursor = 'move';
            } else {
                canvas.style.cursor = 'crosshair';
            }
        }
    }

    if (!isDragging && !isResizing) return;

    if (isResizing) {
        // Resize based on active corner
        switch (activeCorner) {
            case 'topLeft':
                selectionRect.width = dragStart.width + (dragStart.x - x);
                selectionRect.height = dragStart.height + (dragStart.y - y);
                selectionRect.x = x;
                selectionRect.y = y;
                break;
            case 'topRight':
                selectionRect.width = x - selectionRect.x;
                selectionRect.height = dragStart.height + (dragStart.y - y);
                selectionRect.y = y;
                break;
            case 'bottomLeft':
                selectionRect.width = dragStart.width + (dragStart.x - x);
                selectionRect.height = y - selectionRect.y;
                selectionRect.x = x;
                break;
            case 'bottomRight':
                selectionRect.width = x - selectionRect.x;
                selectionRect.height = y - selectionRect.y;
                break;
        }

        // Prevent negative dimensions
        if (selectionRect.width < 10) selectionRect.width = 10;
        if (selectionRect.height < 10) selectionRect.height = 10;
    } else if (isDragging) {
        if (selectionRect.width === 0 || selectionRect.height === 0) {
            // Creating new selection
            selectionRect.width = x - selectionRect.x;
            selectionRect.height = y - selectionRect.y;
        } else {
            // Moving existing selection
            selectionRect.x = x - dragStart.x;
            selectionRect.y = y - dragStart.y;

            // Keep within canvas bounds
            selectionRect.x = Math.max(0, Math.min(canvas.width - selectionRect.width, selectionRect.x));
            selectionRect.y = Math.max(0, Math.min(canvas.height - selectionRect.height, selectionRect.y));
        }
    }

    updateCoordinatesDisplay();
    redrawWithSelection();
}

// Canvas mouse up
function handleCanvasMouseUp(e) {
    if (!areaSelectionMode) return;

    isDragging = false;
    isResizing = false;
    activeCorner = null;

    // Normalize negative width/height
    if (selectionRect.width < 0) {
        selectionRect.x += selectionRect.width;
        selectionRect.width = Math.abs(selectionRect.width);
    }
    if (selectionRect.height < 0) {
        selectionRect.y += selectionRect.height;
        selectionRect.height = Math.abs(selectionRect.height);
    }

    updateCoordinatesDisplay();
    redrawWithSelection();
}

// Update coordinates display
function updateCoordinatesDisplay() {
    document.getElementById('area-x').textContent = Math.round(selectionRect.x);
    document.getElementById('area-y').textContent = Math.round(selectionRect.y);
    document.getElementById('area-width').textContent = Math.round(Math.abs(selectionRect.width));
    document.getElementById('area-height').textContent = Math.round(Math.abs(selectionRect.height));
}

// Redraw canvas with selection rectangle
function redrawWithSelection() {
    // Clear and redraw base image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0);

    // Draw semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear the selection area
    ctx.clearRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
    ctx.drawImage(baseImage, selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height,
                  selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);

    // Draw selection rectangle
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
    ctx.setLineDash([]);

    // Draw corner handles (larger and more visible)
    const handleSize = 16;
    const halfHandle = handleSize / 2;

    const corners = [
        { x: selectionRect.x, y: selectionRect.y },
        { x: selectionRect.x + selectionRect.width, y: selectionRect.y },
        { x: selectionRect.x, y: selectionRect.y + selectionRect.height },
        { x: selectionRect.x + selectionRect.width, y: selectionRect.y + selectionRect.height }
    ];

    corners.forEach(corner => {
        // Draw white border
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(corner.x - halfHandle - 1, corner.y - halfHandle - 1, handleSize + 2, handleSize + 2);

        // Draw blue handle
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(corner.x - halfHandle, corner.y - halfHandle, handleSize, handleSize);
    });
}

// ===== PERSPECTIVE MODE FUNCTIONS =====

// Start perspective mode
function startPerspectiveMode() {
    perspectiveMode = true;
    areaSelectionMode = false;
    canvas.classList.add('area-selection-active');

    // Initialize perspective corners from current billboard if exists
    if (selectedBillboard && selectedBillboard.perspective) {
        perspectiveCorners = {
            topLeft: { ...selectedBillboard.perspective.topLeft },
            topRight: { ...selectedBillboard.perspective.topRight },
            bottomLeft: { ...selectedBillboard.perspective.bottomLeft },
            bottomRight: { ...selectedBillboard.perspective.bottomRight }
        };

        // Clamp existing corners to ensure they're within canvas bounds
        perspectiveCorners = clampCornersToCanvas(perspectiveCorners);
    } else {
        // Default quadrilateral - use percentage of canvas size for better scaling
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const defaultWidth = Math.min(300, canvas.width * 0.4);  // 40% of width or 300px max
        const defaultHeight = Math.min(400, canvas.height * 0.5); // 50% of height or 400px max

        perspectiveCorners = {
            topLeft: { x: cx - defaultWidth / 2, y: cy - defaultHeight / 2 },
            topRight: { x: cx + defaultWidth / 2, y: cy - defaultHeight / 2 },
            bottomLeft: { x: cx - defaultWidth / 2, y: cy + defaultHeight / 2 },
            bottomRight: { x: cx + defaultWidth / 2, y: cy + defaultHeight / 2 }
        };

        // Ensure default corners are within bounds
        perspectiveCorners = clampCornersToCanvas(perspectiveCorners);
    }

    document.getElementById('perspective-adjust-controls').style.display = 'block';
    document.getElementById('area-adjust-controls').style.display = 'none';
    document.querySelector('.mode-selector').style.display = 'none';

    updatePerspectiveDisplay();
    redrawWithPerspective();
}

// Cancel perspective mode
function cancelPerspectiveMode() {
    perspectiveMode = false;
    canvas.classList.remove('area-selection-active');
    document.getElementById('perspective-adjust-controls').style.display = 'none';
    document.querySelector('.mode-selector').style.display = 'flex';
    draggedPerspectiveCorner = null;

    // Redraw using helper function
    redrawCanvas(true);
}

// Confirm perspective mode
function confirmPerspectiveMode() {
    if (!selectedBillboard) {
        selectedBillboardIndex = 0;
        selectedBillboard = currentScreenshot.billboards[0];
    }

    // Update billboard with perspective corners
    currentScreenshot.billboards[selectedBillboardIndex].perspective = {
        topLeft: { x: Math.round(perspectiveCorners.topLeft.x), y: Math.round(perspectiveCorners.topLeft.y) },
        topRight: { x: Math.round(perspectiveCorners.topRight.x), y: Math.round(perspectiveCorners.topRight.y) },
        bottomLeft: { x: Math.round(perspectiveCorners.bottomLeft.x), y: Math.round(perspectiveCorners.bottomLeft.y) },
        bottomRight: { x: Math.round(perspectiveCorners.bottomRight.x), y: Math.round(perspectiveCorners.bottomRight.y) }
    };

    // Calculate bounding box for x, y, width, height
    const minX = Math.min(perspectiveCorners.topLeft.x, perspectiveCorners.bottomLeft.x);
    const maxX = Math.max(perspectiveCorners.topRight.x, perspectiveCorners.bottomRight.x);
    const minY = Math.min(perspectiveCorners.topLeft.y, perspectiveCorners.topRight.y);
    const maxY = Math.max(perspectiveCorners.bottomLeft.y, perspectiveCorners.bottomRight.y);

    currentScreenshot.billboards[selectedBillboardIndex].x = Math.round(minX);
    currentScreenshot.billboards[selectedBillboardIndex].y = Math.round(minY);
    currentScreenshot.billboards[selectedBillboardIndex].width = Math.round(maxX - minX);
    currentScreenshot.billboards[selectedBillboardIndex].height = Math.round(maxY - minY);

    selectedBillboard = currentScreenshot.billboards[selectedBillboardIndex];

    perspectiveMode = false;
    canvas.classList.remove('area-selection-active');
    document.getElementById('perspective-adjust-controls').style.display = 'none';
    document.querySelector('.mode-selector').style.display = 'flex';
    draggedPerspectiveCorner = null;

    alert('Perspective applied! Billboard corners:\nTL: (' + perspectiveCorners.topLeft.x + ', ' + perspectiveCorners.topLeft.y + ')\nTR: (' + perspectiveCorners.topRight.x + ', ' + perspectiveCorners.topRight.y + ')\nBL: (' + perspectiveCorners.bottomLeft.x + ', ' + perspectiveCorners.bottomLeft.y + ')\nBR: (' + perspectiveCorners.bottomRight.x + ', ' + perspectiveCorners.bottomRight.y + ')');

    // Redraw - check if using detected billboards workflow or pre-configured screenshots
    if (detectedRectangles && detectedRectangles.length > 0) {
        // Update the detected rectangle for this billboard
        if (window.activeBillboardIndex !== null && window.activeBillboardIndex !== undefined) {
            const detected = detectedRectangles[window.activeBillboardIndex];
            if (detected) {
                const updatedCorners = {
                    topLeft: { x: Math.round(perspectiveCorners.topLeft.x), y: Math.round(perspectiveCorners.topLeft.y) },
                    topRight: { x: Math.round(perspectiveCorners.topRight.x), y: Math.round(perspectiveCorners.topRight.y) },
                    bottomLeft: { x: Math.round(perspectiveCorners.bottomLeft.x), y: Math.round(perspectiveCorners.bottomLeft.y) },
                    bottomRight: { x: Math.round(perspectiveCorners.bottomRight.x), y: Math.round(perspectiveCorners.bottomRight.y) }
                };

                detected.corners = updatedCorners;
                detected.rect = {
                    x: Math.round(minX),
                    y: Math.round(minY),
                    width: Math.round(maxX - minX),
                    height: Math.round(maxY - minY)
                };

                // Update the selectedBillboardsForRender if this billboard is checked
                if (window.selectedBillboardsForRender) {
                    const billboardInRenderList = window.selectedBillboardsForRender.find(
                        b => b.index === window.activeBillboardIndex
                    );
                    if (billboardInRenderList) {
                        billboardInRenderList.corners = updatedCorners;
                        billboardInRenderList.rect = {
                            x: Math.round(minX),
                            y: Math.round(minY),
                            width: Math.round(maxX - minX),
                            height: Math.round(maxY - minY)
                        };
                    }
                }
            }
        }

        // Draw all selected billboards with their banners (this handles redraw internally)
        drawAllSelectedBillboards(true);
    } else {
        // Pre-configured screenshot workflow
        redrawCanvas(true);
    }
}

// Update perspective corner display
function updatePerspectiveDisplay() {
    document.getElementById('corner-tl').textContent = Math.round(perspectiveCorners.topLeft.x) + ', ' + Math.round(perspectiveCorners.topLeft.y);
    document.getElementById('corner-tr').textContent = Math.round(perspectiveCorners.topRight.x) + ', ' + Math.round(perspectiveCorners.topRight.y);
    document.getElementById('corner-bl').textContent = Math.round(perspectiveCorners.bottomLeft.x) + ', ' + Math.round(perspectiveCorners.bottomLeft.y);
    document.getElementById('corner-br').textContent = Math.round(perspectiveCorners.bottomRight.x) + ', ' + Math.round(perspectiveCorners.bottomRight.y);
}

// Redraw with perspective overlay
function redrawWithPerspective() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0);

    // Draw semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw perspective quadrilateral
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(perspectiveCorners.topLeft.x, perspectiveCorners.topLeft.y);
    ctx.lineTo(perspectiveCorners.topRight.x, perspectiveCorners.topRight.y);
    ctx.lineTo(perspectiveCorners.bottomRight.x, perspectiveCorners.bottomRight.y);
    ctx.lineTo(perspectiveCorners.bottomLeft.x, perspectiveCorners.bottomLeft.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw corner handles as tiny color-coded dots
    const dotRadius = 4;

    const corners = [
        { pos: perspectiveCorners.topLeft, color: '#ef4444', name: 'topLeft' },
        { pos: perspectiveCorners.topRight, color: '#10b981', name: 'topRight' },
        { pos: perspectiveCorners.bottomLeft, color: '#f59e0b', name: 'bottomLeft' },
        { pos: perspectiveCorners.bottomRight, color: '#8b5cf6', name: 'bottomRight' }
    ];

    corners.forEach(corner => {
        // Draw white border circle
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(corner.pos.x, corner.pos.y, dotRadius + 2, 0, 2 * Math.PI);
        ctx.fill();

        // Draw colored dot
        ctx.fillStyle = corner.color;
        ctx.beginPath();
        ctx.arc(corner.pos.x, corner.pos.y, dotRadius, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Draw magnifying glass effect if dragging a corner
    if (draggedPerspectiveCorner) {
        const draggedCorner = perspectiveCorners[draggedPerspectiveCorner];
        const magRadius = 80; // Magnifying glass circle radius
        const magZoom = 3; // Zoom level
        const magBorderWidth = 4;

        // Position magnifying glass offset from cursor
        const offsetX = 100;
        const offsetY = -100;
        const magX = Math.min(Math.max(draggedCorner.x + offsetX, magRadius + 10), canvas.width - magRadius - 10);
        const magY = Math.min(Math.max(draggedCorner.y + offsetY, magRadius + 10), canvas.height - magRadius - 10);

        // Calculate source area to magnify
        const srcSize = magRadius * 2 / magZoom;
        const srcX = draggedCorner.x - srcSize / 2;
        const srcY = draggedCorner.y - srcSize / 2;

        // Save context
        ctx.save();

        // Create circular clipping path for magnifier
        ctx.beginPath();
        ctx.arc(magX, magY, magRadius, 0, 2 * Math.PI);
        ctx.clip();

        // Draw magnified area from base image
        ctx.drawImage(
            baseImage,
            srcX, srcY, srcSize, srcSize,
            magX - magRadius, magY - magRadius, magRadius * 2, magRadius * 2
        );

        ctx.restore();

        // Draw magnifier border
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = magBorderWidth;
        ctx.beginPath();
        ctx.arc(magX, magY, magRadius, 0, 2 * Math.PI);
        ctx.stroke();

        // Draw crosshair in magnifier center
        ctx.strokeStyle = corners.find(c => c.name === draggedPerspectiveCorner).color;
        ctx.lineWidth = 2;
        const crossSize = 12;

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(magX, magY - crossSize);
        ctx.lineTo(magX, magY + crossSize);
        ctx.stroke();

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(magX - crossSize, magY);
        ctx.lineTo(magX + crossSize, magY);
        ctx.stroke();

        // Draw small circle at center
        ctx.fillStyle = corners.find(c => c.name === draggedPerspectiveCorner).color;
        ctx.beginPath();
        ctx.arc(magX, magY, 3, 0, 2 * Math.PI);
        ctx.fill();
    }
}

// Update mouse handlers to support perspective mode
const originalMouseDown = handleCanvasMouseDown;
const originalMouseMove = handleCanvasMouseMove;
const originalMouseUp = handleCanvasMouseUp;

handleCanvasMouseDown = function(e) {
    if (perspectiveMode) {
        handlePerspectiveMouseDown(e);
    } else {
        originalMouseDown(e);
    }
};

handleCanvasMouseMove = function(e) {
    if (perspectiveMode) {
        handlePerspectiveMouseMove(e);
    } else {
        originalMouseMove(e);
    }
};

handleCanvasMouseUp = function(e) {
    if (perspectiveMode) {
        handlePerspectiveMouseUp(e);
    } else {
        originalMouseUp(e);
    }
};

// Perspective mouse handlers
function handlePerspectiveMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const clickRadius = 15;

    // Check which corner is clicked
    const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
    for (const cornerName of corners) {
        const corner = perspectiveCorners[cornerName];
        const distance = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
        if (distance <= clickRadius) {
            draggedPerspectiveCorner = cornerName;
            return;
        }
    }
}

function handlePerspectiveMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Update cursor
    if (!draggedPerspectiveCorner) {
        const clickRadius = 15;
        let overCorner = false;

        const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
        for (const cornerName of corners) {
            const corner = perspectiveCorners[cornerName];
            const distance = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
            if (distance <= clickRadius) {
                canvas.style.cursor = 'pointer';
                overCorner = true;
                break;
            }
        }

        if (!overCorner) {
            canvas.style.cursor = 'crosshair';
        }
    }

    if (draggedPerspectiveCorner) {
        // Clamp to canvas bounds with margin
        const margin = 10;
        perspectiveCorners[draggedPerspectiveCorner].x = Math.max(margin, Math.min(canvas.width - margin, x));
        perspectiveCorners[draggedPerspectiveCorner].y = Math.max(margin, Math.min(canvas.height - margin, y));

        updatePerspectiveDisplay();
        redrawWithPerspective();
    }
}

function handlePerspectiveMouseUp(e) {
    draggedPerspectiveCorner = null;
    // Redraw without magnifier
    redrawWithPerspective();
}
