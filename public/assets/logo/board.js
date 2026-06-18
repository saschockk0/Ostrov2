/* Брендборд: подменяет <img data-inline> на инлайн-SVG, чтобы одноцветные
   варианты (fill="currentColor") наследовали CSS color родителя.
   Загружается внешним файлом — CSP сайта запрещает инлайн-скрипты. */
(function () {
  const imgs = document.querySelectorAll('img[data-inline]');
  imgs.forEach(async (img) => {
    try {
      const res = await fetch(img.getAttribute('src'));
      if (!res.ok) return;
      const text = await res.text();
      const svg = new DOMParser()
        .parseFromString(text, 'image/svg+xml')
        .querySelector('svg');
      if (!svg) return;
      // Убираем собственный color знака, чтобы currentColor брал цвет родителя.
      svg.removeAttribute('color');
      svg.setAttribute('class', img.className);
      svg.setAttribute('role', 'img');
      img.replaceWith(svg);
    } catch (_) {
      /* при ошибке оставляем <img> как есть */
    }
  });
})();
