"use strict";

/* =========================================================
   Игрок: физика, коллизии
   ========================================================= */

const player = {
  pos: new THREE.Vector3(8.5, 50, 8.5),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0, pitch: 0,
  onGround: false,
  inWater: false,
  height: 1.72,
  eye: 1.62,
  radius: 0.32,
  sneak: false, run: false,
};

function solidAt(wx, wy, wz) { return isSolid(getBlock(wx, wy, wz)); }

// Разрешение коллизии по одной оси
function resolveAxis(pos, axis, radius, height, delta) {
  const x0 = Math.floor(pos.x - radius + 0.001);
  const x1 = Math.floor(pos.x + radius - 0.001);
  const y0 = Math.floor(pos.y + 0.001);
  const y1 = Math.floor(pos.y + height - 0.001);
  const z0 = Math.floor(pos.z - radius + 0.001);
  const z1 = Math.floor(pos.z + radius - 0.001);

  if (axis === 'x') {
    if (delta > 0) {
      for (let by=y0;by<=y1;by++) for (let bz=z0;bz<=z1;bz++)
        if (solidAt(x1,by,bz)) { pos.x = x1 - radius - 0.001; return true; }
    } else {
      for (let by=y0;by<=y1;by++) for (let bz=z0;bz<=z1;bz++)
        if (solidAt(x0,by,bz)) { pos.x = x0 + 1 + radius + 0.001; return true; }
    }
  } else if (axis === 'y') {
    if (delta > 0) {
      for (let bx=x0;bx<=x1;bx++) for (let bz=z0;bz<=z1;bz++)
        if (solidAt(bx,y1,bz)) { pos.y = y1 - height - 0.001; return true; }
    } else {
      for (let bx=x0;bx<=x1;bx++) for (let bz=z0;bz<=z1;bz++)
        if (solidAt(bx,y0,bz)) { pos.y = y0 + 1; return true; }
    }
  } else {
    if (delta > 0) {
      for (let bx=x0;bx<=x1;bx++) for (let by=y0;by<=y1;by++)
        if (solidAt(bx,by,z1)) { pos.z = z1 - radius - 0.001; return true; }
    } else {
      for (let bx=x0;bx<=x1;bx++) for (let by=y0;by<=y1;by++)
        if (solidAt(bx,by,z0)) { pos.z = z0 + 1 + radius + 0.001; return true; }
    }
  }
  return false;
}

// Движение по оси с sub-step (чтобы не проскочить блок)
function moveAxis(pos, axis, amount, radius, height) {
  if (amount === 0) return false;
  const maxStep = 0.35;
  const steps = Math.max(1, Math.ceil(Math.abs(amount) / maxStep));
  const step = amount / steps;
  for (let i = 0; i < steps; i++) {
    if (axis === 'x') pos.x += step;
    else if (axis === 'y') pos.y += step;
    else pos.z += step;
    if (resolveAxis(pos, axis, radius, height, step)) return true;
  }
  return false;
}

// Спавн: найти верхний твёрдый блок в точке (sx, sz)
function findSpawn(sx, sz) {
  for (let y = HEIGHT - 2; y > 1; y--) {
    if (solidAt(sx, y, sz)) return y + 1.05;
  }
  return HEIGHT - 5;
}