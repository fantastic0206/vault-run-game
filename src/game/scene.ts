import * as THREE from "three";
import { CORE, EXTRACTION, OBSTACLES, RELAYS, VENTS } from "./map";
import { COLORS, type Input, type World } from "./types";
import { steelFloor, glowTexture, graphicsQuality } from "./art";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WEAPONS, type WeaponId } from "./weapons";

interface Rig {
  group: THREE.Group;
  legs: THREE.Object3D[];
  flash: THREE.Mesh;
  body: THREE.Mesh;
  target: THREE.Vector3;
  label?: THREE.Sprite;
  gun?: THREE.Group;
  weapon?: WeaponId;
}
const v3 = new THREE.Vector3();
export class Battlefield {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(44, 1, 0.1, 140);
  private clock = 0;
  private follow = new THREE.Vector3(-3, 0, 0);
  private actors = new Map<string, Rig>();
  private enemies = new Map<number, THREE.Group>();
  private bullets = new Map<number, THREE.Mesh>();
  private particles = new Map<number, THREE.Group>();
  private hazards = new Map<number, THREE.Group>();
  private terminals: THREE.Group[] = [];
  private medkits: THREE.Group[] = [];
  private labels: THREE.Sprite[] = [];
  private materials = new Map<string, THREE.Material>();
  private door = new THREE.Group();
  private core = new THREE.Group();
  private exfil = new THREE.Group();
  private reticle: THREE.Mesh;
  private observer: ResizeObserver;
  private composer?: EffectComposer;
  private textures: THREE.Texture[] = [];
  private glow = glowTexture();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.05);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private aimTarget = new THREE.Vector3();
  private mobile = graphicsQuality() === "low";
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private bulletGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.85, 6);
  private particleGeometry = new THREE.IcosahedronGeometry(0.11, 0);
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.mobile,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio || 1, this.mobile ? 1 : 1.5),
    );
    this.renderer.shadowMap.enabled = !this.mobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.background = new THREE.Color("#0a111e");
    this.scene.fog = new THREE.FogExp2("#111c2b", 0.014);
    this.scene.add(new THREE.HemisphereLight("#a9c7ed", "#11182b", 1.15));
    const sun = new THREE.DirectionalLight("#ffe7b9", 3.2);
    sun.position.set(-12, 28, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    sun.shadow.camera.far = 75;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const cold = new THREE.PointLight("#62a7e0", 42, 40, 2);
    cold.position.set(-15, 9, 5);
    this.scene.add(cold);
    const gold = new THREE.PointLight("#ffc164", 65, 24, 2);
    gold.position.set(0, 5, -13);
    this.scene.add(gold);
    const purple = new THREE.PointLight("#8a6ce0", 35, 30, 2);
    purple.position.set(18, 7, -8);
    this.scene.add(purple);
    this.buildLevel();
    if (!this.mobile) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1,1), .38, .35, 1.05));
      this.composer.addPass(new OutputPass());
    }
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.3, 24),
      new THREE.MeshBasicMaterial({
        color: "#a9ffe8",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.position.y = 0.06;
    this.scene.add(this.reticle);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  private material(color: string, emissive = false, metal = 0.35) {
    const key = color + emissive + metal;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: emissive ? 0.35 : 0.65,
          metalness: metal,
          emissive: emissive ? color : "#000000",
          emissiveIntensity: emissive ? 2 : 0,
        }),
      );
    return this.materials.get(key)!;
  }
  private box(
    w: number,
    h: number,
    d: number,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = this.scene,
    glow = false,
  ) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, this.material(color, glow));
    mesh.position.set(x, y, z);
    mesh.castShadow = !glow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private cylinder(
    r: number,
    h: number,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const geometry = new THREE.CylinderGeometry(r, r, h, 12);
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private ring(
    radius: number,
    width: number,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const geometry = new THREE.RingGeometry(radius - width, radius, 64);
    const mesh = new THREE.Mesh(geometry, this.material(color, true));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  private label(text: string, color = "#c8bd9b", width = 3): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#111c2ddd";
    ctx.fillRect(0, 8, 512, 80);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 10, 508, 76);
    ctx.fillStyle = color;
    ctx.font = "700 34px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 49);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      }),
    );
    sprite.scale.set(width, (width * 96) / 512, 1);
    this.labels.push(sprite);
    return sprite;
  }
  private buildLevel() {
    this.box(51, 0.7, 41, "#263244", 0, -0.5, 0);
    const floorMap = steelFloor(); this.textures.push(floorMap);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(50,.12,40), new THREE.MeshStandardMaterial({map:floorMap, color:"#b3c6df", metalness:.62, roughness:.42}));
    floor.position.y = -.08; floor.receiveShadow = true; this.scene.add(floor);
    this.box(51, 3.2, 0.8, "#1b293b", 0, 1.4, -20.4);
    this.box(0.8, 2.4, 40, "#1c2b3e", -25.4, 1, 0);
    this.box(0.8, 2.4, 40, "#1c2b3e", 25.4, 1, 0);
    this.box(51, 0.55, 0.8, "#1c2938", 0, 0, 20.4);
    for (const x of [-24.8, 24.8]) {
      this.box(0.06, 0.1, 39, "#5a9ca8", x, 0.15, 0, this.scene, true);
      for (let z = -18; z <= 18; z += 6) {
        this.box(0.65, 3.6, 0.8, "#293951", x, 1.5, z);
        this.box(
          0.08,
          1.6,
          0.12,
          "#c4a264",
          x - (x > 0 ? 0.38 : -0.38),
          1.5,
          z,
          this.scene,
          true,
        );
      }
    }
    this.box(49, 0.06, 0.05, "#82734a", 0, 0.04, -19.5, this.scene, true);
    for (const o of OBSTACLES) {
      if (o.kind === "door") continue;
      const g = new THREE.Group();
      g.userData.static = true;
      g.position.set(o.x, 0, o.z);
      this.scene.add(g);
      this.box(
        o.w,
        o.h,
        o.d,
        o.kind === "crate" ? "#2b3e57" : "#24384c",
        0,
        o.h / 2,
        0,
        g,
      );
      if (o.kind === "crate") {
        this.box(o.w + 0.08, 0.13, o.d + 0.08, "#687583", 0, o.h, 0, g);
        this.box(o.w * .8, .08, o.d * .76, "#26394d", 0, o.h+.1, 0, g);
        for (const sx of [-1,1]) for (const sz of [-1,1]) {
          this.box(.28, o.h+.15,.27,"#b6965a", sx*(o.w/2-.08),o.h/2,sz*(o.d/2-.08),g);
          this.box(.12,.055,.12,"#e7d2a4",sx*(o.w/2-.08),o.h+.19,sz*(o.d/2-.08),g);
        }
        for (const x of [-o.w * 0.31, o.w * 0.31]) {
          this.box(0.13, o.h + 0.13, o.d + 0.11, "#b69b5b", x, o.h / 2, 0, g);
        }
        this.box(
          o.w * 0.5,
          0.23,
          0.07,
          "#1a2b38",
          0,
          o.h * 0.55,
          o.d / 2 + 0.04,
          g,
        );
        this.box(
          0.4,
          0.1,
          0.09,
          "#71b9c2",
          0,
          o.h * 0.55,
          o.d / 2 + 0.09,
          g,
          true,
        );
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(
            new THREE.BoxGeometry(o.w + 0.02, o.h + 0.02, o.d + 0.02),
          ),
          new THREE.LineBasicMaterial({ color: "#57727b" }),
        );
        edges.position.y = o.h / 2;
        g.add(edges);
      } else this.box(o.w + 0.06, 0.12, o.d + 0.06, "#53606e", 0, o.h, 0, g);
    }
    // Monumental vault and its hinged, animated door.
    this.box(2.7, 5.8, 1.2, "#324357", -4.8, 2.8, -9);
    this.box(2.7, 5.8, 1.2, "#324357", 4.8, 2.8, -9);
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(3.55, 0.36, 12, 64),
      this.material("#b39458"),
    );
    frame.position.set(0, 3.35, -8.9);
    frame.castShadow = true;
    this.scene.add(frame);
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.1, 8, 64),
      this.material("#ecc87c", true),
    );
    inner.position.set(0, 3.35, -8.85);
    this.scene.add(inner);
    this.door.position.set(-3.3, 0, -8.75);
    this.scene.add(this.door);
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.6, 48),
      this.material("#66727b", false, 0.8),
    );
    plate.rotation.x = Math.PI / 2;
    plate.position.set(3.3, 3.35, 0);
    plate.castShadow = true;
    this.door.add(plate);
    const doorRim = new THREE.Mesh(
      new THREE.TorusGeometry(2.82, 0.08, 8, 48),
      this.material("#bda066"),
    );
    doorRim.position.set(3.3, 3.35, 0.33);
    this.door.add(doorRim);
    const lock = this.cylinder(0.5, 0.3, "#c2a068", 3.3, 3.35, 0.5, this.door);
    lock.rotation.x = Math.PI / 2;
    for (let a = 0; a < 3; a++) {
      const arm = this.box(
        0.13,
        2.6,
        0.16,
        "#b3aa8b",
        3.3,
        3.35,
        0.7,
        this.door,
      );
      arm.rotation.z = (a * Math.PI) / 3;
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const bolt = this.cylinder(
        0.12,
        0.15,
        "#d1b47d",
        3.3 + Math.cos(a) * 2.9,
        3.35 + Math.sin(a) * 2.9,
        0.4,
        this.door,
      );
      bolt.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 7; i++)
      this.box(
        1.5,
        0.4,
        0.65,
        "#c3a14f",
        -3.5 + (i % 3) * 1.8,
        0.25 + Math.floor(i / 3) * 0.42,
        -18 + Math.floor(i / 3) * 0.75,
      );
    const vaultLabel = this.label("AEGIS // CORE VAULT", "#e0c682", 5);
    vaultLabel.position.set(0, 7.4, -9);
    this.scene.add(vaultLabel);
    RELAYS.forEach((p, i) => {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      this.scene.add(g);
      this.box(1.4, 0.3, 1.2, "#172b3b", 0, 0.15, 0, g);
      this.box(1.1, 1.35, 0.9, "#38536a", 0, 0.85, 0, g);
      this.box(0.8, 0.55, 0.06, "#102438", 0, 1.23, 0.48, g);
      this.box(0.6, 0.28, 0.08, "#65d5d4", 0, 1.25, 0.53, g, true);
      for (let n=0;n<3;n++) this.box(.46,.018,.01,"#143b4b",0,1.18+n*.06,.577,g);
      this.cylinder(0.16, 0.25, "#dbc686", 0, 1.7, 0, g);
      this.ring(1.7, 0.05, "#b37b55", 0, 0.06, 0, g);
      const l = this.label("RELAY 0" + (i + 1), "#ecc888", 2.6);
      l.position.set(0, 2.4, 0);
      g.add(l);
      g.userData.screen = g.children[3];
      g.userData.label = l;
      this.glowDisc(1.5, "#35d4e4", p.x, p.z);
      this.terminals.push(g);
    });
    this.core.position.set(CORE.x, 1.7, CORE.z);
    this.scene.add(this.core);
    const coreGeo = new THREE.OctahedronGeometry(0.65, 0);
    this.core.add(new THREE.Mesh(coreGeo, this.material("#ae8bf1", true)));
    const cage = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.87, 0),
      new THREE.MeshBasicMaterial({ color: "#f2d48a", wireframe: true }),
    );
    this.core.add(cage);
    this.cylinder(1.05, 1.2, "#43546a", CORE.x, 0.6, CORE.z);
    this.ring(1.15, 0.08, "#a289e9", CORE.x, 1.23, CORE.z);
    this.glowDisc(4, "#9251e6", CORE.x, CORE.z);
    this.exfil.position.set(EXTRACTION.x, 0, EXTRACTION.z);
    this.scene.add(this.exfil);
    this.ring(2.7, 0.12, "#5ccca8", 0, 0.07, 0, this.exfil);
    this.ring(2.35, 0.035, "#79b5b0", 0, 0.075, 0, this.exfil);
    this.glowDisc(4, "#36e7b1", EXTRACTION.x, EXTRACTION.z);
    for (const x of [-2.2,2.2]) for (const z of [-1.9,1.9]) {
      this.box(.2,1.1,.2,"#3c5261",x,.55,z,this.exfil);
      this.box(.16,.28,.18,"#8deac1",x,1.02,z,this.exfil,true);
    }
    const arrow = new THREE.Shape(); arrow.moveTo(-.75,-.1); arrow.lineTo(-.2,-.1); arrow.lineTo(-.2,-.8); arrow.lineTo(.2,-.8); arrow.lineTo(.2,-.1); arrow.lineTo(.75,-.1); arrow.lineTo(0,.7); arrow.closePath();
    const arrowMesh = new THREE.Mesh(new THREE.ShapeGeometry(arrow), this.material("#72ffd0",true)); arrowMesh.rotation.x=-Math.PI/2; arrowMesh.position.y=.08; this.exfil.add(arrowMesh);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.box(
        0.25,
        0.09,
        0.45,
        "#8cbf9c",
        Math.cos(a) * 2.85,
        0.06,
        Math.sin(a) * 2.85,
        this.exfil,
        true,
      );
    }
    const exit = this.label("EXTRACTION", "#9be4c0", 3);
    exit.position.set(0, 2.7, 0);
    this.exfil.add(exit);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.7, 5, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: "#78e7bf",
        transparent: true,
        opacity: 0.035,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.y = 2.5;
    this.exfil.add(beam);
    for (const p of [
      { x: -8, z: 14 },
      { x: 17, z: 0 },
      { x: -15, z: -16 },
    ]) {
      const g = new THREE.Group();
      g.position.set(p.x, 0.45, p.z);
      this.scene.add(g);
      this.box(0.65, 0.4, 0.65, "#d3e5dc", 0, 0, 0, g);
      this.box(0.16, 0.07, 0.45, "#71deab", 0, 0.24, 0, g, true);
      this.box(0.45, 0.07, 0.16, "#71deab", 0, 0.24, 0, g, true);
      this.medkits.push(g);
    }
    for (const p of VENTS) {
      this.box(2, 0.09, 1.7, "#142736", p.x, 0.04, p.z);
      for (let i = 0; i < 5; i++)
        this.box(0.14, 0.11, 1.55, "#42566a", p.x - 0.65 + i * 0.33, 0.1, p.z);
    }
    // Ground chevrons and lit conduits establish readable paths through the arena.
    for (let z = -16; z < 17; z += 4)
      this.box(0.07, 0.035, 1.7, "#789c9e", -8, 0.04, z);
    for (let x = -21; x < 22; x += 4)
      this.box(1.8, 0.035, 0.06, "#866f49", x, 0.04, 10);
    this.detailLevel();
    this.batchArchitecture();
    this.camera.position.set(21, 29, 30);
    this.camera.lookAt(0, 0, -2);
  }
  private operative(color: number): Rig {
    const g = new THREE.Group(),
      c = COLORS[color];
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.48, 4, 8),
      this.material("#263447").clone(),
    );
    body.position.y = 0.9;
    body.castShadow = true;
    g.add(body);
    this.box(0.52, 0.4, 0.28, c, 0, 1, 0.24, g);
    this.box(0.34, 0.08, 0.05, "#bceae3", 0, 1.11, 0.4, g, true);
    this.box(0.56, 0.12, 0.44, "#0d1929", 0, 0.59, 0, g);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12),
      this.material(c, false, .7),
    );
    head.scale.y = 1.05;
    head.position.y = 1.48;
    head.castShadow = true;
    g.add(head);
    this.box(0.56, 0.19, 0.3, "#071a2b", 0, 1.5, 0.18, g);
    this.box(0.38, 0.035, 0.05, c, 0, 1.51, 0.32, g, true);
    this.box(0.22, 0.4, 0.2, c, -0.44, 1.07, 0, g);
    this.box(0.22, 0.4, 0.2, c, 0.44, 1.07, 0, g);
    this.box(.44,.48,.24,"#152638",0,1.04,-.28,g);
    this.box(.31,.06,.04,c,0,1.19,-.42,g,true);
    const legL = this.box(0.2, 0.52, 0.24, "#25384c", -0.2, 0.32, 0, g),
      legR = this.box(0.2, 0.52, 0.24, "#25384c", 0.2, 0.32, 0, g);
    this.box(0.25, 0.16, 0.38, "#132132", -0.2, 0.08, 0.08, g);
    this.box(0.25, 0.16, 0.38, "#132132", 0.2, 0.08, 0.08, g);
    const flash = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      this.material("#ffe7a3", true),
    );
    flash.position.set(0.3, 1.03, 1.35);
    flash.visible = false;
    g.add(flash);
    this.ring(0.57, 0.035, c, 0, 0.035, 0, g);
    this.scene.add(g);
    return {
      group: g,
      body,
      legs: [legL, legR],
      flash,
      target: new THREE.Vector3(),
    };
  }
  private equipModel(rig: Rig, weapon: WeaponId) {
    if (rig.weapon === weapon) return;
    if (rig.gun) { rig.gun.traverse(o => { if(o instanceof THREE.Mesh)o.geometry.dispose(); }); rig.group.remove(rig.gun); }
    const gun = rig.gun = new THREE.Group(), color = WEAPONS[weapon].color;
    rig.weapon = weapon; rig.group.add(gun);
    this.box(weapon === 3 ? .44 : .25,.24,.65,"#334b61",.3,1.03,.63,gun);
    this.box(.12,.22,.18,"#172638",.3,.85,.58,gun);
    this.box(.08,.06,.42,color,.3,1.17,.65,gun,true);
    if (weapon === 0) {
      this.box(.12,.14,.55,"#7d939f",.3,1.03,1.08,gun);
      this.box(.2,.08,.2,"#182735",.3,1.22,.68,gun);
    } else if (weapon === 1) {
      for(const x of [.19,.41]) this.box(.12,.13,.72,"#b5a28a",x,1.03,1,gun);
      this.box(.31,.12,.22,color,.3,1.03,.78,gun);
    } else if (weapon === 2) {
      const rotor=new THREE.Group();rotor.position.set(.3,1.03,1.02);gun.add(rotor);gun.userData.rotor=rotor;
      for(let i=0;i<4;i++){const a=i/4*Math.PI*2;const barrel=this.cylinder(.055,.65,"#a1a8b1",Math.cos(a)*.105,Math.sin(a)*.105,0,rotor);barrel.rotation.x=Math.PI/2;}
    } else {
      const barrel=this.cylinder(.2,.8,"#4e708a",.3,1.03,.99,gun);barrel.rotation.x=Math.PI/2;
      for(const z of [.72,1.12,1.35]) { const ring=new THREE.Mesh(new THREE.TorusGeometry(.22,.035,8,20),this.material(color,true));ring.position.set(.3,1.03,z);gun.add(ring); }
    }
  }
  private glowDisc(radius: number, color: string, x: number, z: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius*2,radius*2), new THREE.MeshBasicMaterial({map:this.glow,color,transparent:true,opacity:.34,blending:THREE.AdditiveBlending,depthWrite:false}));
    m.rotation.x=-Math.PI/2; m.position.set(x,.035,z); this.scene.add(m);
  }
  private detailLevel() {
    // Modular bulkheads, warm wall lamps, conduits and floor seams mirror the concept art.
    this.box(50,2.6,.5,"#17273d",0,4.4,-20.1);
    for (let x=-22.5;x<=22.5;x+=5) {
      this.box(4.75,4.8,.12,"#263c53",x,2.7,-19.94);
      this.box(4.5,.13,.15,"#526072",x,1.5,-19.83);
      this.box(4.5,.13,.15,"#526072",x,4.8,-19.83);
      this.box(.3,5.8,.65,"#304253",x-2.4,2.8,-19.75);
      this.box(1.3,.18,.18,"#efc16e",x,.65,-19.7,this.scene,true);
    }
    for (const side of [-1,1]) for (let z=-15;z<19;z+=4) {
      this.box(.14,.65,3.6,"#30445d",side*24.94,2.1,z);
      this.box(.22,.12,3.5,"#b39456",side*24.8,1.25,z);
      this.box(.25,.7,.44,"#bca16b",side*24.8,2.5,z);
      this.box(.29,.47,.22,"#ffe5ac",side*24.62,2.5,z,this.scene,true);
    }
    // A pair of slim pipes and regularly spaced clamps stay inside the outer walls.
    for (const y of [.48,.76]) this.box(48,.09,.09,"#647385",0,y,-19.65);
    for (let x=-22;x<24;x+=2) this.box(.08,.46,.12,"#223346",x,.6,-19.57);
    for (let x=-22;x<=22;x+=6) for (let z=-16;z<=16;z+=8) {
      this.box(.35,.018,.055,"#baa56e",x,.014,z);
      this.box(.055,.019,.35,"#baa56e",x,.015,z);
    }
    for (let i=0;i<12;i++) {
      const x=-5.2+i*.95;
      const stripe=this.box(.45,.025,.75,"#bd9e55",x,.016,-7.6); stripe.rotation.y=-.45;
    }
    for (const x of [-3.5,3.5]) {
      this.box(.18,4.7,.24,"#b39860",x,2.3,-8.3);
      this.box(.07,3.5,.08,"#ffe6ac",x,2.5,-8.14,this.scene,true);
    }
    // Raised segmented pedestal and a purple light pool make the core a focal point.
    for(let i=0;i<8;i++) { const a=i/8*Math.PI*2; this.box(.24,.3,.24,"#b8a281",CORE.x+Math.cos(a)*1.3,.18,CORE.z+Math.sin(a)*1.3); }
  }
  private batchArchitecture() {
    // Merge immovable pieces by material: extra art should not cost hundreds of draw calls.
    this.scene.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, { meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
    const collect = (o: THREE.Object3D) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
      let batch=batches.get(o.material); if(!batch) { batch={meshes:[],geometries:[]}; batches.set(o.material,batch); }
      const g=o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld); batch.meshes.push(o); batch.geometries.push(g);
    };
    for(const child of [...this.scene.children]) {
      if(child instanceof THREE.Mesh) collect(child);
      else if(child.userData.static) child.traverse(collect);
    }
    for(const [material,batch] of batches) {
      if(batch.meshes.length<2) { batch.geometries.forEach(g=>g.dispose()); continue; }
      const geometry=mergeGeometries(batch.geometries,false);
      batch.geometries.forEach(g=>g.dispose());
      if(!geometry) continue;
      const merged=new THREE.Mesh(geometry,material); merged.receiveShadow=true; merged.castShadow=!(material instanceof THREE.MeshBasicMaterial); this.scene.add(merged);
      for(const mesh of batch.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    }
  }
  private renderHazards(w: World, t: number) {
    const ids=new Set(w.hazards.map(h=>h.id));
    for(const [id,g] of this.hazards) if(!ids.has(id)) { this.removeRig(g); this.hazards.delete(id); }
    for(const hazard of w.hazards) {
      let g=this.hazards.get(hazard.id);
      if(!g) {
        g=new THREE.Group(); g.position.set(hazard.x,.045,hazard.z);
        const fill=new THREE.Mesh(new THREE.CircleGeometry(hazard.radius,48),new THREE.MeshBasicMaterial({color:"#ff452e",transparent:true,opacity:.12,depthWrite:false}));
        fill.rotation.x=-Math.PI/2; fill.userData.ownedMaterial=true; g.add(fill);
        this.ring(hazard.radius,.065,"#ff7a50",0,.012,0,g);
        this.box(hazard.radius*1.3,.025,.035,"#ff9e61",0,.014,0,g,true);
        this.box(.035,.025,hazard.radius*1.3,"#ff9e61",0,.015,0,g,true);
        const beam=new THREE.Mesh(new THREE.CylinderGeometry(hazard.radius*.7,hazard.radius,7,24,1,true),new THREE.MeshBasicMaterial({color:"#ff794a",transparent:true,opacity:.17,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
        beam.position.y=3.5; beam.visible=false; beam.userData.ownedMaterial=true; g.add(beam);
        g.userData.fill=fill; g.userData.beam=beam;
        this.scene.add(g); this.hazards.set(hazard.id,g);
      }
      const progress=Math.min(1,(w.time-hazard.born)/hazard.delay);
      const fill=g.userData.fill as THREE.Mesh<THREE.CircleGeometry,THREE.MeshBasicMaterial>;
      fill.material.opacity=hazard.hit?.65:.1+progress*.13+Math.sin(t*19)*.05;
      (g.userData.beam as THREE.Mesh).visible=hazard.hit;
    }
  }
  private drone(heavy: boolean, hunter = false) {
    const g = new THREE.Group(),
      radius = heavy ? 0.62 : 0.44;
    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 1),
      this.material(heavy ? "#70504b" : hunter ? "#9c7050" : "#3a4d66"),
    );
    body.castShadow = true;
    g.add(body);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(radius*.42,.045,8,16),this.material("#ffb44c",true)); eye.position.set(0,0,radius*.95); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(radius*.22,12,8),this.material("#ffe1a3",true)); pupil.position.set(0,0,radius*1.03); g.add(pupil);
    if (hunter) { g.scale.set(.8,.8,1.15); this.box(.28,.15,.3,"#ffb755",0,0,-.5,g,true); }
    this.box(
      radius * 1.3,
      0.14,
      0.12,
      "#ff765b",
      0,
      0.03,
      radius * 0.85,
      g,
      true,
    );
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        this.box(
          0.13,
          0.1,
          0.63,
          "#28394a",
          x * radius,
          0.05,
          z * radius * 0.5,
          g,
        );
        this.cylinder(0.26, 0.08, "#263e4c", x * radius, 0.07, z * radius, g);
        this.ring(0.24, 0.055, "#a78b7d", x * radius, 0.14, z * radius, g);
      }
    this.ring(radius * 1.05, 0.03, "#d47865", 0, -0.9, 0, g);
    this.scene.add(g);
    return g;
  }
  groundPoint(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      (-(clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = this.raycaster.ray.intersectPlane(this.plane, v3);
    return p ? { x: p.x, z: p.z } : null;
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth,
      h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w,h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  private removeRig(group: THREE.Group) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if(o.userData.ownedMaterial && !Array.isArray(o.material)) o.material.dispose();
      }
      if(o instanceof THREE.Sprite) { o.material.map?.dispose(); o.material.dispose(); const i=this.labels.indexOf(o); if(i>=0)this.labels.splice(i,1); }
    });
    this.scene.remove(group);
  }
  render(
    w: World,
    selfId: string,
    dt: number,
    active: boolean,
    input: Input | null,
    guest = false,
  ) {
    this.clock += dt;
    const t = this.clock,
      self = w.players.find((p) => p.id === selfId) ?? w.players[0];
    if (active && self) {
      this.follow.lerp(
        new THREE.Vector3(self.x, 0, self.z),
        1 - Math.exp(-dt * 7),
      );
      this.camera.position.copy(this.follow).add(new THREE.Vector3(13, 20, 17));
      this.camera.lookAt(this.follow.x, 0, this.follow.z - 1.4);
    } else {
      const a = this.reducedMotion ? 0 : Math.sin(t*.055)*.12;
      this.camera.position.set(
        21 + Math.sin(a)*8,
        27,
        30,
      );
      this.camera.lookAt(0, 0.2, -3);
    }
    const ids = new Set(w.players.map((p) => p.id));
    for (const [id, rig] of this.actors)
      if (!ids.has(id)) {
        (rig.body.material as THREE.Material).dispose();
        this.removeRig(rig.group);
        this.actors.delete(id);
      }
    for (const p of w.players) {
      let rig = this.actors.get(p.id);
      if (!rig) {
        rig = this.operative(p.color);
        rig.group.position.set(p.x, 0, p.z);
        rig.label = this.label(p.name.toUpperCase(),COLORS[p.color],Math.min(3, 1.2+p.name.length*.06)); rig.label.position.set(0,2.35,0); rig.group.add(rig.label);
        this.actors.set(p.id, rig);
      }
      this.equipModel(rig, p.weapon);
      if (rig.gun?.userData.rotor) (rig.gun.userData.rotor as THREE.Group).rotation.z=t*30;
      let tx = p.x,
        tz = p.z;
      if (guest && p.id === selfId && input && p.health > 0) {
        tx += input.mx * 0.45;
        tz += input.mz * 0.45;
      }
      rig.target.set(
        tx,
        p.health > 0 ? Math.abs(Math.sin(t * 14)) * 0.04 * p.moving : 0,
        tz,
      );
      rig.group.position.lerp(
        rig.target,
        1 - Math.exp(-dt * (guest ? 16 : 30)),
      );
      rig.group.rotation.y =
        p.id === selfId && input ? Math.atan2(input.ax, input.az) : p.angle;
      rig.group.rotation.z = p.health > 0 ? 0 : Math.PI / 2;
      rig.legs[0].rotation.x = Math.sin(t * 14) * p.moving * 0.6;
      rig.legs[1].rotation.x = -Math.sin(t * 14) * p.moving * 0.6;
      rig.flash.visible = p.fire > WEAPONS[p.weapon].fire * .48 && p.health > 0;
      rig.flash.material = this.material(WEAPONS[p.weapon].color, true);
      rig.flash.scale.setScalar(p.weapon === 3 ? 1.65 : p.weapon === 1 ? 1.1 : .65);
      rig.flash.rotation.z = t * 31;
      (rig.body.material as THREE.MeshStandardMaterial).emissive.set(
        p.hurt > 4.3 ? "#8b3524" : "#000000",
      );
      rig.group.visible = active || p.id === w.players[0].id;
      if (rig.label) rig.label.visible = active;
    }
    const enemies = new Set(w.enemies.map((e) => e.id));
    for (const [id, g] of this.enemies)
      if (!enemies.has(id)) {
        this.removeRig(g);
        this.enemies.delete(id);
      }
    for (const e of w.enemies) {
      let g = this.enemies.get(e.id);
      if (!g) {
        g = this.drone(e.type === "heavy", e.type === "hunter");
        g.position.set(e.x, 1.3, e.z);
        this.enemies.set(e.id, g);
      }
      g.position.lerp(
        new THREE.Vector3(e.x, 1.35 + Math.sin(t * 4 + e.id) * 0.1, e.z),
        1 - Math.exp(-dt * 16),
      );
      g.rotation.y = e.angle;
      g.rotation.z = Math.sin(t * 5 + e.id) * 0.04;
    }
    const bullets = new Set(w.bullets.map((b) => b.id));
    for (const [id, m] of this.bullets)
      if (!bullets.has(id)) {
        this.scene.remove(m);
        this.bullets.delete(id);
      }
    for (const b of w.bullets) {
      let mesh = this.bullets.get(b.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.bulletGeometry,
          this.material(b.enemy ? "#ff875f" : "#9aefe0", true),
        );
        this.scene.add(mesh);
        this.bullets.set(b.id, mesh);
      }
      mesh.position.set(b.x, b.enemy ? 1.3 : 1.06, b.z);
      mesh.material = this.material(b.enemy ? "#ff875f" : WEAPONS[b.weapon ?? 0].color, true);
      mesh.scale.set(b.weapon === 3 ? 3.2 : 1, b.weapon === 3 ? 1.4 : b.weapon === 1 ? .65 : 1, b.weapon === 3 ? 3.2 : 1);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(b.vx, 0, b.vz).normalize(),
      );
    }
    this.door.rotation.y = THREE.MathUtils.lerp(
      this.door.rotation.y,
      w.relays.every((r) => r.done) ? -Math.PI * 0.76 : 0,
      1 - Math.exp(-dt * 2),
    );
    for (let i = 0; i < this.terminals.length; i++) {
      const g = this.terminals[i],
        r = w.relays[i];
      (g.userData.label as THREE.Sprite).visible = !r.done;
      const screen = g.userData.screen as THREE.Mesh;
      screen.material = this.material(r.done ? "#65d5b1" : "#d2a365", true);
    }
    const carrier = w.players.find((p) => p.id === w.core.carrier);
    this.core.position.set(
      w.core.x,
      carrier ? 2.4 : 1.85 + Math.sin(t * 2) * 0.13,
      w.core.z,
    );
    this.core.rotation.y = t * 0.9;
    this.core.visible = w.relays.every((r) => r.done) || !active;
    this.core.scale.setScalar(carrier ? 0.7 : 1);
    this.exfil.rotation.y = 0;
    for (let i = 0; i < this.medkits.length; i++) {
      this.medkits[i].visible = w.pickups[i].active;
      this.medkits[i].rotation.y = t * 0.6;
      this.medkits[i].position.y = 0.5 + Math.sin(t * 3 + i) * 0.08;
    }
    const events = new Set(w.effects.map((e) => e.id));
    for (const [id, g] of this.particles)
      if (!events.has(id)) {
        this.scene.remove(g);
        this.particles.delete(id);
      }
    for (const e of w.effects) {
      let g = this.particles.get(e.id);
      if (!g) {
        g = new THREE.Group();
        g.position.set(e.x, 0.9, e.z);
        const count = e.kind === "nova" ? 20 : e.kind === "explosion" ? 12 : 6;
        for (let i = 0; i < count; i++) {
          const m = new THREE.Mesh(
            this.particleGeometry,
            this.material(
              e.kind === "heal"
                ? "#76e2ba"
                : e.kind === "nova" ? "#8bdfff" : e.kind === "hack"
                  ? "#bc92ed"
                  : "#ffd17e",
              true,
            ),
          );
          m.userData.angle = (i / count) * Math.PI * 2;
          m.userData.height = ((i % 3) + 1) * 0.3;
          g.add(m);
        }
        this.particles.set(e.id, g);
        this.scene.add(g);
      }
      const age = w.time - e.t;
      for (const child of g.children) {
        const angle = child.userData.angle;
        child.position.set(
          Math.cos(angle) * age * (e.kind === "nova" ? 6 : 3),
          age * child.userData.height * 3 - age * age * 3,
          Math.sin(angle) * age * (e.kind === "nova" ? 6 : 3),
        );
        child.scale.setScalar(Math.max(0, 1 - age / 0.7));
      }
    }
    if (active && self && input && self.health > 0) {
      this.aimTarget.set(self.x + input.ax * 5, 0.045, self.z + input.az * 5);
      this.reticle.position.copy(this.aimTarget);
      this.reticle.visible = true;
    } else this.reticle.visible = false;
    this.renderHazards(w, t);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.observer.disconnect();
    this.renderer.setAnimationLoop(null);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.bulletGeometry.dispose();
    this.particleGeometry.dispose();
    this.glow.dispose();
    this.textures.forEach((t) => t.dispose());
    this.composer?.passes.forEach((p) => p.dispose?.());
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
