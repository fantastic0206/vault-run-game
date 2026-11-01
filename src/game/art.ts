import * as THREE from "three";

/** Painted in code so both the deployed game and standalone file use the same art. */
export function steelFloor() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  const gradient = c.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, "#526476"); gradient.addColorStop(0.45, "#394b5c"); gradient.addColorStop(1, "#293d51");
  c.fillStyle = gradient; c.fillRect(0, 0, 512, 512);
  let seed = 21849;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 3500; i++) {
    c.fillStyle = `rgba(${rand() > .5 ? "190,207,218" : "8,18,29"},${rand() * .07})`;
    c.fillRect(rand() * 512, rand() * 512, rand() * 18 + 1, 1);
  }
  c.strokeStyle = "#142232"; c.lineWidth = 10; c.strokeRect(0, 0, 512, 512);
  c.strokeStyle = "#8094a155"; c.lineWidth = 3; c.strokeRect(8, 8, 496, 496);
  c.strokeStyle = "#172737"; c.lineWidth = 2; c.strokeRect(15, 15, 482, 482);
  for (const x of [28, 484]) for (const y of [28, 484]) {
    c.fillStyle = "#192a39"; c.beginPath(); c.arc(x,y,7,0,Math.PI*2); c.fill();
    c.strokeStyle = "#71818a"; c.lineWidth = 2; c.beginPath(); c.moveTo(x-3,y); c.lineTo(x+3,y); c.stroke();
  }
  c.fillStyle = "#192d40"; c.fillRect(54,465,52,12);
  c.fillStyle = "#74848966"; c.font = "8px monospace"; c.fillText("AEGIS // S-07", 57,474);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(50, 40);
  map.anisotropy = 8;
  return map;
}
export function glowTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!, g = c.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0, "#ffffffb0"); g.addColorStop(.25, "#ffffff60"); g.addColorStop(1, "#ffffff00");
  c.fillStyle = g; c.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(canvas);
}
export function graphicsQuality(): "low" | "high" {
  try { const value = localStorage.getItem("vault-breach-quality"); if (value === "low" || value === "high") return value; } catch {}
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return matchMedia("(pointer: coarse)").matches || memory < 6 ? "low" : "high";
}
