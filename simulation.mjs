import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { dropAction, placementMotion, selectMount } from './simulation-rules.mjs';

const ASSETS = './assets/simulation/';
const keys = ['rodLeft', 'rodRight', 'coat', 'hat', 'bag'];
const rodKeys = ['rodLeft', 'rodRight'];
const labels = { rodLeft: 'LEFT WOODEN ROD', rodRight: 'RIGHT WOODEN ROD', coat: 'COAT', hat: 'HAT', bag: 'BAG' };
const defaultSupportFor = { coat: 'rodLeft', hat: 'rodRight' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let instance;
export async function openSimulation() {
  if (!instance) instance = createSimulation().catch(error => { instance = null; throw error; });
  const app = await instance;
  app.setActive(location.hash === '#simulation');
  return app;
}

async function createSimulation() {
  const section = document.querySelector('#simulation-view');
  const host = document.querySelector('#simulation-canvas');
  const ink = document.querySelector('#simulation-ink');
  const message = document.querySelector('#simulation-message');
  const stateOutput = document.querySelector('#simulation-state');
  const keyboardControls = document.querySelector('#simulation-objects');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  const camera = new THREE.OrthographicCamera(-2, 2, 1.2, -1.2, .01, 40);
  camera.position.set(2.1, 1.95, 5.8);
  camera.lookAt(0, .68, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Plopdrobe 3D assembly. Drag the wooden rods to the stand, then hang the coat, hat, and bag. Keyboard controls follow the canvas.');
  canvas.setAttribute('role', 'img');
  host.append(canvas);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  const light = new THREE.DirectionalLight(0xffffff, 2.6);
  light.position.set(-2.8, 5, 4);
  light.castShadow = false;
  scene.add(light, new THREE.HemisphereLight(0xffffff, 0xc4c5c7, 1.5));

  const loader = new GLTFLoader();
  const response = await fetch(`${ASSETS}accessory-mounts.json`);
  if (!response.ok) throw new Error('Mount data could not be loaded.');
  const mounts = await response.json();
  const models = await Promise.all(['stand', 'coat', 'hat', 'bag'].map(key => loader.loadAsync(`${ASSETS}plopdrobe-${key}.glb`)));
  const body = models[0].scene;
  body.name = 'Fixed stand body';
  scene.add(body);
  const items = {};
  const identity = new THREE.Quaternion();
  function addItem(key, object, targetPosition, targetQuaternion) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.object = key;
    keyboardControls.append(button);
    items[key] = { key, object, attached: false, mountKey: null, target: { position: targetPosition, quaternion: targetQuaternion }, home: null, animation: null, button };
    object.traverse(node => { if (node.isMesh) node.userData.simulationItem = key; });
    button.addEventListener('click', () => keyboardPlace(key));
  }
  // Separate the original GLB parts around their own midpoints, preserving assembled poses.
  for (const [key, name, foot, tip] of [
    ['rodLeft', 'Rod_Left', [.144866, .004, .016135], mounts.assets.coat.position],
    ['rodRight', 'Rod_Right', [-.130148, .004, .065618], mounts.assets.hat.position]
  ]) {
    const rod = body.getObjectByName(name);
    if (!rod) throw new Error(`Missing model part: ${name}`);
    const ends = [new THREE.Vector3().fromArray(foot), new THREE.Vector3().fromArray(tip)];
    const center = ends[0].clone().add(ends[1]).multiplyScalar(.5);
    const object = new THREE.Group(); object.name = labels[key]; object.position.copy(center);
    scene.add(object); scene.updateMatrixWorld(true); object.attach(rod);
    addItem(key, object, center.clone(), identity.clone());
    items[key].axis = ends[1].clone().sub(ends[0]).normalize();
    items[key].ends = ends.map(end => end.sub(center));
    items[key].tip = new THREE.Vector3().fromArray(tip);
    items[key].foot = new THREE.Vector3().fromArray(foot);
  }
  for (const [i, key] of ['coat', 'hat', 'bag'].entries()) {
    const model = models[i + 1].scene;
    const entry = mounts.assets[key];
    const root = model.getObjectByName(entry.root);
    if (!root) throw new Error(`Missing model root: ${entry.root}`);
    // GLBs open on the first keyframe (below the mount). Reset to the settled contact origin.
    root.position.set(0, 0, 0); root.quaternion.identity();
    const object = new THREE.Group(); object.name = labels[key]; object.add(model); scene.add(object);
    addItem(key, object, new THREE.Vector3().fromArray(entry.position), new THREE.Quaternion().fromArray(entry.quaternion));
  }
  scene.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; } });
  // Original GLBs only: no target markers or ghost models in the white space.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const animations = new Set();
  let drag = null, active = true, dirty = true, compact = false, width = 1, height = 1;
  let hoverKey = null, inkCount = 0;

  function say(text) { message.textContent = text; }
  function invalidate() { dirty = true; }
  function snapshot(object) { return { position: object.position.clone(), quaternion: object.quaternion.clone() }; }
  function sync() {
    for (const item of Object.values(items)) {
      section.dataset[item.key] = item.attached ? 'attached' : 'free';
      section.dataset[`${item.key}Mount`] = item.mountKey || '';
      item.button.textContent = `${item.attached ? 'REMOVE' : 'PLACE'} ${labels[item.key]}`;
      item.button.setAttribute('aria-pressed', String(item.attached));
      item.button.disabled = !!item.animation;
    }
    stateOutput.textContent = keys.map(key => `${labels[key]} ${items[key].attached ? 'ATTACHED' : 'FREE'}`).join(' · ');
  }
  function idleMessage() {
    if (keys.every(key => items[key].attached)) return 'A PLACE FOR YOUR EVERYDAY.';
    return 'DRAG, PLACE, REPEAT.';
  }
  function homePoses() {
    const positions = compact ? {
      rodLeft: [.36, .03, .80, .28],
      rodRight: [.43, .03, -.12, -.48],
      coat: [-.60, 0, .10, Math.PI / 2, .28, -.18],
      hat: [.65, 0, -.55, -.03, -.32, -.08],
      bag: [-.46, 0, .70, .03, -.32, -.12]
    } : {
      rodLeft: [.92, .03, .56, .28],
      rodRight: [.98, .03, -.43, -.48],
      coat: [-.98, 0, .12, Math.PI / 2, .28, -.18],
      hat: [1.05, 0, -.90, -.03, -.35, -.08],
      bag: [-.67, 0, .70, .03, -.32, -.12]
    };
    for (const item of Object.values(items)) {
      const v = positions[item.key];
      // Both rods lie flat on the floor, at different angles, and remain independently draggable.
      const quaternion = item.axis
        ? new THREE.Quaternion().setFromUnitVectors(item.axis, new THREE.Vector3(Math.cos(v[3]), 0, Math.sin(v[3])))
        : new THREE.Quaternion().setFromEuler(new THREE.Euler(...v.slice(3)));
      const pose = { position: new THREE.Vector3(...v.slice(0, 3)), quaternion };
      item.home = pose;
      if (!item.attached && !item.animation && drag?.item !== item) {
        item.object.position.copy(pose.position); item.object.quaternion.copy(pose.quaternion);
        settleOnFloor(item.object); item.home = snapshot(item.object);
      }
    }
  }
  function settleOnFloor(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    object.position.y += .008 - box.min.y;
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const previousWidth = width, previousHeight = height;
    width = rect.width; height = rect.height;
    for (const group of ink.querySelectorAll('.orbit-pair > g')) {
      const value = group.getAttribute('transform');
      const [, x, y] = value.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
      group.setAttribute('transform', value.replace(/translate\([^)]+\)/, `translate(${+x * width / previousWidth} ${+y * height / previousHeight})`));
    }
    const wasCompact = compact; compact = width < 700;
    const aspect = width / height;
    const viewHeight = compact ? Math.max(2.65, 2.05 / aspect) : Math.max(2.12, 3.25 / aspect);
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    if (!items.rodLeft.home || wasCompact !== compact) homePoses();
    invalidate();
  }
  const observer = new ResizeObserver(resize); observer.observe(host); resize();

  function projected(position) {
    const p = position.clone().project(camera);
    return new THREE.Vector2((p.x + 1) * width / 2, (-p.y + 1) * height / 2);
  }
  function pointerPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
  }
  function setRay(event) {
    const p = pointerPoint(event);
    pointer.set(p.x / width * 2 - 1, 1 - p.y / height * 2);
    raycaster.setFromCamera(pointer, camera);
    return p;
  }
  function pick(event) {
    setRay(event);
    const eligible = Object.values(items).filter(item => !item.animation);
    const intersections = raycaster.intersectObjects(eligible.map(item => item.object), true);
    if (intersections.length) return items[intersections[0].object.userData.simulationItem];
    // A narrow padded segment makes thin rods easy to grab without swallowing nearby objects.
    const p = pointerPoint(event);
    for (const key of rodKeys) {
      const item = items[key];
      if (item.animation) continue;
      item.object.updateMatrixWorld(true);
      const [a, b] = item.ends.map(end => projected(item.object.localToWorld(end.clone())));
      const ab = b.clone().sub(a);
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), .001), 0, 1);
      if (p.distanceTo(a.addScaledVector(ab, t)) < 12) return item;
    }
    return null;
  }
  function occupantOf(rodKey, except = null) {
    return ['coat', 'hat'].map(key => items[key]).find(item => item !== except &&
      ((item.attached && item.mountKey === rodKey) || (item.animation?.attached && item.animation.mountKey === rodKey)));
  }
  function supportsOccupied(item) { return rodKeys.includes(item.key) && !!occupantOf(item.key); }
  function mountCandidates(item) {
    if (rodKeys.includes(item.key)) return [{ key: 'body', pose: item.target, available: !supportsOccupied(item) }];
    if (item.key === 'bag') return [{ key: 'ring', pose: item.target, available: true }];
    return rodKeys.map(key => {
      const rod = items[key];
      const quaternion = item.target.quaternion.clone();
      if (item.key === 'hat' && key !== defaultSupportFor.hat) {
        quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(items[defaultSupportFor.hat].axis, rod.axis));
      }
      return { key, pose: { position: rod.tip.clone(), quaternion },
        available: rod.attached && !rod.animation && !occupantOf(key, item) };
    });
  }
  function supportAttached(item) { return mountCandidates(item).some(candidate => candidate.available); }
  function segmentDistance(point, a, b) {
    const ab = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), .001), 0, 1);
    return point.distanceTo(a.clone().addScaledVector(ab, t));
  }
  function distances(event, item) {
    const point = pointerPoint(event), anchor = projected(item.object.position);
    const base = projected(new THREE.Vector3(0, .05, 0));
    const top = projected(new THREE.Vector3(0, 1.20, 0));
    const radius = Math.max(95, Math.min(170, height * .24));
    const candidates = mountCandidates(item).map(candidate => {
      let a = projected(candidate.pose.position), b = a;
      if (rodKeys.includes(candidate.key)) {
        const rod = items[candidate.key];
        a = projected(rod.foot.clone().lerp(rod.tip, .25)); b = projected(rod.tip);
      } else if (candidate.key === 'body') { a = base; b = top; }
      return { ...candidate, distance: Math.min(segmentDistance(point, a, b), segmentDistance(anchor, a, b)) };
    });
    const mount = selectMount(item.key, candidates, radius);
    return { mount, nearMount: !!mount,
      outsideProduct: segmentDistance(anchor, base, top) > radius * 1.18,
      insideCanvas: point.x > 4 && point.y > 4 && point.x < width - 4 && point.y < height - 4 };
  }
  function leaveInk(point) {
    if (window.drawPlopInk?.(ink, point.x, point.y, inkCount)) inkCount++;
  }
  function animate(item, pose, attached, plop = true, mountKey = item.mountKey) {
    const start = snapshot(item.object);
    item.animation = { start, pose, attached, mountKey, plop, time: performance.now(), duration: reduced.matches ? 1 : plop ? 790 : 380 };
    animations.add(item); sync(); invalidate();
  }
  function cancelDrag(immediate = false) {
    if (!drag) return;
    const current = drag; drag = null;
    if (canvas.hasPointerCapture(current.pointerId)) canvas.releasePointerCapture(current.pointerId);
    if (immediate) {
      current.item.object.position.copy(current.start.position); current.item.object.quaternion.copy(current.start.quaternion);
    } else animate(current.item, current.start, current.wasAttached, false);
    section.dataset.dragging = ''; canvas.style.cursor = 'grab'; say(idleMessage()); invalidate();
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || event.button !== 0 || drag) return;
    const item = pick(event);
    if (!item) return;
    if (supportsOccupied(item)) { say(`REMOVE THE ${labels[occupantOf(item.key).key]} BEFORE MOVING THIS ROD.`); return; }
    event.preventDefault();
    const start = snapshot(item.object);
    camera.getWorldDirection(hit); plane.setFromNormalAndCoplanarPoint(hit, item.object.position);
    setRay(event); if (!raycaster.ray.intersectPlane(plane, hit)) return;
    drag = { item, pointerId: event.pointerId, start, wasAttached: item.attached, origin: pointerPoint(event), offset: item.object.position.clone().sub(hit), moved: false };
    canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
    section.dataset.dragging = item.key;
    say(labels[item.key]);
  });
  canvas.addEventListener('pointermove', event => {
    if (!active) return;
    if (!drag) {
      const item = pick(event);
      if (hoverKey !== item?.key) { hoverKey = item?.key; canvas.style.cursor = item ? 'grab' : 'default'; }
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const point = setRay(event);
    if (point.distanceTo(drag.origin) > 4) drag.moved = true;
    if (raycaster.ray.intersectPlane(plane, hit)) drag.item.object.position.copy(hit).add(drag.offset);
    invalidate();
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag, item = current.item;
    const d = distances(event, item);
    const action = dropAction({ key: item.key, wasAttached: current.wasAttached, supportAttached: supportAttached(item), supportsOccupied: supportsOccupied(item), ...d, moved: current.moved });
    drag = null; section.dataset.dragging = '';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = 'grab';
    const release = pointerPoint(event);
    if (current.moved && release.x >= 0 && release.x <= width && release.y >= 0 && release.y <= height) leaveInk(release);
    if (action === 'attach') {
      animate(item, d.mount.pose, true, true, d.mount.key); say(`${labels[item.key]} — PLOP.`);
    } else if (action === 'detach') {
      const pose = snapshot(item.object); pose.quaternion.copy(item.home.quaternion);
      item.object.quaternion.copy(pose.quaternion); settleOnFloor(item.object); pose.position.copy(item.object.position);
      item.object.quaternion.copy(current.start.quaternion);
      animate(item, pose, false); say(`${labels[item.key]} SET ASIDE.`);
    } else {
      animate(item, current.start, current.wasAttached, false);
      say('PLOP.');
    }
  });
  canvas.addEventListener('pointercancel', () => cancelDrag());
  canvas.addEventListener('lostpointercapture', () => { if (drag) cancelDrag(); });
  window.addEventListener('blur', () => cancelDrag());
  section.addEventListener('keydown', event => { if (event.key === 'Escape') { cancelDrag(); } });
  function keyboardPlace(key) {
    const item = items[key];
    if (item.animation) return;
    if (supportsOccupied(item)) { say(`REMOVE THE ${labels[occupantOf(key).key]} FIRST.`); return; }
    const candidates = mountCandidates(item).map(candidate => ({ ...candidate,
      distance: candidate.key === defaultSupportFor[key] ? 0 : 1 }));
    const mount = selectMount(key, candidates);
    if (!item.attached && !mount) { say('PLACE A FREE WOODEN ROD FIRST.'); return; }
    const pose = item.attached ? item.home : mount.pose;
    leaveInk(projected(pose.position));
    animate(item, pose, !item.attached, true, mount?.key ?? item.mountKey);
    say(`${labels[key]} — PLOP.`);
  }
  function reset() {
    cancelDrag(true);
    animations.clear();
    for (const item of Object.values(items)) { item.animation = null; item.attached = false; item.mountKey = null; }
    ink.replaceChildren(); inkCount = 0;
    homePoses(); sync(); say(idleMessage()); invalidate();
  }
  document.querySelector('#simulation-reset').addEventListener('click', reset);
  function setActive(value) {
    active = value;
    if (!value) cancelDrag(true);
    else { resize(); invalidate(); }
  }
  window.addEventListener('plopdrobe:route', event => setActive(event.detail === '#simulation'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelDrag(true); else invalidate(); });
  reset();
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  section.dataset.ready = 'true';
  renderer.setAnimationLoop(now => {
    if (!active || document.hidden) return;
    for (const item of animations) {
      const a = item.animation;
      const t = Math.min(1, (now - a.time) / a.duration);
      const motion = a.plop ? placementMotion(t) : { travel: 1 - (1 - t) ** 3, lift: 0, sway: 0 };
      item.object.position.lerpVectors(a.start.position, a.pose.position, motion.travel);
      item.object.position.y += motion.lift;
      item.object.quaternion.slerpQuaternions(a.start.quaternion, a.pose.quaternion, motion.travel);
      if (motion.sway) item.object.rotateZ(motion.sway);
      if (t === 1) {
        item.object.position.copy(a.pose.position); item.object.quaternion.copy(a.pose.quaternion);
        item.attached = a.attached; item.mountKey = a.attached ? a.mountKey : null; item.animation = null; animations.delete(item);
        if (a.plop) window.playPlopTone?.();
        sync(); if (keys.every(key => items[key].attached)) say(idleMessage());
      }
      invalidate();
    }
    if (dirty) { scene.updateMatrixWorld(true); renderer.render(scene, camera); dirty = false; }
  });
  return { setActive };
}
