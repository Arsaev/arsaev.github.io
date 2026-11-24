import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual viewer handlers with a small DOM stand-in; no browser dependency needed.
class Element {
  children = []; attrs = {}; handlers = {}; style = {}; hidden = false;
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  querySelectorAll() { return this.children; }
  closest() { return null; }
  contains(target) { return this.children.includes(target); }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  animate(frames) { this.frames = frames; return { finished: Promise.resolve(), cancel() {} }; }
  showModal() { this.open = true; }
  close() { this.open = false; this.handlers.close?.(); }
}
const ids = Object.fromEntries(['painting-content', 'softbox', 'softbox-close', 'softbox-img', 'softbox-images', 'painting-previous', 'painting-next', 'painting-position', 'softbox-name', 'softbox-medium', 'softbox-dimensions', 'softbox-author', 'softbox-text', 'softbox-status', 'softbox-date'].map(id => [id, new Element()]));
function card(name, closeups = []) {
  const item = new Element();
  item.dataset = { art: JSON.stringify({ name, heroImage: `${name}.jpg`, year: 2025, month: 1, closeups }) };
  return item;
}
const first = card('First', [{ src: 'detail.jpg', alt: 'Paint texture' }]);
const hidden = card('Private'); hidden.hidden = true;
const last = card('Last');
let cards = [first, hidden, last];
const document = {
  body: new Element(),
  getElementById: id => ids[id],
  querySelector: selector => ids[selector.slice(1)],
  querySelectorAll: selector => selector === '.art-card' ? cards : [],
  createElement: () => new Element(),
};
const source = readFileSync(new URL('../src/components/ArtGallery.astro', import.meta.url), 'utf8');
const viewer = source.slice(source.indexOf('    const images ='), source.indexOf('\n  });\n</script>'));
const motion = { matches: false };
const context = vm.createContext({ document, window: { matchMedia: () => motion } });
const settle = () => new Promise(resolve => setImmediate(resolve));
vm.runInContext(ts.transpile(viewer + '\nglobalThis.viewer = { showPainting, closeViewer };'), context);
context.viewer.showPainting(first);
assert(ids.softbox.open);
assert.equal(ids['softbox-img'].src, 'First.jpg');
assert.equal(ids['softbox-images'].children.length, 2);
ids['softbox-images'].children[1].onclick();
assert.equal(ids['softbox-img'].src, 'detail.jpg');
assert.equal(ids['softbox-img'].alt, 'Paint texture');
await ids['painting-next'].onclick();
assert.equal(ids['softbox-name'].textContent, 'Last');
assert.equal(ids['painting-position'].textContent, '2 of 2');
assert(ids['softbox-images'].hidden);
await ids['painting-next'].onclick();
assert.equal(ids['softbox-img'].src, 'First.jpg'); // Wrap and reset close-up.
await ids['painting-previous'].onclick();
assert.equal(ids['softbox-name'].textContent, 'Last');
cards = [last, hidden, first];
await ids['painting-next'].onclick();
assert.equal(ids['softbox-name'].textContent, 'First'); // Follow current DOM order.
ids.softbox.handlers.keydown({ key: 'ArrowRight', target: ids.softbox, preventDefault() {} });
await settle();
await settle();
assert.equal(ids['softbox-name'].textContent, 'Last');
ids.softbox.handlers.touchstart({ target: ids['softbox-img'], touches: [{ clientX: 150, clientY: 10 }] });
ids.softbox.handlers.touchend({ changedTouches: [{ clientX: 10, clientY: 15 }] });
await settle();
assert.equal(ids['painting-content'].frames[0].transform, 'translateX(100%)');
assert.equal(ids['softbox-name'].textContent, 'First');
// Vertical scrolling, cancelled gestures, thumbnail scrolling and pinch zoom must not navigate.
for (const end of [{ clientX: 130, clientY: 200 }, { clientX: 145, clientY: 10 }]) {
  ids.softbox.handlers.touchstart({ target: ids['softbox-img'], touches: [{ clientX: 150, clientY: 10 }] });
  ids.softbox.handlers.touchend({ changedTouches: [end] });
  assert.equal(ids['softbox-name'].textContent, 'First');
}
ids.softbox.handlers.touchstart({ target: { closest: () => true }, touches: [{ clientX: 150, clientY: 10 }] });
ids.softbox.handlers.touchend({ changedTouches: [{ clientX: 10, clientY: 10 }] });
assert.equal(ids['softbox-name'].textContent, 'First');
ids.softbox.handlers.touchstart({ target: ids['softbox-img'], touches: [{ clientX: 150, clientY: 10 }] });
ids.softbox.handlers.touchmove({ touches: [{}, {}] });
ids.softbox.handlers.touchend({ changedTouches: [{ clientX: 10, clientY: 10 }] });
assert.equal(ids['softbox-name'].textContent, 'First');
ids.softbox.handlers.touchstart({ target: ids['softbox-img'], touches: [{ clientX: 150, clientY: 10 }] });
ids.softbox.handlers.touchmove({ touches: [{ clientX: 90, clientY: 12 }], cancelable: true, preventDefault() { this.prevented = true; } });
ids.softbox.handlers.touchcancel();
ids.softbox.handlers.touchend({ changedTouches: [{ clientX: 10, clientY: 10 }] });
assert.equal(ids['softbox-name'].textContent, 'First');
// Reduced motion switches immediately without starting another slide.
motion.matches = true;
const frames = ids['painting-content'].frames;
await ids['painting-next'].onclick();
assert.equal(ids['painting-content'].frames, frames);
await ids['painting-previous'].onclick();
motion.matches = false;
// Closing mid-animation must never reopen the viewer or reveal a pending painting.
const pending = ids['painting-next'].onclick();
context.viewer.closeViewer();
await pending;
assert(!ids.softbox.open);
last.hidden = true;
context.viewer.showPainting(first);
assert(ids['painting-next'].disabled);
context.viewer.showPainting(hidden);
assert.equal(ids['softbox-name'].textContent, 'First');
context.viewer.closeViewer();
assert(!ids.softbox.open);
assert.equal(document.body.style.overflow, undefined);
assert.equal(ids['softbox-images'].children.length, 0);
console.log('Art viewer checks passed.');
