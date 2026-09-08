import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildCityGroup, buildGround } from "./city.js";

export class Viewport {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#05070a");
    this.scene.fog = new THREE.FogExp2("#05070a", 0.006);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000);
    this.camera.position.set(86, 92, 110);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.set(0, 8, 0);

    this.scene.add(new THREE.AmbientLight(0x7fd7e8, 0.45));
    const key = new THREE.DirectionalLight(0x00e5ff, 1.4);
    key.position.set(40, 80, 20);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd4ff00, 0.25);
    fill.position.set(-50, 30, -20);
    this.scene.add(fill);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.composer = null;
    this.bloomPass = null;
    this.useBloom = true;
    this.autoRotate = false;
    this._running = true;
    this._clock = new THREE.Clock();

    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this.resize();
    this._buildComposer();
    this._loop();
  }

  _buildComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.72, 0.42, 0.18);
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
    this.useBloom = on;
    if (this.bloomPass) this.bloomPass.enabled = on;
  }

  setScene(reconstruction, params, style) {
    this.world.clear();
    if (!reconstruction) return;
    this.world.add(buildGround(reconstruction, params, style));
    this.world.add(buildCityGroup(reconstruction, params, style));
    const span = Math.max(reconstruction.width, reconstruction.height) * params.metersPerPixel;
    this.camera.position.set(span * 0.55, span * 0.62, span * 0.7);
    this.controls.target.set(0, span * 0.06, 0);
    this.controls.update();
  }

  setView(kind, reconstruction, params) {
    if (!reconstruction) return;
    const span = Math.max(reconstruction.width, reconstruction.height) * params.metersPerPixel;
    if (kind === "top") {
      this.camera.position.set(0, span * 1.15, 0.01);
      this.controls.target.set(0, 0, 0);
    } else if (kind === "street") {
      this.camera.position.set(span * 0.02, span * 0.08, span * 0.55);
      this.controls.target.set(0, span * 0.05, 0);
    } else {
      this.camera.position.set(span * 0.55, span * 0.62, span * 0.7);
      this.controls.target.set(0, span * 0.06, 0);
    }
    this.controls.update();
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
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
      if (this.autoRotate) this.world.rotation.y += this._clock.getDelta() * 0.12;
      else this._clock.getDelta();
      this.controls.update();
      if (this.useBloom && this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose() {
    this._running = false;
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
  }
}
