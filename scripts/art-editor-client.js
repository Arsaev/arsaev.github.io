const form = document.getElementById('art-form');
const result = document.getElementById('result');
const submit = form.querySelector('[type=submit]');
const reset = form.querySelector('[type=reset]');
const token = document.querySelector('[name=editor-token]').content;
const accept = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
let preview;
let closeups = [];
let objectUrls = [];

function setDate() {
  const now = new Date();
  form.elements.date.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function image(file) {
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  img.alt = file.name;
  objectUrls.push(img.src);
  return img;
}
function renderImages() {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls = [];
  document.getElementById('preview-photo').replaceChildren(...(preview ? [image(preview)] : []));
  const list = document.getElementById('closeup-photos');
  list.replaceChildren();
  closeups.forEach((photo, index) => {
    const row = document.createElement('div');
    row.className = 'photo';
    const label = document.createElement('label');
    label.textContent = `Close-up ${index + 1} description`;
    const input = document.createElement('input');
    input.required = true;
    input.maxLength = 500;
    input.value = photo.alt;
    input.placeholder = 'Detail of the brushwork on the hand';
    input.oninput = () => { photo.alt = input.value; };
    label.append(input);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove close-up ${index + 1}`);
    remove.onclick = () => {
      closeups.splice(index, 1);
      renderImages();
      document.getElementById('closeups-input').focus();
    };
    row.append(image(photo.file), label, remove);
    list.append(row);
  });
}
function addFiles(files, main) {
  const incoming = Array.from(files);
  if (!incoming.length) return;
  if (incoming.some(file => !accept.has(file.type) || !file.size || file.size > 20 * 1024 * 1024)) {
    result.textContent = 'Use JPEG, PNG, WebP or GIF images, up to 20 MB each.';
    return;
  }
  if (main && incoming.length !== 1) { result.textContent = 'Drop just one preview image.'; return; }
  if (!main && closeups.length + incoming.length > 20) { result.textContent = 'You can add up to 20 close-ups.'; return; }
  const total = (main ? incoming[0].size : preview?.size || 0) + closeups.reduce((sum, photo) => sum + photo.file.size, 0) + (main ? 0 : incoming.reduce((sum, file) => sum + file.size, 0));
  if (total > 100 * 1024 * 1024) { result.textContent = 'Keep the total upload under 100 MB.'; return; }
  if (main) preview = incoming[0]; else closeups.push(...incoming.map(file => ({ file, alt: '' })));
  result.textContent = '';
  renderImages();
}
for (const kind of ['preview', 'closeups']) {
  const area = document.getElementById(`${kind}-drop`);
  const input = document.getElementById(`${kind}-input`);
  input.onchange = () => { addFiles(input.files, kind === 'preview'); input.value = ''; };
  area.addEventListener('dragover', event => { event.preventDefault(); area.classList.add('drag'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag'));
  area.addEventListener('drop', event => { event.preventDefault(); area.classList.remove('drag'); addFiles(event.dataTransfer.files, kind === 'preview'); });
}
// Avoid navigating away from unsaved work when an image misses a drop zone.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!preview) { result.textContent = 'Choose a preview image first.'; document.getElementById('preview-input').focus(); return; }
  const data = new FormData(form);
  data.append('preview', preview);
  closeups.forEach(photo => { data.append('closeups', photo.file); data.append('alt', photo.alt); });
  submit.disabled = reset.disabled = true;
  result.textContent = 'Saving painting…';
  try {
    const response = await fetch('/paintings', { method: 'POST', headers: { 'X-Editor-Token': token }, body: data });
    if (!response.ok) throw new Error(await response.text());
    const saved = await response.json();
    result.textContent = `Saved locally:\n${saved.content}\n${saved.images.join('\n')}\n\nReview with git diff, then commit when ready. Choose “Add another” for the next painting.`;
  } catch (error) {
    result.textContent = error.message;
    submit.disabled = false;
  } finally { reset.disabled = false; }
});
form.addEventListener('reset', () => {
  preview = undefined;
  closeups = [];
  renderImages();
  result.textContent = '';
  submit.disabled = false;
  setTimeout(setDate);
});
window.addEventListener('beforeunload', event => {
  if ((preview || closeups.length) && !submit.disabled) { event.preventDefault(); event.returnValue = ''; }
});
fetch('/mediums').then(response => {
  if (!response.ok) throw new Error('Could not load medium suggestions. You can still type a medium.');
  return response.json();
}).then(mediums => {
  document.getElementById('mediums').replaceChildren(...mediums.map(medium => {
    const option = document.createElement('option'); option.value = medium; return option;
  }));
}).catch(error => { result.textContent = error.message; });
setDate();
