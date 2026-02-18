(function () {
  const now = new Date();
  document.querySelectorAll('[data-now]').forEach((el) => {
    el.textContent = now.toISOString();
  });

  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (path.endsWith(href.replace('./', '/')) || path.includes('/' + href.replace('./', '').replace('/index.html', '') + '/')) {
      a.classList.add('active');
    }
  });
})();
