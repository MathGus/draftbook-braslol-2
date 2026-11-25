(() => {
  'use strict';

  const publisherId = 'ca-pub-5611015326590025';
  const slotId = '';

  if (!/^ca-pub-\d{16}$/.test(publisherId) || !/^\d+$/.test(slotId)) return;

  const placement = document.querySelector('.ad-placement');
  const unit = placement?.querySelector('ins.adsbygoogle');
  if (!unit) return;

  unit.dataset.adClient = publisherId;
  unit.dataset.adSlot = slotId;

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src =
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + publisherId;
  script.addEventListener('load', () => {
    placement.hidden = false;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      placement.hidden = true;
    }
  });
  document.head.append(script);
})();
