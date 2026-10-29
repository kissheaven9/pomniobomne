/* QR-код в сердце, как в логотипе помниобомне.рф: контур сердца + настоящий QR, повёрнутый ромбом.
   Поворот на 45° сканеры читают; белое поле внутри сердца служит «тихой зоной».
   Нужен qrcode.js (Kazuhiko Arase, MIT). */
(function () {
  'use strict';
  var HEART = 'M50 91C22 72 5 55 5 33C5 17 17 6 31 6C40 6 46 11 50 18C54 11 60 6 69 6C83 6 95 17 95 33C95 55 78 72 50 91Z';
  function heartQR(text, opt) {
    opt = opt || {};
    var color = opt.color || '#2c2c2c', stroke = opt.stroke || '#bb9174';
    // на экране уровень L (крупнее модули — читается от 220px), для печати — M
    var q = window.qrcode(0, opt.ecl || 'L'); q.addData(text); q.make();
    var n = q.getModuleCount(), rects = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (q.isDark(r, c)) rects.push('M' + c + ' ' + r + 'h1v1h-1z');
      }
    }
    // ромб: центр (50,50), полудиагональ 27 → сторона квадрата 27·√2 ≈ 38.2
    var side = 38.2, k = side / n;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="' + (opt.label || 'QR-код страницы памяти') + '">' +
      '<path d="' + HEART + '" fill="#fff" stroke="' + stroke + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<g transform="translate(50 50) rotate(45) translate(' + (-side / 2) + ' ' + (-side / 2) + ') scale(' + k + ')">' +
      '<path d="' + rects.join('') + '" fill="' + color + '" shape-rendering="crispEdges"/></g></svg>';
  }
  // PNG для скачивания/печати (size px)
  function heartQRpng(text, size, cb) {
    var svg = heartQR(text, { ecl: 'M' }), img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas'); cv.width = cv.height = size;
      var x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); x.drawImage(img, 0, 0, size, size);
      cb(cv.toDataURL('image/png'));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  window.heartQR = heartQR;
  window.heartQRpng = heartQRpng;
})();
