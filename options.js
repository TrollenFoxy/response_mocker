const $ = s => document.querySelector(s);
const FIELDS = ['name', 'matchType', 'pattern', 'method', 'page', 'status', 'statusText', 'delay', 'contentType', 'headers', 'body'];
let state = { rules: [], enabled: true };
let selected = null;
let dirty = false;

const uid = () => Math.random().toString(36).slice(2, 10);
const blank = () => ({
  id: uid(), name: 'Новое правило', enabled: true, matchType: 'contains', pattern: '', method: 'ANY',
  page: '', status: 200, statusText: '', delay: 0, contentType: 'application/json', headers: '',
  body: '{\n  "ok": true\n}'
});
const current = () => state.rules.find(r => r.id === selected) || null;
const persist = () => chrome.storage.local.set({ rules: state.rules, enabled: state.enabled });

function setMsg(text, isError = false) {
  const el = $('#msg');
  el.textContent = text;
  el.classList.toggle('err', isError);
}

function renderList() {
  const ul = $('#list');
  ul.replaceChildren();
  for (const r of state.rules) {
    const li = document.createElement('li');
    li.className = r.id === selected ? 'sel' : '';
    const sw = document.createElement('label');
    sw.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = r.enabled;
    cb.setAttribute('aria-label', 'Включить правило ' + r.name);
    cb.onclick = e => e.stopPropagation();
    cb.onchange = () => { r.enabled = cb.checked; persist(); };
    sw.onclick = e => e.stopPropagation();
    sw.append(cb);
    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = r.name || 'Без названия';
    const url = document.createElement('span');
    url.className = 'url';
    url.textContent = `${r.method} ${r.pattern || '—'} → ${r.status}`;
    info.append(name, url);
    li.append(sw, info);
    li.onclick = () => select(r.id);
    ul.append(li);
  }
  $('#enabled').checked = state.enabled;
  $('#enabledLabel').textContent = state.enabled ? 'Подмена включена' : 'Подмена выключена';
}

function fillForm() {
  const r = current();
  $('#editor').hidden = !r;
  $('#empty').hidden = !!r;
  if (!r) return;
  for (const f of FIELDS) $('#' + f).value = r[f] ?? '';
  dirty = false;
  setMsg('');
}

function select(id) {
  if (id !== selected && dirty && !confirm('Отменить несохранённые изменения?')) return;
  selected = id;
  renderList();
  fillForm();
}

function readForm() {
  const o = {};
  for (const f of FIELDS) o[f] = $('#' + f).value;
  o.status = parseInt(o.status, 10);
  o.delay = parseInt(o.delay || '0', 10);
  return o;
}

function validate(d) {
  if (!d.pattern.trim()) return 'Укажите адрес запроса.';
  if (d.matchType === 'regex') {
    try { new RegExp(d.pattern); } catch (e) { return 'Некорректное регулярное выражение: ' + e.message; }
  }
  if (!(d.status >= 200 && d.status <= 599)) return 'Код ответа должен быть от 200 до 599.';
  if (!(d.delay >= 0)) return 'Задержка не может быть отрицательной.';
  if (/json/i.test(d.contentType) && d.body.trim()) {
    try { JSON.parse(d.body); } catch (e) { return 'Тело ответа не является корректным JSON: ' + e.message; }
  }
  return '';
}

$('#save').onclick = async () => {
  const r = current();
  const d = readForm();
  const err = validate(d);
  if (err) return setMsg(err, true);
  Object.assign(r, d);
  await persist();
  dirty = false;
  renderList();
  setMsg('Сохранено');
};

$('#add').onclick = async () => {
  if (dirty && !confirm('Отменить несохранённые изменения?')) return;
  const r = blank();
  state.rules.unshift(r);
  selected = r.id;
  await persist();
  renderList();
  fillForm();
  $('#pattern').focus();
};

$('#dup').onclick = async () => {
  const r = current();
  const copy = { ...r, id: uid(), name: (r.name || 'Правило') + ' (копия)' };
  state.rules.splice(state.rules.indexOf(r) + 1, 0, copy);
  selected = copy.id;
  await persist();
  renderList();
  fillForm();
};

$('#del').onclick = async () => {
  const r = current();
  if (!confirm(`Удалить правило «${r.name}»?`)) return;
  state.rules = state.rules.filter(x => x.id !== r.id);
  selected = state.rules[0]?.id ?? null;
  await persist();
  dirty = false;
  renderList();
  fillForm();
};

$('#enabled').onchange = async e => { state.enabled = e.target.checked; await persist(); renderList(); };

$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(state.rules, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'response-mocker-rules.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#import').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const list = JSON.parse(await file.text());
    if (!Array.isArray(list)) throw new Error('ожидался массив правил');
    const ids = new Set(state.rules.map(r => r.id));
    for (const item of list) {
      const r = { ...blank(), ...item };
      if (ids.has(r.id)) r.id = uid();
      ids.add(r.id);
      state.rules.push(r);
    }
    await persist();
    selected = selected ?? state.rules[0]?.id ?? null;
    renderList();
    fillForm();
  } catch (err) {
    alert('Не удалось импортировать файл: ' + err.message);
  }
};

for (const f of FIELDS) $('#' + f).addEventListener('input', () => { dirty = true; setMsg(''); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.rules) state.rules = changes.rules.newValue || [];
  if (changes.enabled) state.enabled = changes.enabled.newValue !== false;
  if (selected && !current()) { selected = state.rules[0]?.id ?? null; dirty = false; }
  renderList();
  if (!dirty) fillForm();
});

chrome.storage.local.get({ rules: [], enabled: true }).then(d => {
  state = d;
  selected = state.rules[0]?.id ?? null;
  renderList();
  fillForm();
});
