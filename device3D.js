const PARTS = [
    { path: './Assets/CH8/p1-1.stl', color: 0x1a1a2e, label: 'Screen', texture: './Assets/CH8/screen.png' },
    { path: './Assets/CH8/p1-2.stl', color: 0x1a1a2e, label: 'Screen' },
    { path: './Assets/CH8/p2-1.stl', color: 0x101010, label: 'Device Front' },
    { path: './Assets/CH8/p2-2.stl', color: 0x101010, label: 'Device Back' },
    { path: './Assets/CH8/p2-3.stl', color: 0x101010, label: 'Device Cover' },
    { path: './Assets/CH8/p3-1.stl', color: 0x151515, label: 'Camera Mount' },
    { path: './Assets/CH8/p3-2.stl', color: 0x000000, label: 'TPU Feet' },
    { path: './Assets/CH8/p4-1.stl', color: 0x303030, label: 'Speaker Case Back' },
    { path: './Assets/CH8/p4-2.stl', color: 0xa0a0a0, label: 'Speaker' },
    { path: './Assets/CH8/p4-3.stl', color: 0x303030, label: 'Speaker Case Front' },
    { path: './Assets/CH8/p5.stl',   color: 0x1a1a1a, label: 'Camera' },
    { path: './Assets/CH8/p6.stl',   color: 0x104010, label: 'Raspberry Pi 5' },
    { path: './Assets/CH8/p7.stl',   color: 0xdb7500, label: 'Hailo-8L AI HAT' },
];

const CONFIG = {
    euler:       new THREE.Euler(-1.55, 0, -0.75, 'XYZ'),
    scale:       1.25,
    ambLight:    0.5,
    keyLight:    1.5,
    damping:     0.85,
    sensitivity: 0.005,
};

const ORIGIN_QUAT = new THREE.Quaternion().setFromEuler(CONFIG.euler);

const _v = (x, y, z) => new THREE.Vector3(x, y, z);

const EXPLODE_STAGES = [
    // [0] Screen GROUP
    { moves: [ { duration: 0.6, to: _v(0, -0.25, -0.02) }, { duration: 0.6, to: _v(0, -0.20, -0.04) } ]},

    // [1] Device Front
    { moves: [ { duration: 0.6, to: _v(0, -0.3, 0) }, { duration: 0.6, to: _v(0, -0.5, 0) } ]},
    
    // [2] Device Back
    { moves: [] },
    
    // [3] Device Cover
    { moves: [ { duration: 0.6, to: _v(0, 0.25, -0.1) }, { duration: 0.9, to: _v(0, 0.6, 0.05) } ]},
    
    // [4] Camera Mount
    { syncWith: 1, until: 2, moves: [ { duration: 0.6, to: _v(0, -0.6, 0.05) } ]},
    
    // [5] TPU Feet
    { moves: [ { duration: 0.6, to: _v(0, 0, -0.05) }, { duration: 0.6, to: _v(0, 0.4, -0.1) } ]},
    
    // [6] Speaker Case Back
    { moves: [ { duration: 0.6, to: _v(0, 0.075, 0.15) }, { duration: 0.9, to: _v(0, 0.125, -0.075) } ]},

    // [7] Speaker
    { syncWith: 6, until: 2, moves: [ { duration: 0.6, to: _v(0, 0.125, -0.075) }, { duration: 0.6, to: _v(-0.05, 0.125, -0.075) }, { duration: 0.6, to: _v(-0.3, 0.125, -0.075) } ] },

    // [8] Speaker Case Front
    { syncWith: 6, until: 2, moves: [ { duration: 0.6, to: _v(-0.075, 0.125, -0.075) }, { duration: 0.6, to: _v(-0.05, 0.45, -0.2) } ]},

    // [9] Camera
    { syncWith: 1, until: 2, moves: [ { duration: 0.6, to: _v(0, -0.6, 0.12) } ]},

    // [10] Raspberry Pi 5
    { moves: [ { duration: 0.6, to: _v(0, 0.15, -0.025) }, { duration: 0.9, to: _v(0, 0.4, 0.1) } ]},

    // [11] Hailo-8L AI HAT
    { syncWith: 10, until: 1, moves: [ { duration: 0.9, to: _v(0, 0.25, 0.05) } ]},
];

(function prepareStages() {
    let globalMax = 0;

    function resolveStage(stage) {
        if (stage._resolved) return;
        stage._resolved = true;

        if (stage.syncWith !== undefined) {
            const leader = EXPLODE_STAGES[stage.syncWith];
            resolveStage(leader);

            stage._leader = leader;

            if (!stage.moves || stage.moves.length === 0) {
                stage._spline        = null;
                stage._cumulative    = [];
                stage._ownSpline     = null;
                stage._ownCumulative = null;
                stage._totalDuration = leader._totalDuration;
            } else {
                const until         = stage.until ?? Infinity;
                stage._until        = until;
                const leaderHandoff = leader._cumulative[until - 1];
                const handoffTime   = leaderHandoff.end;
                const handoffPt     = leader.moves[until - 1].to.clone();

                const ownMovs = stage.moves;
                const ownPts  = [handoffPt, ...ownMovs.map((m) => m.to.clone())];
                stage._ownSpline = new THREE.CatmullRomCurve3(ownPts, false, 'catmullrom', 0.5);

                let cum = handoffTime;
                const n = ownPts.length - 1;
                stage._ownCumulative = ownMovs.map((mv, k) => {
                    const start   = cum;
                    const spStart = k / n;
                    const spEnd   = (k + 1) / n;
                    cum += mv.duration;
                    return { start, end: cum, spStart, spEnd };
                });

                stage._spline        = null;
                stage._cumulative    = leader._cumulative;
                stage._totalDuration = cum;
                if (cum > globalMax) globalMax = cum;
            }
            return;
        }

        if (!stage.moves || stage.moves.length === 0) {
            stage._spline        = null;
            stage._cumulative    = [];
            stage._totalDuration = 0;
            return;
        }

        const movs = stage.moves;
        const pts  = [new THREE.Vector3(0, 0, 0), ...movs.map((m) => m.to.clone())];
        stage._spline = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);

        let cum = 0;
        const n = pts.length - 1;
        stage._cumulative = movs.map((mv, k) => {
            const start   = cum;
            const spStart = k / n;
            const spEnd   = (k + 1) / n;
            cum += mv.duration;
            return { start, end: cum, spStart, spEnd };
        });

        stage._totalDuration = cum;
        if (cum > globalMax) globalMax = cum;
    }

    EXPLODE_STAGES.forEach(resolveStage);
    EXPLODE_STAGES._globalMax = globalMax;
})();


function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function renderDevice(cell) {
    cell.style.position = 'relative';
    cell.style.display  = 'flex';

    const styleBlock = document.createElement('style');
    styleBlock.textContent = `
        .content-cell--model input[type=range]::-webkit-slider-thumb { border: none !important; }
        .content-cell--model input[type=range]::-moz-range-thumb { border: none !important; }
    `;
    cell.appendChild(styleBlock);

    const panel = document.createElement('div');
    panel.style.cssText = `
        position: absolute;
        left: 20px;
        top: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: rgba(0, 4, 15, 0.85);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--b1);
        border-radius: 14px;
        padding: 0px 20px 10px 20px;
        margin: 20px 0px;
        scrollbar-width: none;
        overflow: hidden;
        z-index: 20;
        min-width: 220px;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.7), 0 0 0 1px var(--glow-faint);
        font-family: var(--ff);
        color: var(--c-ice);
        user-select: none;
        overflow-y: auto;
    `;

    function makeLabel(text) {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'draw-palette-label';
        el.style.marginTop = '4px';
        return el;
    }

    function makeBtn(iconHtml, onClick) {
        const b = document.createElement('button');
        b.innerHTML = iconHtml;
        b.className = 'meta-btn';
        b.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
            padding: 8px 12px;
        `;
        b.onclick = onClick;
        return b;
    }

    function makeSlider(min, max, value, step, onChange, decimals = 2) {
        const wrap = document.createElement('div');
        wrap.className = 'draw-palette-slider-wrap';

        const row = document.createElement('div');
        row.className = 'draw-palette-slider-row';

        const s = document.createElement('input');
        s.type = 'range';
        s.min = min;
        s.max = max;
        s.step = step;
        s.value = value;
        s.className = 'draw-palette-slider';
        s.style.flex = '1';

        const val = document.createElement('span');
        val.className = 'draw-palette-value';
        val.style.color = 'var(--c-meta)';
        val.textContent = Math.abs(parseFloat(value)).toFixed(decimals);

        s.oninput = () => {
            val.textContent = Math.abs(parseFloat(s.value)).toFixed(decimals);
            onChange(parseFloat(s.value));
        };

        row.appendChild(s);
        row.appendChild(val);
        wrap.appendChild(row);

        return { el: wrap, slider: s, valEl: val, _decimals: decimals };
    }

    function makeDivider() {
        const d = document.createElement('div');
        d.className = 'draw-palette-divider';
        return d;
    }

    cell.appendChild(panel);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position: absolute; left: 100px; right: 0; top: 0; bottom: 0; width:100%; height:100%;';
    cell.appendChild(canvas);
    cell.classList.add('content-cell--model');

    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: absolute;
        pointer-events: none;
        display: none;
        background: var(--c-void);
        color: var(--c-ice);
        font-family: var(--ff-m);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid var(--b1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        white-space: nowrap;
        box-shadow: var(--shadow);
        z-index: 9999;
    `;
    cell.appendChild(tooltip);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(cell.clientWidth, cell.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, cell.clientWidth / cell.clientHeight, 0.1, 1000);

    const ambLight  = new THREE.AmbientLight(0xffffff, CONFIG.ambLight);
    scene.add(ambLight);
    const keyLight  = new THREE.DirectionalLight(0xfff4e0, CONFIG.keyLight);
    keyLight.position.set(6, 10, 8);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xc9e8ff, 0.6);
    fillLight.position.set(-8, 4, -4);
    scene.add(fillLight);
    const rimLight  = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, -6, -10);
    scene.add(rimLight);

    const raycaster = new THREE.Raycaster();
    const pointer   = new THREE.Vector2();

    let group        = null;
    let meshList     = [];
    let hoveredMesh  = null;
    let explodeT     = 0;
    let explodeTarget = 0;
    let explodeScale = 0;
    let modelSize    = 1;

    let isDragging = false;
    let lastX = 0, lastY = 0;
    let velX  = 0, velY  = 0;

    const quat       = ORIGIN_QUAT.clone();
    const quatDelta  = new THREE.Quaternion();
    const worldUp    = new THREE.Vector3(0, 1, 0);
    const worldRight = new THREE.Vector3(1, 0, 0);

    let lastTap  = 0;
    let tapCount = 0;

    let spinSpeed   = 0;
    let scaleTarget = CONFIG.scale;
    let ambTarget   = CONFIG.ambLight;
    let keyTarget   = CONFIG.keyLight;

    let rotXTarget = 0, rotYTarget = 0, rotZTarget = 0;
    let rotXCurrent = 0, rotYCurrent = 0, rotZCurrent = 0;

    let sliders = {};

    let panXTarget = 0, panYTarget = 0;
    let panXCurrent = 0, panYCurrent = 0;

    let joystickActive = false;
    let joystickVX = 0, joystickVY = 0;

    const _offsetVec = new THREE.Vector3();

    function syncSlider(key, value) {
        if (!sliders[key]) return;
        const decimals = sliders[key]._decimals ?? 2;
        sliders[key].slider.value = value;
        sliders[key].valEl.textContent = parseFloat(value).toFixed(decimals);
    }

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    let isPanning = false;
    let panLastX = 0, panLastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
        if (e.target !== canvas) return;
        if (e.button === 2) {
            isPanning = true;
            panLastX = e.clientX;
            panLastY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
            canvas.style.cursor = 'move';
            return;
        }
        isDragging = true;
        lastX = e.clientX; lastY = e.clientY;
        velX = velY = 0;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        if (isPanning) {
            const dx = e.clientX - panLastX;
            const dy = e.clientY - panLastY;
            panLastX = e.clientX;
            panLastY = e.clientY;
            const panLimit = modelSize * 0.5;
            const scale = modelSize * 0.003;
            panXTarget = Math.max(-panLimit, Math.min(panLimit, panXTarget + dx * scale));
            panYTarget = Math.max(-panLimit, Math.min(panLimit, panYTarget - dy * scale));
            return;
        }

        if (isDragging) {
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            velX = dy * CONFIG.sensitivity;
            velY = dx * CONFIG.sensitivity;

            quatDelta.setFromAxisAngle(worldUp,    velY); quat.premultiply(quatDelta);
            quatDelta.setFromAxisAngle(worldRight,  velX); quat.premultiply(quatDelta);
            if (group) group.quaternion.copy(quat);

            const deltaQuat = ORIGIN_QUAT.clone().invert().multiply(quat);
            const euler = new THREE.Euler().setFromQuaternion(deltaQuat, 'XYZ');
            const toDeg = (r) => ((r * 180 / Math.PI) % 360 + 360) % 360;
            rotXTarget = rotXCurrent = euler.x;
            rotYTarget = rotYCurrent = euler.y;
            rotZTarget = rotZCurrent = euler.z;
            syncSlider('rotX', toDeg(euler.x));
            syncSlider('rotY', toDeg(euler.y));
            syncSlider('rotZ', toDeg(euler.z));

            lastX = e.clientX; lastY = e.clientY;
            tooltip.style.display = 'none';
            return;
        }

        pointer.x =  (cx / canvas.clientWidth)  * 2 - 1;
        pointer.y = -(cy / canvas.clientHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const allMeshes = [];
        if (group) group.traverse((o) => { if (o.isMesh) allMeshes.push(o); });
        const hits = raycaster.intersectObjects(allMeshes);

        if (hits.length > 0) {
            const hit = hits[0].object;
            if (hit !== hoveredMesh) {
                if (hoveredMesh) hoveredMesh.material.emissive?.setHex(0x000000);
                hoveredMesh = hit;
                hoveredMesh.material.emissive?.setHex(0x4a9eff);
                if (hoveredMesh.material.emissiveIntensity !== undefined)
                    hoveredMesh.material.emissiveIntensity = 0.25;
            }
            tooltip.textContent = hit.__partLabel || '';
            tooltip.style.display = 'block';
            tooltip.style.left = (cx + 14) + 'px';
            tooltip.style.top  = (cy - 28) + 'px';
            canvas.style.cursor = 'grab';
        } else {
            if (hoveredMesh) { hoveredMesh.material.emissive?.setHex(0x000000); hoveredMesh = null; }
            tooltip.style.display = 'none';
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
            return;
        }
        isDragging = false;
        canvas.style.cursor = 'default';
        const now = Date.now();
        tapCount = (now - lastTap < 350) ? tapCount + 1 : 1;
        lastTap = now;
        if (tapCount >= 2) { tapCount = 0; setExplode(explodeT > 0.5 ? 0 : 1); }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        scaleTarget = Math.max(0.3, Math.min(3.0, scaleTarget * factor));
        syncSlider('scale', scaleTarget);
    }, { passive: false });

    function setExplode(v) {
        explodeTarget = Math.max(0, Math.min(1, v));
        syncSlider('explode', explodeTarget);
    }

    function smoothReset() {
        rotXTarget = rotYTarget = rotZTarget = 0;
        velX = velY = 0;
        scaleTarget = CONFIG.scale;
        ambTarget   = CONFIG.ambLight;
        keyTarget   = CONFIG.keyLight;
        spinSpeed   = 0;
        panXTarget  = panYTarget = 0;
        setExplode(0);
        syncSlider('scale', CONFIG.scale);
        syncSlider('amb',   CONFIG.ambLight);
        syncSlider('key',   CONFIG.keyLight);
        syncSlider('spin',  0);
        syncSlider('rotX',  0);
        syncSlider('rotY',  0);
        syncSlider('rotZ',  0);
    }

    const stlLoader     = new THREE.STLLoader();
    const textureLoader = new THREE.TextureLoader();

    const loadPart = ({ path, color, texture, label, backMesh }) =>
        new Promise((resolve, reject) => {
            stlLoader.load(path, (geometry) => {
                geometry.computeVertexNormals();
                if (texture) {
                    geometry.computeBoundingBox();
                    const bbox  = geometry.boundingBox;
                    const sizeX = bbox.max.x - bbox.min.x;
                    const sizeZ = bbox.max.z - bbox.min.z;
                    const pos   = geometry.attributes.position;
                    const uvs   = [];
                    for (let i = 0; i < pos.count; i++) {
                        uvs.push(
                            (pos.getX(i) - bbox.min.x) / sizeX,
                            (pos.getZ(i) - bbox.min.z) / sizeZ,
                        );
                    }
                    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
                    const tex = textureLoader.load(texture);
                    tex.colorSpace = THREE.SRGBColorSpace;
                    const faceMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.05 }));
                    faceMesh.__partLabel = label;
                    backMesh.__partLabel = label;
                    const sg = new THREE.Group();
                    sg.add(backMesh); sg.add(faceMesh);
                    sg.__partLabel = label;
                    resolve(sg);
                } else {
                    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 }));
                    mesh.__partLabel = label;
                    resolve(mesh);
                }
            }, undefined, reject);
        });

    Promise.all([
        loadPart(PARTS[1]).then((backMesh) => loadPart({ ...PARTS[0], backMesh })),
        ...PARTS.slice(2).map(loadPart),
    ])
    .then((meshes) => {
        group    = new THREE.Group();
        meshList = meshes;
        meshes.forEach((m) => { m.__homePos = new THREE.Vector3(0, 0, 0); group.add(m); });

        group.quaternion.identity();
        scene.add(group);

        const box    = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3()).length();
        modelSize    = size;

        meshes.forEach((m) => { m.position.sub(center); m.__homePos = m.position.clone(); });
        group.quaternion.copy(quat);
        explodeScale = size * 0.55;

        camera.position.set(0, 0, size * CONFIG.scale);
        camera.near = size * 0.01;
        camera.far  = size * 20;
        camera.updateProjectionMatrix();

        buildPanel();
        buildJoystick();

        const spinQuat = new THREE.Quaternion();
        const spinAxis = new THREE.Vector3(0, 1, 0);

        const globalMax = EXPLODE_STAGES._globalMax || 1;

        let explodeClock    = 0;
        let explodeClockTgt = 0;
        let lastTime        = performance.now();

        function resolveSplineParam(clock, cum, movs) {
            if (!cum || cum.length === 0) return 0;
            if (clock <= 0) return 0;
            const total = cum[cum.length - 1].end;
            if (clock >= total) return 1;
            for (let k = 0; k < movs.length; k++) {
                const { start, end, spStart, spEnd } = cum[k];
                if (clock <= start) return spStart;
                if (clock <= end) {
                    const localT  = (clock - start) / (end - start);
                    const isFirst = k === 0;
                    const isLast  = k === movs.length - 1;
                    let eased;
                    if (isFirst && isLast) {
                        eased = easeInOutCubic(localT);
                    } else if (isFirst) {
                        eased = localT < 0.5 ? 4 * localT * localT * localT : localT;
                    } else if (isLast) {
                        eased = localT > 0.5 ? 1 - Math.pow(-2 * localT + 2, 3) / 2 : localT;
                    } else {
                        eased = localT;
                    }
                    return spStart + eased * (spEnd - spStart);
                }
            }
            return 1;
        }

        (function animate() {
            requestAnimationFrame(animate);

            const now   = performance.now();
            const delta = (now - lastTime) / 1000;
            lastTime    = now;

            if (!isDragging) {
                velX *= CONFIG.damping; velY *= CONFIG.damping;
                if (Math.abs(velX) > 0.00001 || Math.abs(velY) > 0.00001) {
                    quatDelta.setFromAxisAngle(worldUp,    velY); quat.premultiply(quatDelta);
                    quatDelta.setFromAxisAngle(worldRight,  velX); quat.premultiply(quatDelta);
                }
            }

            if (
                Math.abs(rotXTarget - rotXCurrent) > 0.00001 ||
                Math.abs(rotYTarget - rotYCurrent) > 0.00001 ||
                Math.abs(rotZTarget - rotZCurrent) > 0.00001
            ) {
                rotXCurrent += (rotXTarget - rotXCurrent) * 0.07;
                rotYCurrent += (rotYTarget - rotYCurrent) * 0.07;
                rotZCurrent += (rotZTarget - rotZCurrent) * 0.07;
                const qOffset = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(rotXCurrent, rotYCurrent, rotZCurrent)
                );
                quat.copy(ORIGIN_QUAT).multiply(qOffset);
                velX = velY = 0;
            }

            if (spinSpeed !== 0) {
                spinQuat.setFromAxisAngle(spinAxis, spinSpeed);
                quat.premultiply(spinQuat);
            }

            if (group) group.quaternion.copy(quat);

            if (joystickActive) {
                const panLimit = modelSize * 0.5;
                panXTarget = Math.max(-panLimit, Math.min(panLimit, panXTarget + joystickVX * modelSize * 0.007));
                panYTarget = Math.max(-panLimit, Math.min(panLimit, panYTarget + joystickVY * modelSize * 0.007));
            }
            panXCurrent += (panXTarget - panXCurrent) * 0.1;
            panYCurrent += (panYTarget - panYCurrent) * 0.1;
            if (group) group.position.set(panXCurrent, panYCurrent, 0);

            camera.position.z += (modelSize * scaleTarget - camera.position.z) * 0.08;
            ambLight.intensity += (ambTarget - ambLight.intensity) * 0.08;
            keyLight.intensity += (keyTarget - keyLight.intensity) * 0.08;

            explodeClockTgt = explodeTarget * globalMax;
            const diff      = explodeClockTgt - explodeClock;
            if (Math.abs(diff) < 0.001) {
                explodeClock = explodeClockTgt;
            } else {
                explodeClock += Math.sign(diff) * Math.min(Math.abs(diff), delta);
            }
            explodeT = explodeClock / globalMax;
            if (!sliders.explode?._dragging) syncSlider('explode', explodeT);

            const clock = Math.max(0, explodeClock);

            meshList.forEach((m, i) => {
                const home  = m.__homePos || new THREE.Vector3();
                const stage = EXPLODE_STAGES[i];

                if (!stage) { m.position.copy(home); return; }

                const _tmp = new THREE.Vector3();

                function sampleStage(st) {
                    if (st.syncWith !== undefined) {
                        const leader = st._leader;

                        if (!st._ownSpline) {
                            return sampleStage(leader);
                        }

                        const leaderHandoff = leader._cumulative[st._until - 1];
                        if (clock <= leaderHandoff.end) {
                            return sampleStage(leader);
                        }

                        const sp = resolveSplineParam(clock, st._ownCumulative, st.moves);
                        st._ownSpline.getPoint(sp, _tmp);
                        return;
                    }

                    if (!st._spline) return;

                    const sp = resolveSplineParam(clock, st._cumulative, st.moves);
                    st._spline.getPoint(sp, _tmp);
                }

                sampleStage(stage);

                m.position.set(
                    home.x + _tmp.x * explodeScale,
                    home.y + _tmp.y * explodeScale,
                    home.z + _tmp.z * explodeScale,
                );
            });

            renderer.render(scene, camera);
        })();
    })
    .catch((err) => console.error('[device3D] Failed to load part:', err));

    function buildPanel() {
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; gap:6px; visibility:hidden; height:0; overflow:hidden; margin:0; padding:0;';

        const resetBtn   = makeBtn('<i class="fas fa-sync-alt"></i>', smoothReset);
        const explodeBtn = makeBtn('<i class="fas fa-expand-arrows-alt"></i>', () => setExplode(explodeT > 0.5 ? 0 : 1));
        resetBtn.style.flex   = '1';
        explodeBtn.style.flex = '1';
        topRow.appendChild(resetBtn);
        topRow.appendChild(explodeBtn);
        panel.appendChild(topRow);

        const visRow = document.createElement('div');
        visRow.style.cssText = 'display:flex; gap:6px;';

        const vResetBtn    = makeBtn('<i class="fas fa-sync-alt"></i>', smoothReset);
        const vPanResetBtn = makeBtn('<i class="fa-solid fa-align-center"></i>', () => { panXTarget = panYTarget = 0; });
        const vExplodeBtn  = makeBtn('<i class="fas fa-expand-arrows-alt"></i>', () => setExplode(explodeT > 0.5 ? 0 : 1));
        vResetBtn.style.flex    = '1';
        vPanResetBtn.style.flex = '1';
        vExplodeBtn.style.flex  = '1';
        visRow.appendChild(vResetBtn);
        visRow.appendChild(vPanResetBtn);
        visRow.appendChild(vExplodeBtn);
        panel.appendChild(visRow);

        panel.appendChild(makeDivider());

        panel.appendChild(makeLabel('Rotation X'));
        const rxSl = makeSlider(0, 359, 0, 1, (v) => { rotXTarget = v * Math.PI / 180; }, 0);
        sliders.rotX = rxSl; panel.appendChild(rxSl.el);

        panel.appendChild(makeLabel('Rotation Y'));
        const rySl = makeSlider(0, 359, 0, 1, (v) => { rotYTarget = v * Math.PI / 180; }, 0);
        sliders.rotY = rySl; panel.appendChild(rySl.el);

        panel.appendChild(makeLabel('Rotation Z'));
        const rzSl = makeSlider(0, 359, 0, 1, (v) => { rotZTarget = v * Math.PI / 180; }, 0);
        sliders.rotZ = rzSl; panel.appendChild(rzSl.el);

        panel.appendChild(makeDivider());

        panel.appendChild(makeLabel('Spin'));
        const spinSl = makeSlider(-0.15, 0.15, 0, 0.01, (v) => { spinSpeed = v/10; }, 2);
        sliders.spin = spinSl; panel.appendChild(spinSl.el);

        panel.appendChild(makeLabel('Scale'));
        const scaleSl = makeSlider(0.2, 2.0, CONFIG.scale, 0.01, (v) => { scaleTarget = v; });
        sliders.scale = scaleSl; panel.appendChild(scaleSl.el);
        
        panel.appendChild(makeLabel('Explode'));
        const expSl = makeSlider(0, 1, 0, 0.001, (v) => { explodeTarget = v; });
        expSl.slider.addEventListener('pointerdown', () => { sliders.explode._dragging = true; });
        expSl.slider.addEventListener('pointerup',   () => { sliders.explode._dragging = false; });
        sliders.explode = expSl;
        panel.appendChild(expSl.el);

        panel.appendChild(makeDivider());
        panel.appendChild(makeLabel('Light'));
        const ambSl = makeSlider(0, 2, CONFIG.ambLight, 0.01, (v) => { ambTarget = v; });
        sliders.amb = ambSl; panel.appendChild(ambSl.el);

        panel.appendChild(makeLabel('Key Light'));
        const keySl = makeSlider(0, 6, CONFIG.keyLight, 0.01, (v) => { keyTarget = v; });
        sliders.key = keySl; panel.appendChild(keySl.el);
    }

    function buildJoystick() {
        const PAD   = 90;
        const KNOB  = 30;
        const MAX_R = (PAD - KNOB) / 2;

        const container = document.createElement('div');
        container.style.cssText = `
            position: absolute;
            right: 20px;
            bottom: 20px;
            z-index: 20;
            display: flex;
            flex-direction: column;
            align-items: center;
            pointer-events: none;
        `;

        const pad = document.createElement('div');
        pad.style.cssText = `
            width: ${PAD}px;
            height: ${PAD}px;
            border-radius: 50%;
            background: rgba(0, 4, 15, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--b1);
            box-shadow: 0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px var(--glow-faint);
            position: relative;
            touch-action: none;
            cursor: grab;
            flex-shrink: 0;
            pointer-events: all;
        `;

        const hLine = document.createElement('div');
        hLine.style.cssText = `
            position: absolute; left: 12%; top: 50%; width: 76%; height: 1px;
            background: var(--b1); transform: translateY(-50%); pointer-events: none;
        `;
        const vLine = document.createElement('div');
        vLine.style.cssText = `
            position: absolute; top: 12%; left: 50%; height: 76%; width: 1px;
            background: var(--b1); transform: translateX(-50%); pointer-events: none;
        `;
        pad.appendChild(hLine);
        pad.appendChild(vLine);

        const knob = document.createElement('div');
        knob.style.cssText = `
            position: absolute;
            width: ${KNOB}px;
            height: ${KNOB}px;
            border-radius: 50%;
            background: rgba(255,255,255,0.07);
            border: 1px solid var(--b1);
            box-shadow: 0 2px 10px rgba(0,0,0,0.5), 0 0 0 1px var(--glow-faint);
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
        `;
        pad.appendChild(knob);
        container.appendChild(pad);
        cell.appendChild(container);

        let padPointerId = null;

        function getKnobPos(cx, cy) {
            const rect = pad.getBoundingClientRect();
            const dx = cx - (rect.left + rect.width  / 2);
            const dy = cy - (rect.top  + rect.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            const clamped = Math.min(dist, MAX_R);
            const angle = Math.atan2(dy, dx);
            return {
                kx:    Math.cos(angle) * clamped,
                ky:    Math.sin(angle) * clamped,
                nx:    dist > 0 ? dx / dist : 0,
                ny:    dist > 0 ? dy / dist : 0,
                ratio: Math.min(dist / MAX_R, 1),
            };
        }

        function setKnob(kx, ky) {
            knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
        }

        pad.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            pad.setPointerCapture(e.pointerId);
            padPointerId = e.pointerId;
            joystickActive = true;
            pad.style.cursor = 'grabbing';
            const { kx, ky, nx, ny, ratio } = getKnobPos(e.clientX, e.clientY);
            setKnob(kx, ky);
            joystickVX = -nx * ratio;
            joystickVY =  ny * ratio;
        });

        pad.addEventListener('pointermove', (e) => {
            if (padPointerId === null || e.pointerId !== padPointerId) return;
            const { kx, ky, nx, ny, ratio } = getKnobPos(e.clientX, e.clientY);
            setKnob(kx, ky);
            joystickVX = -nx * ratio;
            joystickVY =  ny * ratio;
        });

        function releaseJoystick() {
            padPointerId   = null;
            joystickActive = false;
            joystickVX = joystickVY = 0;
            knob.style.transition = 'transform 0.25s cubic-bezier(0.25,1,0.5,1)';
            setKnob(0, 0);
            setTimeout(() => { knob.style.transition = 'none'; }, 260);
            pad.style.cursor = 'grab';
        }

        pad.addEventListener('pointerup',     releaseJoystick);
        pad.addEventListener('pointercancel', releaseJoystick);
    }

    const ro = new ResizeObserver(() => {
        const w = cell.clientWidth, h = cell.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    });
    ro.observe(cell);
}