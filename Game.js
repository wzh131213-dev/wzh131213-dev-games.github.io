// ==================== 音频配置 ====================
const BGM_URL = 'heijiedj.mp3'; 
const bgm = new Audio(BGM_URL);
bgm.loop = true;

function playBGM() {
    bgm.play().catch(() => {});
}
function pauseBGM() { bgm.pause(); }
function resetBGM() { bgm.pause(); bgm.currentTime = 0; bgm.playbackRate = 1.0; }

// 独立喇叭音效（Web Audio API 合成，绝不与 BGM 冲突）
function playHorn() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        // 汽车双音喇叭频率组合
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(370, audioCtx.currentTime); 
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(466.16, audioCtx.currentTime); 

        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(audioCtx.currentTime + 0.4);
        osc2.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
        console.log("AudioContext not supported", e);
    }
}

let scene, camera, renderer;
let playerCar;
let roadSegments = [];
let npcCars = [];
let truckRamps = [];

// 第一视角驾驶舱组件
let firstPersonCabin;
let steeringWheelMesh;
let gasPedalMesh;
let brakePedalMesh;

let selectedColor = 0xef4444; 
let baseMaxSpeedKmMin = 300; 
let currentMaxSpeed = 1.2; 
let currentLevel = 1; 

let maxDurability = 10000;
let durability = 10000;

let speed = 0;
let playerX = 0;
let playerY = 0; 
let verticalSpeed = 0; 
let totalDistance = 0;
let isGameOver = false;
let isVictory = false;
let gameStarted = false;

let isFlightUnlocked = false; 
let is2DMode = false; 
let isTransitioning = false;
let cameraMode = 'third'; // 'third' 或 'first'

let webglCanvas, arcadeCanvas, arcadeCtx;
let arcadePlayer = { x: 180, y: 180, width: 60, height: 32 };
let arcadeGroundNpcs = []; 
let backgroundSceneryOffset = 0; 

const keys = { left: false, right: false, gas: false, brake: false, flyUp: false, flyDown: false };

// ==================== 作弊系统 ====================
function triggerCheat() {
    const inputPass = prompt("请输入作弊密码：");
    if (inputPass === "wzh") {
        baseMaxSpeedKmMin = 100000;
        currentMaxSpeed = 150.0; 
        speed = 150.0; 
        bgm.playbackRate = 1.35;
        alert("⚡ 作弊码激活成功！《黑街 DJ》电音加速中！");
        const speedValEl = document.getElementById('speed-val');
        if (speedValEl) speedValEl.innerText = "100000";
    } else if (inputPass !== null) {
        alert("❌ 密码错误！");
    }
}

let tapCount = 0;
let lastTapTime = 0;

function selectCar(index, colorHex, speedLimit, element) {
    document.querySelectorAll('.car-card').forEach(card => card.classList.remove('selected'));
    element.classList.add('selected');
    selectedColor = colorHex;
    baseMaxSpeedKmMin = speedLimit;
    currentMaxSpeed = speedLimit === 300 ? 1.2 : (speedLimit === 700 ? 2.0 : 2.8);
}

function selectDifficulty(hp, element) {
    document.querySelectorAll('.difficulty-card').forEach(card => card.classList.remove('selected'));
    element.classList.add('selected');
    maxDurability = hp;
    durability = hp;
}

function selectLevel(levelId, element) {
    document.querySelectorAll('.level-card').forEach(card => card.classList.remove('selected'));
    element.classList.add('selected');
    currentLevel = levelId;
}

function openGarage() {
    isGameOver = true;
    pauseBGM();
    document.getElementById('garage-screen').style.display = 'flex';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('orientation-tip').style.display = 'none';
    document.getElementById('comic-story-box').style.display = 'none';
    document.getElementById('top-btn-group').style.display = 'none';
    document.getElementById('flight-unlock-btn').style.display = 'none';
    document.getElementById('flight-controls-group').style.display = 'none';
    
    const viewBtn = document.getElementById('btn-switch-view');
    if (viewBtn) viewBtn.style.display = 'none';
    const hornBtn = document.getElementById('btn-horn');
    if (hornBtn) hornBtn.style.display = 'none';

    if (arcadeCanvas) arcadeCanvas.style.display = 'none';
    if (webglCanvas) webglCanvas.style.display = 'block';
    document.querySelector('.controls').style.display = 'none';
}

function startGame() {
    document.getElementById('garage-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('orientation-tip').style.display = 'block';
    document.getElementById('top-btn-group').style.display = 'block';
    document.querySelector('.controls').style.display = 'flex';

    ensureViewButton();
    const viewBtn = document.getElementById('btn-switch-view');
    if (viewBtn) viewBtn.style.display = 'block';
    const hornBtn = document.getElementById('btn-horn');
    if (hornBtn) hornBtn.style.display = 'block';

    document.getElementById('max-hp-val').innerText = maxDurability;
    durability = maxDurability;

    if (currentLevel === 1) {
        document.getElementById('comic-story-box').style.display = 'block';
        document.getElementById('flight-unlock-btn').style.display = 'none';
        document.getElementById('flight-controls-group').style.display = 'none';
    } else {
        document.getElementById('comic-story-box').style.display = 'none';
    }

    if (!scene) {
        init3D();
        init2DArcade();
    } else {
        playerCar.children[0].material.color.setHex(selectedColor);
        resetWheelsToNormal();
        rebuildNpcsForLevel();
        resetGame();
    }
    
    playBGM();
    gameStarted = true;
    isGameOver = false;
    isVictory = false;
}

function toggleCameraMode() {
    cameraMode = cameraMode === 'third' ? 'first' : 'third';
    const viewBtn = document.getElementById('btn-switch-view');
    if (viewBtn) {
        viewBtn.innerText = cameraMode === 'third' ? '📷 第一视角' : '📷 第三视角';
    }
    if (firstPersonCabin) {
        firstPersonCabin.visible = (cameraMode === 'first');
    }
}

function ensureViewButton() {
    let viewBtn = document.getElementById('btn-switch-view');
    if (!viewBtn) {
        viewBtn = document.createElement('button');
        viewBtn.id = 'btn-switch-view';
        viewBtn.innerText = '📷 第一视角';
        viewBtn.style.cssText = 'position: fixed; top: 20px; right: 120px; z-index: 70; background: rgba(59, 130, 246, 0.2); border: 2px solid #3b82f6; color: #3b82f6; padding: 6px 12px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px;';
        viewBtn.onclick = toggleCameraMode;
        document.body.appendChild(viewBtn);
    }
}

function init3D() {
    const container = document.getElementById('game-container');
    webglCanvas = document.getElementById('webgl-canvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.012);

    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    ensureViewButton();
    buildInfiniteRoad();
    playerCar = createDetailedCar(selectedColor);
    scene.add(playerCar);

    firstPersonCabin = createFirstPersonCabin();
    camera.add(firstPersonCabin);
    scene.add(camera);

    resetWheelsToNormal();
    rebuildNpcsForLevel();

    if (currentLevel === 1) {
        spawnTruckRamp(150);
    }

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    bindControls();
    animate();
}

function createFirstPersonCabin() {
    const cabinGroup = new THREE.Group();

    const cabinLight = new THREE.PointLight(0xffffff, 1.5, 4);
    cabinLight.position.set(0, 0.2, 0.3);
    cabinGroup.add(cabinLight);

    const dashGeo = new THREE.BoxGeometry(2.2, 0.35, 0.6);
    const dashMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.position.set(0, -0.45, 0.45);
    cabinGroup.add(dash);

    const wheelGeo = new THREE.TorusGeometry(0.26, 0.03, 12, 24);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    steeringWheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
    steeringWheelMesh.rotation.x = Math.PI / 3;
    steeringWheelMesh.position.set(0, -0.12, 0.38);
    cabinGroup.add(steeringWheelMesh);

    const colGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 12);
    const colMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const col = new THREE.Mesh(colGeo, colMat);
    col.rotation.x = Math.PI / 3;
    col.position.set(0, -0.22, 0.42);
    cabinGroup.add(col);

    const pedalGeo = new THREE.BoxGeometry(0.07, 0.15, 0.02);
    const gasMat = new THREE.MeshLambertMaterial({ color: 0xfbbf24 });
    gasPedalMesh = new THREE.Mesh(pedalGeo, gasMat);
    gasPedalMesh.position.set(0.18, -0.62, 0.55);
    gasPedalMesh.rotation.x = 0.2;
    cabinGroup.add(gasPedalMesh);

    const brakeMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
    brakePedalMesh = new THREE.Mesh(pedalGeo, brakeMat);
    brakePedalMesh.position.set(-0.02, -0.62, 0.55);
    brakePedalMesh.rotation.x = 0.2;
    cabinGroup.add(brakePedalMesh);

    const mirrorGeo = new THREE.BoxGeometry(0.28, 0.14, 0.02);
    const mirrorMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
    
    const leftMirror = new THREE.Mesh(mirrorGeo, mirrorMat);
    leftMirror.position.set(-0.9, 0.35, 0.2);
    leftMirror.rotation.y = 0.35;
    cabinGroup.add(leftMirror);

    const rightMirror = new THREE.Mesh(mirrorGeo, mirrorMat);
    rightMirror.position.set(0.9, 0.35, 0.2);
    rightMirror.rotation.y = -0.35;
    cabinGroup.add(rightMirror);

    cabinGroup.visible = false;
    return cabinGroup;
}

function init2DArcade() {
    arcadeCanvas = document.getElementById('arcade-canvas');
    arcadeCtx = arcadeCanvas.getContext('2d');
    arcadeCanvas.width = window.innerWidth;
    arcadeCanvas.height = window.innerHeight;
    arcadePlayer.x = 180;
    arcadePlayer.y = arcadeCanvas.height * 0.3;
}

function createDetailedCar(colorHex) {
    const carGroup = new THREE.Group();

    const cargoGeo = new THREE.BoxGeometry(2.1, 2.0, 5.5);
    const cargoMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3, metalness: 0.2 });
    const cargo = new THREE.Mesh(cargoGeo, cargoMat);
    cargo.position.set(0, 1.4, -1.2); 
    carGroup.add(cargo);

    const cabGeo = new THREE.BoxGeometry(1.9, 1.6, 1.8);
    const cabMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.2, metalness: 0.4 });
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 1.2, 2.4);
    carGroup.add(cab);

    const roofSpooGeo = new THREE.BoxGeometry(1.8, 0.6, 1.4);
    const roofMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3 });
    const roofSpoiler = new THREE.Mesh(roofSpooGeo, roofMat);
    roofSpoiler.position.set(0, 2.3, 2.2);
    carGroup.add(roofSpoiler);

    const windshieldGeo = new THREE.BoxGeometry(1.7, 0.6, 0.1);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.1, metalness: 0.9 });
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0, 1.4, 3.31);
    carGroup.add(windshield);

    const grilleGeo = new THREE.BoxGeometry(1.4, 0.8, 0.1);
    const grilleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const grille = new THREE.Mesh(grilleGeo, grilleMat);
    grille.position.set(0, 0.8, 3.31);
    carGroup.add(grille);

    const bumperGeo = new THREE.BoxGeometry(2.1, 0.3, 0.3);
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.set(0, 0.4, 3.25);
    carGroup.add(bumper);

    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    const wheelPositions = [
        [-1.0, 0.45, 2.4], [1.0, 0.45, 2.4],
        [-1.05, 0.45, -0.8], [1.05, 0.45, -0.8],
        [-1.05, 0.45, -2.5], [1.05, 0.45, -2.5]
    ];

    carGroup.userData.wheels = [];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(...pos);
        wheel.rotation.set(0, 0, Math.PI / 2);
        carGroup.add(wheel);
        carGroup.userData.wheels.push(wheel);
    });

    carGroup.userData.box = new THREE.Box3();
    return carGroup;
}

function createNormalCar(colorHex) {
    const carGroup = new THREE.Group();
    
    const bodyGeo = new THREE.BoxGeometry(1.6, 0.55, 3.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.2, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.45, 0);
    carGroup.add(body);

    const cabinGeo = new THREE.BoxGeometry(1.4, 0.5, 1.7);
    const cabinMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.2 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.98, -0.1);
    carGroup.add(cabin);

    const railGeo = new THREE.BoxGeometry(0.05, 0.08, 1.4);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-0.65, 1.25, -0.1);
    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(0.65, 1.25, -0.1);
    carGroup.add(leftRail);
    carGroup.add(rightRail);

    const windshieldGeo = new THREE.BoxGeometry(1.35, 0.45, 0.05);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.1, metalness: 0.8 });
    
    const frontWindshield = new THREE.Mesh(windshieldGeo, glassMat);
    frontWindshield.position.set(0, 0.98, 0.76);
    frontWindshield.rotation.x = -0.3;
    carGroup.add(frontWindshield);

    const rearWindshield = new THREE.Mesh(windshieldGeo, glassMat);
    rearWindshield.position.set(0, 0.98, -0.96);
    rearWindshield.rotation.x = 0.3;
    carGroup.add(rearWindshield);

    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    const wheelPositions = [
        [-0.85, 0.3, 1.0], [0.85, 0.3, 1.0],
        [-0.85, 0.3, -1.0], [0.85, 0.3, -1.0]
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(...pos);
        wheel.rotation.set(0, 0, Math.PI / 2);
        carGroup.add(wheel);
    });

    carGroup.userData.box = new THREE.Box3();
    return carGroup;
}

function resetWheelsToNormal() {
    isFlightUnlocked = false;
    is2DMode = false;
    isTransitioning = false;
    
    if (arcadeCanvas) arcadeCanvas.style.display = 'none';
    if (webglCanvas) webglCanvas.style.display = 'block';

    if (!playerCar || !playerCar.userData.wheels) return;
    playerCar.userData.wheels.forEach(wheel => {
        wheel.rotation.set(0, 0, Math.PI / 2);
        wheel.scale.set(1, 1, 1);
    });
}

function activateFlightMode() {
    if (isTransitioning) return;
    isTransitioning = true;

    const flightBtn = document.getElementById('flight-unlock-btn');
    if (flightBtn) flightBtn.style.display = 'none';

    const viewBtn = document.getElementById('btn-switch-view');
    if (viewBtn) viewBtn.style.display = 'none';
    const hornBtn = document.getElementById('btn-horn');
    if (hornBtn) hornBtn.style.display = 'none';

    const overlay = document.getElementById('transition-overlay');
    overlay.style.opacity = '1'; 

    let startTime = performance.now();
    let startCamPos = camera.position.clone();
    let targetCamPos = new THREE.Vector3(playerX - 6, 1.8, totalDistance + 2);

    function animateCameraTransition(now) {
        let elapsed = (now - startTime) / 1000;
        let progress = Math.min(elapsed / 0.3, 1); 

        camera.position.lerpVectors(startCamPos, targetCamPos, progress);
        camera.lookAt(playerX, 0.5, totalDistance + 4);

        if (progress < 1) {
            requestAnimationFrame(animateCameraTransition);
        } else {
            isFlightUnlocked = true;
            is2DMode = true;
            baseMaxSpeedKmMin = 10000;
            currentMaxSpeed = 15.0; 
            speed = currentMaxSpeed; 

            if (firstPersonCabin) firstPersonCabin.visible = false;
            document.getElementById('flight-controls-group').style.display = 'flex'; 

            if (webglCanvas) webglCanvas.style.display = 'none';
            if (arcadeCanvas) {
                arcadeCanvas.style.display = 'block';
                arcadeCanvas.width = window.innerWidth;
                arcadeCanvas.height = window.innerHeight;
                arcadePlayer.y = arcadeCanvas.height * 0.32;
            }

            arcadeGroundNpcs = [];
            const groundY = arcadeCanvas.height - 120;
            for (let i = 0; i < 6; i++) {
                arcadeGroundNpcs.push({
                    x: window.innerWidth + i * 350 + Math.random() * 100,
                    y: groundY,
                    width: 70,
                    height: 35,
                    speed: 14 + Math.random() * 6,
                    color: ['#3b82f6', '#10b981', '#fbbf24', '#a855f7'][Math.floor(Math.random() * 4)]
                });
            }

            if (playerCar && playerCar.userData.wheels) {
                playerCar.userData.wheels.forEach(wheel => {
                    wheel.rotation.set(0, 0, 0); 
                    wheel.scale.set(1, 1, 1);
                });
            }

            overlay.style.opacity = '0';
            isTransitioning = false;
        }
    }
    requestAnimationFrame(animateCameraTransition);
}

function rebuildNpcsForLevel() {
    npcCars.forEach(npc => scene.remove(npc));
    npcCars = [];

    const count = currentLevel === 2 ? 40 : 6;
    const spacing = currentLevel === 2 ? 15 : 50;

    for (let i = 0; i < count; i++) {
        spawnObstacleCar(60 + i * spacing);
    }
}

function spawnTruckRamp(zPos) {
    const group = new THREE.Group();
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
    const matRamp = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3 });
    const matWheel = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const cabGeo = new THREE.BoxGeometry(2.0, 1.8, 2.2);
    const cab = new THREE.Mesh(cabGeo, matMetal);
    cab.position.set(0, 0.9, 2.0);
    group.add(cab);

    const rampGeo = new THREE.BoxGeometry(2.4, 0.3, 5.5);
    const ramp = new THREE.Mesh(rampGeo, matRamp);
    ramp.rotation.x = -Math.PI / 11;
    ramp.position.set(0, 0.7, -1.2);
    group.add(ramp);

    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.6, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    [-0.5, -2.8].forEach(wz => {
        const wheels = new THREE.Mesh(wheelGeo, matWheel);
        wheels.position.set(0, 0.35, wz);
        group.add(wheels);
    });

    group.position.set(0, 0, zPos);
    group.userData.box = new THREE.Box3();
    scene.add(group);
    truckRamps.push(group);
}

function buildInfiniteRoad() {
    const roadGeo = new THREE.PlaneGeometry(12, 300);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    
    for (let i = 0; i < 3; i++) {
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, 0, i * 300 - 50);
        scene.add(road);
        roadSegments.push(road);
    }

    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.5 });
    for (let i = 0; i < 20; i++) {
        const h = 20 + Math.random() * 40;
        const bGeo = new THREE.BoxGeometry(8, h, 15);
        
        const bLeft = new THREE.Mesh(bGeo, buildingMat);
        bLeft.position.set(-14, h / 2, i * 40 - 100);
        scene.add(bLeft);

        const bRight = new THREE.Mesh(bGeo, buildingMat);
        bRight.position.set(14, h / 2, i * 40 - 100);
        scene.add(bRight);
    }
}

function spawnObstacleCar(zPos) {
    const colors = [0x3b82f6, 0x60a5fa, 0x2563eb, 0x1d4ed8];
    const npc = createNormalCar(colors[Math.floor(Math.random() * colors.length)]);
    const lanes = [-3.6, -1.2, 1.2, 3.6];
    npc.position.set(lanes[Math.floor(Math.random() * lanes.length)], 0, zPos);
    npc.userData.speed = 0.3 + Math.random() * 0.4;
    scene.add(npc);
    npcCars.push(npc);
}

function onWindowResize() {
    const container = document.getElementById('game-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const isLandscape = window.innerWidth > window.innerHeight;
    const tipEl = document.getElementById('orientation-tip');
    if (tipEl) tipEl.innerText = isLandscape ? "视角: 横屏" : "视角: 竖屏";

    if (camera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    if (arcadeCanvas) {
        arcadeCanvas.width = width;
        arcadeCanvas.height = height;
    }
}

function bindControls() {
    const bind = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        const start = (e) => { e.preventDefault(); keys[key] = true; el.classList.add('active'); };
        const end = (e) => { e.preventDefault(); keys[key] = false; el.classList.remove('active'); };
        el.addEventListener('touchstart', start);
        el.addEventListener('touchend', end);
        el.addEventListener('mousedown', start);
        el.addEventListener('mouseup', end);
    };
    bind('btn-left', 'left');
    bind('btn-right', 'right');
    bind('btn-gas', 'gas');
    bind('btn-brake', 'brake');
    bind('btn-fly-up', 'flyUp');
    bind('btn-fly-down', 'flyDown');

    // 动态创建并插入喇叭按钮（放在左下角方向键旁边）
    let hornBtn = document.getElementById('btn-horn');
    if (!hornBtn) {
        hornBtn = document.createElement('button');
        hornBtn.id = 'btn-horn';
        hornBtn.innerText = '📢 喇叭';
        hornBtn.style.cssText = 'position: fixed; bottom: 20px; left: 160px; z-index: 70; background: rgba(245, 158, 11, 0.2); border: 2px solid #f59e0b; color: #f59e0b; padding: 12px 16px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);';
        
        const controlsDiv = document.querySelector('.controls');
        if (controlsDiv) {
            controlsDiv.appendChild(hornBtn);
        } else {
            document.body.appendChild(hornBtn);
        }
    }

    const triggerHorn = (e) => {
        e.preventDefault();
        playHorn();
        hornBtn.classList.add('active');
        setTimeout(() => hornBtn.classList.remove('active'), 200);
    };
    hornBtn.addEventListener('touchstart', triggerHorn);
    hornBtn.addEventListener('mousedown', triggerHorn);

    const hudEl = document.getElementById('hud');
    if (hudEl) {
        hudEl.style.pointerEvents = "auto";
        hudEl.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastTapTime < 500) {
                tapCount++;
            } else {
                tapCount = 1;
            }
            lastTapTime = now;
            if (tapCount >= 5) {
                tapCount = 0;
                triggerCheat();
            }
        });
    }

    window.addEventListener('keydown', e => {
        if (e.key === 'Enter') triggerCheat();
        if (e.key === 'c' || e.key === 'C') toggleCameraMode();
        if (e.key === 'h' || e.key === 'H' || e.key === ' ') playHorn();
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = true;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
        if (e.key === 'w' || e.key === 'ArrowUp') keys.gas = true;
        if (e.key === 's' || e.key === 'ArrowDown') keys.brake = true;
        if (e.key === 'i') keys.flyUp = true;
        if (e.key === 'k') keys.flyDown = true;
    });
    
    window.addEventListener('keyup', e => {
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = false;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
        if (e.key === 'w' || e.key === 'ArrowUp') keys.gas = false;
        if (e.key === 's' || e.key === 'ArrowDown') keys.brake = false;
        if (e.key === 'i') keys.flyUp = false;
        if (e.key === 'k') keys.flyDown = false;
    });
}

function resetGame() {
    durability = maxDurability;
    totalDistance = 0;
    speed = 0;
    playerX = 0;
    playerY = 0;
    verticalSpeed = 0;
    isGameOver = false;
    isVictory = false;

    resetBGM();
    playBGM();

    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('victory-screen').style.display = 'none';
    const comicBox = document.getElementById('comic-story-box');
    if (comicBox) comicBox.style.opacity = '1';
    const storyText = document.getElementById('story-text');
    if (storyText) storyText.innerText = "高速公路上车流如织，全速向400公里终点冲刺...";

    resetWheelsToNormal();
    ensureViewButton();
    const viewBtn = document.getElementById('btn-switch-view');
    if (viewBtn) viewBtn.style.display = 'block';
    const hornBtn = document.getElementById('btn-horn');
    if (hornBtn) hornBtn.style.display = 'block';

    const flightBtn = document.getElementById('flight-unlock-btn');
    if (flightBtn) flightBtn.style.display = 'none';
    const flightControlsGroup = document.getElementById('flight-controls-group');
    if (flightControlsGroup) flightControlsGroup.style.display = 'none';

    rebuildNpcsForLevel();
    truckRamps.forEach(tr => { tr.position.z = 150; });
}

function animate() {
    requestAnimationFrame(animate);

    if (gameStarted && !isGameOver && !isVictory) {
        if (keys.gas) speed = Math.min(speed + (isFlightUnlocked ? 0.2 : 0.025), currentMaxSpeed);
        else if (keys.brake) speed = Math.max(speed - 0.025, -currentMaxSpeed * 0.3);
        else if (!isFlightUnlocked) speed = Math.max(speed - 0.01, 0);

        totalDistance += speed;
        let currentKm = totalDistance / 100;

        if (currentKm >= 400) {
            isVictory = true;
            pauseBGM();
            document.getElementById('victory-screen').style.display = 'flex';
            const viewBtn = document.getElementById('btn-switch-view');
            if (viewBtn) viewBtn.style.display = 'none';
            const hornBtn = document.getElementById('btn-horn');
            if (hornBtn) hornBtn.style.display = 'none';
            return;
        }

        if (is2DMode) {
            if (keys.left) arcadePlayer.x = Math.max(50, arcadePlayer.x - 7);
            if (keys.right) arcadePlayer.x = Math.min(window.innerWidth - 120, arcadePlayer.x + 7);
            if (keys.flyUp) arcadePlayer.y -= 7;
            if (keys.flyDown) arcadePlayer.y += 7;

            const groundY = arcadeCanvas.height - 120;
            arcadePlayer.y = Math.max(40, Math.min(groundY, arcadePlayer.y));
            backgroundSceneryOffset += 12;

            if (arcadePlayer.y >= groundY) {
                is2DMode = false;
                if (arcadeCanvas) arcadeCanvas.style.display = 'none';
                if (webglCanvas) webglCanvas.style.display = 'block';

                const flightControlsGroup = document.getElementById('flight-controls-group');
                if (flightControlsGroup) flightControlsGroup.style.display = 'none';
                playerY = 0;
                resetWheelsToNormal();
                const flightBtn = document.getElementById('flight-unlock-btn');
                if (flightBtn) flightBtn.style.display = 'block';
                
                const viewBtn = document.getElementById('btn-switch-view');
                if (viewBtn) viewBtn.style.display = 'block';
                const hornBtn = document.getElementById('btn-horn');
                if (hornBtn) hornBtn.style.display = 'block';
            }

            arcadeCtx.clearRect(0, 0, arcadeCanvas.width, arcadeCanvas.height);
            arcadeCtx.fillStyle = 'rgba(56, 189, 248, 0.15)';
            for (let i = 0; i < 8; i++) {
                let bx = (i * 200 - (backgroundSceneryOffset * 0.5) % 1600);
                arcadeCtx.fillRect(bx, groundY - 80, 80, 80);
            }

            arcadeCtx.fillStyle = '#1e293b';
            arcadeCtx.fillRect(0, groundY, arcadeCanvas.width, arcadeCanvas.height - groundY);
            
            arcadeCtx.strokeStyle = '#fbbf24';
            arcadeCtx.lineWidth = 4;
            arcadeCtx.setLineDash([30, 20]);
            arcadeCtx.lineDashOffset = -backgroundSceneryOffset;
            arcadeCtx.beginPath();
            arcadeCtx.moveTo(0, groundY + 30);
            arcadeCtx.lineTo(arcadeCanvas.width, groundY + 30);
            arcadeCtx.stroke();
            arcadeCtx.setLineDash([]);

            arcadeCtx.fillStyle = '#ef4444';
            arcadeCtx.fillRect(arcadePlayer.x, arcadePlayer.y, arcadePlayer.width, arcadePlayer.height);
            arcadeCtx.fillStyle = '#fbbf24';
            arcadeCtx.fillRect(arcadePlayer.x + 12, arcadePlayer.y - 12, 38, 14);
            arcadeCtx.fillStyle = '#38bdf8';
            arcadeCtx.fillRect(arcadePlayer.x - 20, arcadePlayer.y + 6, 20, 16);
            arcadeCtx.fillStyle = '#111';
            arcadeCtx.beginPath();
            arcadeCtx.arc(arcadePlayer.x + 14, arcadePlayer.y + arcadePlayer.height, 6, 0, Math.PI * 2);
            arcadeCtx.arc(arcadePlayer.x + arcadePlayer.width - 14, arcadePlayer.y + arcadePlayer.height, 6, 0, Math.PI * 2);
            arcadeCtx.fill();

            arcadeGroundNpcs.forEach(npc => {
                npc.x -= npc.speed; 
                if (npc.x < -120) {
                    npc.x = window.innerWidth + 150 + Math.random() * 100;
                    npc.speed = 13 + Math.random() * 6;
                }
                arcadeCtx.fillStyle = npc.color;
                arcadeCtx.fillRect(npc.x, npc.y + 5, npc.width, npc.height - 5);
                arcadeCtx.fillStyle = '#334155';
                arcadeCtx.fillRect(npc.x + 15, npc.y - 8, npc.width - 30, 14);
                arcadeCtx.fillStyle = '#111';
                arcadeCtx.beginPath();
                arcadeCtx.arc(npc.x + 14, npc.y + npc.height, 6, 0, Math.PI * 2);
                arcadeCtx.arc(npc.x + npc.width - 14, npc.y + npc.height, 6, 0, Math.PI * 2);
                arcadeCtx.fill();

                if (Math.abs(arcadePlayer.x - npc.x) < 55 && Math.abs(arcadePlayer.y - npc.y) < 30) {
                    durability = Math.max(0, durability - 1);
                    npc.x = window.innerWidth + 200 + Math.random() * 300; 
                    if (durability <= 0) {
                        isGameOver = true;
                        pauseBGM();
                        document.getElementById('game-over-screen').style.display = 'flex';
                        const viewBtn = document.getElementById('btn-switch-view');
                        if (viewBtn) viewBtn.style.display = 'none';
                        const hornBtn = document.getElementById('btn-horn');
                        if (hornBtn) hornBtn.style.display = 'none';
                    }
                }
            });

        } else {
            if (keys.left) playerX += 0.12;
            if (keys.right) playerX -= 0.12;
            playerX = Math.max(-5.0, Math.min(5.0, playerX));

            if (currentLevel === 2 && currentKm >= 10 && !isFlightUnlocked) {
                const unlockBtn = document.getElementById('flight-unlock-btn');
                if (unlockBtn && unlockBtn.style.display !== 'block') {
                    unlockBtn.style.display = 'block';
                }
            }

            if (playerY > 0 || verticalSpeed !== 0) {
                playerY += verticalSpeed;
                verticalSpeed -= 0.025;
                if (playerY <= 0) {
                    playerY = 0;
                    verticalSpeed = 0;
                }
            }

            playerCar.position.set(playerX, playerY, totalDistance);
            playerCar.userData.box.setFromObject(playerCar);

            if (!isTransitioning) {
                if (cameraMode === 'first') {
                    camera.position.set(playerX, 2.0 + playerY, totalDistance + 2.2);
                    camera.lookAt(playerX, 1.8 + playerY, totalDistance + 25);

                    if (steeringWheelMesh) {
                        let targetWheelZ = 0;
                        if (keys.left) targetWheelZ = 0.7;
                        if (keys.right) targetWheelZ = -0.7;
                        steeringWheelMesh.rotation.z += (targetWheelZ - steeringWheelMesh.rotation.z) * 0.15;
                    }

                    if (gasPedalMesh) {
                        gasPedalMesh.rotation.x = keys.gas ? 0.4 : 0.2;
                    }
                    if (brakePedalMesh) {
                        brakePedalMesh.rotation.x = keys.brake ? 0.4 : 0.2;
                    }

                } else {
                    const isLandscape = window.innerWidth > window.innerHeight;
                    const camHeight = (isLandscape ? 5.8 : 6.8) + playerY * 0.5;
                    const camDist = isLandscape ? 8.5 : 9.8;
                    camera.position.set(playerX * 0.4, camHeight, totalDistance - camDist);
                    camera.lookAt(playerX * 0.2, 1.2 + playerY * 0.5, totalDistance + 8);
                }
            }

            roadSegments.forEach(road => {
                if (road.position.z + 150 < totalDistance) {
                    road.position.z += 900;
                }
            });

            if (currentLevel === 1) {
                truckRamps.forEach(tr => {
                    tr.userData.box.setFromObject(tr);
                    if (playerCar.userData.box.intersectsBox(tr.userData.box) && playerY === 0) {
                        if (speed > 0.35) verticalSpeed = 0.5; 
                    }
                    if (tr.position.z < totalDistance - 30) {
                        tr.position.z = totalDistance + 450;
                    }
                });
            }

            npcCars.forEach(npc => {
                if (currentLevel === 2 && currentKm >= 10 && currentKm <= 100) {
                    npc.userData.speed = speed * 0.90;
                }

                npc.position.z += npc.userData.speed;
                npc.userData.box.setFromObject(npc);

                if (playerCar.userData.box.intersectsBox(npc.userData.box) && playerY < 0.3) {
                    durability = Math.max(0, durability - 1);
                    speed *= 0.8; 

                    let nextSpawnDist = (currentLevel === 2 && currentKm >= 10 && currentKm <= 100) ? 12 + Math.random() * 8 : 180 + Math.random() * 80;
                    npc.position.z = totalDistance + nextSpawnDist;
                    const lanes = [-3.6, -1.2, 1.2, 3.6];
                    npc.position.x = lanes[Math.floor(Math.random() * lanes.length)];

                    if (durability <= 0) {
                        isGameOver = true;
                        pauseBGM();
                        document.getElementById('game-over-screen').style.display = 'flex';
                        const viewBtn = document.getElementById('btn-switch-view');
                        if (viewBtn) viewBtn.style.display = 'none';
                        const hornBtn = document.getElementById('btn-horn');
                        if (hornBtn) hornBtn.style.display = 'none';
                    }
                }

                if (npc.position.z < totalDistance - 30) {
                    let nextSpawnDist = (currentLevel === 2 && currentKm >= 10 && currentKm <= 100) ? 12 + Math.random() * 8 : 180 + Math.random() * 80;
                    npc.position.z = totalDistance + nextSpawnDist;
                    const lanes = [-3.6, -1.2, 1.2, 3.6];
                    npc.position.x = lanes[Math.floor(Math.random() * lanes.length)];
                }
            });

            if (scene && camera && webglCanvas.style.display !== 'none') {
                renderer.render(scene, camera);
            }
        }

        let currentDisplaySpeed = Math.floor((speed / currentMaxSpeed) * baseMaxSpeedKmMin);
        const speedValEl = document.getElementById('speed-val');
        if (speedValEl) speedValEl.innerText = currentDisplaySpeed;
        const distValEl = document.getElementById('dist-val');
        if (distValEl) distValEl.innerText = currentKm.toFixed(1);
        const hpValEl = document.getElementById('hp-val');
        if (hpValEl) hpValEl.innerText = durability;
    }
}
