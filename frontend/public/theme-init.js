(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var query = params.get('theme');
    var saved = localStorage.getItem('emtehani-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = query === 'dark' || query === 'light'
      ? query
      : saved === 'dark' || saved === 'light'
        ? saved
        : prefersDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
  }
})();
