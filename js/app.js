// Global state
let gamesData = null;
let currentGame = null;
let currentScreenshot = null;
let uploadedBanner = null;
let selectedBillboard = null;
let selectedBillboardIndex = null;
let transformTargetBillboardIndex = 0; // For dropdown selection in transform mode
let configData = null; // Store config data
let isDevModeUnlocked = false; // Track if passcode has been entered
let isDevModeUIEnabled = false; // Track if dev mode UI is visible (session-based)
let currentPasscode = null; // Store passcode for encryption/decryption

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

// Perspective corners (with sub-pixel precision)
let perspectiveCorners = {
    topLeft: { x: 0, y: 0, radius: 0 },
    topRight: { x: 0, y: 0, radius: 0 },
    bottomLeft: { x: 0, y: 0, radius: 0 },
    bottomRight: { x: 0, y: 0, radius: 0 }
};

// Perspective precision tracking
let perspectiveRedrawScheduled = false; // For requestAnimationFrame
let lastPerspectiveMousePos = { x: 0, y: 0 };

// Radius anchor dragging
let draggedRadiusAnchor = null; // Which corner's radius is being dragged

// Quadrilateral dragging (drag to reposition)
let isDraggingQuadrilateral = false;
let quadDragStartPos = { mouseX: 0, mouseY: 0, corners: null };

// Edge dragging (drag edge to transform)
let isDraggingEdge = false;
let draggedEdge = null;
let edgeDragStartPos = { mouseX: 0, mouseY: 0, corners: null };

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

    await loadConfigData();
    await loadGamesData();

    // Check if dev mode was enabled in this session
    checkDevModeSession();

    setupEventListeners();
    setupDetectionListeners();
});

// Load config data from JSON
async function loadConfigData() {
    try {
        // Add cache-busting timestamp to prevent browser caching
        const timestamp = new Date().getTime();
        const response = await fetch(`data/config.json?t=${timestamp}`, {
            cache: 'no-store' // Disable browser cache
        });
        configData = await response.json();
        console.log('Config data loaded successfully');

        // Try to restore passcode from sessionStorage (for current browser session)
        const storedPasscode = sessionStorage.getItem('dev_passcode');
        if (storedPasscode) {
            // Verify it's still valid
            const storedHash = await sha256(storedPasscode);
            if (storedHash === configData.passcodeHash) {
                currentPasscode = storedPasscode;
                isDevModeUnlocked = true;
                console.log('✅ Passcode restored from session');
            } else {
                // Invalid passcode in session, clear it
                sessionStorage.removeItem('dev_passcode');
            }
        }
    } catch (error) {
        console.error('Error loading config data:', error);
        // Create default config if not found
        configData = {
            passcodeHash: 'ca5ba8b8a405265c434c36aab691c7048ebf95453d9d086de43488c0bba99d69',
            githubToken: ''
        };
    }
}

// Load games data from JSON
async function loadGamesData() {
    try {
        // Add cache-busting timestamp to prevent browser caching
        const timestamp = new Date().getTime();
        const response = await fetch(`data/games.json?t=${timestamp}`, {
            cache: 'no-store' // Disable browser cache
        });
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
// Check if dev mode was enabled in current session
async function checkDevModeSession() {
    const devModeEnabled = sessionStorage.getItem('dev_mode_enabled');
    const savedPasscode = sessionStorage.getItem('dev_passcode');

    if (devModeEnabled === 'true' && savedPasscode && configData) {
        // Verify the saved passcode is still correct
        const savedHash = await sha256(savedPasscode);
        if (savedHash === configData.passcodeHash) {
            isDevModeUnlocked = true;
            isDevModeUIEnabled = true;
            currentPasscode = savedPasscode;
            enableDevModeUI();
        }
    }
}

// Enable dev mode UI elements
function enableDevModeUI() {
    // Update settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.innerHTML = '⚙️ Settings';
    }

    // Show Define Billboard Area section
    const areaSelectionControls = document.getElementById('area-selection-controls');
    if (areaSelectionControls) {
        areaSelectionControls.style.display = 'block';
    }
}

function setupEventListeners() {
    gameSelect.addEventListener('change', handleGameSelection);
    backBtn.addEventListener('click', handleBackToGallery);

    if (uploadArea) uploadArea.addEventListener('click', () => bannerUpload.click());
    if (bannerUpload) bannerUpload.addEventListener('change', handleBannerUpload);
    if (removeBannerBtn) removeBannerBtn.addEventListener('click', handleRemoveBanner);

    // Push All Live button
    const pushAllBtn = document.getElementById('push-all-btn');
    if (pushAllBtn) {
        pushAllBtn.addEventListener('click', handlePushAllLive);
    }

    // Load queue on page load
    updatePushAllButton();

    // Use event delegation for download button
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'download-btn') {
            console.log('Download button clicked via delegation');
            e.preventDefault();
            e.stopPropagation();
            handleDownload();
        }
    });

    // Passcode and Settings modals
    const settingsBtn = document.getElementById('settings-btn');
    const passcodeModal = document.getElementById('passcode-modal');
    const settingsModal = document.getElementById('settings-modal');
    const passcodeInput = document.getElementById('passcode-input');
    const verifyPasscodeBtn = document.getElementById('verify-passcode-btn');
    const cancelPasscodeBtn = document.getElementById('cancel-passcode-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveTokenBtn = document.getElementById('save-token-btn');
    const clearTokenBtn = document.getElementById('clear-token-btn');
    const passcodeError = document.getElementById('passcode-error');

    if (settingsBtn) settingsBtn.addEventListener('click', () => {
        if (isDevModeUIEnabled) {
            // Dev mode already enabled, go straight to settings
            settingsModal.style.display = 'flex';
            loadTokenStatus();
        } else {
            // Show passcode modal to enable dev mode
            passcodeModal.style.display = 'flex';
            passcodeInput.value = '';
            passcodeError.style.display = 'none';
            setTimeout(() => passcodeInput.focus(), 100);
        }
    });

    if (verifyPasscodeBtn) verifyPasscodeBtn.addEventListener('click', verifyPasscode);
    if (passcodeInput) passcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyPasscode();
    });
    if (cancelPasscodeBtn) cancelPasscodeBtn.addEventListener('click', () => {
        passcodeModal.style.display = 'none';
    });

    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });
    if (saveTokenBtn) saveTokenBtn.addEventListener('click', saveGitHubToken);
    if (clearTokenBtn) clearTokenBtn.addEventListener('click', clearGitHubToken);

    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // Billboard management - use event delegation
    document.addEventListener('click', (e) => {
        // Check if clicked element or its parent is the add billboard button
        const target = e.target.closest('#add-billboard-btn');
        if (target) {
            console.log('Add billboard button clicked via delegation');
            e.preventDefault();
            e.stopPropagation();
            addNewBillboard();
        }
    });

    document.addEventListener('change', (e) => {
        console.log('Change event detected on:', e.target.id, 'value:', e.target.value);
        if (e.target && e.target.id === 'billboard-selector') {
            console.log('Billboard selector changed to:', e.target.value);
            selectBillboardForTransform(parseInt(e.target.value));
        }
    });

    // Area selection
    const startAreaBtn = document.getElementById('start-area-selection-btn');
    const confirmAreaBtn = document.getElementById('confirm-area-btn');
    const cancelAreaBtn = document.getElementById('cancel-area-btn');
    const setDefaultBtn = document.getElementById('set-default-btn');
    const startPerspectiveBtn = document.getElementById('start-perspective-mode-btn');
    const confirmPerspectiveBtn = document.getElementById('confirm-perspective-btn');
    const cancelPerspectiveBtn = document.getElementById('cancel-perspective-btn');

    if (startAreaBtn) startAreaBtn.addEventListener('click', startAreaSelection);
    if (confirmAreaBtn) confirmAreaBtn.addEventListener('click', confirmAreaSelection);
    if (cancelAreaBtn) cancelAreaBtn.addEventListener('click', cancelAreaSelection);
    if (setDefaultBtn) setDefaultBtn.addEventListener('click', handleSetAsDefault);
    if (startPerspectiveBtn) startPerspectiveBtn.addEventListener('click', startPerspectiveMode);
    if (confirmPerspectiveBtn) confirmPerspectiveBtn.addEventListener('click', confirmPerspectiveMode);
    if (cancelPerspectiveBtn) cancelPerspectiveBtn.addEventListener('click', cancelPerspectiveMode);

    // Canvas mouse events - attach to canvas
    attachCanvasEventListeners();
}

// Attach canvas event listeners (can be called multiple times)
function attachCanvasEventListeners() {
    if (!canvas) {
        console.error('❌ CANVAS NOT FOUND!');
        return;
    }

    console.log('🎨 Attaching canvas event listeners...');
    console.log('🎨 Canvas element:', canvas);
    console.log('🎨 Canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('🎨 Canvas display:', window.getComputedStyle(canvas).display);
    console.log('🎨 Canvas visibility:', window.getComputedStyle(canvas).visibility);
    console.log('🎨 Canvas pointer-events:', window.getComputedStyle(canvas).pointerEvents);

    // Add test click listener to verify events work
    canvas.onclick = function(e) {
        console.log('🖱️ TEST ONCLICK EVENT FIRED at', e.clientX, e.clientY);
    };

    canvas.onmousedown = function(e) {
        console.log('🖱️ ONMOUSEDOWN EVENT FIRED');
        handleCanvasMouseDown(e);
    };

    canvas.onmousemove = function(e) {
        handleCanvasMouseMove(e);
    };

    canvas.onmouseup = function(e) {
        console.log('🖱️ ONMOUSEUP EVENT FIRED');
        handleCanvasMouseUp(e);
    };

    console.log('✅ Canvas event listeners attached successfully using on* properties');
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

// Helper function to analyze billboard ratios
function getBillboardRatios(screenshot) {
    if (!screenshot.billboards || screenshot.billboards.length === 0) {
        return [];
    }

    const ratios = new Set();

    screenshot.billboards.forEach(billboard => {
        let ratio;

        // If perspective data exists, calculate ratio from perspective corners
        if (billboard.perspective) {
            const p = billboard.perspective;

            // Calculate average width (top + bottom)
            const topWidth = Math.sqrt(
                Math.pow(p.topRight.x - p.topLeft.x, 2) +
                Math.pow(p.topRight.y - p.topLeft.y, 2)
            );
            const bottomWidth = Math.sqrt(
                Math.pow(p.bottomRight.x - p.bottomLeft.x, 2) +
                Math.pow(p.bottomRight.y - p.bottomLeft.y, 2)
            );
            const avgWidth = (topWidth + bottomWidth) / 2;

            // Calculate average height (left + right)
            const leftHeight = Math.sqrt(
                Math.pow(p.bottomLeft.x - p.topLeft.x, 2) +
                Math.pow(p.bottomLeft.y - p.topLeft.y, 2)
            );
            const rightHeight = Math.sqrt(
                Math.pow(p.bottomRight.x - p.topRight.x, 2) +
                Math.pow(p.bottomRight.y - p.topRight.y, 2)
            );
            const avgHeight = (leftHeight + rightHeight) / 2;

            ratio = avgWidth / avgHeight;
        } else {
            // Fallback to bounding box ratio
            ratio = billboard.width / billboard.height;
        }

        // 5-category classification for clearer expectations
        if (ratio > 1.3) {
            ratios.add('Horizontal');
        } else if (ratio > 1.1) {
            ratios.add('Landscape');
        } else if (ratio >= 0.9) {
            ratios.add('Square');
        } else if (ratio > 0.77) {
            ratios.add('Portrait');
        } else {
            ratios.add('Vertical');
        }
    });

    return Array.from(ratios);
}

// Get bounding box that contains all billboards
function getBillboardsBoundingBox(screenshot) {
    if (!screenshot.billboards || screenshot.billboards.length === 0) {
        return null;
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    screenshot.billboards.forEach(billboard => {
        if (billboard.perspective) {
            const corners = [
                billboard.perspective.topLeft,
                billboard.perspective.topRight,
                billboard.perspective.bottomLeft,
                billboard.perspective.bottomRight
            ];

            corners.forEach(corner => {
                minX = Math.min(minX, corner.x);
                minY = Math.min(minY, corner.y);
                maxX = Math.max(maxX, corner.x);
                maxY = Math.max(maxY, corner.y);
            });
        }
    });

    if (minX === Infinity) return null;

    const width = maxX - minX;
    const height = maxY - minY;

    // Add 20% padding around the bounding box
    const padding = 0.2;
    const paddingX = width * padding;
    const paddingY = height * padding;

    return {
        x: Math.max(0, minX - paddingX),
        y: Math.max(0, minY - paddingY),
        width: width + (paddingX * 2),
        height: height + (paddingY * 2)
    };
}

// Generate thumbnail with billboard overlays
function generateThumbnailWithBillboards(screenshot, callback) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `public/screenshots/${screenshot.filename}`;

    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set thumbnail size
        const thumbnailWidth = 300;
        const thumbnailHeight = 200;
        canvas.width = thumbnailWidth;
        canvas.height = thumbnailHeight;

        // Get billboard bounding box for cropping
        const bbox = getBillboardsBoundingBox(screenshot);

        let sourceX, sourceY, sourceWidth, sourceHeight;
        let scale, offsetX, offsetY;

        if (bbox) {
            // Crop to billboard region with padding
            sourceX = Math.max(0, bbox.x);
            sourceY = Math.max(0, bbox.y);
            sourceWidth = Math.min(bbox.width, img.width - sourceX);
            sourceHeight = Math.min(bbox.height, img.height - sourceY);

            // Calculate scale to fit cropped region into thumbnail
            scale = Math.min(thumbnailWidth / sourceWidth, thumbnailHeight / sourceHeight);
            const scaledWidth = sourceWidth * scale;
            const scaledHeight = sourceHeight * scale;
            offsetX = (thumbnailWidth - scaledWidth) / 2;
            offsetY = (thumbnailHeight - scaledHeight) / 2;

            // Draw cropped and scaled image
            ctx.drawImage(
                img,
                sourceX, sourceY, sourceWidth, sourceHeight,
                offsetX, offsetY, scaledWidth, scaledHeight
            );
        } else {
            // No billboards - show full image
            sourceX = 0;
            sourceY = 0;
            sourceWidth = img.width;
            sourceHeight = img.height;

            scale = Math.min(thumbnailWidth / img.width, thumbnailHeight / img.height);
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            offsetX = (thumbnailWidth - scaledWidth) / 2;
            offsetY = (thumbnailHeight - scaledHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
        }

        // Draw billboard overlays (adjusted for crop)
        if (screenshot.billboards && screenshot.billboards.length > 0) {
            screenshot.billboards.forEach(billboard => {
                if (billboard.perspective) {
                    ctx.save();
                    ctx.beginPath();

                    const tl = billboard.perspective.topLeft;
                    const tr = billboard.perspective.topRight;
                    const br = billboard.perspective.bottomRight;
                    const bl = billboard.perspective.bottomLeft;

                    // Adjust coordinates for crop offset
                    const adjustX = (x) => offsetX + (x - sourceX) * scale;
                    const adjustY = (y) => offsetY + (y - sourceY) * scale;

                    const tlAdj = { x: adjustX(tl.x), y: adjustY(tl.y) };
                    const trAdj = { x: adjustX(tr.x), y: adjustY(tr.y) };
                    const brAdj = { x: adjustX(br.x), y: adjustY(br.y) };
                    const blAdj = { x: adjustX(bl.x), y: adjustY(bl.y) };

                    ctx.moveTo(tlAdj.x, tlAdj.y);
                    ctx.lineTo(trAdj.x, trAdj.y);
                    ctx.lineTo(brAdj.x, brAdj.y);
                    ctx.lineTo(blAdj.x, blAdj.y);
                    ctx.closePath();

                    // Fill with solid grey background
                    ctx.fillStyle = '#808080';
                    ctx.fill();

                    // Add "Your Ad Here" text with perspective
                    const centerX = (tlAdj.x + trAdj.x + blAdj.x + brAdj.x) / 4;
                    const centerY = (tlAdj.y + trAdj.y + blAdj.y + brAdj.y) / 4;

                    // Calculate width and height of billboard in screen space
                    const width = Math.sqrt(Math.pow(trAdj.x - tlAdj.x, 2) + Math.pow(trAdj.y - tlAdj.y, 2));
                    const height = Math.sqrt(Math.pow(blAdj.x - tlAdj.x, 2) + Math.pow(blAdj.y - tlAdj.y, 2));

                    // Calculate rotation angle from top edge
                    const angle = Math.atan2(trAdj.y - tlAdj.y, trAdj.x - tlAdj.x);

                    ctx.save();
                    ctx.translate(centerX, centerY);
                    ctx.rotate(angle);

                    // Set font size based on billboard size
                    const fontSize = Math.min(width / 8, height / 3, 24);
                    ctx.font = `bold ${fontSize}px Arial`;
                    ctx.fillStyle = 'white';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('Your Ad Here', 0, 0);

                    ctx.restore();

                    // Add blue border for visibility
                    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.restore();
                }
            });
        }

        callback(canvas.toDataURL());
    };

    img.onerror = function() {
        callback(null);
    };
}

// Display screenshot gallery
function displayScreenshotGallery() {
    screenshotGallery.innerHTML = '';

    currentGame.screenshots.forEach((screenshot, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.onclick = () => selectScreenshot(index);

        const imageDiv = document.createElement('div');
        imageDiv.className = 'gallery-item-image';
        imageDiv.innerHTML = '<span>Loading...</span>';

        // Generate thumbnail with billboard overlays
        generateThumbnailWithBillboards(screenshot, (thumbnailDataUrl) => {
            if (thumbnailDataUrl) {
                const imgElement = document.createElement('img');
                imgElement.src = thumbnailDataUrl;
                imgElement.alt = screenshot.filename;
                imgElement.style.width = '100%';
                imgElement.style.height = '200px';
                imgElement.style.objectFit = 'contain';
                imageDiv.innerHTML = '';
                imageDiv.appendChild(imgElement);
            } else {
                imageDiv.innerHTML = '<span>Screenshot Preview</span>';
            }
        });

        // Get billboard ratios
        const ratios = getBillboardRatios(screenshot);
        const ratioText = ratios.length > 0 ? ratios.join(' • ') : 'No billboards';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'gallery-item-info';

        let ratioBadgesHTML = '';
        if (ratios.length > 0) {
            ratioBadgesHTML = ratios.map(ratio =>
                `<span class="ratio-badge ratio-badge-${ratio.toLowerCase()}">${ratio}</span>`
            ).join('');
        } else {
            ratioBadgesHTML = '<span class="ratio-badge ratio-badge-none">No billboards</span>';
        }

        infoDiv.innerHTML = `
            <div class="ratio-badges">${ratioBadgesHTML}</div>
            <div class="billboard-count">
                ${screenshot.billboards.length} billboard${screenshot.billboards.length !== 1 ? 's' : ''}
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
    transformTargetBillboardIndex = 0;
    areaSelectionMode = false;
    billboardControls.style.display = 'none';
    exportControls.style.display = 'none';

    // Clear billboard banners
    billboardBanners = {};

    // If no billboards exist, create a default placeholder
    if (!currentScreenshot.billboards || currentScreenshot.billboards.length === 0) {
        currentScreenshot.billboards = [{
            id: 'billboard-1',
            x: 100,
            y: 100,
            width: 300,
            height: 600,
            rotation: 0,
            perspective: {
                topLeft: { x: 100, y: 100 },
                topRight: { x: 400, y: 100 },
                bottomLeft: { x: 100, y: 700 },
                bottomRight: { x: 400, y: 700 }
            }
        }];
    }

    // Show area selection controls only if dev mode is enabled
    const areaSelectionControls = document.getElementById('area-selection-controls');
    if (areaSelectionControls && isDevModeUIEnabled) {
        areaSelectionControls.style.display = 'block';
    }

    // Show "Set as Default" button for pre-configured screenshots (if enabled)
    if (currentGame && currentGame.id !== 'uploaded') {
        updateSetAsDefaultButtonVisibility();
    }

    // Render upload slots for all billboards
    renderUploadSlots();

    // Populate billboard dropdown
    populateBillboardDropdown();

    // Select first billboard by default
    selectBillboardForTransform(0);

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

        // Draw all billboards (either uploaded banners or grey placeholders)
        if (currentScreenshot && currentScreenshot.billboards) {
            currentScreenshot.billboards.forEach((billboard, index) => {
                if (billboardBanners[index] && billboard.perspective) {
                    drawBannerWithPerspective(billboardBanners[index], billboard.perspective);
                } else if (billboard.perspective) {
                    // Draw grey placeholder with "Your Ad Here" text
                    drawPlaceholderBillboard(billboard.perspective);
                }
            });
        }

        // Draw billboard outlines
        drawBillboardOutlines();

        // Re-attach event listeners after canvas is resized
        console.log('📸 Image loaded, re-attaching canvas event listeners...');
        attachCanvasEventListeners();
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

        // Re-attach event listeners after canvas is resized
        console.log('📸 Image error, re-attaching canvas event listeners...');
        attachCanvasEventListeners();
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
            y: Math.max(margin, Math.min(canvas.height - margin, corners.topLeft.y)),
            radius: corners.topLeft.radius || 0
        },
        topRight: {
            x: Math.max(margin, Math.min(canvas.width - margin, corners.topRight.x)),
            y: Math.max(margin, Math.min(canvas.height - margin, corners.topRight.y)),
            radius: corners.topRight.radius || 0
        },
        bottomLeft: {
            x: Math.max(margin, Math.min(canvas.width - margin, corners.bottomLeft.x)),
            y: Math.max(margin, Math.min(canvas.height - margin, corners.bottomLeft.y)),
            radius: corners.bottomLeft.radius || 0
        },
        bottomRight: {
            x: Math.max(margin, Math.min(canvas.width - margin, corners.bottomRight.x)),
            y: Math.max(margin, Math.min(canvas.height - margin, corners.bottomRight.y)),
            radius: corners.bottomRight.radius || 0
        }
    };
}

// Helper function to draw banner with perspective transformation
function drawBannerWithPerspective(bannerImage, corners) {
    const { topLeft, topRight, bottomLeft, bottomRight } = corners;

    // Save context
    ctx.save();

    // Create clipping path for the quadrilateral with rounded corners
    ctx.beginPath();

    // Get radius values (default to 0 if not present)
    const tlRadius = topLeft.radius || 0;
    const trRadius = topRight.radius || 0;
    const brRadius = bottomRight.radius || 0;
    const blRadius = bottomLeft.radius || 0;

    // Start at top-left corner (after rounded area if applicable)
    ctx.moveTo(topLeft.x + tlRadius, topLeft.y);

    // Top edge to top-right corner
    ctx.lineTo(topRight.x - trRadius, topRight.y);
    if (trRadius > 0) {
        ctx.arcTo(topRight.x, topRight.y, topRight.x, topRight.y + trRadius, trRadius);
    }

    // Right edge to bottom-right corner
    ctx.lineTo(bottomRight.x, bottomRight.y - brRadius);
    if (brRadius > 0) {
        ctx.arcTo(bottomRight.x, bottomRight.y, bottomRight.x - brRadius, bottomRight.y, brRadius);
    }

    // Bottom edge to bottom-left corner
    ctx.lineTo(bottomLeft.x + blRadius, bottomLeft.y);
    if (blRadius > 0) {
        ctx.arcTo(bottomLeft.x, bottomLeft.y, bottomLeft.x, bottomLeft.y - blRadius, blRadius);
    }

    // Left edge back to top-left corner
    ctx.lineTo(topLeft.x, topLeft.y + tlRadius);
    if (tlRadius > 0) {
        ctx.arcTo(topLeft.x, topLeft.y, topLeft.x + tlRadius, topLeft.y, tlRadius);
    }

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

    // Set offscreen canvas size with 2x resolution for sharper rendering
    const resolutionMultiplier = 2;
    offCanvas.width = Math.ceil(billboardWidth * resolutionMultiplier);
    offCanvas.height = Math.ceil(billboardHeight * resolutionMultiplier);

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
    // Use more segments for better quality, especially for extreme perspectives
    const segments = 50;

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

// Draw grey placeholder billboard with "Your Ad Here" text
function drawPlaceholderBillboard(corners) {
    const { topLeft, topRight, bottomLeft, bottomRight } = corners;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();

    // Fill with solid grey background
    ctx.fillStyle = '#808080';
    ctx.fill();

    // Add "Your Ad Here" text with perspective
    const centerX = (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4;
    const centerY = (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4;

    // Calculate width and height of billboard
    const width = Math.sqrt(Math.pow(topRight.x - topLeft.x, 2) + Math.pow(topRight.y - topLeft.y, 2));
    const height = Math.sqrt(Math.pow(bottomLeft.x - topLeft.x, 2) + Math.pow(bottomLeft.y - topLeft.y, 2));

    // Calculate rotation angle from top edge
    const angle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    // Set font size based on billboard size
    const fontSize = Math.min(width / 8, height / 3, 48);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Your Ad Here', 0, 0);

    ctx.restore();
    ctx.restore();
}

// Draw the screenshot with billboards
function drawScreenshot() {
    if (!baseImage || !baseImage.complete) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw base screenshot
    ctx.drawImage(baseImage, 0, 0);

    // Draw all billboards (either uploaded banners or grey placeholders)
    currentScreenshot.billboards.forEach((billboard, index) => {
        if (billboardBanners[index]) {
            drawBannerWithPerspective(billboardBanners[index], billboard.perspective);
        } else {
            // Draw grey placeholder with "Your Ad Here" text
            drawPlaceholderBillboard(billboard.perspective);
        }
    });

    // Draw billboard outlines
    drawBillboardOutlines();
}

// Draw billboard outlines on canvas
function drawBillboardOutlines() {
    if (!currentScreenshot || !currentScreenshot.billboards) return;

    currentScreenshot.billboards.forEach((billboard, index) => {
        const isSelected = index === transformTargetBillboardIndex;

        // Different styling for selected billboard
        ctx.strokeStyle = isSelected ? '#16a34a' : '#3b82f6';
        ctx.lineWidth = isSelected ? 5 : 3;
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

        // Draw billboard number with background
        const labelText = `Billboard ${index + 1}`;
        const labelX = (topLeft.x + topRight.x) / 2;
        const labelY = topLeft.y - 10;

        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Background for label
        const metrics = ctx.measureText(labelText);
        const padding = 6;
        ctx.fillStyle = isSelected ? '#16a34a' : '#3b82f6';
        ctx.fillRect(
            labelX - metrics.width / 2 - padding,
            labelY - 20 - padding,
            metrics.width + padding * 2,
            20 + padding * 2
        );

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, labelX, labelY);

        // Draw corner handles if selected (in edit mode)
        if (isSelected && (areaSelectionMode || perspectiveMode)) {
            const corners = [topLeft, topRight, bottomLeft, bottomRight];
            corners.forEach(corner => {
                ctx.fillStyle = '#16a34a';
                ctx.fillRect(corner.x - 5, corner.y - 5, 10, 10);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.strokeRect(corner.x - 5, corner.y - 5, 10, 10);
            });
        }
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

    // Redraw canvas
    drawScreenshot();
}

// ===== MULTI-BILLBOARD MANAGEMENT =====

// Add new billboard
window.addNewBillboard = function addNewBillboard() {
    console.log('addNewBillboard called');
    console.log('currentScreenshot:', currentScreenshot);
    console.log('billboards:', currentScreenshot?.billboards);

    if (!currentScreenshot || !currentScreenshot.billboards) {
        alert('Please load a screenshot first.');
        return;
    }

    const lastBillboard = currentScreenshot.billboards[currentScreenshot.billboards.length - 1];
    console.log('Last billboard:', lastBillboard);

    // Calculate offset from last billboard's perspective
    const lastTopLeft = lastBillboard.perspective.topLeft;
    const offsetX = 50;
    const offsetY = 50;

    // New position with boundary checks
    let newX = Math.min(lastTopLeft.x + offsetX, canvas.width - 350);
    let newY = Math.min(lastTopLeft.y + offsetY, canvas.height - 650);

    // If we're too far right or bottom, wrap to a different position
    if (newX + 300 > canvas.width) newX = 50;
    if (newY + 600 > canvas.height) newY = 50;

    const newBillboard = {
        id: `billboard-${Date.now()}`,
        x: newX,
        y: newY,
        width: 300,
        height: 600,
        rotation: 0,
        perspective: {
            topLeft: { x: newX, y: newY },
            topRight: { x: newX + 300, y: newY },
            bottomLeft: { x: newX, y: newY + 600 },
            bottomRight: { x: newX + 300, y: newY + 600 }
        }
    };

    currentScreenshot.billboards.push(newBillboard);

    // Refresh UI
    renderUploadSlots();
    populateBillboardDropdown();

    // Select the new billboard for transform
    transformTargetBillboardIndex = currentScreenshot.billboards.length - 1;
    const dropdown = document.getElementById('billboard-selector');
    if (dropdown) {
        dropdown.value = transformTargetBillboardIndex;
    }
    selectBillboardForTransform(transformTargetBillboardIndex);

    // Redraw canvas
    drawScreenshot();
}

// Delete billboard
window.deleteBillboard = function deleteBillboard(index) {
    if (!currentScreenshot || !currentScreenshot.billboards) {
        return;
    }

    if (currentScreenshot.billboards.length <= 1) {
        alert('Cannot delete the last billboard. At least one billboard is required.');
        return;
    }

    const billboardNum = index + 1;
    if (!confirm(`Are you sure you want to remove Billboard ${billboardNum}?`)) {
        return;
    }

    // Remove billboard
    currentScreenshot.billboards.splice(index, 1);

    // Remove associated banner if exists
    if (billboardBanners[index]) {
        delete billboardBanners[index];
    }

    // Update transformTargetBillboardIndex if needed
    if (transformTargetBillboardIndex >= currentScreenshot.billboards.length) {
        transformTargetBillboardIndex = currentScreenshot.billboards.length - 1;
    }

    // Refresh UI
    renderUploadSlots();
    populateBillboardDropdown();

    // Update dropdown selection
    document.getElementById('billboard-selector').value = transformTargetBillboardIndex;
    selectBillboardForTransform(transformTargetBillboardIndex);

    // Redraw canvas
    drawScreenshot();
}

// Select billboard for transform
window.selectBillboardForTransform = function selectBillboardForTransform(index) {
    console.log('selectBillboardForTransform called with index:', index);
    console.log('Available billboards:', currentScreenshot.billboards.length);

    transformTargetBillboardIndex = index;
    selectedBillboardIndex = index;
    selectedBillboard = currentScreenshot.billboards[index];

    console.log('Selected billboard:', selectedBillboard);
    console.log('transformTargetBillboardIndex:', transformTargetBillboardIndex);

    // Redraw canvas to highlight selected billboard
    drawScreenshot();
}

// Populate billboard dropdown
function populateBillboardDropdown() {
    const dropdown = document.getElementById('billboard-selector');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    currentScreenshot.billboards.forEach((billboard, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `Billboard ${index + 1}`;
        dropdown.appendChild(option);
    });

    dropdown.value = transformTargetBillboardIndex;
}

// Render upload slots dynamically
function renderUploadSlots() {
    const container = document.getElementById('upload-slots-container');
    if (!container) return;

    container.innerHTML = '';

    currentScreenshot.billboards.forEach((billboard, index) => {
        const slotCard = document.createElement('div');
        slotCard.className = 'upload-slot-card';
        slotCard.innerHTML = `
            <div class="upload-slot-header">
                <h4>Billboard ${index + 1}</h4>
                <button class="delete-billboard-btn" data-index="${index}" title="Delete this billboard">
                    🗑️
                </button>
            </div>
            <div class="upload-area upload-slot-area" data-index="${index}">
                <div class="upload-prompt">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <p>Upload banner ${index + 1}</p>
                    <p class="upload-hint">Drag & drop or click</p>
                </div>
                <input type="file" class="banner-upload-input" data-index="${index}" accept="image/*" style="display: none;">
            </div>
            <div class="banner-info-slot" id="banner-info-${index}" style="display: none;">
                <p><strong>Size:</strong> <span class="banner-size-info"></span></p>
                <p><strong>Dimensions:</strong> <span class="banner-dimensions"></span></p>
                <button class="btn btn-danger btn-sm remove-banner-btn" data-index="${index}">Remove Banner</button>
            </div>
        `;

        container.appendChild(slotCard);

        // Add event listeners
        const uploadArea = slotCard.querySelector('.upload-slot-area');
        const fileInput = slotCard.querySelector('.banner-upload-input');
        const deleteBtn = slotCard.querySelector('.delete-billboard-btn');
        const removeBannerBtn = slotCard.querySelector('.remove-banner-btn');

        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleBannerUploadForSlot(e, index));
        deleteBtn.addEventListener('click', () => deleteBillboard(index));
        if (removeBannerBtn) {
            removeBannerBtn.addEventListener('click', () => removeBannerFromSlot(index));
        }

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                loadBannerImageForSlot(file, index);
            }
        });
    });
}

// Handle banner upload for specific slot
function handleBannerUploadForSlot(e, index) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        loadBannerImageForSlot(file, index);
    }
}

// Load banner image for specific slot
function loadBannerImageForSlot(file, index) {
    const reader = new FileReader();

    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Store banner for this billboard
            billboardBanners[index] = img;

            // Update UI for this slot
            const bannerInfo = document.getElementById(`banner-info-${index}`);
            if (bannerInfo) {
                bannerInfo.style.display = 'block';
                const sizeInfo = bannerInfo.querySelector('.banner-size-info');
                const dimensionsInfo = bannerInfo.querySelector('.banner-dimensions');

                if (sizeInfo) sizeInfo.textContent = currentScreenshot.bannerSize || '300x600';
                if (dimensionsInfo) dimensionsInfo.textContent = `${img.width} × ${img.height}px`;
            }

            // Select this billboard and redraw
            selectBillboard(index);
            drawScreenshot();

            // Show export controls
            exportControls.style.display = 'block';
        };
        img.src = e.target.result;
    };

    reader.readAsDataURL(file);
}

// Remove banner from specific slot
function removeBannerFromSlot(index) {
    delete billboardBanners[index];

    const bannerInfo = document.getElementById(`banner-info-${index}`);
    if (bannerInfo) {
        bannerInfo.style.display = 'none';
    }

    const fileInput = document.querySelector(`.banner-upload-input[data-index="${index}"]`);
    if (fileInput) {
        fileInput.value = '';
    }

    // Redraw canvas
    drawScreenshot();
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
    console.log('🔽 Download button clicked');
    console.log('Canvas:', canvas);
    console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('baseImage:', baseImage);
    console.log('currentGame:', currentGame);
    console.log('currentScreenshot:', currentScreenshot);
    console.log('selectedBillboardsForRender:', window.selectedBillboardsForRender);
    console.log('uploadedBanner:', uploadedBanner);
    console.log('selectedBillboard:', selectedBillboard);

    // Check if we have a valid canvas
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
        console.error('Canvas is not initialized');
        alert('Error: Canvas is not initialized. Please load a screenshot first.');
        return;
    }

    // Check if base image exists and is loaded
    if (!baseImage) {
        console.error('Base image does not exist');
        alert('Error: Screenshot image is not loaded. Please load a screenshot first.');
        return;
    }

    // If image is still loading, wait for it
    if (!baseImage.complete) {
        console.warn('Image still loading, waiting...');
        baseImage.onload = function() {
            console.log('Image loaded, retrying download...');
            handleDownload();
        };
        return;
    }

    // Render final image without outlines
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw base screenshot
    ctx.drawImage(baseImage, 0, 0);

    // Check workflow type and draw banners accordingly
    if (window.selectedBillboardsForRender && window.selectedBillboardsForRender.length > 0) {
        // Uploaded screenshot workflow - draw selected billboards
        window.selectedBillboardsForRender.forEach(billboard => {
            const bannerImage = billboardBanners[billboard.index];
            if (bannerImage) {
                drawBannerWithPerspective(bannerImage, billboard.corners);
            }
        });
    } else if (currentScreenshot && currentScreenshot.billboards) {
        // Pre-configured screenshot workflow - draw all billboards with banners
        currentScreenshot.billboards.forEach((billboard, index) => {
            if (billboardBanners[index]) {
                drawBannerWithPerspective(billboardBanners[index], billboard.perspective);
            }
        });
    }

    // Generate filename
    let filename = 'banner_screenshot.png';
    if (currentGame && currentScreenshot) {
        const gameName = currentGame.name || 'game';
        const screenshotName = currentScreenshot.filename || 'screenshot';
        filename = `${gameName}_${screenshotName}_banner.png`;
    } else if (currentScreenshot) {
        const screenshotName = currentScreenshot.filename || 'screenshot';
        filename = `${screenshotName}_banner.png`;
    } else if (currentGame) {
        const gameName = currentGame.name || 'game';
        filename = `${gameName}_banner.png`;
    }

    console.log('Generated filename:', filename);

    try {
        // Download the clean image
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        console.log('Download link created:', link.href.substring(0, 100) + '...');
        link.click();
        console.log('✅ Download triggered successfully');
    } catch (error) {
        console.error('❌ Error during download:', error);
        alert('Error downloading image: ' + error.message);
        return;
    }

    // Redraw canvas with outlines for preview
    if (detectedRectangles && detectedRectangles.length > 0) {
        // Uploaded screenshot workflow
        drawAllSelectedBillboards(true);
    } else if (currentScreenshot && currentScreenshot.billboards) {
        // Pre-configured screenshot workflow - redraw with billboards and outlines
        drawScreenshot();
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

// ===== SET AS DEFAULT FUNCTIONS =====

// Handle Set as Default for rectangle mode
window.handleSetAsDefault = async function handleSetAsDefault() {
    console.log('🔧 handleSetAsDefault called');
    console.log('currentGame:', currentGame);
    console.log('currentScreenshot:', currentScreenshot);
    console.log('currentScreenshot.billboards:', currentScreenshot?.billboards);

    if (!currentGame || currentGame.id === 'uploaded') {
        alert('Set as Default is only available for pre-configured game screenshots.');
        return;
    }

    // Check if feature is enabled
    if (configData?.setAsDefaultEnabled === false) {
        alert('⚠️ "Set as Default" is currently disabled.\n\nPlease enable it in Settings (⚙️) to save billboard configurations.');
        return;
    }

    if (!currentScreenshot || !currentScreenshot.billboards || currentScreenshot.billboards.length === 0) {
        alert('No billboards to save. Please configure at least one billboard first.');
        return;
    }

    // Check if GitHub token is configured
    let token = getGitHubToken();
    if (!token) {
        // If no token, it might be because passcode is not set
        // Prompt for passcode first
        if (!currentPasscode) {
            console.log('⚠️ No passcode set, prompting user...');
            const passcode = await promptForPasscode();
            if (!passcode) {
                // User cancelled or entered wrong passcode
                return;
            }
            // Try getting token again with the passcode
            token = getGitHubToken();
        }

        // If still no token, it means no token is saved
        if (!token) {
            alert('GitHub token not configured!\n\nPlease click the Settings button (⚙️) in the header to configure your GitHub Personal Access Token first.');
            return;
        }
    }

    try {
        // Show loading message
        const setDefaultBtn = document.getElementById('set-default-btn');
        const originalText = setDefaultBtn.textContent;
        setDefaultBtn.textContent = 'Adding to Queue...';
        setDefaultBtn.disabled = true;

        // Load existing queue from sessionStorage
        let pendingChanges = JSON.parse(sessionStorage.getItem('pendingBillboardChanges') || '[]');

        // Check if this game/screenshot already has a pending change
        const existingIndex = pendingChanges.findIndex(
            change => change.gameId === currentGame.id && change.screenshotId === currentScreenshot.id
        );

        const changeData = {
            gameId: currentGame.id,
            screenshotId: currentScreenshot.id,
            billboards: JSON.parse(JSON.stringify(currentScreenshot.billboards)), // Deep clone
            gameName: currentGame.name,
            screenshotName: currentScreenshot.filename
        };

        if (existingIndex !== -1) {
            // Update existing entry
            pendingChanges[existingIndex] = changeData;
            console.log('✅ Updated existing queue entry');
        } else {
            // Add new entry
            pendingChanges.push(changeData);
            console.log('✅ Added new queue entry');
        }

        // Save back to sessionStorage
        sessionStorage.setItem('pendingBillboardChanges', JSON.stringify(pendingChanges));

        // Update UI
        updatePushAllButton();

        // Reset button
        setDefaultBtn.textContent = originalText;
        setDefaultBtn.disabled = false;

        alert(`✅ Added to Queue!\n\nSaved ${currentScreenshot.billboards.length} billboard(s) for:\n${currentGame.name} - ${currentScreenshot.filename}\n\nClick "Push All Live" in the header when you're ready to publish all changes.`);

    } catch (error) {
        console.error('❌ Error adding to queue:', error);

        // Reset button
        const setDefaultBtn = document.getElementById('set-default-btn');
        setDefaultBtn.textContent = 'Save to Queue';
        setDefaultBtn.disabled = false;

        alert(`❌ Failed to add to queue:\n\n${error.message}`);
    }
}

// Update the Push All button visibility and count
function updatePushAllButton() {
    const pendingChanges = JSON.parse(sessionStorage.getItem('pendingBillboardChanges') || '[]');
    const pushAllBtn = document.getElementById('push-all-btn');
    const pendingCount = document.getElementById('pending-count');

    if (pendingChanges.length > 0) {
        pushAllBtn.style.display = 'block';
        pendingCount.textContent = pendingChanges.length;
    } else {
        pushAllBtn.style.display = 'none';
    }
}

// Handle pushing all pending changes to GitHub
window.handlePushAllLive = async function handlePushAllLive() {
    console.log('🚀 handlePushAllLive called');

    // Load pending changes
    const pendingChanges = JSON.parse(sessionStorage.getItem('pendingBillboardChanges') || '[]');

    if (pendingChanges.length === 0) {
        alert('No pending changes to push.');
        return;
    }

    // Check if GitHub token is configured
    let token = getGitHubToken();
    if (!token) {
        if (!currentPasscode) {
            const passcode = await promptForPasscode();
            if (!passcode) {
                return;
            }
            token = getGitHubToken();
        }

        if (!token) {
            alert('GitHub token not configured!\n\nPlease configure your GitHub token in Settings first.');
            return;
        }
    }

    // Show confirmation dialog
    const confirmMsg = `You are about to push ${pendingChanges.length} billboard configuration(s) to GitHub:\n\n` +
        pendingChanges.map(c => `• ${c.gameName} - ${c.screenshotName} (${c.billboards.length} billboard(s))`).join('\n') +
        `\n\nContinue?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        // Show loading state
        const pushAllBtn = document.getElementById('push-all-btn');
        const originalText = pushAllBtn.innerHTML;
        pushAllBtn.innerHTML = '⏳ Pushing...';
        pushAllBtn.disabled = true;

        console.log('📡 Fetching games.json from GitHub...');

        // Fetch current games.json from GitHub
        const { content: githubGamesData, sha } = await fetchGamesJsonFromGitHub(token);

        console.log('✅ Fetched games.json, applying all changes...');

        // Apply all pending changes
        let totalBillboards = 0;
        for (const change of pendingChanges) {
            const gameIndex = githubGamesData.games.findIndex(g => g.id === change.gameId);
            if (gameIndex === -1) {
                console.warn(`Game ${change.gameName} not found, skipping`);
                continue;
            }

            const screenshotIndex = githubGamesData.games[gameIndex].screenshots.findIndex(
                s => s.id === change.screenshotId
            );
            if (screenshotIndex === -1) {
                console.warn(`Screenshot ${change.screenshotName} not found, skipping`);
                continue;
            }

            // Apply the billboard changes
            githubGamesData.games[gameIndex].screenshots[screenshotIndex].billboards = change.billboards;
            totalBillboards += change.billboards.length;
            console.log(`✅ Applied changes for ${change.gameName} - ${change.screenshotName}`);
        }

        console.log('📤 Committing all changes to GitHub...');

        // Commit the updated games.json to GitHub
        const commitMessage = `Update billboard configurations for ${pendingChanges.length} screenshot(s)\n\n` +
            pendingChanges.map(c => `- ${c.gameName}: ${c.screenshotName} (${c.billboards.length} billboard(s))`).join('\n');

        const commitResponse = await commitGamesJsonToGitHub(token, githubGamesData, sha, commitMessage);
        const commitSha = commitResponse.commit.sha;

        console.log('✅ Successfully committed to GitHub with SHA:', commitSha);

        // Update local gamesData
        gamesData = githubGamesData;

        // Clear the queue
        sessionStorage.removeItem('pendingBillboardChanges');
        updatePushAllButton();

        // Reset button
        pushAllBtn.innerHTML = originalText;
        pushAllBtn.disabled = false;

        alert(`✅ Success!\n\nPushed ${pendingChanges.length} configuration(s) with ${totalBillboards} total billboard(s) to GitHub.\n\nWe're tracking the deployment status and will notify you when it's live.`);

        // Poll for deployment
        pollForGitHubUpdate(token, commitSha, null, null, totalBillboards);

    } catch (error) {
        console.error('❌ Error pushing to GitHub:', error);

        // Reset button
        const pushAllBtn = document.getElementById('push-all-btn');
        pushAllBtn.innerHTML = '🚀 Push <span id="pending-count">' + pendingChanges.length + '</span> Live';
        pushAllBtn.disabled = false;

        alert(`❌ Failed to push to GitHub:\n\n${error.message}\n\nPlease check:\n1. Your GitHub token has 'repo' permissions\n2. You have access to the repository\n3. Your internet connection is working`);
    }
}

// Poll GitHub Pages deployment status to check when the update is live
async function pollForGitHubUpdate(token, commitSha, gameId, screenshotId, expectedBillboardCount) {
    console.log('🔄 Starting to track GitHub Pages deployment for commit:', commitSha);

    const pollInterval = 2000; // Check every 2 seconds

    const checkDeploymentStatus = async () => {
        console.log('📡 Checking deployment status...');

        try {
            // Check GitHub Pages Builds API
            const buildsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pages/builds/latest`;
            const response = await fetch(buildsUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                console.warn('Failed to fetch GitHub Pages build status, falling back to file polling');
                return await checkUpdateViaFilePolling(gameId, screenshotId, expectedBillboardCount);
            }

            const buildData = await response.json();
            console.log('Build status:', buildData.status);

            // Check if deployment is complete and matches our commit
            if (buildData.status === 'built' && buildData.commit === commitSha) {
                console.log('✅ Deployment confirmed live on GitHub Pages!');
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error checking deployment status, falling back to file polling:', error);
            return await checkUpdateViaFilePolling(gameId, screenshotId, expectedBillboardCount);
        }
    };

    // Fallback: Check by fetching the actual file
    const checkUpdateViaFilePolling = async (gameId, screenshotId, expectedBillboardCount) => {
        console.log('📄 Falling back to file polling method...');

        try {
            const timestamp = new Date().getTime();
            const response = await fetch(`data/games.json?t=${timestamp}`, {
                cache: 'no-store'
            });

            const liveData = await response.json();

            // Find the game and screenshot
            const game = liveData.games.find(g => g.id === gameId);
            if (!game) {
                console.warn('Game not found in live data');
                return false;
            }

            const screenshot = game.screenshots.find(s => s.id === screenshotId);
            if (!screenshot) {
                console.warn('Screenshot not found in live data');
                return false;
            }

            // Check if billboard count matches (indicates update is live)
            const liveBillboardCount = screenshot.billboards?.length || 0;
            console.log(`Live billboard count: ${liveBillboardCount}, Expected: ${expectedBillboardCount}`);

            if (liveBillboardCount === expectedBillboardCount) {
                console.log('✅ Update confirmed live via file polling!');
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error in file polling:', error);
            return false;
        }
    };

    // Poll loop
    const poll = async () => {
        const isLive = await checkDeploymentStatus();

        if (isLive) {
            // Deployment is live! Prompt user to reload
            const shouldReload = confirm(
                '✅ Your changes are now live on GitHub Pages!\n\n' +
                'Click OK to reload the page and see the updated billboard configuration.\n\n' +
                'Click Cancel to continue working (you can reload manually later).'
            );

            if (shouldReload) {
                location.reload();
            }
            return;
        }

        // Keep polling until deployment is confirmed
        setTimeout(poll, pollInterval);
    };

    // Start polling
    poll();
}

// ===== AREA SELECTION FUNCTIONS =====

// Start area selection mode
window.startAreaSelection = function startAreaSelection() {
    console.log('startAreaSelection called');
    console.log('transformTargetBillboardIndex:', transformTargetBillboardIndex);
    console.log('currentScreenshot.billboards:', currentScreenshot.billboards);

    areaSelectionMode = true;
    canvas.classList.add('area-selection-active');

    // Use the transform target billboard
    const targetBillboard = currentScreenshot.billboards[transformTargetBillboardIndex];
    console.log('Target billboard from index:', targetBillboard);

    // Initialize selection rect with target billboard
    if (targetBillboard) {
        const { topLeft, bottomRight } = targetBillboard.perspective;
        selectionRect = {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        };
        selectedBillboard = targetBillboard;
        selectedBillboardIndex = transformTargetBillboardIndex;
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
    document.getElementById('start-perspective-mode-btn').style.display = 'none';
    document.getElementById('add-billboard-btn').style.display = 'none';

    console.log('📐 About to call redrawWithSelection()');
    console.log('📐 selectionRect:', selectionRect);
    console.log('📐 canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('📐 baseImage:', baseImage, baseImage ? 'loaded' : 'not loaded');

    // Redraw with selection
    redrawWithSelection();

    console.log('✅ redrawWithSelection() completed');
}

// Cancel area selection
window.cancelAreaSelection = function cancelAreaSelection() {
    areaSelectionMode = false;
    canvas.classList.remove('area-selection-active');
    document.getElementById('area-adjust-controls').style.display = 'none';
    document.getElementById('start-area-selection-btn').style.display = 'block';
    document.getElementById('start-perspective-mode-btn').style.display = 'block';
    document.getElementById('add-billboard-btn').style.display = 'block';

    // Redraw without selection using helper function
    redrawCanvas(true);
}

// Confirm area selection
window.confirmAreaSelection = function confirmAreaSelection() {
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
    document.getElementById('start-perspective-mode-btn').style.display = 'block';
    document.getElementById('add-billboard-btn').style.display = 'block';

    // Show "Set as Default" button for pre-configured screenshots
    if (currentGame && currentGame.id !== 'uploaded') {
        const setDefaultContainer = document.getElementById('set-default-container');
        if (setDefaultContainer) {
            setDefaultContainer.style.display = 'block';
        }
    }

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
    console.log('🖱️ MOUSE DOWN on canvas');
    console.log('areaSelectionMode:', areaSelectionMode);
    console.log('perspectiveMode:', perspectiveMode);

    if (!areaSelectionMode && !perspectiveMode) {
        console.log('Not in edit mode, returning');
        return;
    }

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
    if (!areaSelectionMode && !perspectiveMode) return;

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
    console.log('🖱️ MOUSE UP on canvas');
    if (!areaSelectionMode && !perspectiveMode) return;

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
window.startPerspectiveMode = function startPerspectiveMode() {
    console.log('startPerspectiveMode called');
    console.log('transformTargetBillboardIndex:', transformTargetBillboardIndex);

    perspectiveMode = true;
    areaSelectionMode = false;
    canvas.classList.add('area-selection-active');

    // Use the transform target billboard
    const targetBillboard = currentScreenshot.billboards[transformTargetBillboardIndex];
    console.log('Target billboard:', targetBillboard);
    selectedBillboard = targetBillboard;
    selectedBillboardIndex = transformTargetBillboardIndex;

    // Initialize perspective corners from target billboard
    if (targetBillboard && targetBillboard.perspective) {
        perspectiveCorners = {
            topLeft: {
                ...targetBillboard.perspective.topLeft,
                radius: targetBillboard.perspective.topLeft.radius || 0
            },
            topRight: {
                ...targetBillboard.perspective.topRight,
                radius: targetBillboard.perspective.topRight.radius || 0
            },
            bottomLeft: {
                ...targetBillboard.perspective.bottomLeft,
                radius: targetBillboard.perspective.bottomLeft.radius || 0
            },
            bottomRight: {
                ...targetBillboard.perspective.bottomRight,
                radius: targetBillboard.perspective.bottomRight.radius || 0
            }
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
            topLeft: { x: cx - defaultWidth / 2, y: cy - defaultHeight / 2, radius: 0 },
            topRight: { x: cx + defaultWidth / 2, y: cy - defaultHeight / 2, radius: 0 },
            bottomLeft: { x: cx - defaultWidth / 2, y: cy + defaultHeight / 2, radius: 0 },
            bottomRight: { x: cx + defaultWidth / 2, y: cy + defaultHeight / 2, radius: 0 }
        };

        // Ensure default corners are within bounds
        perspectiveCorners = clampCornersToCanvas(perspectiveCorners);
    }

    document.getElementById('perspective-adjust-controls').style.display = 'block';
    document.getElementById('area-adjust-controls').style.display = 'none';
    document.getElementById('start-perspective-mode-btn').style.display = 'none';
    document.getElementById('add-billboard-btn').style.display = 'none';

    updatePerspectiveDisplay();
    redrawWithPerspective();
}

// Cancel perspective mode
window.cancelPerspectiveMode = function cancelPerspectiveMode() {
    perspectiveMode = false;
    canvas.classList.remove('area-selection-active');
    document.getElementById('perspective-adjust-controls').style.display = 'none';
    document.getElementById('start-perspective-mode-btn').style.display = 'block';
    document.getElementById('add-billboard-btn').style.display = 'block';
    draggedPerspectiveCorner = null;
    draggedRadiusAnchor = null;
    isDraggingQuadrilateral = false;
    quadDragStartPos = { mouseX: 0, mouseY: 0, corners: null };
    isDraggingEdge = false;
    draggedEdge = null;
    edgeDragStartPos = { mouseX: 0, mouseY: 0, corners: null };

    // Redraw using helper function
    redrawCanvas(true);
}

// Confirm perspective mode
window.confirmPerspectiveMode = function confirmPerspectiveMode() {
    if (!selectedBillboard) {
        selectedBillboardIndex = 0;
        selectedBillboard = currentScreenshot.billboards[0];
    }

    // Update billboard with perspective corners including radius
    currentScreenshot.billboards[selectedBillboardIndex].perspective = {
        topLeft: {
            x: Math.round(perspectiveCorners.topLeft.x),
            y: Math.round(perspectiveCorners.topLeft.y),
            radius: Math.round(perspectiveCorners.topLeft.radius || 0)
        },
        topRight: {
            x: Math.round(perspectiveCorners.topRight.x),
            y: Math.round(perspectiveCorners.topRight.y),
            radius: Math.round(perspectiveCorners.topRight.radius || 0)
        },
        bottomLeft: {
            x: Math.round(perspectiveCorners.bottomLeft.x),
            y: Math.round(perspectiveCorners.bottomLeft.y),
            radius: Math.round(perspectiveCorners.bottomLeft.radius || 0)
        },
        bottomRight: {
            x: Math.round(perspectiveCorners.bottomRight.x),
            y: Math.round(perspectiveCorners.bottomRight.y),
            radius: Math.round(perspectiveCorners.bottomRight.radius || 0)
        }
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
    document.getElementById('start-perspective-mode-btn').style.display = 'block';
    document.getElementById('add-billboard-btn').style.display = 'block'; // Show "Add Billboard" button
    draggedPerspectiveCorner = null;
    draggedRadiusAnchor = null;

    // Show "Set as Default" button for pre-configured screenshots
    if (currentGame && currentGame.id !== 'uploaded') {
        const setDefaultContainer = document.getElementById('set-default-container');
        if (setDefaultContainer) {
            setDefaultContainer.style.display = 'block';
        }
    }

    alert('Perspective applied! Billboard corners:\nTL: (' + perspectiveCorners.topLeft.x + ', ' + perspectiveCorners.topLeft.y + ')\nTR: (' + perspectiveCorners.topRight.x + ', ' + perspectiveCorners.topRight.y + ')\nBL: (' + perspectiveCorners.bottomLeft.x + ', ' + perspectiveCorners.bottomLeft.y + ')\nBR: (' + perspectiveCorners.bottomRight.x + ', ' + perspectiveCorners.bottomRight.y + ')');

    // Redraw - check if using detected billboards workflow or pre-configured screenshots
    if (detectedRectangles && detectedRectangles.length > 0) {
        // Update the detected rectangle for this billboard
        if (window.activeBillboardIndex !== null && window.activeBillboardIndex !== undefined) {
            const detected = detectedRectangles[window.activeBillboardIndex];
            if (detected) {
                const updatedCorners = {
                    topLeft: {
                        x: Math.round(perspectiveCorners.topLeft.x),
                        y: Math.round(perspectiveCorners.topLeft.y),
                        radius: Math.round(perspectiveCorners.topLeft.radius || 0)
                    },
                    topRight: {
                        x: Math.round(perspectiveCorners.topRight.x),
                        y: Math.round(perspectiveCorners.topRight.y),
                        radius: Math.round(perspectiveCorners.topRight.radius || 0)
                    },
                    bottomLeft: {
                        x: Math.round(perspectiveCorners.bottomLeft.x),
                        y: Math.round(perspectiveCorners.bottomLeft.y),
                        radius: Math.round(perspectiveCorners.bottomLeft.radius || 0)
                    },
                    bottomRight: {
                        x: Math.round(perspectiveCorners.bottomRight.x),
                        y: Math.round(perspectiveCorners.bottomRight.y),
                        radius: Math.round(perspectiveCorners.bottomRight.radius || 0)
                    }
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

    // Draw semi-transparent overlay FIRST
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw existing banners for all billboards ON TOP of overlay
    if (currentScreenshot && currentScreenshot.billboards) {
        currentScreenshot.billboards.forEach((billboard, index) => {
            // Draw banner if it exists
            if (billboardBanners[index] && billboard.perspective) {
                // For the billboard being edited, use the current perspectiveCorners (live preview)
                if (index === selectedBillboardIndex) {
                    drawBannerWithPerspective(billboardBanners[index], perspectiveCorners);
                } else {
                    // For other billboards, use their saved perspective
                    drawBannerWithPerspective(billboardBanners[index], billboard.perspective);
                }
            }
        });
    }

    // Draw perspective quadrilateral with rounded corners
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();

    // Get radius values
    const tlRadius = perspectiveCorners.topLeft.radius || 0;
    const trRadius = perspectiveCorners.topRight.radius || 0;
    const brRadius = perspectiveCorners.bottomRight.radius || 0;
    const blRadius = perspectiveCorners.bottomLeft.radius || 0;

    // Start at top-left corner (after rounded area)
    ctx.moveTo(perspectiveCorners.topLeft.x + tlRadius, perspectiveCorners.topLeft.y);

    // Top edge to top-right corner
    ctx.lineTo(perspectiveCorners.topRight.x - trRadius, perspectiveCorners.topRight.y);
    if (trRadius > 0) {
        ctx.arcTo(perspectiveCorners.topRight.x, perspectiveCorners.topRight.y,
                  perspectiveCorners.topRight.x, perspectiveCorners.topRight.y + trRadius, trRadius);
    }

    // Right edge to bottom-right corner
    ctx.lineTo(perspectiveCorners.bottomRight.x, perspectiveCorners.bottomRight.y - brRadius);
    if (brRadius > 0) {
        ctx.arcTo(perspectiveCorners.bottomRight.x, perspectiveCorners.bottomRight.y,
                  perspectiveCorners.bottomRight.x - brRadius, perspectiveCorners.bottomRight.y, brRadius);
    }

    // Bottom edge to bottom-left corner
    ctx.lineTo(perspectiveCorners.bottomLeft.x + blRadius, perspectiveCorners.bottomLeft.y);
    if (blRadius > 0) {
        ctx.arcTo(perspectiveCorners.bottomLeft.x, perspectiveCorners.bottomLeft.y,
                  perspectiveCorners.bottomLeft.x, perspectiveCorners.bottomLeft.y - blRadius, blRadius);
    }

    // Left edge back to top-left corner
    ctx.lineTo(perspectiveCorners.topLeft.x, perspectiveCorners.topLeft.y + tlRadius);
    if (tlRadius > 0) {
        ctx.arcTo(perspectiveCorners.topLeft.x, perspectiveCorners.topLeft.y,
                  perspectiveCorners.topLeft.x + tlRadius, perspectiveCorners.topLeft.y, tlRadius);
    }

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

    // Draw radius anchor handles (blue circles inside corners)
    const radiusAnchorRadius = 6;
    const radiusAnchorOffset = 25; // Distance from corner toward center

    corners.forEach(corner => {
        // Calculate direction from corner toward center of quad
        const centerX = (perspectiveCorners.topLeft.x + perspectiveCorners.topRight.x +
                        perspectiveCorners.bottomLeft.x + perspectiveCorners.bottomRight.x) / 4;
        const centerY = (perspectiveCorners.topLeft.y + perspectiveCorners.topRight.y +
                        perspectiveCorners.bottomLeft.y + perspectiveCorners.bottomRight.y) / 4;

        const dx = centerX - corner.pos.x;
        const dy = centerY - corner.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const normalizedDx = dx / dist;
            const normalizedDy = dy / dist;

            // Position radius anchor along diagonal toward center
            const anchorX = corner.pos.x + normalizedDx * radiusAnchorOffset;
            const anchorY = corner.pos.y + normalizedDy * radiusAnchorOffset;

            // Draw white border
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(anchorX, anchorY, radiusAnchorRadius + 2, 0, 2 * Math.PI);
            ctx.fill();

            // Draw blue filled circle for radius anchor
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(anchorX, anchorY, radiusAnchorRadius, 0, 2 * Math.PI);
            ctx.fill();

            // If this corner has a radius, draw a visual indicator
            if (corner.pos.radius > 0) {
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(corner.pos.x, corner.pos.y);
                ctx.lineTo(anchorX, anchorY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    });

    // Draw magnifying glass effect if dragging a corner
    if (draggedPerspectiveCorner) {
        const draggedCorner = perspectiveCorners[draggedPerspectiveCorner];
        const magRadius = 100; // Magnifying glass circle radius (increased from 80)
        const magZoom = 8; // Zoom level (increased from 3 for better precision)
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

// Helper function to check if point is inside quadrilateral
function isPointInQuadrilateral(x, y, corners) {
    // Use ray casting algorithm
    const vertices = [
        corners.topLeft,
        corners.topRight,
        corners.bottomRight,
        corners.bottomLeft
    ];

    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x, yi = vertices[i].y;
        const xj = vertices[j].x, yj = vertices[j].y;

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

// Helper function to get distance from point to line segment
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
        param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// Helper function to check if cursor is near an edge
function getEdgeNearCursor(x, y, corners, threshold = 10) {
    const edges = [
        { name: 'top', x1: corners.topLeft.x, y1: corners.topLeft.y, x2: corners.topRight.x, y2: corners.topRight.y },
        { name: 'right', x1: corners.topRight.x, y1: corners.topRight.y, x2: corners.bottomRight.x, y2: corners.bottomRight.y },
        { name: 'bottom', x1: corners.bottomRight.x, y1: corners.bottomRight.y, x2: corners.bottomLeft.x, y2: corners.bottomLeft.y },
        { name: 'left', x1: corners.bottomLeft.x, y1: corners.bottomLeft.y, x2: corners.topLeft.x, y2: corners.topLeft.y }
    ];

    for (const edge of edges) {
        const dist = distanceToLineSegment(x, y, edge.x1, edge.y1, edge.x2, edge.y2);
        if (dist <= threshold) {
            return edge.name;
        }
    }

    return null;
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
    const radiusAnchorOffset = 25;

    // First check if clicking on a radius anchor (higher priority than corner)
    const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

    // Calculate center for radius anchor positioning
    const centerX = (perspectiveCorners.topLeft.x + perspectiveCorners.topRight.x +
                    perspectiveCorners.bottomLeft.x + perspectiveCorners.bottomRight.x) / 4;
    const centerY = (perspectiveCorners.topLeft.y + perspectiveCorners.topRight.y +
                    perspectiveCorners.bottomLeft.y + perspectiveCorners.bottomRight.y) / 4;

    for (const cornerName of corners) {
        const corner = perspectiveCorners[cornerName];

        // Calculate radius anchor position
        const dx = centerX - corner.x;
        const dy = centerY - corner.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const normalizedDx = dx / dist;
            const normalizedDy = dy / dist;
            const anchorX = corner.x + normalizedDx * radiusAnchorOffset;
            const anchorY = corner.y + normalizedDy * radiusAnchorOffset;

            // Check if clicked on radius anchor
            const anchorDistance = Math.sqrt(Math.pow(x - anchorX, 2) + Math.pow(y - anchorY, 2));
            if (anchorDistance <= clickRadius) {
                draggedRadiusAnchor = cornerName;
                return;
            }
        }
    }

    // Then check which corner is clicked
    for (const cornerName of corners) {
        const corner = perspectiveCorners[cornerName];
        const distance = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
        if (distance <= clickRadius) {
            draggedPerspectiveCorner = cornerName;
            return;
        }
    }

    // Check if clicking on an edge (drag edge to transform)
    const edgeNear = getEdgeNearCursor(x, y, perspectiveCorners, 10);
    if (edgeNear) {
        isDraggingEdge = true;
        draggedEdge = edgeNear;
        edgeDragStartPos = {
            mouseX: x,
            mouseY: y,
            corners: {
                topLeft: { ...perspectiveCorners.topLeft },
                topRight: { ...perspectiveCorners.topRight },
                bottomLeft: { ...perspectiveCorners.bottomLeft },
                bottomRight: { ...perspectiveCorners.bottomRight }
            }
        };
        return;
    }

    // Finally, check if clicking inside the quadrilateral (drag to reposition)
    if (isPointInQuadrilateral(x, y, perspectiveCorners)) {
        isDraggingQuadrilateral = true;
        quadDragStartPos = {
            mouseX: x,
            mouseY: y,
            corners: {
                topLeft: { ...perspectiveCorners.topLeft },
                topRight: { ...perspectiveCorners.topRight },
                bottomLeft: { ...perspectiveCorners.bottomLeft },
                bottomRight: { ...perspectiveCorners.bottomRight }
            }
        };
    }
}

function handlePerspectiveMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Use HIGH PRECISION calculation - keep decimals for smooth dragging
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Store raw mouse position for magnifier
    lastPerspectiveMousePos.x = x;
    lastPerspectiveMousePos.y = y;

    // Handle radius anchor dragging
    if (draggedRadiusAnchor) {
        const corner = perspectiveCorners[draggedRadiusAnchor];

        // Calculate distance from mouse to corner
        const dx = x - corner.x;
        const dy = y - corner.y;
        const distanceFromCorner = Math.sqrt(dx * dx + dy * dy);

        // Set radius based on distance (max 50px)
        const maxRadius = 50;
        const radius = Math.min(maxRadius, Math.max(0, distanceFromCorner - 10)); // -10 to account for anchor offset

        corner.radius = radius;

        // Use requestAnimationFrame for smooth redraws
        if (!perspectiveRedrawScheduled) {
            perspectiveRedrawScheduled = true;
            requestAnimationFrame(() => {
                redrawWithPerspective();
                perspectiveRedrawScheduled = false;
            });
        }
        return;
    }

    // Handle edge dragging (drag edge to transform)
    if (isDraggingEdge && draggedEdge) {
        const deltaX = x - edgeDragStartPos.mouseX;
        const deltaY = y - edgeDragStartPos.mouseY;

        const margin = 10;
        let newCorners = { ...perspectiveCorners };

        // Move the two corners that define the edge
        if (draggedEdge === 'top') {
            newCorners.topLeft = {
                x: edgeDragStartPos.corners.topLeft.x + deltaX,
                y: edgeDragStartPos.corners.topLeft.y + deltaY,
                radius: edgeDragStartPos.corners.topLeft.radius
            };
            newCorners.topRight = {
                x: edgeDragStartPos.corners.topRight.x + deltaX,
                y: edgeDragStartPos.corners.topRight.y + deltaY,
                radius: edgeDragStartPos.corners.topRight.radius
            };
        } else if (draggedEdge === 'right') {
            newCorners.topRight = {
                x: edgeDragStartPos.corners.topRight.x + deltaX,
                y: edgeDragStartPos.corners.topRight.y + deltaY,
                radius: edgeDragStartPos.corners.topRight.radius
            };
            newCorners.bottomRight = {
                x: edgeDragStartPos.corners.bottomRight.x + deltaX,
                y: edgeDragStartPos.corners.bottomRight.y + deltaY,
                radius: edgeDragStartPos.corners.bottomRight.radius
            };
        } else if (draggedEdge === 'bottom') {
            newCorners.bottomRight = {
                x: edgeDragStartPos.corners.bottomRight.x + deltaX,
                y: edgeDragStartPos.corners.bottomRight.y + deltaY,
                radius: edgeDragStartPos.corners.bottomRight.radius
            };
            newCorners.bottomLeft = {
                x: edgeDragStartPos.corners.bottomLeft.x + deltaX,
                y: edgeDragStartPos.corners.bottomLeft.y + deltaY,
                radius: edgeDragStartPos.corners.bottomLeft.radius
            };
        } else if (draggedEdge === 'left') {
            newCorners.bottomLeft = {
                x: edgeDragStartPos.corners.bottomLeft.x + deltaX,
                y: edgeDragStartPos.corners.bottomLeft.y + deltaY,
                radius: edgeDragStartPos.corners.bottomLeft.radius
            };
            newCorners.topLeft = {
                x: edgeDragStartPos.corners.topLeft.x + deltaX,
                y: edgeDragStartPos.corners.topLeft.y + deltaY,
                radius: edgeDragStartPos.corners.topLeft.radius
            };
        }

        // Check if all corners are within canvas bounds
        const allWithinBounds = Object.values(newCorners).every(corner =>
            corner.x >= margin && corner.x <= canvas.width - margin &&
            corner.y >= margin && corner.y <= canvas.height - margin
        );

        if (allWithinBounds) {
            perspectiveCorners = newCorners;
        }

        updatePerspectiveDisplay();

        // Use requestAnimationFrame for smooth redraws
        if (!perspectiveRedrawScheduled) {
            perspectiveRedrawScheduled = true;
            requestAnimationFrame(() => {
                redrawWithPerspective();
                perspectiveRedrawScheduled = false;
            });
        }
        return;
    }

    // Handle quadrilateral dragging (drag to reposition)
    if (isDraggingQuadrilateral) {
        const deltaX = x - quadDragStartPos.mouseX;
        const deltaY = y - quadDragStartPos.mouseY;

        // Move all corners by the same delta
        const newCorners = {
            topLeft: {
                x: quadDragStartPos.corners.topLeft.x + deltaX,
                y: quadDragStartPos.corners.topLeft.y + deltaY,
                radius: quadDragStartPos.corners.topLeft.radius
            },
            topRight: {
                x: quadDragStartPos.corners.topRight.x + deltaX,
                y: quadDragStartPos.corners.topRight.y + deltaY,
                radius: quadDragStartPos.corners.topRight.radius
            },
            bottomLeft: {
                x: quadDragStartPos.corners.bottomLeft.x + deltaX,
                y: quadDragStartPos.corners.bottomLeft.y + deltaY,
                radius: quadDragStartPos.corners.bottomLeft.radius
            },
            bottomRight: {
                x: quadDragStartPos.corners.bottomRight.x + deltaX,
                y: quadDragStartPos.corners.bottomRight.y + deltaY,
                radius: quadDragStartPos.corners.bottomRight.radius
            }
        };

        // Check if all corners are within canvas bounds
        const margin = 10;
        const allWithinBounds = Object.values(newCorners).every(corner =>
            corner.x >= margin && corner.x <= canvas.width - margin &&
            corner.y >= margin && corner.y <= canvas.height - margin
        );

        if (allWithinBounds) {
            perspectiveCorners = newCorners;
        }

        updatePerspectiveDisplay();

        // Use requestAnimationFrame for smooth redraws
        if (!perspectiveRedrawScheduled) {
            perspectiveRedrawScheduled = true;
            requestAnimationFrame(() => {
                redrawWithPerspective();
                perspectiveRedrawScheduled = false;
            });
        }
        return;
    }

    // Update cursor
    if (!draggedPerspectiveCorner && !draggedRadiusAnchor && !isDraggingQuadrilateral && !isDraggingEdge) {
        const clickRadius = 15;
        let overCorner = false;
        const radiusAnchorOffset = 25;

        const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

        // Calculate center for radius anchor positioning
        const centerX = (perspectiveCorners.topLeft.x + perspectiveCorners.topRight.x +
                        perspectiveCorners.bottomLeft.x + perspectiveCorners.bottomRight.x) / 4;
        const centerY = (perspectiveCorners.topLeft.y + perspectiveCorners.topRight.y +
                        perspectiveCorners.bottomLeft.y + perspectiveCorners.bottomRight.y) / 4;

        // Check radius anchors first
        for (const cornerName of corners) {
            const corner = perspectiveCorners[cornerName];
            const dx = centerX - corner.x;
            const dy = centerY - corner.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0) {
                const normalizedDx = dx / dist;
                const normalizedDy = dy / dist;
                const anchorX = corner.x + normalizedDx * radiusAnchorOffset;
                const anchorY = corner.y + normalizedDy * radiusAnchorOffset;

                const anchorDistance = Math.sqrt(Math.pow(x - anchorX, 2) + Math.pow(y - anchorY, 2));
                if (anchorDistance <= clickRadius) {
                    canvas.style.cursor = 'pointer';
                    overCorner = true;
                    break;
                }
            }
        }

        // Then check corner handles
        if (!overCorner) {
            for (const cornerName of corners) {
                const corner = perspectiveCorners[cornerName];
                const distance = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
                if (distance <= clickRadius) {
                    canvas.style.cursor = 'pointer';
                    overCorner = true;
                    break;
                }
            }
        }

        // Check if over an edge
        if (!overCorner) {
            const edgeNear = getEdgeNearCursor(x, y, perspectiveCorners, 10);
            if (edgeNear) {
                // Set appropriate cursor for edge direction
                if (edgeNear === 'top' || edgeNear === 'bottom') {
                    canvas.style.cursor = 'ns-resize';
                } else {
                    canvas.style.cursor = 'ew-resize';
                }
                overCorner = true;
            }
        }

        // Check if inside quadrilateral
        if (!overCorner && isPointInQuadrilateral(x, y, perspectiveCorners)) {
            canvas.style.cursor = 'move';
            overCorner = true;
        }

        if (!overCorner) {
            canvas.style.cursor = 'crosshair';
        }
    }

    if (draggedPerspectiveCorner) {
        // Clamp to canvas bounds with margin - KEEP DECIMAL PRECISION
        const margin = 10;
        // Store with full precision (no rounding)
        perspectiveCorners[draggedPerspectiveCorner].x = Math.max(margin, Math.min(canvas.width - margin, x));
        perspectiveCorners[draggedPerspectiveCorner].y = Math.max(margin, Math.min(canvas.height - margin, y));

        updatePerspectiveDisplay();

        // Use requestAnimationFrame for smooth redraws
        if (!perspectiveRedrawScheduled) {
            perspectiveRedrawScheduled = true;
            requestAnimationFrame(() => {
                redrawWithPerspective();
                perspectiveRedrawScheduled = false;
            });
        }
    }
}

function handlePerspectiveMouseUp(e) {
    draggedPerspectiveCorner = null;
    draggedRadiusAnchor = null;
    isDraggingQuadrilateral = false;
    quadDragStartPos = { mouseX: 0, mouseY: 0, corners: null };
    isDraggingEdge = false;
    draggedEdge = null;
    edgeDragStartPos = { mouseX: 0, mouseY: 0, corners: null };
    // Redraw without magnifier
    redrawWithPerspective();
}

// ===== PASSCODE VERIFICATION =====

// SHA-256 hash function
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Prompt for passcode inline (for Set as Default functionality)
async function promptForPasscode() {
    return new Promise((resolve) => {
        const passcode = prompt('🔒 Enter your 6-digit developer passcode to continue:');

        if (!passcode) {
            resolve(null); // User cancelled
            return;
        }

        if (passcode.length !== 6) {
            alert('❌ Passcode must be 6 digits');
            resolve(null);
            return;
        }

        // Verify passcode
        sha256(passcode).then(hash => {
            if (hash === configData.passcodeHash) {
                // Correct passcode - store it
                currentPasscode = passcode;
                isDevModeUnlocked = true;
                sessionStorage.setItem('dev_passcode', passcode);
                console.log('✅ Passcode verified and stored for session');
                resolve(passcode);
            } else {
                alert('❌ Incorrect passcode');
                resolve(null);
            }
        });
    });
}

// Simple XOR encryption/decryption with passcode as key
function encryptToken(token, passcode) {
    // Use passcode as repeating key
    let encrypted = '';
    for (let i = 0; i < token.length; i++) {
        const charCode = token.charCodeAt(i) ^ passcode.charCodeAt(i % passcode.length);
        encrypted += String.fromCharCode(charCode);
    }
    // Convert to base64 to make it safe for JSON
    return btoa(encrypted);
}

function decryptToken(encryptedToken, passcode) {
    try {
        if (!encryptedToken) return '';
        // Decode from base64
        const encrypted = atob(encryptedToken);
        // Use passcode as repeating key
        let decrypted = '';
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i) ^ passcode.charCodeAt(i % passcode.length);
            decrypted += String.fromCharCode(charCode);
        }
        return decrypted;
    } catch (error) {
        console.error('Decryption failed:', error);
        return '';
    }
}

// Verify passcode
async function verifyPasscode() {
    const passcodeInput = document.getElementById('passcode-input');
    const passcodeError = document.getElementById('passcode-error');
    const passcodeModal = document.getElementById('passcode-modal');
    const settingsModal = document.getElementById('settings-modal');

    const enteredPasscode = passcodeInput.value.trim();

    if (enteredPasscode.length !== 6) {
        passcodeError.textContent = '❌ Please enter a 6-digit passcode';
        passcodeError.style.display = 'block';
        return;
    }

    // Hash the entered passcode
    const enteredHash = await sha256(enteredPasscode);

    // Compare with stored hash
    if (enteredHash === configData.passcodeHash) {
        // Correct passcode - enable dev mode
        isDevModeUnlocked = true;
        isDevModeUIEnabled = true;
        currentPasscode = enteredPasscode;

        // Save dev mode state to sessionStorage (only for current session)
        sessionStorage.setItem('dev_passcode', enteredPasscode);
        sessionStorage.setItem('dev_mode_enabled', 'true');

        // Enable dev mode UI
        enableDevModeUI();

        // Just close passcode modal, don't open settings
        passcodeModal.style.display = 'none';
    } else {
        // Incorrect passcode
        passcodeError.textContent = '❌ Incorrect passcode';
        passcodeError.style.display = 'block';
        passcodeInput.value = '';
        passcodeInput.focus();
    }
}

// ===== GITHUB API FUNCTIONS =====

// GitHub configuration
const GITHUB_OWNER = 'djlord7';
const GITHUB_REPO = 'ad-banner-screenshot-generator';
const GITHUB_BRANCH = 'main';
const GAMES_JSON_PATH = 'data/games.json';
const CONFIG_JSON_PATH = 'data/config.json';

// Save GitHub token to config.json on GitHub
async function saveGitHubToken() {
    const tokenInput = document.getElementById('github-token');
    const token = tokenInput.value.trim();
    const statusEl = document.getElementById('token-status');

    if (!token) {
        statusEl.textContent = '❌ Please enter a token';
        statusEl.style.color = '#ef4444';
        return;
    }

    if (!currentPasscode) {
        statusEl.textContent = '❌ Passcode not available for encryption';
        statusEl.style.color = '#ef4444';
        return;
    }

    try {
        statusEl.textContent = '⏳ Encrypting and saving token to GitHub...';
        statusEl.style.color = '#3b82f6';

        // Fetch current config.json from GitHub
        const { sha } = await fetchConfigJsonFromGitHub(token);

        // Encrypt the token before storing
        const encryptedToken = encryptToken(token, currentPasscode);

        // Update config with encrypted token
        configData.githubToken = encryptedToken;

        // Commit updated config to GitHub
        await commitConfigJsonToGitHub(token, configData, sha);

        statusEl.textContent = '✅ Token saved successfully to GitHub (encrypted)!';
        statusEl.style.color = '#10b981';

        setTimeout(() => {
            document.getElementById('settings-modal').style.display = 'none';
        }, 1500);
    } catch (error) {
        console.error('Error saving token:', error);
        statusEl.textContent = `❌ Failed to save: ${error.message}`;
        statusEl.style.color = '#ef4444';
    }
}

// Clear GitHub token
async function clearGitHubToken() {
    const statusEl = document.getElementById('token-status');

    if (!confirm('Are you sure you want to clear the GitHub token?')) {
        return;
    }

    try {
        statusEl.textContent = '⏳ Clearing token from GitHub...';
        statusEl.style.color = '#3b82f6';

        // Use existing token to fetch and update config
        const currentToken = configData.githubToken;
        if (!currentToken) {
            statusEl.textContent = '❌ No token to clear';
            statusEl.style.color = '#ef4444';
            return;
        }

        // Fetch current config.json from GitHub
        const { sha } = await fetchConfigJsonFromGitHub(currentToken);

        // Update config with empty token
        configData.githubToken = '';

        // Commit updated config to GitHub
        await commitConfigJsonToGitHub(currentToken, configData, sha);

        document.getElementById('github-token').value = '';
        statusEl.textContent = '✅ Token cleared from GitHub';
        statusEl.style.color = '#10b981';
    } catch (error) {
        console.error('Error clearing token:', error);
        statusEl.textContent = `❌ Failed to clear: ${error.message}`;
        statusEl.style.color = '#ef4444';
    }
}

// Load token status
function loadTokenStatus() {
    const encryptedToken = configData?.githubToken || '';
    const statusEl = document.getElementById('token-status');

    if (encryptedToken && currentPasscode) {
        // Decrypt token for display
        const decryptedToken = decryptToken(encryptedToken, currentPasscode);
        statusEl.textContent = '✓ Token is configured (encrypted on GitHub)';
        statusEl.style.color = '#10b981';
        document.getElementById('github-token').value = decryptedToken;
    } else if (encryptedToken) {
        statusEl.textContent = '✓ Token is configured (encrypted)';
        statusEl.style.color = '#10b981';
        document.getElementById('github-token').value = '';
    } else {
        statusEl.textContent = 'No token configured';
        statusEl.style.color = '#94a3b8';
        document.getElementById('github-token').value = '';
    }
}

// Get GitHub token (decrypted)
function getGitHubToken() {
    const encryptedToken = configData?.githubToken || '';
    if (!encryptedToken || !currentPasscode) {
        return '';
    }
    return decryptToken(encryptedToken, currentPasscode);
}

// Handle Set as Default toggle change
async function handleSetAsDefaultToggle(e) {
    const isEnabled = e.target.checked;
    const token = getGitHubToken();

    if (!token) {
        alert('Please configure GitHub token first');
        e.target.checked = !isEnabled; // Revert toggle
        return;
    }

    try {
        // Fetch current config.json from GitHub
        const { sha } = await fetchConfigJsonFromGitHub(token);

        // Update config with new toggle state
        configData.setAsDefaultEnabled = isEnabled;

        // Commit updated config to GitHub
        await commitConfigJsonToGitHub(token, configData, sha);

        // Update button visibility
        updateSetAsDefaultButtonVisibility();

        const statusMsg = isEnabled ? 'enabled' : 'disabled';
        console.log(`✅ "Set as Default" ${statusMsg}`);
    } catch (error) {
        console.error('Error saving toggle state:', error);
        alert(`Failed to save setting: ${error.message}`);
        e.target.checked = !isEnabled; // Revert toggle
    }
}

// Update visibility of "Set as Default" button based on dev mode
function updateSetAsDefaultButtonVisibility() {
    const setDefaultContainer = document.getElementById('set-default-container');

    if (setDefaultContainer) {
        // Show only if dev mode is enabled
        if (isDevModeUIEnabled) {
            setDefaultContainer.style.display = 'block';
        } else {
            setDefaultContainer.style.display = 'none';
        }
    }
}

// Fetch current config.json from GitHub
async function fetchConfigJsonFromGitHub(token) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_JSON_PATH}?ref=${GITHUB_BRANCH}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch config.json: ${response.statusText}`);
    }

    const data = await response.json();
    const content = atob(data.content); // Decode base64

    return {
        content: JSON.parse(content),
        sha: data.sha // Need SHA for updating
    };
}

// Commit updated config.json to GitHub
async function commitConfigJsonToGitHub(token, configData, sha) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_JSON_PATH}`;

    const content = btoa(JSON.stringify(configData, null, 2)); // Encode to base64

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Update GitHub token configuration',
            content: content,
            sha: sha,
            branch: GITHUB_BRANCH
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to commit: ${error.message}`);
    }

    return await response.json();
}

// Fetch current games.json from GitHub
async function fetchGamesJsonFromGitHub(token) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GAMES_JSON_PATH}?ref=${GITHUB_BRANCH}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch games.json: ${response.statusText}`);
    }

    const data = await response.json();
    const content = atob(data.content); // Decode base64

    return {
        content: JSON.parse(content),
        sha: data.sha // Need SHA for updating
    };
}

// Commit updated games.json to GitHub
async function commitGamesJsonToGitHub(token, gamesData, sha, customMessage = null) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GAMES_JSON_PATH}`;

    const content = btoa(JSON.stringify(gamesData, null, 2)); // Encode to base64

    const message = customMessage || `Update billboard coordinates for ${currentGame.name} - ${currentScreenshot.filename}`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            content: content,
            sha: sha,
            branch: GITHUB_BRANCH
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to commit: ${error.message}`);
    }

    return await response.json();
}
