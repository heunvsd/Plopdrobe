/* Edit these values to change the rhythm of the landing page. */
const SETTINGS = { color: '#0018a3', maxCoverage: 0.68, drawDuration: 1500, fontSize: 22 };
const stage = document.querySelector('#stage');
const svg = document.querySelector('#drawing');
const status = document.querySelector('#status');
const NS = 'http://www.w3.org/2000/svg';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let serial = 0;
let pairCount = 0;
let ready = false;
const copy = [...new Set(window.PLOPDROBE_COPY)];
let measuredCopy = [];
let recentPhrases = [];
function measureCopy() {
  const probe = element('text', { class: 'orbit-type', 'font-size': SETTINGS.fontSize, visibility: 'hidden' });
  svg.append(probe);
  measuredCopy = copy.map(phrase => {
    probe.textContent = phrase;
    return { phrase, width: probe.getComputedTextLength() };
  }).sort((a, b) => a.width - b.width);
  probe.remove();
}
function choosePhrase(length) {
  const eligible = measuredCopy.filter(item => item.width <= length * SETTINGS.maxCoverage);
  if (!eligible.length) return null;
  const balanced = eligible.filter(item => item.width >= length * .32);
  const pool = balanced.length ? balanced : eligible;
  const fresh = pool.filter(item => !recentPhrases.includes(item.phrase));
  const choices = fresh.length ? fresh : pool;
  const choice = choices[Math.floor(Math.random() * choices.length)];
  recentPhrases.push(choice.phrase);
  if (recentPhrases.length > 10) recentPhrases.shift();
  return choice.phrase;
}
function element(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function ellipsePath(rx, ry, start, reverse = false) {
  const x = rx * Math.cos(start), y = ry * Math.sin(start);
  const sweep = reverse ? 0 : 1;
  return `M ${x} ${y} A ${rx} ${ry} 0 1 ${sweep} ${-x} ${-y} A ${rx} ${ry} 0 1 ${sweep} ${x} ${y}`;
}
function makeOrbit(parent, cx, cy, rx, ry, rotation, start, phrase, mirrored) {
  const group = element('g', { transform: `translate(${cx} ${cy}) rotate(${rotation})` });
  parent.append(group);
  const id = `orbit-${++serial}`;
  const path = element('path', { id, d: ellipsePath(rx, ry, mirrored ? Math.PI - start : start, mirrored), class: 'orbit-line' });
  group.append(path);
  const length = path.getTotalLength();
  const text = element('text', { class: 'orbit-type', dy: 0, 'dominant-baseline': 'alphabetic', 'font-size': SETTINGS.fontSize });
  const textPath = element('textPath', { href: `#${id}`, startOffset: '3%' });
  text.append(textPath);
  group.append(text);
  // Alphabetic baseline lies directly on the same path as the outline.
  // Font size stays fixed; choosePhrase has already selected a complete phrase that fits.
  Array.from(phrase).forEach((character, i) => {
    const span = element('tspan');
    span.textContent = character;
    span.style.animationDelay = `${120 + i / phrase.length * 1300}ms`;
    textPath.append(span);
  });
  if (!reducedMotion.matches) path.animate([
    { strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
    { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }
  ], { duration: SETTINGS.drawDuration, easing: 'cubic-bezier(.25,.1,.25,1)', fill: 'both' });
}
// One drawing engine for home clicks and simulation releases.
function drawMirroredInk(surface, x, y, count, exactPosition = false) {
  if (!ready) return null;
  const { width, height } = surface.getBoundingClientRect();
  if (!width || !height) return null;
  const scale = Math.min(width / 1100, height / 800, 1.2);
  const sizes = [42, 62, 88, 120, 165, 215];
  const size = exactPosition ? sizes[Math.floor(Math.random() * sizes.length)] : sizes[count % sizes.length];
  const base = Math.max(38, size * Math.max(.65, scale) * (.9 + Math.random() * .2));
  const shapes = [[1, 1], [1.6, .65], [.65, 1.5], [1.3, .85], [.85, 1.3], [1.8, .65]];
  const shape = shapes[Math.floor(Math.random() * shapes.length)];
  let rx = base * shape[0], ry = base * shape[1];
  const rotation = (Math.random() - .5) * 100;
  const start = -Math.PI / 2 + Math.random() * Math.PI;
  const probe = element('path', { d: ellipsePath(rx, ry, start), visibility: 'hidden' });
  surface.append(probe);
  let length = probe.getTotalLength();
  // Even the smallest circle must hold the shortest complete supplied phrase.
  const minimum = measuredCopy[0].width / SETTINGS.maxCoverage;
  if (length < minimum) {
    const factor = minimum / length * 1.01;
    rx *= factor; ry *= factor;
    probe.setAttribute('d', ellipsePath(rx, ry, start));
    length = probe.getTotalLength();
  }
  const phrase = choosePhrase(length);
  probe.remove();
  if (!phrase) return null;
  // Simulation art is centered on the exact release point and its reflected point.
  let left = Math.min(x, width - x);
  if (!exactPosition) left = Math.min(left, width / 2 - rx * .7);
  const parent = element('g', { class: 'orbit-pair', 'data-copy': phrase });
  surface.append(parent);
  makeOrbit(parent, left, y, rx, ry, rotation, start, phrase, false);
  makeOrbit(parent, width - left, y, rx, ry, -rotation, start, phrase, true);
  return phrase;
}
window.drawPlopInk = (surface, x, y, count = 0) => drawMirroredInk(surface, x, y, count, true);
function draw(x, y) {
  const phrase = drawMirroredInk(svg, x, y, pairCount);
  if (!phrase) return;
  window.playPlopTone?.();
  pairCount++;
  document.body.classList.add('has-drawing');
  status.textContent = phrase.replaceAll(' ·', '') + ' — ' + pairCount;
}
stage.addEventListener('click', e => {
  const rect = stage.getBoundingClientRect();
  draw(e.clientX - rect.left, e.clientY - rect.top);
});
stage.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    draw(stage.clientWidth * .22, stage.clientHeight * (.18 + Math.random() * .52));
  }
  if (e.key === 'Escape') clear();
});
function clear() {
  svg.replaceChildren();
  pairCount = 0;
  recentPhrases = [];
  document.body.classList.remove('has-drawing');
  status.textContent = 'A new beginning.';
  stage.focus({ preventScroll: true });
}

// Resize existing art symmetrically without re-running its animations.
let previousWidth = stage.clientWidth, previousHeight = stage.clientHeight;
new ResizeObserver(() => {
  const width = stage.clientWidth, height = stage.clientHeight;
  if (!width || !height) return;
  for (const parent of svg.children) {
    for (const group of parent.children) {
      const value = group.getAttribute('transform');
      const [, x, y] = value.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
      group.setAttribute('transform', value.replace(/translate\([^)]+\)/, `translate(${+x * width / previousWidth} ${+y * height / previousHeight})`));
    }
  }
  previousWidth = width; previousHeight = height;
}).observe(stage);
function enableDrawing() { measureCopy(); ready = true; }
document.fonts.load(`${SETTINGS.fontSize}px "Plop Garamond"`).then(enableDrawing, enableDrawing);

// Navigation stays outside the drawing surface, so menu clicks never create circles.
const panel = document.querySelector('#info-panel');
const panels = {
  collections: ['Collections', 'Collections are not available yet.']
};
// Full-page navigation is managed by shop.js; Collections keeps its temporary dialog.
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
  const [title, body] = panels[button.dataset.panel];
  document.querySelector('#panel-title').textContent = title;
  document.querySelector('#panel-body').textContent = body;
  panel.showModal();
}));
panel.querySelector('.panel-close').addEventListener('click', () => panel.close());
panel.addEventListener('click', event => { if (event.target === panel) { const r = panel.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) panel.close(); } });
