if ('serviceWorker' in navigator) {
  const base = document.querySelector('base')?.href || location.pathname.replace(/\/[^\/]*$/, '/');
  navigator.serviceWorker.register(base + 'sw.js').catch(() => {});
}
