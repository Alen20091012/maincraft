"use strict";

/* =========================================================
   Мир: блоки, чанки, генерация, меши
   ========================================================= */

const CHUNK  = 16;   // X/Z размер чанка
const HEIGHT = 64;   // высота мира
const SEA    = 30;   // уровень воды
const VOL    = CHUNK * CHUNK * HEIGHT;

// ID блоков
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, COBBLE = 4,
      LOG = 5, LEAVES = 6, SAND = 7, PLANKS = 8, WATER = 9,
      GLASS = 10, BEDROCK = 11, GRAVEL = 12;

// Какой тайл атласа используется для каждой грани блока.
// faceIdx: 0=+X, 1=-X, 2=+Y (верх), 3=-Y (низ), 4=+Z, 5=-Z
const BLOCK_DEF = {
  [GRASS]:   { name:'Трава',     top:'grass_top', bottom:'dirt', side:'grass_side' },
  [DIRT]:    { name:'Земля',     all:'dirt' },
  [STONE]:   { name:'Камень',    all:'stone' },
  [COBBLE]:  { name:'Булыжник',  all:'cobble' },
  [LOG]:     { name:'Дерево',    top:'log_top', bottom:'log_top', side:'log_side' },
  [LEAVES]:  { name:'Листва',    all:'leaves', transparent:true },
  [SAND]:    { name:'Песок',     all:'sand' },
  [PLANKS]:  { name:'Доски',     all:'planks' },
  [WATER]:   { name:'Вода',      all:'water', liquid:true, transparent:true },
  [GLASS]:   { name:'Стекло',    all:'glass', transparent:true },
  [BEDROCK]: { name:'Бедрок',    all:'bedrock' },
  [GRAVEL]:  { name:'Гравий',    all:'gravel' },
};

const isOpaque = b => b !== AIR && b !== WATER && b !== GLASS && b !== LEAVES;
const isSolid  = b => b !== AIR && b !== WATER;

// Какой тайл для блока+грани
function tileFor(blockId, faceIdx) {
  const d = BLOCK_DEF[blockId];
  if (d.all !== undefined) return TILE_INDEX[d.all];
  if (faceIdx === 2) return TILE_INDEX[d.top];
  if (faceIdx === 3) return TILE_INDEX[d.bottom];
  return TILE_INDEX[d.side];
}

/* ---------- Шум (простой value-noise) ---------- */
function hash2(x, z) {
  let n = Math.imul(x|0, 374761393) ^ Math.imul(z|0, 668265263) ^ 0x9E3779B9;
  n = Math.imul(n ^ (n>>>13), 1274126177);
  n = n ^ (n>>>16);
  return (n>>>0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf*xf*(3-2*xf);
  const v = zf*zf*(3-2*zf);
  const a = hash2(xi, zi),     b = hash2(xi+1, zi);
  const c = hash2(xi, zi+1),   d = hash2(xi+1, zi+1);
  return (a*(1-u)+b*u)*(1-v) + (c*(1-u)+d*u)*v;
}
function terrainHeight(wx, wz) {
  const n1 = vnoise(wx/110, wz/110) - 0.5;
  const n2 = vnoise(wx/ 48, wz/ 48) - 0.5;
  const n3 = vnoise(wx/ 19, wz/ 19) - 0.5;
  const n4 = vnoise(wx/  8, wz/  8) - 0.5;
  let h = 32 + n1*36 + n2*12 + n3*4 + n4*1.6;
  return Math.max(1, Math.min(HEIGHT-8, Math.floor(h)));
}

/* ---------- Чанки ---------- */
const chunks = new Map();
const ckey = (cx, cz) => cx + ',' + cz;

function generateChunk(cx, cz) {
  const blocks = new Uint8Array(VOL);
  const baseX = cx*CHUNK, baseZ = cz*CHUNK;
  const idx = (x,y,z) => x + z*CHUNK + y*CHUNK*CHUNK;

  for (let x=0;x<CHUNK;x++) for (let z=0;z<CHUNK;z++) {
    const wx = baseX+x, wz = baseZ+z;
    const h = terrainHeight(wx, wz);
    const top = Math.max(h, SEA);
    for (let y=0;y<=top;y++) {
      let b = AIR;
      if (y === 0)         b = BEDROCK;
      else if (y < h-3)    b = STONE;
      else if (y < h)      b = DIRT;
      else if (y === h)    b = (h <= SEA+1) ? SAND : GRASS;
      else if (y <= SEA)   b = WATER;
      if (b !== AIR) blocks[idx(x,y,z)] = b;
    }
  }

  // Деревья (частично заходят в соседние чанки — просто пропускаем за границей)
  const place = (lx, ly, lz, b) => {
    if (lx<0 || lx>=CHUNK || lz<0 || lz>=CHUNK) return;
    if (ly<0 || ly>=HEIGHT) return;
    const i = idx(lx,ly,lz);
    if (b === LEAVES && blocks[i] !== AIR) return;
    blocks[i] = b;
  };
  for (let x=-3;x<CHUNK+3;x++) for (let z=-3;z<CHUNK+3;z++) {
    const wx = baseX+x, wz = baseZ+z;
    if (hash2(wx*13+7, wz*17+3) > 0.008) continue;
    const h = terrainHeight(wx, wz);
    if (h <= SEA+1) continue;
    const th = 4 + Math.floor(hash2(wx*31+1, wz*37+5)*3);
    const topY = h + th;
    for (let i=1;i<=th;i++) place(x, h+i, z, LOG);
    for (let dy=-2; dy<=1; dy++) {
      const y = topY + dy;
      const r = dy <= 0 ? 2 : 1;
      for (let dx=-r; dx<=r; dx++) for (let dz=-r; dz<=r; dz++) {
        if (dy <= 0 && dx === 0 && dz === 0) continue;
        if (Math.abs(dx)===r && Math.abs(dz)===r) continue;
        place(x+dx, y, z+dz, LEAVES);
      }
    }
  }
  return blocks;
}

function getChunk(cx, cz, create = true) {
  const k = ckey(cx, cz);
  let c = chunks.get(k);
  if (!c && create) {
    c = { cx, cz, blocks: generateChunk(cx, cz), mesh:null, waterMesh:null, built:false };
    chunks.set(k, c);
  }
  return c;
}

function getBlock(wx, wy, wz) {
  if (wy < 0 || wy >= HEIGHT) return AIR;
  const cx = Math.floor(wx / CHUNK);
  const cz = Math.floor(wz / CHUNK);
  const c = getChunk(cx, cz, false);
  if (!c) return AIR;
  const lx = wx - cx*CHUNK;
  const lz = wz - cz*CHUNK;
  return c.blocks[lx + lz*CHUNK + wy*CHUNK*CHUNK];
}

function setBlock(wx, wy, wz, type) {
  if (wy < 0 || wy >= HEIGHT) return false;
  const cx = Math.floor(wx / CHUNK);
  const cz = Math.floor(wz / CHUNK);
  const c = getChunk(cx, cz, false);
  if (!c) return false;
  const lx = wx - cx*CHUNK;
  const lz = wz - cz*CHUNK;
  c.blocks[lx + lz*CHUNK + wy*CHUNK*CHUNK] = type;
  rebuildChunkMesh(c);
  if (lx === 0)       rebuildChunkMesh(getChunk(cx-1, cz, false));
  if (lx === CHUNK-1) rebuildChunkMesh(getChunk(cx+1, cz, false));
  if (lz === 0)       rebuildChunkMesh(getChunk(cx, cz-1, false));
  if (lz === CHUNK-1) rebuildChunkMesh(getChunk(cx, cz+1, false));
  return true;
}

/* ---------- Меш чанка ---------- */
const FACES = [
  { dir:[ 1,0,0], corners:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]], shade:0.80 },
  { dir:[-1,0,0], corners:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]], shade:0.80 },
  { dir:[ 0,1,0], corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]], shade:1.00 },
  { dir:[ 0,-1,0],corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]], shade:0.50 },
  { dir:[ 0,0,1], corners:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]], shade:0.66 },
  { dir:[ 0,0,-1],corners:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]], shade:0.66 },
];

function rebuildChunkMesh(chunk) {
  if (!chunk || !scene) return;
  if (chunk.mesh)      { scene.remove(chunk.mesh);      chunk.mesh.geometry.dispose();      chunk.mesh = null; }
  if (chunk.waterMesh) { scene.remove(chunk.waterMesh); chunk.waterMesh.geometry.dispose(); chunk.waterMesh = null; }

  const baseX = chunk.cx*CHUNK, baseZ = chunk.cz*CHUNK;
  const blocks = chunk.blocks;
  const idx = (x,y,z) => x + z*CHUNK + y*CHUNK*CHUNK;

  const pos = [], nor = [], uv = [], col = [], ind = [];
  const wpos = [], wnor = [], wuv = [], wcol = [], wind = [];
  let vc = 0, wvc = 0;

  for (let y=0;y<HEIGHT;y++) {
    for (let z=0;z<CHUNK;z++) {
      for (let x=0;x<CHUNK;x++) {
        const b = blocks[idx(x,y,z)];
        if (b === AIR) continue;
        const wx = baseX + x, wy = y, wz = baseZ + z;
        const isWater = (b === WATER);
        const P = isWater ? wpos : pos, N = isWater ? wnor : nor;
        const U = isWater ? wuv  : uv,  C = isWater ? wcol : col;
        const I = isWater ? wind : ind;
        let base = isWater ? wvc : vc;

        for (let f=0; f<6; f++) {
          const face = FACES[f];
          const nb = getBlock(wx + face.dir[0], wy + face.dir[1], wz + face.dir[2]);

          if (isWater) {
            if (nb === WATER) continue;
            if (isOpaque(nb)) continue;
          } else {
            if (isOpaque(nb)) continue;
            if (nb === b && (b === GLASS || b === LEAVES)) continue;
          }

          const tileIdx = tileFor(b, f);
          const [u0,v0,u1,v1] = tileUV(tileIdx);
          const sh = face.shade, cs = face.corners;
          const uvs = [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];

          for (let i=0;i<4;i++) {
            const c = cs[i];
            P.push(wx + c[0], wy + c[1], wz + c[2]);
            N.push(face.dir[0], face.dir[1], face.dir[2]);
            U.push(uvs[i][0], uvs[i][1]);
            C.push(sh, sh, sh);
          }
          I.push(base, base+1, base+2, base, base+2, base+3);
          base += 4;
        }
        if (isWater) wvc = base; else vc = base;
      }
    }
  }

  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(ind);
    const m = new THREE.MeshLambertMaterial({
      map: atlasTexture, vertexColors: true,
      transparent: true, alphaTest: 0.5
    });
    const mesh = new THREE.Mesh(g, m);
    scene.add(mesh);
    chunk.mesh = mesh;
  }

  if (wpos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    g.setAttribute('normal',   new THREE.Float32BufferAttribute(wnor, 3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(wuv, 2));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(wcol, 3));
    g.setIndex(wind);
    const m = new THREE.MeshLambertMaterial({
      map: atlasTexture, vertexColors: true,
      transparent: true, opacity: 0.78, depthWrite: false
    });
    const mesh = new THREE.Mesh(g, m);
    scene.add(mesh);
    chunk.waterMesh = mesh;
  }

  chunk.built = true;
}