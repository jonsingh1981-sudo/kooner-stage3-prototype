const fs = require('fs');
const path = require('path');
const express = require('express');

// Prototype V2 mobile QR hotfix.
// The original browser-side QR library does not render consistently on all phones.
// Intercept the app shell and inject a reliable image-based location QR renderer.
const originalStatic = express.static;

express.static = function patchedStatic(root, options) {
  const staticMiddleware = originalStatic(root, options);

  return function koonerStatic(req, res, next) {
    if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
      try {
        let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        const fix = String.raw`<script>
(function(){
  window.locationqr = function(){
    const l = loc(activeLocation);
    const payload = (l && l.type === 'van' ? 'VAN:' : 'LOC:') + activeLocation;
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data=' + encodeURIComponent(payload);
    return head('Location QR', true) +
      '<div class="content"><div class="card" style="text-align:center">' +
      '<h2>' + esc((l && l.name) || activeLocation) + '</h2>' +
      '<div style="background:#fff;border:1px solid #e5e1ed;border-radius:16px;padding:18px;display:inline-block">' +
      '<img src="' + qrUrl + '" alt="Location QR code" style="display:block;width:min(72vw,320px);height:auto">' +
      '</div>' +
      '<p style="margin-top:14px"><b>' + esc(payload) + '</b></p>' +
      '<p class="tiny muted">Print this as a durable Kooner van/location label. Scan it using Scan Location or during a stock transfer.</p>' +
      '<button class="btn full" onclick="window.print()">Print QR label</button>' +
      '</div></div>';
  };
  window.QRcodeDraw = function(){};
})();
</script>`;
        html = html.replace('</body>', fix + '</body>');
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.type('html').send(html);
      } catch (err) {
        console.error('QR hotfix failed:', err.message);
      }
    }

    return staticMiddleware(req, res, next);
  };
};
