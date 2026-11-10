const $ = s => document.querySelector(s);
let state = { rules: [], enabled: true };

const persist = () => chrome.storage.local.set(state);

function render() {
  $('#enabled').checked = state.enabled;
  $('#enabledLabel').textContent = state.enabled ? 'Вкл' : 'Выкл';
  document.body.classList.toggle('off', !state.enabled);
  $('#empty').hidden = state.rules.length > 0;
  const ul = $('#list');
  ul.replaceChildren();
  for (const r of state.rules) {
    const li = document.createElement('li');
    const sw = document.createElement('label');
    sw.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = r.enabled;
    cb.setAttribute('aria-label', 'Включить правило ' + r.name);
    cb.onchange = () => { r.enabled = cb.checked; persist(); };
    sw.append(cb);
    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = r.name || 'Без названия';
    const url = document.createElement('span');
    url.className = 'url';
    url.textContent = `${r.method} ${r.pattern} → ${r.status}`;
    info.append(name, url);
    li.append(sw, info);
    ul.append(li);
  }
}

$('#enabled').onchange = e => { state.enabled = e.target.checked; persist(); render(); };
$('#open').onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };

chrome.storage.local.get({ rules: [], enabled: true }).then(d => { state = d; render(); });
