/**
 * script.js - HandRecog Pro Presentation System
 * Features: Fixed Thumbs Up/Down vs Fist Matrix, Mirror-Corrected Canvas, and Calm Deliberate Cooldown Timers.
 */

// Handle core workers setups
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

// DOM Selections
const videoEl = document.getElementById('webcam');
const canvasEl = document.getElementById('skeletonCanvas');
const ctx = canvasEl.getContext('2d');
const statusTag = document.getElementById('status-tag');
const gestureOut = document.getElementById('gesture-out');
const actionOut = document.getElementById('action-out');
const volumeReadout = document.getElementById('volume-out');
const volumeBar = document.getElementById('volume-indicator-bar');
const fpsOut = document.getElementById('fps-out');
const feedbackAudio = document.getElementById('feedback-audio');
const container = document.getElementById('slide-canvas-container');
const camToggleBtn = document.getElementById('cam-toggle-btn');
const dropzoneUi = document.getElementById('dropzone-ui');

// Global Engines State Parameters
let currentSlideIndex = 0;
let totalSlidesCount = 1; 
let uploadedSlidesData = []; 
let currentZoomScale = 1.0;

let lastFrameTime = Date.now();
let frameCounter = 0;

let positionHistory = [];
const HISTORY_LIMIT = 6;

// --- GESTURE COOLDOWN CONFIGURATION (Slowing down the actions) ---
let lastSlideActionTime = 0;
const SLIDE_COOLDOWN = 2000;      // Increased to 2.0s to prevent rapid slide skips

let lastVolumeActionTime = 0;
const VOLUME_STEP_INTERVAL = 400; // Increased to 400ms for stable discrete audio stepping

let lastZoomActionTime = 0;
const ZOOM_COOLDOWN = 1100;       // Increased to 1.1s so zoom steps feel controlled and steady

let isCameraRunning = true;
let cameraInstance = null;

// Dynamic tracking configuration
function resizeCanvas() {
    if (canvasEl && videoEl) {
        canvasEl.width = videoEl.clientWidth || canvasEl.offsetWidth || 640;
        canvasEl.height = videoEl.clientHeight || canvasEl.offsetHeight || 480;
    }
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 500); // Late calibration check

// Unblock web audio policies safely
window.addEventListener('click', () => {
    if (feedbackAudio && feedbackAudio.paused) {
        feedbackAudio.volume = 0.5;
        feedbackAudio.play().catch(() => {});
    }
}, { once: true });

// Initialize MediaPipe Instance Engine
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.65
});

hands.onResults(onTrackingResults);

function initCamera() {
    if (!videoEl) return;
    
    cameraInstance = new Camera(videoEl, {
        onFrame: async () => {
            if (isCameraRunning) {
                await hands.send({ image: videoEl });
            }
        },
        width: 640,
        height: 480
    });

    cameraInstance.start().then(() => {
        resizeCanvas();
        if (statusTag) {
            statusTag.className = "status-badge ready";
            statusTag.innerText = "System Engine Active";
        }
    }).catch(err => {
        console.error("Camera Hardware Request Failure:", err);
        if (statusTag) {
            statusTag.className = "status-badge error";
            statusTag.innerText = "Camera Access Blocked";
        }
    });
}

// Spool system hardware on entry
initCamera();

// Hardware Camera Toggle Button Logic
if (camToggleBtn) {
    camToggleBtn.addEventListener('click', () => {
        if (isCameraRunning) {
            isCameraRunning = false;
            if (videoEl.srcObject) {
                videoEl.srcObject.getTracks().forEach(track => track.stop());
                videoEl.srcObject = null;
            }
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            if (statusTag) { statusTag.className = "status-badge standby"; statusTag.innerText = "Feed Offline"; }
            if (gestureOut) gestureOut.innerText = "Hardware Dormant";
            if (actionOut) actionOut.innerText = "Vision Thread Suspended";
            if (fpsOut) fpsOut.innerText = "0 FPS";
            
            camToggleBtn.innerText = "Turn Camera On";
            camToggleBtn.className = "btn btn-primary";
        } else {
            isCameraRunning = true;
            if (statusTag) { statusTag.className = "status-badge standby"; statusTag.innerText = "Connecting Feed..."; }
            camToggleBtn.innerText = "Turn Camera Off";
            camToggleBtn.className = "btn btn-danger";
            initCamera();
        }
    });
}

function onTrackingResults(results) {
    if (!isCameraRunning) return;

    frameCounter++;
    const now = Date.now();
    if (now - lastFrameTime >= 1000) {
        if (fpsOut) fpsOut.innerText = `${Math.round((frameCounter * 1000) / (now - lastFrameTime))} FPS`;
        frameCounter = 0;
        lastFrameTime = now;
    }

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        if (gestureOut) gestureOut.innerText = "Searching Frame...";
        return;
    }

    // Capture the primary operating hand profile close to the lens viewport
    let primaryHandIdx = 0;
    let maxRangeSpan = 0;
    results.multiHandLandmarks.forEach((hand, idx) => {
        const span = Math.sqrt(Math.pow(hand[12].x - hand[0].x, 2) + Math.pow(hand[12].y - hand[0].y, 2));
        if (span > maxRangeSpan) {
            maxRangeSpan = span;
            primaryHandIdx = idx;
        }
    });

    const landmarks = results.multiHandLandmarks[primaryHandIdx];
    
    // Fire structural alignments loops
    renderLiveSkeleton(landmarks);
    const intent = processDualTelemetry(landmarks);
    executeUnifiedAction(intent);
}

function processDualTelemetry(landmarks) {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const thumbKnuckle = landmarks[2];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    const pinchDistance = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));

    const fingers = {
        indexUp: indexTip.y < landmarks[6].y,
        middleUp: middleTip.y < landmarks[10].y,
        ringUp: ringTip.y < landmarks[14].y,
        pinkyUp: pinkyTip.y < landmarks[18].y
    };

    let raisedCount = 0;
    if (fingers.indexUp) raisedCount++;
    if (fingers.middleUp) raisedCount++;
    if (fingers.ringUp) raisedCount++;
    if (fingers.pinkyUp) raisedCount++;

    // ----------------------------------------------------
    // LAYER 1: FIXED THUMB ZOOM VS FIST MATRIX 
    // ----------------------------------------------------
    if (raisedCount === 0) {
        // Compute fist tightness: average distance from fingers to the wrist base
        const indexToWrist = Math.sqrt(Math.pow(indexTip.x - wrist.x, 2) + Math.pow(indexTip.y - wrist.y, 2));
        const middleToWrist = Math.sqrt(Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2));
        const fistTightness = (indexToWrist + middleToWrist) / 2;

        // Compute how far the thumb is sticking out away from the index finger knuckle (landmarks[5])
        const thumbExtension = Math.sqrt(Math.pow(thumbTip.x - landmarks[5].x, 2) + Math.pow(thumbTip.y - landmarks[5].y, 2));

        // CRITICAL CHECK: If the thumb is drawn tight against the hand, it's a Closed Fist
        if (fistTightness < 0.26 && thumbExtension < 0.08) {
            return { type: "Prev Slide Trigger", source: "Closed Fist Pose" };
        }

        // THUMBS UP: Thumb tip must be pointing higher than its knuckle AND extended out away from the fist profile
        if (thumbTip.y < thumbKnuckle.y - 0.05 && thumbExtension >= 0.08) {
            return { type: "Zoom In Trigger" };
        }
        
        // THUMBS DOWN: Thumb tip must be pointing lower than its knuckle AND extended out away from the fist profile
        if (thumbTip.y > thumbKnuckle.y + 0.05 && thumbExtension >= 0.08) {
            return { type: "Zoom Out Trigger" };
        }
    }

    // 2. Pinch Volume Continuous Slider logic (Kept immediate since slider adjustments require dynamic response)
    if (pinchDistance < 0.045 && fingers.indexUp && !fingers.middleUp && !fingers.ringUp) {
        let linearScale = (1.0 - indexTip.y);
        linearScale = (linearScale - 0.2) / 0.6; // Norm mapping bounds variables
        linearScale = Math.max(0, Math.min(1, linearScale));
        return { type: "Fluid Volume Adjust", data: Math.round(linearScale * 100), rawValue: linearScale };
    }

    // 3. Static Trigger Commands
    if (raisedCount === 4) return { type: "Next Slide Trigger", source: "Open Palm Pose" };
    if (raisedCount === 2 && fingers.indexUp && fingers.middleUp) return { type: "Step Volume Up" };
    if (raisedCount === 3 && fingers.indexUp && fingers.middleUp && fingers.ringUp) return { type: "Step Volume Down" };

    // 4. Kinetic Horizontal Tracking Swipe processing
    positionHistory.push({ x: wrist.x, y: wrist.y, time: Date.now() });
    if (positionHistory.length > HISTORY_LIMIT) positionHistory.shift();

    if (Date.now() - lastSlideActionTime > SLIDE_COOLDOWN && positionHistory.length >= 4) {
        const start = positionHistory[0];
        const end = positionHistory[positionHistory.length - 1];
        const dx = end.x - start.x;
        const dt = end.time - start.time;

        if (Math.abs(dx) > 0.20 && dt < 350) {
            positionHistory = [];
            return { type: (dx > 0) ? "Prev Slide Trigger" : "Next Slide Trigger", source: "Velocity Swipe Command" };
        }
    }

    return { type: "Standard Hand Tracked" };
}

function executeUnifiedAction(intentObj) {
    if (intentObj.type === "Standard Hand Tracked") {
        if (gestureOut) gestureOut.innerText = "Tracking Locked";
        if (actionOut) actionOut.innerText = "Monitoring Gesture Plane";
        return;
    }

    const currentTime = Date.now();

    if (intentObj.type === "Fluid Volume Adjust") {
        if (gestureOut) gestureOut.innerText = "Pinch Slider Engaged";
        if (feedbackAudio) feedbackAudio.volume = intentObj.rawValue;
        if (volumeReadout) volumeReadout.innerText = `Volume: ${intentObj.data}%`;
        if (volumeBar) volumeBar.style.width = `${intentObj.data}%`;
        if (actionOut) actionOut.innerText = `Setting Engine Volume to ${intentObj.data}%`;
        return;
    }

    if (intentObj.type === "Step Volume Up") {
        if (gestureOut) gestureOut.innerText = "Index + Middle Extended";
        if (currentTime - lastVolumeActionTime > VOLUME_STEP_INTERVAL) {
            let vol = Math.min(1.0, feedbackAudio.volume + 0.05);
            feedbackAudio.volume = vol;
            if (volumeReadout) volumeReadout.innerText = `Volume: ${Math.round(vol * 100)}%`;
            if (volumeBar) volumeBar.style.width = `${Math.round(vol * 100)}%`;
            if (actionOut) actionOut.innerText = "Stepping Vol Up (+5%)";
            lastVolumeActionTime = currentTime;
        }
        return;
    }

    if (intentObj.type === "Step Volume Down") {
        if (gestureOut) gestureOut.innerText = "3 Fingers Extended";
        if (currentTime - lastVolumeActionTime > VOLUME_STEP_INTERVAL) {
            let vol = Math.max(0.0, feedbackAudio.volume - 0.05);
            feedbackAudio.volume = vol;
            if (volumeReadout) volumeReadout.innerText = `Volume: ${Math.round(vol * 100)}%`;
            if (volumeBar) volumeBar.style.width = `${Math.round(vol * 100)}%`;
            if (actionOut) actionOut.innerText = "Stepping Vol Down (-5%)";
            lastVolumeActionTime = currentTime;
        }
        return;
    }

    if (intentObj.type === "Zoom In Trigger") {
        if (gestureOut) gestureOut.innerText = "Thumbs Up Detected";
        if (currentTime - lastZoomActionTime > ZOOM_COOLDOWN) {
            currentZoomScale = Math.min(2.5, currentZoomScale + 0.20);
            applyLiveZoom();
            if (actionOut) actionOut.innerText = `Viewport Scale -> ${Math.round(currentZoomScale * 100)}%`;
            lastZoomActionTime = currentTime;
        }
        return;
    }

    if (intentObj.type === "Zoom Out Trigger") {
        if (gestureOut) gestureOut.innerText = "Thumbs Down Detected";
        if (currentTime - lastZoomActionTime > ZOOM_COOLDOWN) {
            currentZoomScale = Math.max(0.6, currentZoomScale - 0.20);
            applyLiveZoom();
            if (actionOut) actionOut.innerText = `Viewport Scale -> ${Math.round(currentZoomScale * 100)}%`;
            lastZoomActionTime = currentTime;
        }
        return;
    }

    if (intentObj.type === "Next Slide Trigger") {
        if (gestureOut) gestureOut.innerText = intentObj.source;
        if (currentTime - lastSlideActionTime > SLIDE_COOLDOWN) {
            if (currentSlideIndex < totalSlidesCount - 1) {
                currentSlideIndex++;
                currentZoomScale = 1.0;
                renderActiveView();
                if (actionOut) actionOut.innerText = `Advanced to page ${currentSlideIndex + 1}`;
                lastSlideActionTime = currentTime;
            }
        }
        return;
    }

    if (intentObj.type === "Prev Slide Trigger") {
        if (gestureOut) gestureOut.innerText = intentObj.source;
        if (currentTime - lastSlideActionTime > SLIDE_COOLDOWN) {
            if (currentSlideIndex > 0) {
                currentSlideIndex--;
                currentZoomScale = 1.0;
                renderActiveView();
                if (actionOut) actionOut.innerText = `Returned to page ${currentSlideIndex + 1}`;
                lastSlideActionTime = currentTime;
            }
        }
        return;
    }
}

function applyLiveZoom() {
    const activeSlide = container.querySelector('.slide.active');
    if (activeSlide) {
        activeSlide.style.transform = `scale(${currentZoomScale})`;
        activeSlide.style.transformOrigin = "center center";
        activeSlide.style.transition = "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
    }
}

// Render dynamic slide layers
function renderActiveView() {
    const indicator = document.getElementById('page-indicator');
    if (indicator) indicator.innerText = `Slide: ${currentSlideIndex + 1} / ${totalSlidesCount}`;
    
    if (uploadedSlidesData.length > 0) {
        if (dropzoneUi) dropzoneUi.style.display = "none";
        
        const activeOldSlides = container.querySelectorAll('.slide');
        activeOldSlides.forEach(s => s.remove());
        
        const content = uploadedSlidesData[currentSlideIndex];
        const slideWrapper = document.createElement('div');
        slideWrapper.className = "slide active";
        slideWrapper.style.width = "100%";
        slideWrapper.style.height = "100%";
        slideWrapper.style.display = "flex";
        slideWrapper.style.flexDirection = "column";
        slideWrapper.style.justifyContent = "center";
        slideWrapper.style.background = "#ffffff";
        slideWrapper.style.borderRadius = "6px";
        slideWrapper.style.padding = "24px";
        slideWrapper.style.overflow = "auto";
        
        if (content.startsWith("data:image") || content.startsWith("blob:")) {
            slideWrapper.innerHTML = `<img src="${content}" style="max-width:100%; max-height:100%; object-fit:contain; margin:auto;" />`;
        } else {
            slideWrapper.innerHTML = `<div style="color:#0f172a; font-size:1.1rem; text-align:left; width:100%;">${content}</div>`;
        }
        container.appendChild(slideWrapper);
        applyLiveZoom();
    }
}

// Render vision canvas overlay loop
function renderLiveSkeleton(landmarks) {
    if (!ctx || !canvasEl || !landmarks) return;
    
    if (canvasEl.width !== videoEl.clientWidth) {
        resizeCanvas();
    }

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    
    ctx.fillStyle = "#10b981";
    landmarks.forEach(pt => {
        ctx.beginPath();
        ctx.arc(canvasEl.width - (pt.x * canvasEl.width), pt.y * canvasEl.height, 4, 0, 2 * Math.PI);
        ctx.fill();
    });

    ctx.strokeStyle = "rgba(37, 99, 235, 0.75)";
    ctx.lineWidth = 3;
    const structures = [
        [0,1,2,3,4], [0,5,6,7,8], [9,10,11,12], [13,14,15,16], [0,17,18,19,20], [5,9,13,17]
    ];
    structures.forEach(path => {
        ctx.beginPath();
        for(let i=0; i < path.length - 1; i++) {
            const startNode = landmarks[path[i]];
            const endNode = landmarks[path[i+1]];
            ctx.moveTo(canvasEl.width - (startNode.x * canvasEl.width), startNode.y * canvasEl.height);
            ctx.lineTo(canvasEl.width - (endNode.x * canvasEl.width), endNode.y * canvasEl.height);
        }
        ctx.stroke();
    });
}

// File Unpacking Pipeline Logic
const fileInput = document.getElementById('slide-upload');
if (fileInput) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (actionOut) actionOut.innerText = "Parsing asset matrices...";
        uploadedSlidesData = [];
        
        if (file.name.endsWith('.pptx') || file.name.endsWith('.ppt')) {
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const zip = await JSZip.loadAsync(this.result);
                    const slideFiles = Object.keys(zip.files)
                        .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
                        .sort((a, b) => {
                            const numA = parseInt(a.replace('ppt/slides/slide', '').replace('.xml', ''));
                            const numB = parseInt(b.replace('ppt/slides/slide', '').replace('.xml', ''));
                            return numA - numB;
                        });

                    for (let i = 0; i < slideFiles.length; i++) {
                        const slideXmlText = await zip.file(slideFiles[i]).async('string');
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(slideXmlText, 'text/xml');
                        const textNodes = xmlDoc.getElementsByTagName('a:t');
                        
                        let slideTxt = "";
                        for (let node of textNodes) {
                            if (node.textContent.trim()) {
                                slideTxt += `<p style="margin-bottom:12px; font-size:1.15rem; line-height:1.5;">${node.textContent.trim()}</p>`;
                            }
                        }
                        uploadedSlidesData.push(slideTxt || "<p style='color:#64748b; font-style:italic;'>Image slide background vector asset.</p>");
                    }

                    totalSlidesCount = uploadedSlidesData.length;
                    currentSlideIndex = 0;
                    currentZoomScale = 1.0;
                    renderActiveView();
                    if (actionOut) actionOut.innerText = "PPTX Unpacked Successfully.";
                } catch (err) {
                    console.error(err);
                    if (actionOut) actionOut.innerText = "Extraction crash occurred.";
                }
            };
            reader.readAsArrayBuffer(file);

        } else if (file.name.endsWith('.pdf')) {
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    
                    totalSlidesCount = pdf.numPages;
                    currentSlideIndex = 0;
                    currentZoomScale = 1.0;
                    
                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 1.5 });
                        
                        const offscreenCanvas = document.createElement('canvas');
                        const offscreenContext = offscreenCanvas.getContext('2d');
                        offscreenCanvas.height = viewport.height;
                        offscreenCanvas.width = viewport.width;
                        
                        await page.render({ canvasContext: offscreenContext, viewport: viewport }).promise;
                        uploadedSlidesData.push(offscreenCanvas.toDataURL());
                    }
                    renderActiveView();
                    if (actionOut) actionOut.innerText = "PDF Document Processed.";
                } catch (error) {
                    console.error(error);
                    if (actionOut) actionOut.innerText = "PDF Parsing array error.";
                }
            };
            reader.readAsArrayBuffer(file);
        }
    });
}

// Manual Click Controls
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

if (prevBtn) {
    prevBtn.addEventListener('click', () => {
        if (currentSlideIndex > 0) {
            currentSlideIndex--;
            currentZoomScale = 1.0;
            renderActiveView();
        }
    });
}
if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        if (currentSlideIndex < totalSlidesCount - 1) {
            currentSlideIndex++;
            currentZoomScale = 1.0;
            renderActiveView();
        }
    });
}