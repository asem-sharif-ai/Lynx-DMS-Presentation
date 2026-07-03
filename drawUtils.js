'use strict';

const colorsList = [
    '#ffffff', '#a8d4ff', '#4a9eff', '#00e5b0', '#ffd700',
    '#ff9f40', '#ff5f7e', '#c77dff', '#69ff47', '#ff3333',
];

const defaultConfig = { m: 5, h: 25, e: 20, a: 0.5 };

let activeTool = null;
let activeColor = { m: '#ffffff', h: '#ffd700', g: '#4a9eff' };
let openPalette = null;
let lineWidth = { m: defaultConfig.m, h: defaultConfig.h };
let isDrawing = false;
let holdTimer = null;

const palette = document.getElementById('draw-palette');
const btnM = document.getElementById('draw-marker');
const btnH = document.getElementById('draw-highlighter');
const btnG = document.getElementById('draw-geometric');
const btnE = document.getElementById('draw-eraser');
const stage = document.getElementById('stage');

const [canvas, ctx, highlightInternal, internalCanvas, internalCtx, highlightCtx, eraserCursor] = buildCanvas()

// ────────── Canvas ──────────────────────────────────────────────────

function buildCanvas() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.id = 'draw-canvas';
    
    const internalCanvas = document.createElement('canvas');
    const internalCtx = internalCanvas.getContext('2d');
    
    const highlightCanvas = document.createElement('canvas');
    const highlightCtx = highlightCanvas.getContext('2d');
    highlightCanvas.id = 'draw-hl-preview';
    
    const eraserCursor = document.createElement('div');
    eraserCursor.id = 'eraser-cursor';
    document.body.appendChild(eraserCursor);
    
    stage.appendChild(canvas);
    stage.appendChild(highlightCanvas);

    window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(() => requestAnimationFrame(resizeCanvas));

    return [ canvas, ctx, internalCanvas, highlightCanvas, internalCtx, highlightCtx, eraserCursor ];
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = stage.clientWidth;
    const h = stage.clientHeight;

    const prevW = canvas.width;
    const prevH = canvas.height;
    const img = (prevW > 0 && prevH > 0) ? ctx.getImageData(0, 0, prevW, prevH) : null;

    for (const c of [canvas, internalCanvas, internalCanvas]) {
        c.width  = Math.max(1, w * dpr);
        c.height = Math.max(1, h * dpr);
        c.style.width  = w + 'px';
        c.style.height = h + 'px';
    }

    ctx.scale(dpr, dpr);
    if (img) ctx.putImageData(img, 0, 0);
}

// ────────── Palette ──────────────────────────────────────────────────

function buildPalette() {
    palette.innerHTML = '';

    const colorRow = document.createElement('div');
    colorRow.className = 'draw-palette-colors';
    colorsList.forEach(hex => {
        const sw = document.createElement('button');
        sw.className = 'draw-color-switch';
        sw.style.background = hex;
        sw.dataset.color = hex;
        sw.addEventListener('pointerdown', e => e.stopPropagation());
        sw.addEventListener('click', e => {
            e.stopPropagation();
            if (openPalette) {
                activeColor[openPalette] = hex;
                updateToolsIcons()
                updateColorSwitch();
            }
        });
        colorRow.appendChild(sw);
    });
    palette.appendChild(colorRow);

    const sliderRow = document.createElement('div');
    sliderRow.className = 'draw-palette-slider-row';

    const sliderLabel = document.createElement('span');
    sliderLabel.className = 'draw-palette-label';
    sliderLabel.textContent = 'Size';

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'draw-palette-slider-wrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'draw-linewidth-slider';
    slider.className = 'draw-palette-slider';
    slider.min = '1'; slider.max = '40'; slider.step = '1';

    const sliderVal = document.createElement('span');
    sliderVal.className = 'draw-palette-value';

    slider.addEventListener('input', e => {
        e.stopPropagation();
        if (openPalette) {
            lineWidth[openPalette] = parseFloat(slider.value);
            sliderVal.textContent  = `${Math.round(slider.value)}px`;
        }
    });

    sliderWrap.appendChild(slider);
    sliderRow.appendChild(sliderLabel);
    sliderRow.appendChild(sliderWrap);
    sliderRow.appendChild(sliderVal);
    palette.appendChild(sliderRow);

    document.addEventListener('pointerdown', e => {
        if (openPalette && !palette.contains(e.target) && e.target !== btnM && e.target !== btnH) {
            closePalette();
            updateColorSwitch()
            setTool(openPalette, true)
        }
    });
}

function updateColorSwitch() {
    if (!openPalette) return;
    palette.querySelectorAll('.draw-color-switch').forEach(sw =>
        sw.classList.toggle('selected', sw.dataset.color === activeColor[openPalette])
    );
}

function updateSlider(tool) {
    const slider = document.getElementById('draw-linewidth-slider');
    const value = palette.querySelector('.draw-palette-value');
    if (!slider) return;
    slider.value = lineWidth[tool];
    if (value) value.textContent = `${Math.round(lineWidth[tool])}px`;
}

function updateToolsIcons() {
    btnM.style.color = activeColor['m']
    btnH.style.color = activeColor['h']
}

function openPaletteFor(tool) {
    openPalette = tool;
    const btn = tool === 'm' ? btnM : btnH;
    const annotDiv = document.getElementById('draw-group');
    const bRect = btn.getBoundingClientRect();
    const aRect = annotDiv.getBoundingClientRect();
    palette.style.left = (bRect.left + bRect.width / 2 - aRect.left) + 'px';
    palette.style.bottom = aRect.height + 'px';
    updateColorSwitch();
    updateSlider(tool);
    palette.classList.remove('closing');
    palette.classList.add('open');
}

function closePalette() {
    if (!palette.classList.contains('open')) return;
    palette.classList.add('closing');
    palette.classList.remove('open');
    setTimeout(() => { palette.classList.remove('closing'); openPalette = null; }, 320);
}

// ────────── Activation & Usage ──────────────────────────────────────────────────

function setTool(tool, fromPalette = false) {
    if (activeTool === tool && !fromPalette) { deactivateTool(); return; }
    activeTool = tool;
    btnM.classList.toggle('active', tool === 'm');
    btnH.classList.toggle('active', tool === 'h');
    btnE.classList.toggle('active', tool === 'e');
    stage.classList.remove('cursor-marker', 'cursor-highlighter', 'cursor-eraser');
    if (tool === 'm') stage.classList.add('cursor-marker');
    if (tool === 'h') stage.classList.add('cursor-highlighter');
    if (tool === 'e') stage.classList.add('cursor-eraser');
}

function deactivateTool() {
    activeTool = null;
    isDrawing  = false;
    btnM.classList.remove('active');
    btnH.classList.remove('active');
    btnE.classList.remove('active');
    stage.classList.remove('cursor-marker', 'cursor-highlighter', 'cursor-eraser');
    eraserCursor.classList.remove('visible');
    closePalette();
}

export function clearCanvas() {
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
}

function startHold(tool, btn) {
    btn.classList.add('holding');
    holdTimer = setTimeout(() => {
        btn.classList.remove('holding');
        openPaletteFor(tool);
    }, 500);
}

function cancelHold(btn) {
    clearTimeout(holdTimer);
    holdTimer = null;
    btn.classList.remove('holding');
}

function bindToolButton(btn, tool) {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); startHold(tool, btn); });
    btn.addEventListener('pointerup', () => {
        if (holdTimer) {
            cancelHold(btn);
            if (!palette.classList.contains('open')) setTool(tool);
        }
    });
    btn.addEventListener('pointerleave',  () => cancelHold(btn));
    btn.addEventListener('pointercancel', () => cancelHold(btn));
}

function bindEraserButton(btn, tool) {
    let eraserHoldTimer = null;

    btnE.addEventListener('pointerdown', e => {
        e.preventDefault();
        btnE.classList.add('holding');
        eraserHoldTimer = setTimeout(() => {
            btnE.classList.remove('holding');
            eraserHoldTimer = null;
            clearCanvas();
            deactivateTool()
            btnE.classList.add('flash');
            setTimeout(() => btnE.classList.remove('flash'), 300);
        }, 500);
    });

    btnE.addEventListener('pointerup', () => {
        if (eraserHoldTimer) {
            clearTimeout(eraserHoldTimer);
            eraserHoldTimer = null;
            btnE.classList.remove('holding');
            setTool('e');
        }
    });

    ['pointerleave', 'pointercancel'].forEach(evt =>
        btnE.addEventListener(evt, () => {
            clearTimeout(eraserHoldTimer);
            eraserHoldTimer = null;
            btnE.classList.remove('holding');
        })
    );

    document.addEventListener('pointermove', e => {
        if (activeTool !== 'e') return;
        const sr = stage.getBoundingClientRect();
        const inStage = e.clientX >= sr.left && e.clientX <= sr.right && e.clientY >= sr.top  && e.clientY <= sr.bottom;
        eraserCursor.classList.toggle('visible', inStage);
        eraserCursor.style.left = e.clientX + 'px';
        eraserCursor.style.top  = e.clientY + 'px';
    });
}

// ────────── Drawing ──────────────────────────────────────────────────

function toLocal(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return [cx - r.left, cy - r.top];
}

function eraseAt(x, y) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, defaultConfig.e, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function refreshHighlight() {
    const dpr = window.devicePixelRatio || 1;
    const w = hlPreview.width  / dpr;
    const h = hlPreview.height / dpr;
    hlPCtx.clearRect(0, 0, hlPreview.width, hlPreview.height);
    hlPCtx.save();
    hlPCtx.globalAlpha = defaultConfig.a;
    hlPCtx.drawImage(internalCanvas, 0, 0, w, h);
    hlPCtx.restore();
}

function commitHighlight() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width  / dpr;
    const h = canvas.height / dpr;
    ctx.save();
    ctx.globalAlpha = defaultConfig.a;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(internalCanvas, 0, 0, w, h);
    ctx.restore();
    highlightCtx.clearRect(0, 0, internalCanvas.width, internalCanvas.height);
    hlPCtx.clearRect(0, 0, hlPreview.width, hlPreview.height);
}

function onDrawStart(x, y) {
    isDrawing = true;
    
    if (activeTool === 'm') {
        ctx.strokeStyle = activeColor.m;
        ctx.lineWidth = lineWidth.m;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.arc(x, y, lineWidth.m / 2, 0, Math.PI * 2);
        ctx.fillStyle = activeColor.m;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y);
    } else if (activeTool === 'h') {
        highlightCtx.clearRect(0, 0, internalCanvas.width, internalCanvas.height);
        highlightCtx.strokeStyle = activeColor.h;
        highlightCtx.lineWidth = lineWidth.h;
        highlightCtx.globalAlpha = 1;
        highlightCtx.globalCompositeOperation = 'source-over';
        highlightCtx.lineCap = 'round';
        highlightCtx.lineJoin = 'round';
        highlightCtx.beginPath();
        highlightCtx.arc(x, y, lineWidth.h / 2, 0, Math.PI * 2);
        highlightCtx.fillStyle = activeColor.h;
        highlightCtx.fill();
        highlightCtx.beginPath();
        highlightCtx.moveTo(x, y);
        refreshHighlight();
    } else {
        eraseAt(x, y);
    }
}

function onDrawMove(x, y) {
    if (!isDrawing) return;

    if (activeTool === 'm') {
        ctx.strokeStyle = activeColor.m;
        ctx.lineWidth = lineWidth.m;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    } else if (activeTool === 'h') {
        highlightCtx.strokeStyle = activeColor.h;
        highlightCtx.lineWidth = lineWidth.h;
        highlightCtx.globalAlpha = 1;
        highlightCtx.globalCompositeOperation = 'source-over';
        highlightCtx.lineCap = 'round';
        highlightCtx.lineJoin = 'round';
        highlightCtx.lineTo(x, y);
        highlightCtx.stroke();
        highlightCtx.beginPath();
        highlightCtx.moveTo(x, y);
        refreshHighlight();
    } else {
        eraseAt(x, y);
    }
}

function onDrawEnd() {
    if (!isDrawing) return;
    isDrawing = false;
    if (activeTool === 'h') commitHighlight();
}

function bindStage(btn, tool) {
    stage.addEventListener('pointerdown', e => {
        if (!activeTool) return;
        if (palette.classList.contains('open')) { closePalette(); return; }
        e.preventDefault();
        stage.setPointerCapture(e.pointerId);
        onDrawStart(...toLocal(e.clientX, e.clientY));
    });

    stage.addEventListener('pointermove', e => {
        if (!isDrawing || e.buttons === 0) return;
        onDrawMove(...toLocal(e.clientX, e.clientY));
    });

    stage.addEventListener('pointerup', () => onDrawEnd());
    stage.addEventListener('pointercancel', () => onDrawEnd());

    stage.addEventListener('touchstart', e => {
        if (!activeTool) return;
        e.preventDefault();
        const t = e.touches[0];
        onDrawStart(...toLocal(t.clientX, t.clientY));
    }, { passive: false });

    stage.addEventListener('touchmove', e => {
        if (!activeTool || !isDrawing) return;
        e.preventDefault();
        const t = e.touches[0];
        onDrawMove(...toLocal(t.clientX, t.clientY));
    }, { passive: false });

    stage.addEventListener('touchend', () => onDrawEnd());
}

// ────────── Setup UI ──────────────────────────────────────────────────

buildCanvas()
buildPalette();
bindStage();
bindToolButton(btnM, 'm');
bindToolButton(btnH, 'h');
updateToolsIcons()
bindEraserButton()
