(function () {
  var defaults = {
    brandName: 'WiFi Hotspot',
    wifiName: 'Jaringan tersedia',
    portalUrl: 'https://BILLING_DOMAIN/?tab=voucher',
    logoPath: ''
  };

  function isSafePortalUrl(value) {
    try {
      var url = new URL(value, window.location.href);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_error) {
      return false;
    }
  }

  function isSafeLogoPath(value) {
    return typeof value === 'string' &&
      value.trim() !== '' &&
      !/^(?:[a-z][a-z0-9+.-]*:|\/|\\\\)/i.test(value) &&
      value.split(/[\\/]/).indexOf('..') === -1;
  }

  function applyConfig(config) {
    var brandName = typeof config.brandName === 'string' && config.brandName.trim()
      ? config.brandName.trim()
      : defaults.brandName;
    var wifiName = typeof config.wifiName === 'string' && config.wifiName.trim()
      ? config.wifiName.trim()
      : defaults.wifiName;
    var portalUrl = typeof config.portalUrl === 'string' && isSafePortalUrl(config.portalUrl.trim())
      ? config.portalUrl.trim()
      : defaults.portalUrl;
    var logoPath = isSafeLogoPath(config.logoPath) ? config.logoPath.trim() : '';

    document.querySelectorAll('[data-brand-name]').forEach(function (element) {
      element.textContent = brandName;
    });
    document.querySelectorAll('[data-wifi-name]').forEach(function (element) {
      element.textContent = wifiName;
    });
    document.querySelectorAll('[data-portal-link]').forEach(function (element) {
      element.href = portalUrl;
    });
    document.querySelectorAll('[data-brand-logo]').forEach(function (image) {
      if (!logoPath) return;
      image.addEventListener('error', function () {
        image.hidden = true;
      }, { once: true });
      image.addEventListener('load', function () {
        var fallback = image.parentNode.querySelector('[data-brand-fallback]');
        if (fallback) fallback.hidden = true;
        image.hidden = false;
      }, { once: true });
      image.src = logoPath;
    });
  }

  applyConfig(defaults);
  fetch('config.json', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('Hotspot config not found');
      return response.json();
    })
    .then(applyConfig)
    .catch(function (error) {
      applyConfig(defaults);
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn('Hotspot config.json could not be loaded; using built-in defaults.', error);
      }
    });
})();
