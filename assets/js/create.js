/* помниобомне.рф — конструктор страниц памяти (/sozdat/) и просмотр созданной страницы (/stranica/).
   Сервера пока нет: страницы хранятся в IndexedDB этого браузера (DEMO). Онлайн-оплата не подключена —
   расширенная оформляется через мессенджер, в демо её можно включить, чтобы посмотреть возможности.
   Тарифы (решение Ольги 28.10): базовая — бесплатно (1 фото, биография ≤ 500 знаков), расширенная — 2990 ₽,
   изготовление именной QR-таблички под заказ — 2990 ₽ отдельно (услуга, не перепродажа). */
(function () {
  'use strict';
  var BASE = (document.documentElement.getAttribute('data-base') || '');
  var CFG = window.POMNI || {};
  var FREE_BIO = 500, EXT_PHOTOS = 200, EPITAPH_MAX = 140;
  var PRICE_EXT = '2990 ₽', PRICE_PLAQUE = '2990 ₽', SUM_EXT = 2990, SUM_PLAQUE = 2990;   // табличка 2990 — решение Ольги 29.10
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var ICON = {
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------- хранилище (IndexedDB, фолбэк — память) ---------- */
  var mem = {};
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, fail) {
      if (!window.indexedDB) return fail(new Error('no idb'));
      var r = indexedDB.open('pomni', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('pages', { keyPath: 'id' }); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { fail(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, fail) {
        var t = d.transaction('pages', mode), st = t.objectStore('pages'), res = fn(st);
        t.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res); };
        t.onerror = function () { fail(t.error); };
      });
    });
  }
  var store = {
    all: function () { return tx('readonly', function (s) { return s.getAll(); }).catch(function () { return Object.keys(mem).map(function (k) { return mem[k]; }); }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }).catch(function () { return mem[id]; }); },
    put: function (p) { p.updated = new Date().toISOString(); mem[p.id] = p; return tx('readwrite', function (s) { s.put(p); }).catch(function () {}); },
    del: function (id) { delete mem[id]; return tx('readwrite', function (s) { s['delete'](id); }).catch(function () {}); }
  };

  /* ---------- сервер кабинета (если подключён) ---------- */
  var API = CFG.api ? BASE + CFG.api : null;
  function apiCall(method, path, body, raw) {
    var o = { method: method, credentials: 'same-origin', headers: { 'X-Pomni': '1' } };
    if (raw) { o.headers['Content-Type'] = 'application/octet-stream'; o.body = raw; }
    else if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(API + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.error) || 'Ошибка ' + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function dataUrlToBlob(d) {
    var b = atob(d.split(',')[1]), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return new Blob([a], { type: 'image/jpeg' });
  }
  var demoCode = null;
  var auth = {
    me: function () {
      if (API) return apiCall('GET', '/me').then(function (r) { return r.email; }, function () { return null; });
      try { return Promise.resolve(localStorage.getItem('pomni_demo_email')); } catch (e) { return Promise.resolve(null); }
    },
    request: function (email) {
      if (API) return apiCall('POST', '/auth/request', { email: email });
      demoCode = String(Math.floor(100000 + Math.random() * 900000));
      return Promise.resolve({ demoCode: demoCode });
    },
    verify: function (email, code) {
      if (API) return apiCall('POST', '/auth/verify', { email: email, code: code });
      if (code.replace(/\D/g, '') !== demoCode) return Promise.reject(new Error('Неверный код'));
      try { localStorage.setItem('pomni_demo_email', email); } catch (e) {}
      return Promise.resolve({ email: email });
    },
    logout: function () {
      if (API) return apiCall('POST', '/auth/logout', {});
      try { localStorage.removeItem('pomni_demo_email'); } catch (e) {}
      return Promise.resolve();
    }
  };
  var EDITABLE = ['serial', 'lastName', 'firstName', 'patronymic', 'born', 'died', 'epitaph', 'bio', 'burial', 'videos', 'relatives'];
  var pages = {
    all: function () { return API ? apiCall('GET', '/pages') : store.all(); },
    get: function (id) { return API ? apiCall('GET', '/pages/' + id) : store.get(id); },
    view: function (id) { return API ? apiCall('GET', '/public/' + id).catch(function () { return null; }) : store.get(id); },
    create: function (p, portrait) {
      if (!API) { p.portrait = portrait; return store.put(p).then(function () { return p; }); }
      var body = { consent: p.consent }; EDITABLE.forEach(function (k) { body[k] = p[k]; });
      return apiCall('POST', '/pages', body).then(function (np) {
        return portrait ? apiCall('POST', '/pages/' + np.id + '/portrait', undefined, dataUrlToBlob(portrait)) : np;
      });
    },
    save: function (p) {
      if (!API) return store.put(p);
      var body = {}; EDITABLE.forEach(function (k) { body[k] = p[k]; });
      return apiCall('PATCH', '/pages/' + p.id, body);
    },
    upload: function (p, kind, dataUrl) {   // kind: portrait | photos
      if (!API) { if (kind === 'portrait') p.portrait = dataUrl; else p.photos.push(dataUrl); return store.put(p).then(function () { return p; }); }
      return apiCall('POST', '/pages/' + p.id + '/' + kind, undefined, dataUrlToBlob(dataUrl));
    },
    delPhoto: function (p, i) {
      if (!API) { p.photos.splice(i, 1); return store.put(p).then(function () { return p; }); }
      return apiCall('DELETE', '/pages/' + p.id + '/photos/' + p.photos[i].split('/').pop());
    },
    del: function (id) { return API ? apiCall('DELETE', '/pages/' + id) : store.del(id); }
  };
  function syncFromServer(np) { if (!API || !np || !cur) return; cur.portrait = np.portrait; cur.photos = np.photos || []; cur.plan = np.plan; cur.status = np.status; }

  /* ---------- утилиты ---------- */
  var toastEl, toastT;
  function toast(m) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = m; toastEl.classList.add('is-on'); clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }
  function parseDate(s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) {
      var d = +m[1], mo = +m[2], y = +m[3], dt = new Date(y, mo - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
      return { y: y, m: mo, d: d };
    }
    m = s.match(/^(\d{4})$/);
    return m ? { y: +m[1] } : null;
  }
  function maskDate(el) {
    var d = el.value.replace(/\D/g, '').slice(0, 8), out = d;
    if (d.length > 4) out = d.slice(0, 2) + '.' + d.slice(2, 4) + '.' + d.slice(4);
    else if (d.length > 2) out = d.slice(0, 2) + '.' + d.slice(2);
    el.value = out;
  }
  function dateOnBlur(el) {   // «19.91» после ввода 4 цифр — это год 1991
    var d = el.value.replace(/\D/g, '');
    if (d.length === 4 && !parseDate(el.value)) el.value = d;
  }
  function fmtDate(t) { return t ? (t.d ? t.d + ' ' + MONTHS[t.m - 1] + ' ' + t.y : String(t.y)) : '?'; }
  function age(b, d) {
    if (!b || !d || !b.d || !d.d) return null;
    var a = d.y - b.y - ((d.m < b.m || (d.m === b.m && d.d < b.d)) ? 1 : 0);
    return a >= 0 ? a : null;
  }
  function yearsWord(n) { var m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? 'год' : (m >= 2 && m <= 4 && (h < 12 || h > 14)) ? 'года' : 'лет'; }
  function gender(p) { var x = (p.patronymic || '').toLowerCase(); return /(вич|ич|оглы|улы)$/.test(x) ? 'm' : /(вна|чна|шна|кызы|гызы)$/.test(x) ? 'f' : null; }
  function fullName(p) { return [p.lastName, p.firstName, p.patronymic].filter(Boolean).join(' '); }
  function span(p) { var b = parseDate(p.born), d = parseDate(p.died); return (b ? b.y : '?') + '–' + (d ? d.y : '?'); }
  function isExt(p) { return p.plan === 'extended'; }
  function bioLen(p) { return (p.bio || []).reduce(function (n, c) { return n + (c.text || '').length; }, 0); }
  function pageUrl(id) { return location.origin + BASE + '/stranica/?id=' + encodeURIComponent(id); }
  function makeQR(text, cell) {
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createDataURL(cell || 6, 4); } catch (e) { return ''; }
  }
  // сжатие фото в браузере: длинная сторона ≤ max, JPEG
  function readPhoto(file, max) {
    return new Promise(function (ok, fail) {
      if (!/^image\//.test(file.type)) return fail(new Error('type'));
      var r = new FileReader();
      r.onload = function () {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          var x = c.getContext('2d'); x.fillStyle = '#f5efe6'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.84));
        };
        img.onerror = function () { fail(new Error('decode')); };
        img.src = r.result;
      };
      r.onerror = function () { fail(r.error); };
      r.readAsDataURL(file);
    });
  }
  function videoEmbed(url) {
    url = String(url || '').trim(); var m;
    if ((m = url.match(/rutube\.ru\/(?:video|play\/embed)\/([0-9a-f]{32})/i))) return { src: 'https://rutube.ru/play/embed/' + m[1] + '?autoplay=1', thumb: 'https://rutube.ru/api/video/' + m[1] + '/thumbnail/?redirect=1' };
    if ((m = url.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/))) return { src: 'https://vk.com/video_ext.php?oid=' + m[1] + '&id=' + m[2] + '&autoplay=1', thumb: '' };
    // YouTube не принимаем — только российские видеохостинги (решение Ольги 28.10)
    return null;
  }
  function placeLinks(b) {
    if (!b) return null;
    var t = (b.text || '').trim(), c = (b.coords || '').trim(), m = c.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      var lat = m[1], lng = m[2];
      return { text: t, coords: lat + ', ' + lng, route: 'https://yandex.ru/maps/?rtext=~' + lat + ',' + lng + '&rtt=auto', open: 'https://yandex.ru/maps/?pt=' + lng + ',' + lat + '&z=16&l=map', embed: 'https://yandex.ru/map-widget/v1/?ll=' + lng + ',' + lat + '&z=15&pt=' + lng + ',' + lat + ',pm2rdm' };
    }
    if (t.replace(/[\s.,;:-]/g, '').length >= 3) {
      var q = encodeURIComponent(t);
      return { text: t, coords: null, route: 'https://yandex.ru/maps/?text=' + q, open: 'https://yandex.ru/maps/?text=' + q, embed: 'https://yandex.ru/map-widget/v1/?text=' + q + '&z=13' };
    }
    return null;
  }
  function msgLink(kind, text) {
    if (kind === 'wa') return CFG.wa + '?text=' + encodeURIComponent(text);
    return CFG.tg;
  }

  /* ---------- общий рендер страницы памяти (тот же вид, что у перенесённых) ---------- */
  function pageHTML(p, opts) {
    opts = opts || {};
    var b = parseDate(p.born), d = parseDate(p.died), a = age(b, d), g = gender(p), place = placeLinks(p.burial);
    var ext = opts.as ? opts.as === 'ext' : isExt(p), photos = ext ? (p.photos || []) : [], videos = ext ? (p.videos || []).map(videoEmbed).filter(Boolean) : [];
    var rels = (p.relatives || []).filter(function (r) { return r.name; });   // родственники — бесплатно
    var chapters = (p.bio || []).filter(function (c) { return (c.text || '').trim(); });
    if (!ext && chapters.length) chapters = [{ title: '', text: chapters.map(function (c) { return c.text; }).join('\n\n').slice(0, FREE_BIO) }];
    var h = [];
    h.push('<section class="hero"><div class="wrap hero__grid">');
    h.push(p.portrait ? '<div class="hero__photo"><button type="button" data-lb="' + p.portrait + '" data-alt="' + esc(fullName(p)) + '" aria-label="Открыть портрет"><img src="' + p.portrait + '" alt="' + esc(fullName(p)) + '"></button></div>'
      : '<div class="hero__photo" aria-hidden="true"><div class="person__img" style="width:100%;height:100%;border-radius:0;font-size:96px">' + esc((p.lastName || '?').charAt(0)) + '</div></div>');
    h.push('<div><h1 class="hero__name"><span>' + esc(p.lastName || 'Фамилия') + '</span><span>' + esc([p.firstName, p.patronymic].filter(Boolean).join(' ') || 'Имя Отчество') + '</span></h1>');
    if (b || d) {
      h.push('<p class="hero__dates"><b>' + esc(fmtDate(b)) + '</b> — <b>' + esc(fmtDate(d)) + '</b>');
      if (a !== null) h.push('<br><span class="hero__age">' + (g === 'm' ? 'Прожил ' : g === 'f' ? 'Прожила ' : '') + a + ' ' + yearsWord(a) + '</span>');
      h.push('</p>');
    }
    if (p.epitaph) h.push('<p class="hero__epitaph">' + esc(p.epitaph) + '</p>');
    if (!opts.preview) {
      h.push('<div class="hero__actions">' + (place ? '<a class="btn btn--solid" href="' + esc(place.route) + '" target="_blank" rel="noopener">' + ICON.route + 'Как добраться</a>' : '') +
        '<button type="button" class="btn btn--bird" data-share>' + ICON.share + 'Поделиться</button></div>');
    }
    h.push('</div></div></section>');
    var tabs = [];
    if (chapters.length) tabs.push(['bio', 'Биография']);
    if (photos.length) tabs.push(['foto', 'Фото', photos.length]);
    if (videos.length) tabs.push(['video', 'Видео']);
    if (rels.length) tabs.push(['semya', 'Семья']);
    if (place) tabs.push(['mesto', 'Место захоронения']);
    if (tabs.length > 1 && !opts.preview) {
      h.push('<nav class="tabs" aria-label="Разделы страницы"><div class="wrap tabs__in">' + tabs.map(function (t, i) { return '<a href="#' + t[0] + '"' + (i ? '' : ' class="is-active"') + '>' + t[1] + (t[2] ? '<small>' + t[2] + '</small>' : '') + '</a>'; }).join('') + '</div></nav>');
    }
    if (chapters.length) {
      h.push('<section class="section" id="bio"><div class="wrap"><h2 class="section__title">Биография</h2><div class="bio"><div class="bio__body">');
      var k = 0;
      chapters.forEach(function (c) {
        if (c.title) h.push('<h3>' + esc(c.title) + '</h3>');
        c.text.split(/\n{2,}/).forEach(function (para) { if (para.trim()) h.push('<p' + (k++ ? '' : ' class="bio__lead"') + '>' + esc(para.trim()).replace(/\n/g, '<br>') + '</p>'); });
      });
      h.push('</div></div></div></section>');
    }
    if (photos.length) {
      h.push('<section class="section" id="foto"><div class="wrap"><h2 class="section__title">Фотографии</h2><div class="gallery">');
      photos.forEach(function (src, i) { h.push('<figure class="gallery__item"><button type="button" data-lb="' + src + '" data-alt="Фото ' + (i + 1) + '" aria-label="Открыть фото ' + (i + 1) + '"><img src="' + src + '" alt="' + esc(fullName(p)) + ', фото ' + (i + 1) + '" loading="lazy"></button></figure>'); });
      h.push('</div></div></section>');
    }
    if (videos.length) {
      h.push('<section class="section" id="video"><div class="wrap"><h2 class="section__title">Видео</h2><div class="videos">');
      videos.forEach(function (v, i) { h.push('<div class="video"><button type="button" data-embed="' + esc(v.src) + '" aria-label="Видео ' + (i + 1) + '"' + (v.thumb ? ' style="background-image:url(&quot;' + esc(v.thumb) + '&quot;)"' : '') + '><span class="video__play">' + ICON.play + '</span><span class="video__label">' + (videos.length > 1 ? 'Видео ' + (i + 1) : 'Смотреть видео') + '</span></button></div>'); });
      h.push('</div></div></section>');
    }
    if (rels.length) {
      h.push('<section class="section" id="semya"><div class="wrap"><h2 class="section__title">Семья</h2><div class="people">');
      rels.forEach(function (r) {
        var tag = r.link ? 'a' : 'div', href = r.link ? ' href="' + esc(r.link) + '"' : '';
        h.push('<' + tag + ' class="person"' + href + '><span class="person__img">' + esc(r.name.charAt(0)) + '</span><span><span class="person__name">' + esc(r.name) + '</span><br><span class="person__meta">' + esc(r.relation || '') + '</span></span></' + tag + '>');
      });
      h.push('</div></div></section>');
    }
    if (place) {
      h.push('<section class="section" id="mesto"><div class="wrap place"><div><h2 class="section__title">Место захоронения</h2>');
      if (place.text) h.push('<p class="place__addr">' + esc(place.text) + '</p>');
      if (place.coords) h.push('<p class="place__coords">Координаты: ' + esc(place.coords) + '</p>');
      h.push('<div class="place__btns"><a class="btn btn--solid" href="' + esc(place.route) + '" target="_blank" rel="noopener">' + ICON.route + 'Построить маршрут</a></div></div>');
      h.push('<div class="place__map"><iframe src="' + esc(place.embed) + '" title="Карта места захоронения" loading="lazy"></iframe></div>');
      h.push('</div></section>');
    }
    var qr = window.heartQR ? window.heartQR(pageUrl(p.id), { bg: false }) : '';
    if (qr) h.push('<section class="section" id="qr"><div class="wrap qr-sec"><div class="qr-sec__img">' + qr + '</div>' +
      '<div><h2 class="section__title">QR-код страницы</h2><p>Распечатайте или закажите именную табличку на памятник — по QR-коду откроется эта страница.</p></div></div></section>');
    return h.join('');
  }

  /* =================== /stranica/ — просмотр созданной страницы =================== */
  function runView() {
    var app = $('#app');
    var id = new URLSearchParams(location.search).get('id');
    pages.view(id).then(function (p) {
      if (!p) {
        app.innerHTML = '<section class="section"><div class="wrap"><h1 class="section__title">Страница не найдена</h1><p>' + (API ? 'Страница удалена или снята с публикации.' : 'В демо-режиме страницы хранятся только в браузере, где их создали.') + ' <a href="' + BASE + '/sozdat/">Создать страницу</a></p></div></section>';
        return;
      }
      document.title = fullName(p) + ' (' + span(p) + ') — страница памяти';
      var bar = API ? (p.status === 'draft' ? '<div class="demo-bar"><div class="wrap">Черновик — видите только вы. <a href="' + BASE + '/kabinet/#/edit/' + encodeURIComponent(p.id) + '">Редактировать</a></div></div>' : '')
        : '<div class="demo-bar"><div class="wrap">Демо: страница сохранена в вашем браузере. <a href="' + BASE + '/kabinet/#/edit/' + encodeURIComponent(p.id) + '">Редактировать</a></div></div>';
      app.innerHTML = bar + pageHTML(p);
      var s = document.createElement('script'); s.src = BASE + '/assets/js/memorial.js?v=' + (CFG.v || '1'); document.body.appendChild(s);
    });
  }

  /* =================== /sozdat/ — конструктор =================== */
  var root, cur = null, saveT = null;

  var IS_CABINET = false, ME = null;
  function route() {
    var h = location.hash.replace(/^#/, '') || '/';
    var m;
    if (h === '/new') return renderStep1();
    if (/^\/paid\//.test(h)) { toast('Спасибо! Оплата прошла — страница опубликована'); location.hash = '#/'; return; }
    auth.me().then(function (email) {
      ME = email;
      if (!email && (IS_CABINET || /^\/edit\//.test(h) || API)) return renderLogin(route);
      if ((m = h.match(/^\/edit\/(.+)$/))) return openEditor(decodeURIComponent(m[1]));
      pages.all().then(function (list) { list.length || IS_CABINET ? renderMine(list) : renderStep1(); })
        .catch(function (e) { if (e.status === 401) renderLogin(route); else shell('<p>' + esc(e.message) + '</p>'); });
    });
  }

  /* ---------- вход по коду на почту ---------- */
  function renderLogin(done, lead) {
    shell('<div class="cr-login"><h1 class="cr-title">Личный кабинет</h1>' +
      '<p class="cr-sub">' + (lead || 'Войдите, чтобы видеть и редактировать свои страницы памяти. Пароль не нужен — пришлём код на почту.') + '</p>' +
      '<form class="cr-box" id="lg1" novalidate>' + field('lg-email', 'Электронная почта', 'type="email" autocomplete="email" inputmode="email" placeholder="name@mail.ru" required') +
      '<button class="btn btn--solid cr-next" type="submit">Получить код</button></form></div>');
    $('#lg-email').focus();
    $('#lg1').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = $('#lg-email').value.trim().toLowerCase(), err = $('#lg-email-err');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { err.hidden = false; err.textContent = 'Проверьте адрес почты'; $('#lg-email').focus(); return; }
      var btn = $('#lg1 button'); btn.disabled = true; btn.textContent = 'Отправляем…';
      auth.request(email).then(function (r) { renderCode(email, r, done); }, function (e) {
        btn.disabled = false; btn.textContent = 'Получить код'; err.hidden = false; err.textContent = e.message;
      });
    });
  }
  function renderCode(email, r, done) {
    var hint = r.demoCode ? '<p class="cr-democode">Демо-режим: письмо не отправляется. Ваш код: <b>' + r.demoCode + '</b>. В рабочей версии код придёт на почту.</p>'
      : r.devCode ? '<p class="cr-democode">Тестовый сервер: код <b>' + r.devCode + '</b></p>' : '';
    shell('<div class="cr-login"><h1 class="cr-title">Код из письма</h1><p class="cr-sub">Отправили 6-значный код на <b>' + esc(email) + '</b>. Код действует 10 минут.</p>' + hint +
      '<form class="cr-box" id="lg2" novalidate>' + field('lg-code', 'Код', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required') +
      '<button class="btn btn--solid cr-next" type="submit">Войти</button>' +
      '<button type="button" class="linkbtn" id="lg-back">Другая почта или новый код</button></form></div>');
    $('#lg-code').focus();
    $('#lg-back').addEventListener('click', function () { renderLogin(done); });
    $('#lg2').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var code = $('#lg-code').value.replace(/\D/g, ''), err = $('#lg-code-err');
      if (code.length !== 6) { err.hidden = false; err.textContent = 'Введите 6 цифр'; return; }
      auth.verify(email, code).then(function () { ME = email; toast('Вы вошли'); done(); }, function (e) { err.hidden = false; err.textContent = e.message; $('#lg-code').select(); });
    });
  }

  function shell(inner) { root.innerHTML = '<div class="wrap cr">' + inner + '</div>'; window.scrollTo(0, 0); }

  function renderMine(list) {
    list.sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); });
    shell('<div class="cr-head"><h1 class="cr-title">Личный кабинет</h1><a class="btn btn--solid" href="#/new">' + ICON.plus + 'Создать страницу</a></div>' +
      (ME ? '<p class="cr-me">Вы вошли как <b>' + esc(ME) + '</b> · <button type="button" class="linkbtn" id="logout">Выйти</button></p>' : '') +
      (list.length ? '<h2 class="cr-sec__t" style="margin:8px 0 14px">Мои страницы</h2>' : '<p class="cr-empty">Страниц пока нет. Создайте первую — это бесплатно.</p>') +
      demoNote() +
      '<div class="cr-mine">' + list.map(function (p) {
        return '<div class="cr-card"><span class="cr-card__img">' + (p.portrait ? '<img src="' + p.portrait + '" alt="">' : esc((p.lastName || '?').charAt(0))) + '</span>' +
          '<div class="cr-card__body"><span class="cr-tag' + (isExt(p) ? ' cr-tag--ext' : '') + '">' + (isExt(p) ? 'Расширенная' : 'Базовая') + '</span>' +
          '<b>' + esc(fullName(p) || 'Без имени') + '</b><span>' + span(p) + '</span>' +
          '<div class="cr-card__btns"><a class="btn btn--solid" href="#/edit/' + encodeURIComponent(p.id) + '">Редактировать</a><a class="btn" href="' + BASE + '/stranica/?id=' + encodeURIComponent(p.id) + '">Открыть</a></div></div></div>';
      }).join('') + '</div>');
    var lo = $('#logout'); if (lo) lo.addEventListener('click', function () { auth.logout().then(function () { ME = null; toast('Вы вышли'); location.hash = '#/'; route(); }); });
  }

  function demoNote() {
    if (API) return '';
    return '<p class="cr-demo"><b>Демо-режим.</b> Это предпросмотр сайта без сервера: вход и страницы сохраняются только в этом браузере. На рабочем сайте код придёт на почту, а страницы будут доступны с любого устройства.</p>';
  }

  function field(id, label, attrs, hint) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + (attrs || '') + '>' + (hint ? '<p class="field__hint">' + hint + '</p>' : '') + '<p class="field__err" id="' + id + '-err" hidden></p></div>';
  }

  function renderStep1() {
    var draft = { photo: null };
    shell('<a class="cr-back" href="' + BASE + '/">← На главную</a>' +
      '<h1 class="cr-title">Создать страницу памяти</h1><p class="cr-sub">Шаг 1 из 2 · Основное. Займёт пару минут — остальное можно добавить потом.</p>' +
      '<div class="cr-bar"><span style="width:50%"></span></div>' +
      '<form class="cr-box" id="s1" novalidate>' +
        '<div class="cr-s1">' +
          '<label class="cr-upload" id="up"><input type="file" accept="image/*" id="upf" hidden><span class="cr-upload__in">' + ICON.photo + '<span>Портрет<br><small>необязательно</small></span></span></label>' +
          '<div class="cr-s1__fields">' +
            field('f-last', 'Фамилия', 'autocomplete="off" required') +
            field('f-first', 'Имя', 'autocomplete="off" required') +
            field('f-patr', 'Отчество', 'autocomplete="off"') +
          '</div>' +
        '</div>' +
        '<div class="cr-grid2">' +
          field('f-born', 'Дата рождения', 'inputmode="numeric" placeholder="ДД.ММ.ГГГГ" maxlength="10"', 'Просто цифры — точки появятся сами. Только год — 4 цифры') +
          field('f-died', 'Дата смерти', 'inputmode="numeric" placeholder="ДД.ММ.ГГГГ" maxlength="10"', 'Просто цифры — точки появятся сами. Только год — 4 цифры') +
        '</div>' +
        '<label class="check"><input type="checkbox" id="f-ok"><span>Я родственник умершего или действую с согласия родственников, имею право публиковать эти фото и сведения и даю <a href="' + BASE + '/soglasie-publikaciya/" target="_blank">согласие на их публикацию</a></span></label>' +
        '<p class="field__err" id="f-ok-err" hidden>Без этого подтверждения страницу создать нельзя</p>' +
        '<label class="check"><input type="checkbox" id="f-pd"><span>Даю <a href="' + BASE + '/soglasie/" target="_blank">согласие на обработку моих персональных данных</a>, с <a href="' + BASE + '/politic/" target="_blank">Политикой</a> ознакомлен(а)</span></label>' +
        '<p class="field__err" id="f-pd-err" hidden>Нужно согласие на обработку персональных данных</p>' +
        '<button class="btn btn--solid cr-next" type="submit">Создать страницу</button>' +
      '</form>');
    var up = $('#up'), upf = $('#upf');
    upf.addEventListener('change', function () {
      var f = upf.files[0]; if (!f) return;
      readPhoto(f, 1400).then(function (d) { draft.photo = d; up.style.backgroundImage = 'url(' + d + ')'; up.classList.add('has'); })
        .catch(function () { toast('Не удалось прочитать фото. Подойдёт JPG или PNG.'); });
    });
    $$('#f-born, #f-died').forEach(function (i) { i.addEventListener('input', function () { maskDate(i); }); i.addEventListener('blur', function () { dateOnBlur(i); }); });
    $('#s1').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var bad = null;
      var chk = function (id, cond, msg) { var e = $('#' + id + '-err'), inp = $('#' + id); e.hidden = !cond; e.textContent = msg; if (inp.tagName === 'INPUT' && inp.type !== 'checkbox') inp.setAttribute('aria-invalid', cond ? 'true' : 'false'); if (cond && !bad) bad = inp; };
      chk('f-last', !$('#f-last').value.trim(), 'Укажите фамилию');
      chk('f-first', !$('#f-first').value.trim(), 'Укажите имя');
      var bs = $('#f-born').value.trim(), ds = $('#f-died').value.trim(), bp = parseDate(bs), dp = parseDate(ds);
      chk('f-born', bs && !bp, 'Формат: ДД.ММ.ГГГГ или ГГГГ');
      chk('f-died', ds && !dp, 'Формат: ДД.ММ.ГГГГ или ГГГГ');
      if (bp && dp && !$('#f-died-err').textContent.trim()) chk('f-died', dp.y < bp.y, 'Дата смерти раньше даты рождения');
      chk('f-ok', !$('#f-ok').checked, 'Без этого подтверждения страницу создать нельзя');
      chk('f-pd', !$('#f-pd').checked, 'Нужно согласие на обработку персональных данных');
      if (bad) { bad.focus(); return; }
      var ln = $('#f-last').value.trim();
      var p = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        plan: 'free', created: new Date().toISOString(),
        lastName: ln, firstName: $('#f-first').value.trim(), patronymic: $('#f-patr').value.trim(),
        born: bs, died: ds, epitaph: '', portrait: null,
        bio: [{ title: '', text: '' }], photos: [], videos: [], burial: { text: '', coords: '' }, relatives: [],
        consent: { at: new Date().toISOString(), publication: 'soglasie-publikaciya, ред. 28.10.2026', processing: 'soglasie, ред. 28.10.2026' }
      };
      var create = function () {
        var btn = $('.cr-next'); if (btn) { btn.disabled = true; btn.textContent = 'Создаём…'; }
        pages.create(p, draft.photo).then(function (np) { location.hash = '#/edit/' + encodeURIComponent(np.id); toast('Страница создана — теперь расскажите о человеке'); },
          function (e) { if (btn) { btn.disabled = false; btn.textContent = 'Создать страницу'; } toast(e.message); });
      };
      auth.me().then(function (email) {
        if (email) return create();
        renderLogin(create, 'Чтобы сохранить страницу и потом её редактировать, войдите по почте — пришлём код. Пароль не нужен.');
      });
    });
  }

  /* ---------- редактор ---------- */
  var QUESTIONS = ['Где и в какой семье родился человек? Каким было детство?', 'Где учился, кем мечтал стать?', 'Кем работал, чем гордился в работе?',
    'Семья: супруг(а), дети, внуки', 'Увлечения, любимые занятия, черты характера', 'Какие слова или привычки вспоминают родные?', 'Чему он(а) научил(а) близких?'];

  function openEditor(id) {
    pages.get(id).then(function (p) {
      if (!p) { shell('<h1 class="cr-title">Страница не найдена</h1><p><a href="#/new">Создать новую</a></p>'); return; }
      p.bio = p.bio && p.bio.length ? p.bio : [{ title: '', text: '' }]; p.photos = p.photos || []; p.videos = p.videos || []; p.relatives = p.relatives || []; p.burial = p.burial || { text: '', coords: '' };
      cur = p; renderEditor();
    }, function (e) { if (e.status === 401) renderLogin(route); else shell('<h1 class="cr-title">Страница не найдена</h1><p><a href="#/">В кабинет</a></p>'); });
  }

  // платный раздел — пометка, но заполнять можно (на странице появится в расширенной)
  function paidMark(p) {
    return isExt(p) ? '' : '<span class="cr-paid" title="Покажется на странице в расширенной версии">Расширенная · ' + PRICE_EXT + '</span>';
  }

  function sec(id, title, inner, extra) {
    return '<section class="cr-sec" id="' + id + '"><h2 class="cr-sec__t">' + title + (extra || '') + '</h2>' + inner + '</section>';
  }

  var pvAs = null;          // превью: 'free' | 'ext'
  var order = { plan: null, plaque: false };

  function renderEditor() {
    var p = cur, ext = isExt(p), len = bioLen(p);
    if (!order.plan) order.plan = ext ? 'ext' : 'free';
    if (!pvAs) pvAs = ext ? 'ext' : 'free';
    var bioUI = (p.bio || []).map(function (c, i) {
      return '<div class="cr-chap"><div class="cr-chap__head"><input data-ct="' + i + '" value="' + esc(c.title) + '" placeholder="' + (i ? 'Название главы (например: Служба)' : 'Название главы — необязательно') + '" aria-label="Название главы ' + (i + 1) + '">' +
        ((p.bio.length > 1) ? '<button type="button" class="cr-del" data-delchap="' + i + '" aria-label="Удалить главу">' + ICON.x + '</button>' : '') + '</div>' +
        '<textarea data-cx="' + i + '" rows="7" placeholder="Кем был человек, что любил, каким его помнят. Пустая строка — новый абзац." aria-label="Текст главы ' + (i + 1) + '">' + esc(c.text) + '</textarea></div>';
    }).join('') +
      '<p class="cr-count' + (len > FREE_BIO && !ext ? ' is-over' : '') + '" id="bio-cnt">' + bioCountText(len, ext) + '</p>' +
      '<button type="button" class="btn" id="addchap">' + ICON.plus + 'Добавить главу</button>';
    var help = '<details class="cr-help"><summary>Не знаете, с чего начать? Вопросы-подсказки</summary><ul>' + QUESTIONS.map(function (q) { return '<li>' + q + '</li>'; }).join('') + '</ul></details>';
    var note = function (t) { return ext ? '' : '<p class="cr-paidnote">' + t + '</p>'; };

    var photosUI = note('Добавляйте сразу — на странице фото появятся в расширенной версии. В превью справа переключите «Расширенная», чтобы увидеть.') +
      '<div class="cr-photos">' + (p.photos || []).map(function (src, i) { return '<div class="cr-ph" style="background-image:url(' + src + ')"><button type="button" class="cr-del" data-delph="' + i + '" aria-label="Удалить фото ' + (i + 1) + '">' + ICON.x + '</button></div>'; }).join('') +
      ((p.photos || []).length < EXT_PHOTOS ? '<label class="cr-ph cr-ph--add"><input type="file" accept="image/*" multiple id="phf" hidden>' + ICON.plus + '<span>Добавить</span></label>' : '') + '</div>' +
      '<p class="field__hint">' + (p.photos || []).length + ' из ' + EXT_PHOTOS + '. Фото сжимаются автоматически.</p>';
    var videosUI = note('Видео появится на странице в расширенной версии.') +
      (p.videos || []).map(function (v, i) { return '<div class="cr-row"><input data-vid="' + i + '" value="' + esc(v) + '" placeholder="Ссылка на Rutube или VK Видео" aria-label="Ссылка на видео ' + (i + 1) + '"><button type="button" class="cr-del" data-delvid="' + i + '" aria-label="Удалить видео">' + ICON.x + '</button></div>'; }).join('') +
      '<p class="field__err" id="vid-err" hidden>Не распознали ссылку. Подойдут Rutube и VK Видео.</p><button type="button" class="btn" id="addvid">' + ICON.plus + 'Добавить видео</button>';
    var relsUI = (p.relatives || []).map(function (r, i) { return '<div class="cr-row cr-row--2"><input data-rn="' + i + '" value="' + esc(r.name) + '" placeholder="ФИО" aria-label="ФИО родственника"><input data-rr="' + i + '" value="' + esc(r.relation) + '" placeholder="Кем приходится: сын, жена…" aria-label="Кем приходится"><button type="button" class="cr-del" data-delrel="' + i + '" aria-label="Удалить">' + ICON.x + '</button></div>'; }).join('') +
      '<button type="button" class="btn" id="addrel">' + ICON.plus + 'Добавить родственника</button>' +
      '<p class="field__hint">Бесплатно. Указывайте умерших родственников или тех, кто согласен на публикацию своего имени.</p>';

    shell('<a class="cr-back" href="' + BASE + '/kabinet/">← Личный кабинет</a>' +
      '<div class="cr-head"><h1 class="cr-title">' + esc(fullName(p) || 'Новая страница') + '</h1><span class="cr-saved" id="saved" aria-live="polite">' + (p.status === 'published' ? 'Опубликована · сохранено' : 'Черновик · сохранено') + '</span></div>' +
      '<p class="cr-sub">Заполняйте спокойно — всё сохраняется само. Разделы с пометкой «Расширенная» можно заполнить сразу: на странице они появятся в расширенной версии. Выбрать версию и опубликовать — в конце.</p>' +
      '<div class="cr-split"><div class="cr-form">' +
        sec('s-main', 'Основное',
          '<div class="cr-s1"><label class="cr-upload' + (p.portrait ? ' has' : '') + '" id="up"' + (p.portrait ? ' style="background-image:url(' + p.portrait + ')"' : '') + '><input type="file" accept="image/*" id="upf" hidden><span class="cr-upload__in">' + ICON.photo + '<span>' + (p.portrait ? 'Заменить' : 'Портрет') + '</span></span></label>' +
          '<div class="cr-s1__fields">' + field('e-last', 'Фамилия', 'value="' + esc(p.lastName) + '"') + field('e-first', 'Имя', 'value="' + esc(p.firstName) + '"') + field('e-patr', 'Отчество', 'value="' + esc(p.patronymic) + '"') + '</div></div>' +
          '<div class="cr-grid2">' + field('e-born', 'Дата рождения', 'inputmode="numeric" maxlength="10" placeholder="ДД.ММ.ГГГГ" value="' + esc(p.born) + '"') + field('e-died', 'Дата смерти', 'inputmode="numeric" maxlength="10" placeholder="ДД.ММ.ГГГГ" value="' + esc(p.died) + '"') + '</div>' +
          '<div class="field"><label for="e-epi">Эпитафия <span>(необязательно)</span></label><input id="e-epi" maxlength="' + EPITAPH_MAX + '" value="' + esc(p.epitaph) + '" placeholder="Короткая фраза под именем"><p class="field__hint">До ' + EPITAPH_MAX + ' знаков</p></div>') +
        sec('s-bio', 'Биография', bioUI + help) +
        sec('s-place', 'Место захоронения',
          field('e-place', 'Кладбище и адрес', 'value="' + esc((p.burial || {}).text) + '" placeholder="Например: Юго-Восточное кладбище, г. Омск"') +
          field('e-coords', 'Координаты <span>(необязательно)</span>', 'value="' + esc((p.burial || {}).coords) + '" placeholder="54.930856, 73.60815"', 'Откройте Яндекс Карты, нажмите на место — координаты появятся внизу. Тогда маршрут приведёт точно к могиле.')) +
        sec('s-photos', 'Фотографии', photosUI, paidMark(p)) +
        sec('s-video', 'Видео', videosUI, paidMark(p)) +
        sec('s-rel', 'Родственники', relsUI, '<span class="cr-free">Бесплатно</span>') +
        sec('s-done', 'Ваш заказ', orderHTML(p)) +
      '</div><aside class="cr-prev" aria-label="Предпросмотр">' +
        '<div class="cr-pvswitch" role="group" aria-label="Какую версию показать"><button type="button" data-pv="free" aria-pressed="' + (pvAs === 'free') + '">Бесплатная</button><button type="button" data-pv="ext" aria-pressed="' + (pvAs === 'ext') + '">Расширенная</button></div>' +
        '<div class="cr-phone"><div class="cr-phone__scr" id="pv"></div></div><p class="cr-prev__cap" id="pvcap"></p></aside></div>' +
      demoNote());
    bindEditor();
    updatePreview();
  }

  function bioCountText(len, ext) {
    if (ext) return len + ' знаков';
    return len <= FREE_BIO ? len + ' из ' + FREE_BIO + ' бесплатных знаков'
      : '<span class="cr-paid">Расширенная · ' + PRICE_EXT + '</span> ' + len + ' знаков — бесплатно показываются первые ' + FREE_BIO;
  }

  // ---------- «Ваш заказ»: версия, табличка, оплата ----------
  function orderHTML(p) {
    var ext = isExt(p), cnt = (p.photos || []).length, vc = (p.videos || []).filter(Boolean).length, len = bioLen(p);
    var extras = [];
    if (cnt) extras.push(cnt + ' фото');
    if (vc) extras.push(vc + ' видео');
    if (len > FREE_BIO) extras.push('полная биография');
    var plan = ext
      ? '<div class="cr-opt is-on"><b>Расширенная страница</b> — оплачена. На странице всё, что вы добавили.</div>'
      : '<label class="cr-opt' + (order.plan === 'free' ? ' is-on' : '') + '"><input type="radio" name="plan" value="free"' + (order.plan === 'free' ? ' checked' : '') + '><span><b>Бесплатная страница — 0 ₽</b><small>ФИО, даты, портрет, место захоронения, биография до ' + FREE_BIO + ' знаков, родственники, QR-код.</small></span></label>' +
        '<label class="cr-opt' + (order.plan === 'ext' ? ' is-on' : '') + '"><input type="radio" name="plan" value="ext"' + (order.plan === 'ext' ? ' checked' : '') + '><span><b>Расширенная страница — ' + PRICE_EXT + '</b><small>Всё, что вы добавили' + (extras.length ? ' (' + extras.join(', ') + ')' : '') + ', появится на странице: биография без ограничений, до ' + EXT_PHOTOS + ' фото, видео. И возможность попасть в мини-сериал проекта. Разовая оплата, без подписки.</small></span></label>';
    var total = (order.plan === 'ext' && !ext ? SUM_EXT : 0) + (order.plaque ? SUM_PLAQUE : 0);
    var delivery = order.plaque ? '<div class="cr-deliv"><h3>Доставка СДЭК</h3>' +
        field('o-name', 'Получатель (ФИО)', 'autocomplete="name"') + field('o-phone', 'Телефон', 'type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00"') +
        '<div class="cr-grid2">' + field('o-city', 'Город', 'autocomplete="address-level2"') + field('o-addr', 'Пункт выдачи СДЭК или адрес', 'placeholder="Например: ул. Ленина, 1 (ПВЗ)"') + '</div></div>' : '';
    var mail = total ? field('o-email', 'Почта для чека', 'type="email" autocomplete="email" value="' + esc(ME || '') + '"') : '';
    return '<div class="cr-done"><div class="cr-qr" id="qr"></div><div>' +
        '<p>Ссылка и QR-код страницы. QR можно распечатать сразу.</p>' +
        '<div class="cr-done__btns"><a class="btn" id="open" href="' + BASE + '/stranica/?id=' + encodeURIComponent(p.id) + '">Открыть страницу</a><a class="btn" id="qrdl" download="qr-' + esc(p.id) + '.png" href="#">Скачать QR-код</a><a class="btn" id="qrsvg" download="qr-' + esc(p.id) + '-tablichka.svg" href="#">Для печати таблички (SVG)</a></div></div></div>' +
      '<div class="cr-order">' + plan +
        ((order.plan === 'ext' || ext) ? '<label class="cr-opt cr-opt--serial' + (p.serial && p.serial.on ? ' is-on' : '') + '"><input type="checkbox" id="o-serial"' + (p.serial && p.serial.on ? ' checked' : '') + '><span><b>Предлагаю историю для мини-сериала помниобомне.рф</b><small>Мы читаем истории расширенных страниц и выбираем героев для мини-сериалов о подвигах и судьбах. Это возможность, а не обязательство: если выберем вашу историю — свяжемся до публикации. Отмечая, даю <a href="' + BASE + '/soglasie-serial/" target="_blank">согласие на использование истории, фото и видео в мини-сериале</a>.</small></span></label>' : '') +
        '<label class="cr-opt cr-opt--plaque' + (order.plaque ? ' is-on' : '') + '"><input type="checkbox" id="o-plaque"' + (order.plaque ? ' checked' : '') + '><span><b>Именная QR-табличка — ' + PRICE_PLAQUE + '</b><small>Двухслойный акрил, УФ-печать, 2 таблички и 2 наклейки в подарочной коробке. Доставка СДЭК. <button type="button" class="linkbtn" id="plaque">Подробнее и фото</button></small></span></label>' +
        delivery + mail +
        '<div class="cr-total"><span>Итого</span><b>' + (total ? total.toLocaleString('ru-RU') + ' ₽' : '0 ₽') + '</b></div>' +
        '<button type="button" class="btn btn--solid cr-pay" id="o-go">' + (total ? 'Оплатить ' + total.toLocaleString('ru-RU') + ' ₽' : (p.status === 'published' ? 'Страница опубликована — обновить' : 'Опубликовать бесплатно')) + '</button>' +
        '<p class="field__err" id="o-err" hidden></p>' +
      '</div>' +
      '<button type="button" class="linkbtn cr-delpage" id="delpage">Удалить страницу</button>';
  }

  function plaqueModal() {
    var img = function (src, alt) { return '<img src="' + BASE + src + '" alt="' + alt + '" loading="lazy">'; };
    openModal('<h2 class="cr-modal__t">Именная QR-табличка — ' + PRICE_PLAQUE + '</h2>' +
      '<div class="cr-plq">' + img('/assets/img/home/plaque.webp', 'QR-табличка на памятнике') + img('/assets/img/home/grave-2.webp', 'Комплект в подарочной коробке') + img('/assets/img/home/grave-1.webp', 'Табличка в руке у памятника') + '</div>' +
      (CFG.plaqueVideo ? '<div class="cr-plq__video"><iframe src="' + esc(CFG.plaqueVideo) + '" title="Распаковка таблички" loading="lazy" allowfullscreen></iframe></div>' : '') +
      '<p class="cr-plq__text">Табличка 6×6 см из <b>двухслойного акрила с УФ-печатью</b> — с QR-кодом этой страницы в сердце и именем. Не выцветает, не боится дождя и мороза.</p>' +
      '<p class="cr-plq__text"><b>В комплекте:</b> 2 таблички и 2 наклейки в красивой подарочной коробке. Изготовим и отправим СДЭК.</p>' +
      '<button type="button" class="btn btn--solid" id="plq-add">' + (order.plaque ? 'Табличка уже в заказе' : 'Добавить в заказ') + '</button>');
    $('#plq-add').addEventListener('click', function () { order.plaque = true; closeModal(); refreshOrder(); var o = $('#s-done'); if (o) o.scrollIntoView({ behavior: 'smooth' }); });
  }

  function refreshOrder() {
    var box = $('#s-done'); if (!box) return;
    box.innerHTML = '<h2 class="cr-sec__t">Ваш заказ</h2>' + orderHTML(cur);
    bindOrder(); drawQR();
  }

  function drawQR() {
    var q = $('#qr'); if (!q || !window.heartQR) return;
    q.innerHTML = window.heartQR(pageUrl(cur.id));
    var dl = $('#qrdl');
    if (dl) window.heartQRpng(pageUrl(cur.id), 1200, function (png) { dl.href = png; });
    var sv = $('#qrsvg');   // белый SVG без фона, как макет таблички (для УФ-печати)
    if (sv) sv.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.heartQR(pageUrl(cur.id), { ecl: 'M', withText: true, bg: false, color: '#fff', accent: '#fff' }));
  }

  function bindOrder() {
    var p = cur;
    $$('input[name="plan"]').forEach(function (r) { r.addEventListener('change', function () { order.plan = r.value; pvAs = r.value; refreshOrder(); updatePreview(); syncSwitch(); }); });
    var pl = $('#o-plaque'); if (pl) pl.addEventListener('change', function () { order.plaque = pl.checked; refreshOrder(); });
    var sr = $('#o-serial'); if (sr) sr.addEventListener('change', function () {
      p.serial = sr.checked ? { on: true, at: new Date().toISOString() } : null; save(true);
      sr.closest('.cr-opt').classList.toggle('is-on', sr.checked);
      toast(sr.checked ? 'История предложена для мини-сериала' : 'Предложение для мини-сериала снято');
    });
    var more = $('#plaque'); if (more) more.addEventListener('click', function (e) { e.preventDefault(); plaqueModal(); });
    var ph = $('#o-phone'); if (ph) ph.addEventListener('input', function () { ph.value = ph.value.replace(/[^\d+()\- ]/g, ''); });
    $('#o-go').addEventListener('click', function () { checkout(p); });
    $('#delpage').addEventListener('click', function () {
      if (!confirm('Удалить страницу «' + (fullName(p) || 'без имени') + '»? Это нельзя отменить.')) return;
      pages.del(p.id).then(function () { toast('Страница удалена'); location.hash = '#/'; }, function (e) { toast(e.message); });
    });
  }

  function checkout(p) {
    var err = $('#o-err'), btn = $('#o-go');
    var fail = function (m, el) { err.hidden = false; err.textContent = m; if (el) el.focus(); };
    err.hidden = true;
    if (!p.lastName || !p.firstName) return fail('Заполните фамилию и имя в разделе «Основное»', $('#e-last'));
    var total = (order.plan === 'ext' && !isExt(p) ? SUM_EXT : 0) + (order.plaque ? SUM_PLAQUE : 0);
    var delivery = {};
    if (order.plaque) {
      var need = [['o-name', 'получателя'], ['o-phone', 'телефон'], ['o-city', 'город'], ['o-addr', 'пункт выдачи СДЭК']];
      for (var i = 0; i < need.length; i++) { var el = $('#' + need[i][0]); if (!el.value.trim()) return fail('Укажите ' + need[i][1], el); }
      if ($('#o-phone').value.replace(/\D/g, '').length < 10) return fail('Проверьте телефон', $('#o-phone'));
      delivery = { name: $('#o-name').value.trim(), phone: $('#o-phone').value.trim(), city: $('#o-city').value.trim(), address: $('#o-addr').value.trim() };
    }
    if (total) {
      var em = $('#o-email'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(em.value.trim())) return fail('Укажите почту для чека', em);
      delivery.email = em.value.trim();
    }
    btn.disabled = true; btn.textContent = total ? 'Переходим к оплате…' : 'Публикуем…';
    var body = { plan: order.plan === 'ext' ? 'extended' : 'free', plaque: order.plaque, delivery: delivery };
    var done = function (r) {
      if (r && r.payUrl) { location.href = r.payUrl; return; }
      if (r && r.published) { p.status = 'published'; toast('Страница опубликована'); refreshOrder(); $('#saved').textContent = 'Опубликована · сохранено'; return; }
      // оплата ещё не подключена (нет ключей ЮKassa) — заказ сохранён
      btn.disabled = false; btn.textContent = 'Оплатить ' + total.toLocaleString('ru-RU') + ' ₽';
      openModal('<h2 class="cr-modal__t">Заказ сохранён</h2><p>Онлайн-оплата подключается. Заказ №' + esc(r && r.order || '') + ' на ' + total.toLocaleString('ru-RU') + ' ₽ сохранён — мы пришлём ссылку на оплату на ' + esc(delivery.email || '') + '.</p>');
    };
    if (API) {
      pages.save(p).then(function () { return apiCall('POST', '/pages/' + p.id + '/order', body); }).then(done, function (e) { btn.disabled = false; btn.textContent = total ? 'Оплатить' : 'Опубликовать'; fail(e.message); });
    } else {   // демо без сервера: оплата не проводится
      if (total) { if (order.plan === 'ext') p.plan = 'extended'; p.demo = true; }
      p.status = 'published';
      store.put(p).then(function () {
        if (total) openModal('<h2 class="cr-modal__t">Демо: оплата не проводится</h2><p>На рабочем сайте здесь откроется оплата ЮKassa на ' + total.toLocaleString('ru-RU') + ' ₽. Для просмотра считаем, что оплачено' + (order.plan === 'ext' ? ' — расширенная включена' : '') + (order.plaque ? ', табличка заказана' : '') + '.</p>');
        else toast('Страница опубликована');
        order.plan = isExt(p) ? 'ext' : 'free'; order.plaque = false; renderEditor();   // оплачено — заказ очищен
      });
    }
  }

  var PV_TARGET = { 's-main': null, 's-bio': 'bio', 's-place': 'mesto', 's-photos': 'foto', 's-video': 'video', 's-rel': 'semya', 's-done': 'qr' };
  var pvFocus = null;
  function scrollPreview() {
    var pv = $('#pv'); if (!pv || pvFocus === undefined) return;
    var t = pvFocus && $('#pv #' + pvFocus);
    pv.scrollTo({ top: t ? Math.max(0, t.getBoundingClientRect().top - pv.getBoundingClientRect().top + pv.scrollTop - 12) : 0, behavior: 'smooth' });
  }
  function syncSwitch() {
    $$('[data-pv]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pv') === pvAs)); });
    var cap = $('#pvcap');
    if (cap) cap.textContent = pvAs === 'ext' ? 'Так будет выглядеть расширенная страница' + (isExt(cur) ? '' : ' (' + PRICE_EXT + ')') : 'Так будет выглядеть бесплатная страница';
  }
  function updatePreview() {
    var pv = $('#pv'); if (!pv) return;
    var oldMap = $('#pv .place__map iframe');
    pv.innerHTML = '<div class="cr-pv">' + pageHTML(cur, { preview: true, as: pvAs }) + '</div>';
    var newMap = $('#pv .place__map iframe');
    if (oldMap && newMap && oldMap.src === newMap.src) newMap.parentNode.replaceChild(oldMap, newMap);
    if (pvFocus) { var t = $('#pv #' + pvFocus); if (t) pv.scrollTop = Math.max(0, t.getBoundingClientRect().top - pv.getBoundingClientRect().top + pv.scrollTop - 12); }
    syncSwitch();
  }

  function save(now) {
    clearTimeout(saveT);
    var s = $('#saved'); if (s) s.textContent = 'Сохраняем…';
    var st = function () { return cur.status === 'published' ? 'Опубликована · сохранено' : 'Черновик · сохранено'; };
    var go = function () {
      pages.save(cur).then(function () { var e = $('#saved'); if (e) e.textContent = st(); },
        function (er) { var e = $('#saved'); if (e) e.textContent = 'Не сохранено'; toast(er.message); });
    };
    if (now) go(); else saveT = setTimeout(go, 500);
  }

  function bindEditor() {
    var p = cur;
    $$('.cr-sec').forEach(function (sec) {
      sec.addEventListener('focusin', function () {
        if (!(sec.id in PV_TARGET) || pvFocus === PV_TARGET[sec.id]) return;
        pvFocus = PV_TARGET[sec.id]; scrollPreview();
      });
    });
    $$('[data-pv]').forEach(function (b) { b.addEventListener('click', function () { pvAs = b.getAttribute('data-pv'); updatePreview(); }); });
    var live = function (sel, fn) { var el = $(sel); if (el) el.addEventListener('input', function () { fn(el.value); updatePreview(); save(); }); };
    live('#e-last', function (v) { p.lastName = v.trim(); $('.cr-title').textContent = fullName(p) || 'Новая страница'; });
    live('#e-first', function (v) { p.firstName = v.trim(); $('.cr-title').textContent = fullName(p) || 'Новая страница'; });
    live('#e-patr', function (v) { p.patronymic = v.trim(); });
    ['born', 'died'].forEach(function (k) {
      var el = $('#e-' + k);
      var apply = function () {
        var v = el.value.trim(), ok = !v || parseDate(v) || /^\d{1,2}(\.\d{0,2}(\.\d{0,3})?)?$/.test(v);
        var full = !v || parseDate(v);
        $('#e-' + k + '-err').hidden = !!ok; $('#e-' + k + '-err').textContent = 'Проверьте дату: ДД.ММ.ГГГГ или только год';
        el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (full) { p[k] = v; updatePreview(); save(); }
      };
      el.addEventListener('input', function () { maskDate(el); apply(); });
      el.addEventListener('blur', function () { dateOnBlur(el); apply(); });
    });
    live('#e-epi', function (v) { p.epitaph = v.trim(); });
    live('#e-place', function (v) { p.burial = p.burial || {}; p.burial.text = v; });
    live('#e-coords', function (v) { p.burial = p.burial || {}; p.burial.coords = v; });
    var bioCount = function () { var len = bioLen(p), c = $('#bio-cnt'); c.innerHTML = bioCountText(len, isExt(p)); c.classList.toggle('is-over', len > FREE_BIO && !isExt(p)); };
    $$('[data-ct]').forEach(function (i) { i.addEventListener('input', function () { p.bio[+i.getAttribute('data-ct')].title = i.value; updatePreview(); save(); }); });
    $$('[data-cx]').forEach(function (i) { i.addEventListener('input', function () { p.bio[+i.getAttribute('data-cx')].text = i.value; bioCount(); updatePreview(); save(); }); });
    $('#addchap').addEventListener('click', function () { p.bio.push({ title: '', text: '' }); save(true); renderEditor(); var n = $$('[data-ct]'); n[n.length - 1].focus(); });
    $$('[data-delchap]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('Удалить главу?')) return; p.bio.splice(+b.getAttribute('data-delchap'), 1); save(true); renderEditor(); }); });
    var upf = $('#upf');
    upf.addEventListener('change', function () {
      var f = upf.files[0]; if (!f) return;
      readPhoto(f, 1400).then(function (d) { return pages.upload(p, 'portrait', d); })
        .then(function (np) { syncFromServer(np); renderEditor(); }, function (e) { toast(e && e.message && e.message !== 'type' && e.message !== 'decode' ? e.message : 'Не удалось прочитать фото. Подойдёт JPG или PNG.'); });
    });
    var phf = $('#phf');
    if (phf) phf.addEventListener('change', function () {
      var files = Array.prototype.slice.call(phf.files, 0, EXT_PHOTOS - p.photos.length);
      toast('Загружаем фото: ' + files.length);
      if (!isExt(p)) { pvAs = 'ext'; }   // сразу показать, как фото будут выглядеть
      files.reduce(function (pr, f) {
        return pr.then(function () { return readPhoto(f, 1600).then(function (d) { return pages.upload(p, 'photos', d); }).then(syncFromServer, function (e) { if (e && e.message && e.message !== 'type') toast(e.message); }); });
      }, Promise.resolve()).then(function () { renderEditor(); var s = $('#s-photos'); if (s) s.scrollIntoView(); });
    });
    $$('[data-delph]').forEach(function (b) { b.addEventListener('click', function () {
      pages.delPhoto(p, +b.getAttribute('data-delph')).then(function (np) { syncFromServer(np); renderEditor(); $('#s-photos').scrollIntoView(); }, function (e) { toast(e.message); });
    }); });
    $('#addvid').addEventListener('click', function () { p.videos.push(''); if (!isExt(p)) pvAs = 'ext'; save(true); renderEditor(); var n = $$('[data-vid]'); n[n.length - 1].focus(); });
    $$('[data-vid]').forEach(function (i) {
      i.addEventListener('input', function () {
        p.videos[+i.getAttribute('data-vid')] = i.value.trim(); updatePreview(); save();
        if (!i.value.trim() || videoEmbed(i.value)) { $('#vid-err').hidden = true; i.setAttribute('aria-invalid', 'false'); }
      });
      i.addEventListener('blur', function () { var bad = i.value.trim() && !videoEmbed(i.value); $('#vid-err').hidden = !bad; i.setAttribute('aria-invalid', bad ? 'true' : 'false'); });
    });
    $$('[data-delvid]').forEach(function (b) { b.addEventListener('click', function () { p.videos.splice(+b.getAttribute('data-delvid'), 1); save(true); renderEditor(); $('#s-video').scrollIntoView(); }); });
    $('#addrel').addEventListener('click', function () { p.relatives.push({ name: '', relation: '' }); save(true); renderEditor(); var n = $$('[data-rn]'); n[n.length - 1].focus(); });
    $$('[data-rn]').forEach(function (i) { i.addEventListener('input', function () { p.relatives[+i.getAttribute('data-rn')].name = i.value; updatePreview(); save(); }); });
    $$('[data-rr]').forEach(function (i) { i.addEventListener('input', function () { p.relatives[+i.getAttribute('data-rr')].relation = i.value; updatePreview(); save(); }); });
    $$('[data-delrel]').forEach(function (b) { b.addEventListener('click', function () { p.relatives.splice(+b.getAttribute('data-delrel'), 1); save(true); renderEditor(); $('#s-rel').scrollIntoView(); }); });
    bindOrder(); drawQR();
  }

  // не используется в новой логике — оставлено для совместимости ссылок data-upgrade
  function openUpgrade() { order.plan = 'ext'; refreshOrder(); var o = $('#s-done'); if (o) o.scrollIntoView({ behavior: 'smooth' }); }

  var modalEl = null, lastFocus = null;
  function openModal(inner) {
    closeModal();
    lastFocus = document.activeElement;
    modalEl = document.createElement('div');
    modalEl.className = 'cr-modal'; modalEl.setAttribute('role', 'dialog'); modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML = '<div class="cr-modal__box"><button type="button" class="cr-modal__x" aria-label="Закрыть">' + ICON.x + '</button>' + inner + '</div>';
    document.body.appendChild(modalEl);
    document.documentElement.style.overflow = 'hidden';
    modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeModal(); });
    $('.cr-modal__x', modalEl).addEventListener('click', closeModal);
    $('.cr-modal__x', modalEl).focus();
  }
  function closeModal() {
    if (!modalEl) return;
    modalEl.remove(); modalEl = null; document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modalEl) closeModal(); });

  /* ---------- старт ---------- */
  if ($('#app[data-view]')) { runView(); return; }
  root = $('#cr-root');
  if (!root) return;
  IS_CABINET = root.hasAttribute('data-cabinet');
  window.addEventListener('hashchange', route);
  route();
})();
