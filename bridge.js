// Изолированный контент-скрипт: передаёт правила из chrome.storage в страницу.
// Страница получает только включённые правила, подходящие под её адрес.
function push() {
  try {
    chrome.storage.local.get({ rules: [], enabled: true }).then(({ rules, enabled }) => {
      const mine = rules.filter(r => r.enabled && (!r.page || location.href.includes(r.page)));
      window.postMessage({ source: 'rmock-bridge', rules: mine, enabled }, '*');
    }).catch(() => {});
  } catch { /* расширение было перезагружено */ }
}

push();
window.addEventListener('message', e => {
  if (e.source === window && e.data && e.data.source === 'rmock-page') push();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.rules || changes.enabled)) push();
});
