(() => {
  const dialog = document.querySelector('dialog.lightbox');
  const lightboxImg = dialog && dialog.querySelector('.lb-img');
  if (!dialog || !lightboxImg || typeof dialog.showModal !== 'function') {
    return;
  }

  let opener = null;

  const open = (img, button) => {
    opener = button;
    lightboxImg.src = img.currentSrc || img.src;
    lightboxImg.alt = img.alt;
    dialog.showModal();
  };

  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    lightboxImg.removeAttribute('src');
    if (opener) {
      opener.focus();
    }
  });

  document.querySelectorAll('img[data-zoom]').forEach((img) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zoom';
    button.setAttribute('aria-label', `Enlarge screenshot: ${img.alt}`);
    img.replaceWith(button);
    button.append(img);
    button.addEventListener('click', () => open(img, button));
  });
})();
