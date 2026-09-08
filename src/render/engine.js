import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildCityGroup, buildGround, pickBuildingAt } from "./city.js";

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class Viewport {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#05070a");
    this.scene.fog = new THREE.FogExp2("#05070a", 0.00115);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 8000);
    this.camera.position.set(86, 92, 110);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setClearColor("#05070a", 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 2400;
    this.controls.target.set(0, 8, 0);
    this.controls.autoRotateSpeed = 0.55;

    this.scene.add(new THREE.AmbientLight(0x8ce8f4, 0.5));
    const key = new THREE.DirectionalLight(0x00e5ff, 1.55);
    key.position.set(50, 90, 28);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd4ff00, 0.28);
    fill.position.set(-60, 40, -30);
    this.scene.add(fill);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.composer = null;
    this.bloomPass = null;
    this.useBloom = true;
    this._running = true;
    this._clock = new THREE.Clock();
    this._softwareGL = this._detectSoftwareGL();
    this._camAnim = null;
    this._pickables = [];
    this._hover = null;
    this._selected = null;
    this._onPick = null;
    this._scan = null;

    this._ndc = new THREE.Vector2();
    this.renderer.domElement.addEventListener("pointermove", (e) => this._onPointer(e, false));
    this.renderer.domElement.addEventListener("click", (e) => this._onPointer(e, true));

    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    if (!this._softwareGL) this._buildComposer();
    else this.useBloom = false;
    this._loop();
  }

  set onPick(fn) {
    this._onPick = fn;
  }

  get autoRotate() {
    return this.controls.autoRotate;
  }

  set autoRotate(v) {
    this.controls.autoRotate = !!v;
  }

  _detectSoftwareGL() {
    try {
      const gl = this.renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      return /llvmpipe|swiftshader|softpipe|microsoft basic/i.test(name);
    } catch {
      return false;
    }
  }

  _buildComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.85, 0.48, 0.16);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  setBloom(on) {
    this.useBloom = on && !this._softwareGL && !!this.composer;
    if (this.bloomPass) this.bloomPass.enabled = this.useBloom;
  }

  setScene(reconstruction, params, style) {
    this.world.clear();
    this._pickables = [];
    this._hover = null;
    this._selected = null;
    this._scan = null;
    if (!reconstruction) return;
    this.resize();
    this.world.add(buildGround(reconstruction, params, style));
    const city = buildCityGroup(reconstruction, params, style);
    this.world.add(city);
    this._pickables = city.userData.pickables || [];
    this._scan = this.world.getObjectByName("scan");
    const span = Math.max(reconstruction.width, reconstruction.height) * params.metersPerPixel;
    this.flyTo(
      new THREE.Vector3(span * 0.58, span * 0.52, span * 0.72),
      new THREE.Vector3(0, span * 0.07, 0),
    );
    this.resize();
  }

  setView(kind, reconstruction, params) {
    if (!reconstruction) return;
    const span = Math.max(reconstruction.width, reconstruction.height) * params.metersPerPixel;
    if (kind === "top") {
      this.flyTo(new THREE.Vector3(0.02, span * 1.18, 0.02), new THREE.Vector3(0, 0, 0));
    } else if (kind === "street") {
      this.flyTo(new THREE.Vector3(span * 0.04, span * 0.11, span * 0.52), new THREE.Vector3(0, span * 0.06, 0));
    } else {
      this.flyTo(new THREE.Vector3(span * 0.58, span * 0.52, span * 0.72), new THREE.Vector3(0, span * 0.07, 0));
    }
  }

  flyTo(position, target, duration = 0.85) {
    this._camAnim = {
      t: 0,
      duration,
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
    };
  }

  _onPointer(event, click) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const hit = pickBuildingAt(this._pickables, this.camera, this._ndc);
    if (this._hover && this._hover !== hit) {
      this._hover.material.opacity = this._hover.userData.baseOpacity ?? this._hover.material.opacity;
    }
    this._hover = hit;
    this.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    if (hit) {
      hit.userData.baseOpacity ??= hit.material.opacity;
      if (hit !== this._selected) hit.material.opacity = Math.min(0.88, hit.userData.baseOpacity + 0.24);
    }
    if (click) {
      this._selected = hit;
      this._onPick?.(hit?.userData?.building || null);
    }
  }

  screenshot() {
    if (this.useBloom && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  exportGltf() {
    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();
      exporter.parse(
        this.world,
        (result) => {
          const blob =
            result instanceof ArrayBuffer
              ? new Blob([result], { type: "model/gltf-binary" })
              : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
          resolve(blob);
        },
        reject,
        { binary: true },
      );
    });
  }

  _loop() {
    const tick = () => {
      if (!this._running) return;
      requestAnimationFrame(tick);
      const dt = this._clock.getDelta();
      if (this._camAnim) {
        this._camAnim.t += dt / this._camAnim.duration;
        const k = easeInOut(Math.min(1, this._camAnim.t));
        this.camera.position.lerpVectors(this._camAnim.fromPos, this._camAnim.toPos, k);
        this.controls.target.lerpVectors(this._camAnim.fromTarget, this._camAnim.toTarget, k);
        if (this._camAnim.t >= 1) this._camAnim = null;
      }
      if (this._scan) {
        const maxY = this._scan.userData.maxY || 40;
        this._scan.position.y = ((Math.sin(this._clock.elapsedTime * 0.45) + 1) / 2) * maxY;
      }
      this.controls.update();
      if (this.useBloom && this.composer) {
        try {
          this.composer.render();
        } catch {
          this.useBloom = false;
          this.renderer.render(this.scene, this.camera);
        }
      } else this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose() {
    this._running = false;
    this._ro?.disconnect();
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
  }
}
