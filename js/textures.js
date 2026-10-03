"use strict";

/* =========================================================
   Главный модуль: сцена, рендер, ввод, ломание/установка
   ========================================================= */

let scene, camera, renderer;
let chunkHighlight;

const RDIST = 5; // радиус прорисовки чанков

// ---------- Хотбар ----------
const ALL_BLOCKS = [GRASS, DIRT, STONE, COBBLE, LOG, LEAVES, SAND, PLANKS, WATER, GLASS, GRAVEL, BEDROCK];
const hotbar = [GRASS, DIRT, STONE, COBBLE, LOG, PLANKS, SAND, GLASS, LEAVES];
let selected = 0;

const hotbarEl = document.getElementById('hotbar');

// Мини-иконка блока из атласа
function makeIconCanvas(blockType) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const d = BLOCK_DEF[blockType];
  const topKey  = d.all !== undefined ? d.all : d.top;
  const sideKey = d.all !== undefined ? d.all : d.side;
  const topIdx  = TILE_INDEX[topKey];
  const sideIdx = TILE_INDEX[sideKey];
  const tsx = (sideIdx % ATLAS_COLS) * TILE_PX;
  const tsy = Math.floor(sideIdx / ATLAS_COLS) * TILE_PX;
  const ttx = (topIdx  % ATLAS_COLS) * TILE_PX;
  const tty = Math.floor(topIdx  / ATLAS_COLS) * TILE_PX;
  // боковая грань как основа
  ctx.drawImage(atlasCanvas, tsx, tsy, 16, 16, 0, 0, 16, 16);
  // верхняя — полупрозрачно
  ctx.globalAlpha = 0.55;
  ctx.drawImage(atlasCanvas, ttx, tty, 16, 16, 0, 0, 16, 16);
  ctx.globalAlpha = 1;
  return c;
}

function buildHotbar() {
  hotbarEl.innerHTML = '';
  hotbar.forEach((bt, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === selected ? ' active' : '');
    const num = document.createElement('span');
    num.className = 'num'; num.textContent = i + 1;
    slot.appendChild(num);
    const icon = makeIconCanvas(bt);
    const url = icon.toDataURL();
    const img = document.createElement('img');
    img.src = url;
    slot.appendChild(img);
    slot.addEventListener('click', () => selectSlot(i));
    hotbarEl.appendChild(slot);
  });
}
function selectSlot(i) {
  selected = i;
  document.querySelectorAll('.slot').forEach((s, k) =>
    s.classList.toggle('active', k === i));
}

// ---------- Ввод ----------
const keys = {};
let pointerLocked = false;
const overlay = document.getElementById('overlay');
const canvas  = document.getElementById('game');

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) overlay.classList.add('hidden');
  else overlay.classList.remove('hidden');
});

overlay.addEventListener('click', () => canvas.requestPointerLock());
canvas.addEventListener('click', () => {
  if (!pointerLocked) canvas.requestPointerLock();
});

document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  const sens = 0.0022;
  player.yaw   -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  const lim = Math.PI/2 - 0.001;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
});

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code >= 'Digit1' && e.code <= 'Digit9') {
    const n = parseInt(e.code.slice(5), 10) - 1;
    if (n < hotbar.length) selectSlot(n);
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

addEventListener('wheel', e => {
  if (!pointerLocked) return;
  const dir = Math.sign(e.deltaY);
  const n = (selected + dir + hotbar.length) % hotbar.length;
  selectSlot(n);
}, { passive: true });

// ---------- Райкаст ----------
const raycaster = new THREE.Raycaster();
raycaster.far = 6;

function raycastBlock() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  raycaster.set(camera.position.clone(), dir);
  const hits = raycaster.intersectObjects(scene.children, false);
  for (const h of hits) {
    if (h.object === chunkHighlight) continue;
    if (!h.object.geometry) continue;
    if (!h.face) continue;
    const p = h.point.clone().addScaledVector(h.face.normal, -0.5);
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const b = getBlock(bx, by, bz);
    if (b === AIR || b === WATER) continue;
    return {
      x: bx, y: by, z: bz,
      nx: h.face.normal.x, ny: h.face.normal.y, nz: h.face.normal.z,
      block: b
    };
  }
  return null;
}

canvas.addEventListener('mousedown', e => {
  if (!pointerLocked) return;
  const hit = raycastBlock();
  if (!hit) return;
  if (e.button === 0) {
    if (hit.block === BEDROCK) return;
    setBlock(hit.x, hit.y, hit.z, AIR);
  } else if (e.button === 2) {
    const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
    const cur = getBlock(tx, ty, tz);
    if (cur !== AIR && cur !== WATER) return;
    // запрет поставить блок внутрь себя
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    const minX = px - player.radius, maxX = px + player.radius;
    const minY = py,                maxY = py + player.height;
    const minZ = pz - player.radius, maxZ = pz + player.radius;
    if (tx+1 > minX && tx < maxX && ty+1 > minY && ty < maxY && tz+1 > minZ && tz < maxZ) return;
    setBlock(tx, ty, tz, hotbar[selected]);
  }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Физика игрока ----------
let walkPhase = 0;

function updatePhysics(dt) {
  const px = Math.floor(player.pos.x);
  const pz = Math.floor(player.pos.z);
  player.inWater = getBlock(px, Math.floor(player.pos.y + 0.1), pz) === WATER ||
                   getBlock(px, Math.floor(player.pos.y + 1.4), pz) === WATER;

  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right   = new THREE.Vector3( Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  let mx = 0, mz = 0;
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyD']) mx += 1;
  if (keys['KeyA']) mx -= 1;

  player.sneak = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
  player.run   = (!!keys['ControlLeft'] || !!keys['ControlRight']) && !player.sneak;

  const wish = new THREE.Vector3();
  wish.addScaledVector(forward, mz);
  wish.addScaledVector(right, mx);
  if (wish.lengthSq() > 0) wish.normalize();

  let speed = 4.3;
  if (player.run)     speed = 6.5;
  if (player.sneak)   speed = 2.0;
  if (player.inWater) speed *= 0.55;

  const accel = player.onGround ? 30 : 6;
  player.vel.x += (wish.x * speed - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (wish.z * speed - player.vel.z) * Math.min(1, accel * dt);

  if (wish.lengthSq() === 0 && player.onGround) {
    const f = Math.pow(0.001, dt);
    player.vel.x *= f;
    player.vel.z *= f;
  }

  if (player.inWater) {
    player.vel.y -= 9 * dt;
    if (player.vel.y < -3) player.vel.y = -3;
    if (keys['Space']) player.vel.y = 3.2;
    player.vel.x *= Math.pow(0.4, dt);
    player.vel.z *= Math.pow(0.4, dt);
  } else {
    player.vel.y -= 28 * dt;
    if (player.vel.y < -60) player.vel.y = -60;
    if (keys['Space'] && player.onGround) {
      player.vel.y = 8.7;
      player.onGround = false;
    }
  }

  if (moveAxis(player.pos, 'x', player.vel.x * dt, player.radius, player.height)) player.vel.x = 0;
  if (moveAxis(player.pos, 'z', player.vel.z * dt, player.radius, player.height)) player.vel.z = 0;
  const hitY = moveAxis(player.pos, 'y', player.vel.y * dt, player.radius, player.height);
  if (hitY) {
    if (player.vel.y < 0) player.onGround = true;
    player.vel.y = 0;
  } else {
    player.onGround = false;
  }

  if (player.pos.y < -20) {
    player.pos.set(8.5, findSpawn(8, 8), 8.5);
    player.vel.set(0, 0, 0);
  }

  const eyeY = player.pos.y + player.eye - (player.sneak ? 0.18 : 0);
  camera.position.set(player.pos.x, eyeY, player.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  const hspeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && hspeed > 0.5) {
    walkPhase += dt * hspeed * 1.6;
    camera.position.y += Math.sin(walkPhase * 2) * 0.035;
    camera.rotation.z = Math.sin(walkPhase) * 0.012;
  } else {
    camera.rotation.z *= 0.9;
  }
}

// ---------- Загрузка чанков вокруг игрока ----------
function updateChunks() {
  const pcx = Math.floor(player.pos.x / CHUNK);
  const pcz = Math.floor(player.pos.z / CHUNK);

  const need = [];
  for (let dx = -RDIST; dx <= RDIST; dx++)
    for (let dz = -RDIST; dz <= RDIST; dz++) {
      if (dx*dx + dz*dz > RDIST*RDIST + RDIST) continue;
      need.push([pcx+dx, pcz+dz]);
    }
  need.sort((a,b) => {
    const da = (a[0]-pcx)**2 + (a[1]-pcz)**2;
    const db = (b[0]-pcx)**2 + (b[1]-pcz)**2;
    return da - db;
  });

  let built = 0;
  for (const [cx, cz] of need) {
    const c = getChunk(cx, cz, true);
    if (!c.built) {
      rebuildChunkMesh(c);
      built++;
      if (built >= 2) break; // не больше 2 чанков за кадр — чтобы не лагало
    }
  }

  // Удаляем далёкие
  const maxD = (RDIST + 2) * (RDIST + 2);
  for (const [k, c] of chunks) {
    const dx = c.cx - pcx, dz = c.cz - pcz;
    if (dx*dx + dz*dz > maxD) {
      if (c.mesh)      { scene.remove(c.mesh);      c.mesh.geometry.dispose(); }
      if (c.waterMesh) { scene.remove(c.waterMesh); c.waterMesh.geometry.dispose(); }
      chunks.delete(k);
    }
  }
}

// ---------- HUD ----------
const hud = document.getElementById('hud');
let fpsAcc = 0, fpsN = 0, fpsTimer = 0, fpsShow = 0;

function updateHUD(dt) {
  fpsAcc += 1/Math.max(dt, 0.0001); fpsN++;
  fpsTimer += dt;
  if (fpsTimer > 0.4) {
    fpsShow = Math.round(fpsAcc / fpsN);
    fpsAcc = 0; fpsN = 0; fpsTimer = 0;
  }
  const bname = BLOCK_DEF[hotbar[selected]].name;
  hud.textContent =
    `XYZ: ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)}\n` +
    `Чанков: ${chunks.size}   FPS: ${fpsShow}\n` +
    `Блок: ${bname}  ${player.inWater ? '[в воде]' : ''}${player.onGround ? '' : ' [в воздухе]'}`;
}

// ---------- Инициализация ----------
async function init() {
  const loadingEl = document.getElementById('loading');
  const loadingText = document.getElementById('loadingText');
  const loadingSub  = document.getElementById('loadingSub');

  // 1. Загрузка текстур
  loadingText.textContent = 'Загрузка текстур...';
  const texResult = await loadAllTextures();
  if (texResult.missing.length) {
    loadingSub.textContent =
      `Не найдено ${texResult.missing.length} файлов. Смотри консоль (F12).`;
  } else {
    loadingSub.textContent = 'Все текстуры загружены';
  }
  await new Promise(r => setTimeout(r, 400));

  // 2. Сцена
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, CHUNK*RDIST*0.55, CHUNK*RDIST*0.95);

  camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 500);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x87ceeb);

  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(60, 140, 40);
  scene.add(sun);

  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Подсветка блока под прицелом
  const hlGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  const hlEdges = new THREE.EdgesGeometry(hlGeo);
  chunkHighlight = new THREE.LineSegments(
    hlEdges, new THREE.LineBasicMaterial({ color: 0x000000 })
  );
  chunkHighlight.visible = false;
  scene.add(chunkHighlight);

  // 3. Спавн-чанки
  loadingText.textContent = 'Генерация мира...';
  getChunk(0, 0, true);
  getChunk(-1, 0, true);
  getChunk(0, -1, true);
  getChunk(-1, -1, true);
  rebuildChunkMesh(getChunk(0, 0));

  player.pos.set(8.5, findSpawn(8, 8), 8.5);

  // 4. Первичная загрузка чанков
  for (let i = 0; i < 12; i++) updateChunks();

  // 5. Хотбар
  buildHotbar();
  selectSlot(0);

  // 6. Спрятать загрузку, показать overlay
  loadingEl.classList.add('hidden');
  overlay.classList.remove('hidden');

  // 7. Главный цикл
  let last = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;

    updateChunks();

    if (pointerLocked) {
      updatePhysics(dt);
    } else {
      camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;
    }

    const hit = pointerLocked ? raycastBlock() : null;
    if (hit) {
      chunkHighlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      chunkHighlight.visible = true;
    } else {
      chunkHighlight.visible = false;
    }

    updateHUD(dt);
    renderer.render(scene, camera);
  }
  loop();
}

init();