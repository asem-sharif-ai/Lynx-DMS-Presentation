'use strict';

import { clearCanvas } from './drawUtils.js';
import { buildSlides, snapTo, slideTo, syncActive } from './slideUtils.js';

let slides = [];
let config = {};
let current = 0;
let dragBase = 0;
let snapBuffer = '';
let bufferTimeout = null;

const NEXT = ['ArrowRight', 'ArrowDown', 'MediaTrackNext', 'BrowserForward', '>'];
const BACK = ['ArrowLeft', 'ArrowUp', 'MediaTrackPrevious', 'BrowserBack', '<'];
const SNAP = { buffer: '', timeout: null }

const introScreen = document.getElementById('intro-screen');
const introVideo = document.getElementById('intro-video');
const introSkip = document.getElementById('intro-skip');
const appShell = document.getElementById('app-shell');
const bgLayer = document.getElementById('bg-layer');
const bgOverlay = document.getElementById('bg-overlay');
const slideTrack = document.getElementById('slide-track');
const pageFooter = document.getElementById('footer');
const indexLabel = document.getElementById('index-label');
const indexStart = document.getElementById('index-start');
const indexBack = document.getElementById('index-back');
const indexNext = document.getElementById('index-next');
const indexEnd = document.getElementById('index-end');
const referencesGroup = document.getElementById('references-group');

// ────────── Utils ──────────────────────────────────────────────────

async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed To Load '${path}': ${res.status}`);
    return res.json();
}

function applyConfig() {
    document.title = config.title || 'Presentation';

    if (config.icon) {
        let link = document.querySelector('link[rel*="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = config.icon;
        if (config.icon.endsWith('.svg'))      link.type = 'image/svg+xml';
        else if (config.icon.endsWith('.png')) link.type = 'image/png';
        else if (config.icon.endsWith('.ico')) link.type = 'image/x-icon';
    }

    if (config.background) {
        bgLayer.style.backgroundImage = `url('${config.background.src}')`;
        bgLayer.style.filter = 'blur(' + ((config.background.blur || 0) * 20) + 'px)';
        bgOverlay.style.background = `rgba(0, 0, 0, ${config.background.overlay || 0.0})`;
    } else {
        bgLayer.style.background = config.background.fallback;
    }
}

function ctx() { return { slides, slideTrack, current, clearCanvas, syncFooter }; }

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

// ────────── Entry Point ──────────────────────────────────────────────────

async function startApp() {
    [config, slides] = await Promise.all([
        fetchJSON('./config.json'),
        fetchJSON('./slides.json'),
    ]);

    applyConfig();
    buildSlides(slideTrack, slides);
    bindActions();
    buildReferences();

    slideTrack.addEventListener('click', e => {
        const row = e.target.closest('.content-index-item[data-page]');
        if (!row) return;
        const page = parseInt(row.dataset.page, 10);
        if (isNaN(page)) return;
        current = snapTo(page, ctx());
    });
    
    if (config.intro?.src) showIntro();
    else showApp();

    document.querySelectorAll('[title]').forEach(el => {
        el.dataset.title = el.getAttribute('title');
        el.removeAttribute('title');
    });
}

function showApp() {
    appShell.classList.remove('hidden');
    appShell.style.opacity = '0';
    requestAnimationFrame(() => {
        appShell.style.transition = 'opacity 0.3s ease';
        appShell.style.opacity = '1';
    });
    snapTo(0, ctx(), false);
}

// ────────── Intro & Footer References ──────────────────────────────────────────────────

function showIntro() {
    introScreen.classList.remove('hidden');
    appShell.classList.add('hidden');
    introVideo.src = config.intro.src;
    introVideo.play().catch(() => {});
    setTimeout(() => { introSkip.classList.remove('hidden'); introSkip.classList.add('visible'); }, 1000);
    introVideo.addEventListener('ended', hideIntro, { once: true });
    introSkip.addEventListener('click', hideIntro, { once: true });
}

function hideIntro() {
    introScreen.style.transition = 'opacity 0.5s ease';
    introScreen.style.opacity = '0';
    setTimeout(() => { introScreen.classList.add('hidden'); introScreen.style.opacity = ''; showApp(); }, 500);
}

function buildReferences() {
    if (!referencesGroup || !config.references) return;

    referencesGroup.innerHTML = '';
    config.references.forEach(ref => {
        const a = document.createElement('a');
        a.href = ref.url;
        a.target = '_blank';
        a.dataset.title = ref.name;
        a.className = 'meta-btn';

        const icon = document.createElement('i');
        icon.className = ref.icon;

        a.appendChild(icon);
        referencesGroup.appendChild(a);
    });
}

// ────────── Slides & Actions ──────────────────────────────────────────────────

function syncFooter(index) {
    index = clamp(index, 0, slides.length - 1);

    indexStart.disabled = index === 0;
    indexBack.disabled = index === 0;
    indexNext.disabled = index === slides.length - 1;
    indexEnd.disabled = index === slides.length - 1;

    if (indexLabel && slides.length > 0) {
        indexLabel.textContent = `${index + 1}/${slides.length}`;
    }

    const p = slides.length > 1 ? index / (slides.length - 1) : 0;
    pageFooter.style.setProperty('--progress', p);
}

function bindActions() {
    document.addEventListener('keydown', e => {
        if (NEXT.includes(e.key)) current = snapTo(current + 1, ctx());
        if (BACK.includes(e.key)) current = snapTo(current - 1, ctx());
        if (/^[0-9]$/.test(e.key)) {
            clearTimeout(SNAP.timeout);
            SNAP.buffer += e.key;
            SNAP.timeout = setTimeout(() => {
                current = snapTo(parseInt(SNAP.buffer - 1, 10), ctx());
                SNAP.buffer = '';
            }, 500);
        }
    });

    indexStart.addEventListener('click', () => { current = snapTo(0,                  ctx()); });
    indexBack.addEventListener('click',  () => { current = snapTo(current - 1,        ctx()); });
    indexNext.addEventListener('click',  () => { current = snapTo(current + 1,        ctx()); });
    indexEnd.addEventListener('click',   () => { current = snapTo(slides.length - 1,  ctx()); });

    // ───────────────────────────────────────────────────────────────────────────────  

    const stageW = () => slideTrack.parentElement.clientWidth;
    let lastPreview = 0;
    let dragBodies = [];
    let blurred = new Set();

    function dragStart() {
        dragBase = current;
        lastPreview = current;
        slideTrack.style.transition = 'none';
        dragBodies = Array.from(slideTrack.querySelectorAll('.slide'));
    }

    function dragMove(dx) {
        const pos = clamp(dragBase - dx / stageW(), 0, slides.length - 1);
        slideTo(pos, slideTrack);
        const liveIdx = clamp(Math.round(pos), 0, slides.length - 1);
        if (liveIdx !== lastPreview) {
            lastPreview = liveIdx;
            const p = slides.length > 1 ? liveIdx / (slides.length - 1) : 0;
            pageFooter.style.setProperty('--progress', p);
        }

        const lo = clamp(Math.floor(pos) - 1, 0, dragBodies.length - 1);
        const hi = clamp(Math.ceil(pos) + 1, 0, dragBodies.length - 1);
        const nextBlurred = new Set();

        for (let i = lo; i <= hi; i++) {
            const dist = Math.abs(i - pos);
            const blur = Math.min(dist, 1) * 8;
            dragBodies[i].style.filter = blur ? `blur(${blur}px)` : '';
            if (blur) nextBlurred.add(i);
        }
        blurred.forEach(i => { if (!nextBlurred.has(i) && dragBodies[i]) dragBodies[i].style.filter = ''; });
        blurred = nextBlurred;
    }

    function dragEnd(dx) {
        const pos = clamp(dragBase - dx / stageW(), 0, slides.length - 1);
        const target = Math.round(pos);
        dragBase = target;
        blurred.forEach(i => { if (dragBodies[i]) dragBodies[i].style.filter = ''; });
        blurred.clear();
        current = snapTo(target, ctx());
    }

    let tX = 0;
    slideTrack.addEventListener('touchstart', e => { tX = e.touches[0].clientX; dragStart(); }, { passive: true });
    slideTrack.addEventListener('touchmove', e => { dragMove(e.touches[0].clientX - tX); }, { passive: true });
    slideTrack.addEventListener('touchend', e => { dragEnd(e.changedTouches[0].clientX - tX); }, { passive: true });

    let mDown = false, mX = 0;
    slideTrack.addEventListener('mousedown', e => {
        if (e.target.closest('.content-cell--model')) return;
        mDown = true; mX = e.clientX; dragStart(); e.preventDefault();
    });

    window.addEventListener('mousemove', e => { if (mDown) dragMove(e.clientX - mX); });
    window.addEventListener('mouseup', e => { if (!mDown) return; mDown = false; dragEnd(e.clientX - mX); });

    window.addEventListener('wheel', e => {
        if (e.target.closest('.content-cell--model')) return;
        if (SNAP.wheel) return;
        current = snapTo(current + (e.deltaY > 0 ? 1 : -1), ctx());
        SNAP.wheel = setTimeout(() => { SNAP.wheel = null; }, 500);
    }, { passive: true });
}

startApp().catch(e => console.error(`Lynx DMS Preview Error: ${e}`));