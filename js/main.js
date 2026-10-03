"use strict";

/* =========================================================
   Загрузчик текстур Minecraft 1.21.11
   Пути:  textures/block/*.png  и  textures/item/*.png
   ========================================================= */

// Список текстур блоков, которые использует движок на этом этапе.
// Ключ — внутреннее имя, значение — путь к PNG-файлу.
const BLOCK_TEXTURES = {
  grass_top:   'textures/block/grass_block_top.png',
  grass_side:  'textures/block/grass_block_side.png',
  dirt:        'textures/block/dirt.png',
  stone:       'textures/block/stone.png',
  cobble:      'textures/block/cobblestone.png',
  log_side:    'textures/block/oak_log.png',
  log_top:     'textures/block/oak_log_top.png',
  leaves:      'textures/block/oak_leaves.png',
  sand:        'textures/block/sand.png',
  planks:      'textures/block/oak_planks.png',
  glass:       'textures/block/glass.png',
  bedrock:     'textures/block/bedrock.png',
  gravel:      'textures/block/gravel.png',
  water:       'textures/block/water_still.png',
};

// Порядок тайлов в атласе (4 колонки × 4 строки = 16 ячеек)
const ATLAS_ORDER = [
  'grass_top',   // 0
  'grass_side',  // 1
  'dirt',        // 2
  'stone',       // 3
  'cobble',      // 4
  'log_side',    // 5
  'log_top',     // 6
  'leaves',      // 7
  'sand',        // 8
  'planks',      // 9
  'glass',       // 10
  'bedrock',     // 11
  'gravel',      // 12
  'water',       // 13
];

const TILE_PX  = 16;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 4;
const ATLAS_W = ATLAS_COLS * TILE_PX;  // 64
const ATLAS_H = ATLAS_ROWS * TILE_PX;  // 64

// Карта «внутреннее имя → индекс тайла в атласе»
const TILE_INDEX = {};
ATLAS_ORDER.forEach((key, i) => TILE_INDEX[key] = i);

// Итоговая текстура-атлас и canvas
let atlasCanvas = null;
let atlasTexture = null;

// Служебная: нарисовать «отсутствующую» текстуру (фиолетово-чёрная шахматка)
function drawMissing(ctx, x, y) {
  for (let py = 0; py < TILE_PX; py++) {
    for (let px = 0; px < TILE_PX; px++) {
      const c = ((px >> 2) + (py >> 2)) % 2 === 0 ? '#ff00ff' : '#000000';
      ctx.fillStyle = c;
      ctx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

// Служебная: загрузить одну картинку
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ ok: true,  img, url });
    img.onerror = () => resolve({ ok: false, img: null, url });
    img.src = url;
  });
}

// Загружает все текстуры, строит атлас.
// Возвращает Promise<{missing: string[], found: number, total: number}>.
async function loadAllTextures() {
  atlasCanvas = document.createElement('canvas');
  atlasCanvas.width  = ATLAS_W;
  atlasCanvas.height = ATLAS_H;
  const ctx = atlasCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const missing = [];
  let found = 0;
  const total = ATLAS_ORDER.length;

  for (let i = 0; i < ATLAS_ORDER.length; i++) {
    const key = ATLAS_ORDER[i];
    const url = BLOCK_TEXTURES[key];
    const res = await loadImage(url);
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const dx = col * TILE_PX;
    const dy = row * TILE_PX;

    if (res.ok) {
      const img = res.img;
      // Если картинка выше, чем шире — это анимация (например, water_still).
      // Берём первый кадр: верхние img.width пикселей.
      const useH = Math.min(img.height, img.width);
      ctx.drawImage(img, 0, 0, img.width, useH, dx, dy, TILE_PX, TILE_PX);
      found++;
    } else {
      drawMissing(ctx, dx, dy);
      missing.push(url);
      console.warn('[textures] НЕ НАЙДЕН:', url);
    }
  }

  atlasTexture = new THREE.CanvasTexture(atlasCanvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
  atlasTexture.wrapT = THREE.ClampToEdgeWrapping;

  console.log(`[textures] Загружено ${found}/${total}. Отсутствует: ${missing.length}`);
  if (missing.length) {
    console.log('[textures] Список отсутствующих файлов:');
    missing.forEach(u => console.log('   ' + u));
  }

  return { missing, found, total };
}

// UV-координаты тайла для атласа. tileIndex — номер тайла (0..15).
// Возвращает [u0, v0, u1, v1]. Небольшой отступ (0.5 текселя) убирает щели.
function tileUV(tileIndex) {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  const pad = 0.5 / ATLAS_W;
  const u0 = col / ATLAS_COLS + pad;
  const u1 = (col + 1) / ATLAS_COLS - pad;
  const v1 = 1 - row / ATLAS_ROWS - pad;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + pad;
  return [u0, v0, u1, v1];
}