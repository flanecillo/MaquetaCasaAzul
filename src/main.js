import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";

// ─────────────────────────────────────────────
// URL del Gaussian — cambia esto a tu ruta real
// ─────────────────────────────────────────────
const GARDEN_URL = "https://casa-azul-zeta.vercel.app/";

// ─────────────────────────────────────────────
// Distancia para mostrar el botón "Visitar Jardín"
// ─────────────────────────────────────────────
const PROXIMITY_THRESHOLD = 20.0;

// ─────────────────────────────────────────────
// Modo debug
// true  = muestra esferas movibles
// false = oculta debug para versión final
// ─────────────────────────────────────────────
const DEBUG_ENTRY_POINTS = true;

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="loading-screen" id="loadingScreen">
    <div class="loading-box">
      <p class="loading-title">Cargando maqueta</p>
      <div class="loading-bar-bg">
        <div class="loading-bar" id="loadingBar"></div>
      </div>
      <div class="loading-percent" id="loadingPercent">0%</div>
    </div>
  </div>

  <aside class="ui-panel">
    <h1>Casa Azul</h1>
    <p>
      Demo base para visualizar una maqueta 3D en web.
      Esta versión está pensada como punto de partida.
    </p>
    <div class="ui-help">
      <div><strong>Mouse:</strong> clic izquierdo rota</div>
      <div><strong>Mouse:</strong> clic derecho mueve</div>
      <div><strong>Rueda:</strong> zoom</div>
      <br />
      <div><strong>Móvil:</strong> activa el giroscopio para controlar la cámara inclinando el teléfono.</div>
      <br />
      <div><strong>Debug:</strong> mueve la esfera verde y roja para obtener coordenadas.</div>
    </div>
  </aside>

  <button class="visit-btn" id="visitBtn">Visitar Interior</button>

  <div class="fade-overlay" id="fadeOverlay"></div>
`;

// ─────────────────────────────────────────────
// Referencias UI
// ─────────────────────────────────────────────
const loadingScreen = document.getElementById("loadingScreen");
const loadingBar = document.getElementById("loadingBar");
const loadingPercent = document.getElementById("loadingPercent");
const visitBtn = document.getElementById("visitBtn");
const fadeOverlay = document.getElementById("fadeOverlay");

// ─────────────────────────────────────────────
// Escena
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// ─────────────────────────────────────────────
// Cámara
// ─────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(6, 5, 8);
scene.add(camera);

// ─────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.classList.add("webgl");
app.appendChild(renderer.domElement);

// ─────────────────────────────────────────────
// Controles
// ─────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.8, 0);
controls.minDistance = 1.5;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.48;

// ─────────────────────────────────────────────
// Luces
// ─────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.6);
directionalLight.position.set(8, 12, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -15;
directionalLight.shadow.camera.right = 15;
directionalLight.shadow.camera.top = 15;
directionalLight.shadow.camera.bottom = -15;
scene.add(directionalLight);

// ─────────────────────────────────────────────
// Piso y grid
// ─────────────────────────────────────────────
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ opacity: 0.22 }),
);
floor.rotation.x = -Math.PI * 0.5;
floor.position.y = -0.001;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(80, 80, 0x666666, 0x333333);
grid.material.opacity = 0.18;
grid.material.transparent = true;
scene.add(grid);

// ─────────────────────────────────────────────
// Grupo del modelo
// ─────────────────────────────────────────────
const modelGroup = new THREE.Group();
scene.add(modelGroup);

let loadedModel = null;

// ─────────────────────────────────────────────
// Puntos de entrada
//
// Verde: punto hacia donde mira la cámara.
// Rojo: punto hacia donde se mueve la cámara.
//
// Estos valores están en coordenadas locales del modelo.
// Con el debug activado, mueve las esferas y copia los
// valores que aparecen en consola.
// ─────────────────────────────────────────────
const WIN_LOCAL_EXT = new THREE.Vector3(0, 4.77, 2);
const WIN_LOCAL_INT = new THREE.Vector3(3, 4.77, 2);

const windowExteriorWorld = new THREE.Vector3();
const windowInteriorWorld = new THREE.Vector3();

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────
function centerAndFitModel(object3D) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  object3D.position.x -= center.x;
  object3D.position.y -= box.min.y;
  object3D.position.z -= center.z;

  const maxDim = Math.max(size.x, size.y, size.z);
  const fitDistance = maxDim * 1.8;

  camera.position.set(fitDistance * 0.9, fitDistance * 0.7, fitDistance);
  camera.near = Math.max(0.1, maxDim / 100);
  camera.far = Math.max(1000, maxDim * 20);
  camera.updateProjectionMatrix();

  controls.target.set(0, size.y * 0.35, 0);
  controls.minDistance = Math.max(1, maxDim * 0.25);
  controls.maxDistance = Math.max(20, maxDim * 8);
  controls.update();

  directionalLight.position.set(maxDim * 1.2, maxDim * 1.6, maxDim * 1.2);
}

function enableShadows(object3D) {
  object3D.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) child.material.needsUpdate = true;
    }
  });
}

// ─────────────────────────────────────────────
// Debug spheres
// ─────────────────────────────────────────────
function createDebugSphere(name, color, localPosition, model) {
  const geometry = new THREE.SphereGeometry(0.12, 24, 24);
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
  });

  const sphere = new THREE.Mesh(geometry, material);
  sphere.name = name;
  sphere.position.copy(localPosition);
  sphere.renderOrder = 999;

  model.add(sphere);

  const transform = new TransformControls(camera, renderer.domElement);
  transform.attach(sphere);
  transform.setMode("translate");
  transform.setSize(0.65);

  scene.add(transform);

  transform.addEventListener("dragging-changed", (event) => {
    controls.enabled = !event.value;
  });

  transform.addEventListener("objectChange", () => {
    console.log(
      `${name}: new THREE.Vector3(${sphere.position.x.toFixed(3)}, ${sphere.position.y.toFixed(3)}, ${sphere.position.z.toFixed(3)})`,
    );
  });

  return { sphere, transform };
}

function updateEntryWorldPositions(model) {
  const tempObj = new THREE.Object3D();
  model.add(tempObj);

  tempObj.position.copy(WIN_LOCAL_EXT);
  tempObj.updateWorldMatrix(true, false);
  tempObj.getWorldPosition(windowExteriorWorld);

  tempObj.position.copy(WIN_LOCAL_INT);
  tempObj.updateWorldMatrix(true, false);
  tempObj.getWorldPosition(windowInteriorWorld);

  model.remove(tempObj);
}

// ─────────────────────────────────────────────
// Loader GLB
// ─────────────────────────────────────────────
const gltfLoader = new GLTFLoader();

gltfLoader.load(
  "/models/CasaAzulOpt.glb",
  (gltf) => {
    const model = gltf.scene;
    loadedModel = model;

    enableShadows(model);
    modelGroup.add(model);
    centerAndFitModel(model);

    // Calcular posiciones mundo para la animación
    updateEntryWorldPositions(model);

    // Crear esferas de debug
    if (DEBUG_ENTRY_POINTS) {
      createDebugSphere(
        "ENTRY_LOOK_POINT_VERDE",
        0x00ff00,
        WIN_LOCAL_EXT,
        model,
      );

      createDebugSphere(
        "ENTRY_CAMERA_POINT_ROJO",
        0xff0000,
        WIN_LOCAL_INT,
        model,
      );

      console.log("Debug activado:");
      console.log(
        "Mueve las esferas verde y roja. Copia los valores que aparecen aquí en consola.",
      );
      console.log("Verde = WIN_LOCAL_EXT / punto hacia donde mira la cámara.");
      console.log("Rojo = WIN_LOCAL_INT / punto hacia donde se mueve la cámara.");
    }

    // ── Loading done ──────────────────────────
    loadingBar.style.width = "100%";
    loadingPercent.textContent = "100%";
    setTimeout(() => loadingScreen.classList.add("hidden"), 300);
  },
  (event) => {
    if (event.total) {
      const progress = Math.round((event.loaded / event.total) * 100);
      loadingBar.style.width = `${progress}%`;
      loadingPercent.textContent = `${progress}%`;
    }
  },
  (error) => {
    console.error("Error al cargar el modelo:", error);
    loadingPercent.textContent = "Error al cargar el modelo";
  },
);

// ─────────────────────────────────────────────
// Estado de animación
// ─────────────────────────────────────────────
let isAnimating = false;

// ─────────────────────────────────────────────
// Transición al jardín
// ─────────────────────────────────────────────
function flyToGarden() {
  if (isAnimating) return;
  isAnimating = true;

  visitBtn.classList.remove("visible");

  const currentLook = new THREE.Vector3();
  camera.getWorldDirection(currentLook);
  currentLook.multiplyScalar(5).add(camera.position);

  const lookProxy = {
    x: currentLook.x,
    y: currentLook.y,
    z: currentLook.z,
  };

  const tl = gsap.timeline();

  // ── Fase 0: rotar para apuntar al punto VERDE ──
  tl.to(
    lookProxy,
    {
      x: windowExteriorWorld.x,
      y: windowExteriorWorld.y,
      z: windowExteriorWorld.z,
      duration: 1.4,
      ease: "power2.inOut",
    },
    0,
  );

  // ── Fase 1: mover al punto ROJO mirando al VERDE ──
  tl.to(
    camera.position,
    {
      x: windowInteriorWorld.x,
      y: windowInteriorWorld.y,
      z: windowInteriorWorld.z,
      duration: 2.0,
      ease: "power2.inOut",
      onUpdate: () => camera.lookAt(lookProxy.x, lookProxy.y, lookProxy.z),
    },
    0.3,
  );

  // ── Fase 2: fade out ──
  tl.to(
    fadeOverlay,
    {
      opacity: 1,
      duration: 0.5,
      ease: "power1.in",
      onComplete: () => (window.location.href = GARDEN_URL),
    },
    "-=0.25",
  );
}

visitBtn.addEventListener("click", flyToGarden);

// ─────────────────────────────────────────────
// Resize
// ─────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ─────────────────────────────────────────────
// Giroscopio (móvil) — sin gimbal lock, toggle on/off
// ─────────────────────────────────────────────
let gyroEnabled = false;
let gyroReady   = false;
const GYRO_LERP = 0.06;

// Quaternion corregido del sensor (actualizado cada frame por el listener)
const _rawSensorQuat = new THREE.Quaternion();
// Quaternion objetivo que se aplica a la cámara en tick()
const _targetQuat    = new THREE.Quaternion();

// Offset de calibración — se aplica a la IZQUIERDA del sensor quat:
//   Al calibrar : _calibOffset = camera.quaternion * rawSensorQuat⁻¹
//   En tick()   : targetQuat   = _calibOffset * rawSensorQuat
//
// Multiplicar a la izquierda cancela el yaw absoluto (azimuth) del sensor,
// que vive en espacio-mundo. A la derecha solo compensa pitch/roll local,
// lo que causaba que el teléfono girase como manecilla de reloj.
const _calibOffset = new THREE.Quaternion();

// Corrección de ejes: lleva el "frente" del sensor al -Z de Three.js
const _axisCorrection = new THREE.Quaternion();
_axisCorrection.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// Offset portrait: ajusta la inclinación natural del teléfono al leer
const _portraitOffset = new THREE.Quaternion();
_portraitOffset.setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  THREE.MathUtils.degToRad(20), // ajusta si la cámara apunta muy arriba/abajo
);

// Convierte el quaternion crudo del sensor al espacio de Three.js
function buildCorrectedQuat(raw) {
  _rawSensorQuat.copy(_axisCorrection).multiply(raw).multiply(_portraitOffset);
}

// ── Calibrar al activar ──────────────────────────────────────
function calibrate() {
  // _calibOffset = camera.quaternion * rawSensorQuat⁻¹
  _calibOffset.copy(_rawSensorQuat).invert().premultiply(camera.quaternion);
  _targetQuat.copy(camera.quaternion);
}

// ── Estrategia 1: AbsoluteOrientationSensor (Android Chrome) ─
function startAbsoluteOrientationSensor() {
  try {
    // "device": quaternion en espacio del dispositivo físico
    const sensor = new AbsoluteOrientationSensor({ frequency: 60, referenceFrame: "device" });
    const _q = new THREE.Quaternion();

    sensor.addEventListener("reading", () => {
      _q.set(sensor.quaternion[0], sensor.quaternion[1], sensor.quaternion[2], sensor.quaternion[3]);
      buildCorrectedQuat(_q);
      if (gyroEnabled) {
        // offset a la izquierda: _calibOffset * rawSensorQuat
        _targetQuat.copy(_calibOffset).multiply(_rawSensorQuat);
      }
    });

    sensor.addEventListener("error", (e) => {
      console.warn("AbsoluteOrientationSensor error, usando fallback:", e);
      startDeviceOrientationFallback();
    });

    sensor.start();
    return true;
  } catch {
    return false;
  }
}

// ── Estrategia 2: deviceorientation (fallback iOS / Firefox) ─
function startDeviceOrientationFallback() {
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();

  window.addEventListener("deviceorientation", (e) => {
    const alpha = THREE.MathUtils.degToRad(e.alpha ?? 0);
    const beta  = THREE.MathUtils.degToRad(e.beta  ?? 0);
    const gamma = THREE.MathUtils.degToRad(e.gamma ?? 0);

    _m.makeRotationFromEuler(new THREE.Euler(beta, alpha, -gamma, "ZXY"));
    _q.setFromRotationMatrix(_m);
    buildCorrectedQuat(_q);
    if (gyroEnabled) {
      _targetQuat.copy(_calibOffset).multiply(_rawSensorQuat);
    }
  });
}


// ── Inicializar sensor (solo una vez, la primera vez que el usuario activa) ──
async function initSensor() {
  if (gyroReady) return true;

  if (typeof DeviceOrientationEvent?.requestPermission === "function") {
    const result = await DeviceOrientationEvent.requestPermission();
    if (result !== "granted") return false;
  }

  const hasSensorAPI = typeof AbsoluteOrientationSensor !== "undefined";
  if (hasSensorAPI) {
    try {
      await Promise.all([
        navigator.permissions.query({ name: "accelerometer" }),
        navigator.permissions.query({ name: "gyroscope" }),
        navigator.permissions.query({ name: "magnetometer" }),
      ]);
      startAbsoluteOrientationSensor();
    } catch {
      startDeviceOrientationFallback();
    }
  } else {
    startDeviceOrientationFallback();
  }

  gyroReady = true;
  return true;
}

// ── Activar / desactivar gyro ────────────────────────────────
const _savedTarget = new THREE.Vector3(); // target de órbita guardado al activar

function enableGyro() {
  // Guardar el target actual antes de ceder el control
  _savedTarget.copy(controls.target);
  calibrate();
  gyroEnabled = true;
  controls.enabled = false;
}

function disableGyro() {
  gyroEnabled = false;

  // Calcular el quaternion que miraría de vuelta al target guardado
  const _lookAtQuat = new THREE.Quaternion();
  const _lookAtM    = new THREE.Matrix4();
  _lookAtM.lookAt(camera.position, _savedTarget, camera.up);
  _lookAtQuat.setFromRotationMatrix(_lookAtM);

  // Animar suavemente la rotación de la cámara hacia el target guardado
  const rotProxy = { t: 0 };
  const fromQuat = camera.quaternion.clone();

  gsap.to(rotProxy, {
    t: 1,
    duration: 0.6,
    ease: "power2.out",
    onUpdate() {
      camera.quaternion.slerpQuaternions(fromQuat, _lookAtQuat, rotProxy.t);
    },
    onComplete() {
      // Restaurar el target exacto y entregar el control a OrbitControls
      controls.target.copy(_savedTarget);
      controls.enabled = true;
      controls.update();
    },
  });
}

// ── Botón toggle (solo visible en móvil) ─────────────────────
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
let gyroBtn = null;

if (isMobile) {
  gyroBtn = document.createElement("button");
  gyroBtn.id = "gyroBtn";
  gyroBtn.className = "visit-btn visible";
  gyroBtn.style.cssText = `
    top: auto;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    opacity: 1;
    pointer-events: all;
  `;

  function updateGyroBtnState() {
    gyroBtn.textContent = gyroEnabled ? "⏹ Desactivar giroscopio" : "🌀 Activar giroscopio";
    gyroBtn.style.background = gyroEnabled
      ? "rgba(6, 164, 178, 0.35)"
      : "rgba(6, 164, 178, 0.15)";
    gyroBtn.style.boxShadow = gyroEnabled
      ? "0 0 20px rgba(6, 164, 178, 0.4)"
      : "none";
  }

  updateGyroBtnState();
  app.appendChild(gyroBtn);

  gyroBtn.addEventListener("click", async () => {
    if (!gyroReady) {
      const ok = await initSensor();
      if (!ok) {
        gyroBtn.textContent = "⚠ Permiso denegado";
        return;
      }
      // Pequeña espera para que el sensor emita al menos un frame antes de calibrar
      await new Promise((r) => setTimeout(r, 150));
    }

    if (gyroEnabled) {
      disableGyro();
    } else {
      enableGyro();
    }
    updateGyroBtnState();
  });
}

// ─────────────────────────────────────────────
// Animación principal
// ─────────────────────────────────────────────
const clock = new THREE.Clock();
let btnVisible = false;

function tick() {
  const elapsedTime = clock.getElapsedTime();

  directionalLight.position.x += Math.sin(elapsedTime * 0.2) * 0.002;

  // Controls solo cuando no estamos animando
  if (!isAnimating) controls.update();

  // ── Detección de proximidad + posición flotante ──
  if (!isAnimating && windowInteriorWorld.lengthSq() > 0) {
    const dist = camera.position.distanceTo(windowInteriorWorld);
    const shouldShow = dist < PROXIMITY_THRESHOLD;

    if (shouldShow !== btnVisible) {
      btnVisible = shouldShow;
      visitBtn.classList.toggle("visible", shouldShow);
    }

    if (btnVisible) {
      const projected = windowInteriorWorld.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      visitBtn.style.left = `${x}px`;
      visitBtn.style.top = `${y}px`;
    }
  }

  // ── Giroscopio ──
  if (gyroEnabled && !isAnimating) {
    camera.quaternion.slerp(_targetQuat, GYRO_LERP);
  }

  renderer.render(scene, camera);
  window.requestAnimationFrame(tick);
}

tick();
