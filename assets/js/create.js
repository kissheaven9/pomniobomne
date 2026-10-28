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
  var PRICE_EXT = '2990 ₽', PRICE_PLAQUE = '2990 ₽';
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
    var ext = isExt(p), photos = ext ? (p.photos || []) : [], videos = ext ? (p.videos || []).map(videoEmbed).filter(Boolean) : [];
    var rels = ext ? (p.relatives || []).filter(function (r) { return r.name; }) : [];
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
      rels.forEach(function (r) { h.push('<div class="person"><span class="person__img">' + esc(r.name.charAt(0)) + '</span><span><span class="person__name">' + esc(r.name) + '</span><br><span class="person__meta">' + esc(r.relation || '') + '</span></span></div>'); });
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
    var qr = makeQR(pageUrl(p.id), 6);
    if (qr) h.push('<section class="section" id="qr"><div class="wrap qr-sec"><div class="qr-sec__img"><img src="' + qr + '" alt="QR-код страницы памяти" width="160" height="160"></div>' +
      '<div><h2 class="section__title">QR-код страницы</h2><p>Распечатайте или закажите именную табличку на памятник — по QR-коду откроется эта страница.</p></div></div></section>');
    return h.join('');
  }

  /* =================== /stranica/ — просмотр созданной страницы =================== */
  function runView() {
    var app = $('#app');
    var id = new URLSearchParams(location.search).get('id');
    store.get(id).then(function (p) {
      if (!p) {
        app.innerHTML = '<section class="section"><div class="wrap"><h1 class="section__title">Страница не найдена</h1><p>Пока страницы, созданные в конструкторе, сохраняются только в браузере, где их создали. <a href="' + BASE + '/sozdat/">Создать страницу</a></p></div></section>';
        return;
      }
      document.title = fullName(p) + ' (' + span(p) + ') — страница памяти';
      app.innerHTML = '<div class="demo-bar"><div class="wrap">Эта страница сохранена в вашем браузере. <a href="' + BASE + '/sozdat/#/edit/' + encodeURIComponent(p.id) + '">Редактировать</a></div></div>' + pageHTML(p);
      var s = document.createElement('script'); s.src = BASE + '/assets/js/memorial.js?v=' + (CFG.v || '1'); document.body.appendChild(s);
    });
  }

  /* =================== /sozdat/ — конструктор =================== */
  var root, cur = null, saveT = null;

  function route() {
    var h = location.hash.replace(/^#/, '') || '/';
    var m;
    if ((m = h.match(/^\/edit\/(.+)$/))) return openEditor(decodeURIComponent(m[1]));
    if (h === '/new') return renderStep1();
    store.all().then(function (list) { list.length ? renderMine(list) : renderStep1(); });
  }

  function shell(inner) { root.innerHTML = '<div class="wrap cr">' + inner + '</div>'; window.scrollTo(0, 0); }

  function renderMine(list) {
    list.sort(function (a, b) { return (b.updated || '').localeCompare(a.updated || ''); });
    shell('<div class="cr-head"><h1 class="cr-title">Мои страницы</h1><a class="btn btn--solid" href="#/new">' + ICON.plus + 'Создать новую</a></div>' +
      demoNote() +
      '<div class="cr-mine">' + list.map(function (p) {
        return '<div class="cr-card"><span class="cr-card__img">' + (p.portrait ? '<img src="' + p.portrait + '" alt="">' : esc((p.lastName || '?').charAt(0))) + '</span>' +
          '<div class="cr-card__body"><span class="cr-tag' + (isExt(p) ? ' cr-tag--ext' : '') + '">' + (isExt(p) ? 'Расширенная' : 'Базовая') + '</span>' +
          '<b>' + esc(fullName(p) || 'Без имени') + '</b><span>' + span(p) + '</span>' +
          '<div class="cr-card__btns"><a class="btn btn--solid" href="#/edit/' + encodeURIComponent(p.id) + '">Редактировать</a><a class="btn" href="' + BASE + '/stranica/?id=' + encodeURIComponent(p.id) + '">Открыть</a></div></div></div>';
      }).join('') + '</div>');
  }

  function demoNote() {
    return '<p class="cr-demo"><b>Как сохраняется страница.</b> Пока сайт работает без личного кабинета, страница хранится в этом браузере. Публикация для всех и вход по почте появятся при запуске — созданные страницы перенесём.</p>';
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
          field('f-born', 'Дата рождения', 'inputmode="numeric" placeholder="ДД.ММ.ГГГГ" maxlength="10"', 'Если точная дата неизвестна — только год') +
          field('f-died', 'Дата смерти', 'inputmode="numeric" placeholder="ДД.ММ.ГГГГ" maxlength="10"', 'Если точная дата неизвестна — только год') +
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
    $$('#f-born, #f-died').forEach(function (i) { i.addEventListener('input', function () { i.value = i.value.replace(/[^\d.]/g, ''); }); });
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
        born: bs, died: ds, epitaph: '', portrait: draft.photo,
        bio: [{ title: '', text: '' }], photos: [], videos: [], burial: { text: '', coords: '' }, relatives: [],
        consent: { at: new Date().toISOString(), publication: 'soglasie-publikaciya, ред. 28.10.2026', processing: 'soglasie, ред. 28.10.2026' }
      };
      store.put(p).then(function () { location.hash = '#/edit/' + encodeURIComponent(p.id); toast('Страница создана — теперь расскажите о человеке'); });
    });
  }

  /* ---------- редактор ---------- */
  var QUESTIONS = ['Где и в какой семье родился человек? Каким было детство?', 'Где учился, кем мечтал стать?', 'Кем работал, чем гордился в работе?',
    'Семья: супруг(а), дети, внуки', 'Увлечения, любимые занятия, черты характера', 'Какие слова или привычки вспоминают родные?', 'Чему он(а) научил(а) близких?'];

  function openEditor(id) {
    store.get(id).then(function (p) {
      if (!p) { shell('<h1 class="cr-title">Страница не найдена</h1><p><a href="#/new">Создать новую</a></p>'); return; }
      cur = p; renderEditor();
    });
  }

  function lockBox(what) {
    return '<div class="cr-lock">' + ICON.lock + '<div><b>' + what + ' — в расширенной странице</b><span>Разовая оплата ' + PRICE_EXT + ', без подписки.</span></div><button type="button" class="btn btn--solid" data-upgrade>Подключить</button></div>';
  }

  function sec(id, title, inner, badge) {
    return '<section class="cr-sec" id="' + id + '"><h2 class="cr-sec__t">' + title + (badge ? '<span class="cr-tag cr-tag--ext">' + badge + '</span>' : '') + '</h2>' + inner + '</section>';
  }

  function renderEditor() {
    var p = cur, ext = isExt(p), len = bioLen(p);
    var bioUI;
    if (ext) {
      bioUI = (p.bio || []).map(function (c, i) {
        return '<div class="cr-chap"><div class="cr-chap__head"><input data-ct="' + i + '" value="' + esc(c.title) + '" placeholder="Название главы (например: Детство)" aria-label="Название главы ' + (i + 1) + '">' +
          ((p.bio.length > 1) ? '<button type="button" class="cr-del" data-delchap="' + i + '" aria-label="Удалить главу">' + ICON.x + '</button>' : '') + '</div>' +
          '<textarea data-cx="' + i + '" rows="7" placeholder="Текст главы. Пустая строка — новый абзац." aria-label="Текст главы ' + (i + 1) + '">' + esc(c.text) + '</textarea></div>';
      }).join('') + '<button type="button" class="btn" id="addchap">' + ICON.plus + 'Добавить главу</button>';
    } else {
      var t = (p.bio && p.bio[0] && p.bio[0].text) || '';
      bioUI = '<textarea id="bio-free" rows="7" maxlength="' + FREE_BIO + '" placeholder="Несколько слов о человеке: кем был, что любил, каким его помнят." aria-describedby="bio-cnt">' + esc(t) + '</textarea>' +
        '<p class="cr-count" id="bio-cnt"><span>' + t.length + '</span> / ' + FREE_BIO + ' знаков</p>' +
        '<div class="cr-hint-up" id="bio-up"' + (t.length >= FREE_BIO * 0.9 ? '' : ' hidden') + '>Хотите рассказать больше? В расширенной странице биография без ограничений и по главам. <button type="button" class="linkbtn" data-upgrade>Подключить — ' + PRICE_EXT + '</button></div>';
    }
    var help = '<details class="cr-help"><summary>Не знаете, с чего начать? Вопросы-подсказки</summary><ul>' + QUESTIONS.map(function (q) { return '<li>' + q + '</li>'; }).join('') + '</ul></details>';

    var photosUI = ext
      ? '<div class="cr-photos">' + (p.photos || []).map(function (src, i) { return '<div class="cr-ph" style="background-image:url(' + src + ')"><button type="button" class="cr-del" data-delph="' + i + '" aria-label="Удалить фото ' + (i + 1) + '">' + ICON.x + '</button></div>'; }).join('') +
        ((p.photos || []).length < EXT_PHOTOS ? '<label class="cr-ph cr-ph--add"><input type="file" accept="image/*" multiple id="phf" hidden>' + ICON.plus + '<span>Добавить</span></label>' : '') + '</div>' +
        '<p class="field__hint">' + (p.photos || []).length + ' из ' + EXT_PHOTOS + '. Фото сжимаются автоматически.</p>'
      : lockBox('Галерея до ' + EXT_PHOTOS + ' фото');
    var videosUI = ext
      ? (p.videos || []).map(function (v, i) { return '<div class="cr-row"><input data-vid="' + i + '" value="' + esc(v) + '" placeholder="Ссылка на Rutube или VK Видео" aria-label="Ссылка на видео ' + (i + 1) + '"><button type="button" class="cr-del" data-delvid="' + i + '" aria-label="Удалить видео">' + ICON.x + '</button></div>'; }).join('') +
        '<p class="field__err" id="vid-err" hidden>Не распознали ссылку. Подойдут Rutube и VK Видео.</p><button type="button" class="btn" id="addvid">' + ICON.plus + 'Добавить видео</button>'
      : lockBox('Видео');
    var relsUI = ext
      ? (p.relatives || []).map(function (r, i) { return '<div class="cr-row cr-row--2"><input data-rn="' + i + '" value="' + esc(r.name) + '" placeholder="ФИО" aria-label="ФИО родственника"><input data-rr="' + i + '" value="' + esc(r.relation) + '" placeholder="Кем приходится: сын, жена…" aria-label="Кем приходится"><button type="button" class="cr-del" data-delrel="' + i + '" aria-label="Удалить">' + ICON.x + '</button></div>'; }).join('') +
        '<button type="button" class="btn" id="addrel">' + ICON.plus + 'Добавить родственника</button>' +
        '<p class="field__hint">Указывайте умерших родственников или тех, кто согласен на публикацию своего имени.</p>'
      : lockBox('Родственники и семейное древо');

    var plan = ext
      ? '<div class="cr-plan cr-plan--ext"><span class="cr-tag cr-tag--ext">Расширенная</span><span>' + (p.demo ? 'Включена в демо-режиме, чтобы посмотреть возможности. Оплата — при запуске.' : 'Все возможности открыты.') + '</span></div>'
      : '<div class="cr-plan"><span class="cr-tag">Базовая · бесплатно</span><span>1 портрет и биография до ' + FREE_BIO + ' знаков.</span><button type="button" class="btn btn--solid" data-upgrade>Расширенная — ' + PRICE_EXT + '</button></div>';

    shell('<a class="cr-back" href="#/">← Мои страницы</a>' +
      '<div class="cr-head"><h1 class="cr-title">' + esc(fullName(p) || 'Новая страница') + '</h1><span class="cr-saved" id="saved" aria-live="polite">Сохранено</span></div>' +
      plan +
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
        sec('s-photos', 'Фотографии', photosUI, ext ? '' : '') +
        sec('s-video', 'Видео', videosUI) +
        sec('s-rel', 'Родственники', relsUI) +
        sec('s-done', 'Готово',
          '<div class="cr-done"><div class="cr-qr"><img id="qr" alt="QR-код страницы" width="148" height="148"></div><div>' +
          '<p>Ссылка на страницу и QR-код. QR можно распечатать или заказать готовую табличку.</p>' +
          '<div class="cr-done__btns"><a class="btn btn--solid" id="open" href="' + BASE + '/stranica/?id=' + encodeURIComponent(p.id) + '">Открыть страницу</a>' +
          '<a class="btn" id="qrdl" download="qr-' + esc(p.id) + '.png">Скачать QR-код</a>' +
          '<button type="button" class="btn" id="plaque">Заказать именную табличку — ' + PRICE_PLAQUE + '</button></div>' +
          '<button type="button" class="linkbtn cr-delpage" id="delpage">Удалить страницу</button></div></div>') +
      '</div><aside class="cr-prev" aria-label="Предпросмотр"><div class="cr-phone"><div class="cr-phone__scr" id="pv"></div></div><p class="cr-prev__cap">Так страница выглядит на телефоне</p></aside></div>' +
      demoNote());
    bindEditor();
    updatePreview();
  }

  var PV_TARGET = { 's-main': null, 's-bio': 'bio', 's-place': 'mesto', 's-photos': 'foto', 's-video': 'video', 's-rel': 'semya', 's-done': 'qr' };
  var pvFocus = null;
  function scrollPreview() {
    var pv = $('#pv'); if (!pv || pvFocus === undefined) return;
    var t = pvFocus && $('#pv #' + pvFocus);
    var k = 0.7333;   // масштаб .cr-pv
    pv.scrollTo({ top: t ? Math.max(0, t.offsetTop * k - 12) : 0, behavior: 'smooth' });
  }
  function updatePreview() {
    var pv = $('#pv'); if (!pv) return;
    // карту не перезагружаем на каждый символ: переносим уже открытый iframe, если адрес не менялся
    var oldMap = $('#pv .place__map iframe');
    pv.innerHTML = '<div class="cr-pv">' + pageHTML(cur, { preview: true }) + '</div>';
    var newMap = $('#pv .place__map iframe');
    if (oldMap && newMap && oldMap.src === newMap.src) newMap.parentNode.replaceChild(oldMap, newMap);
    if (pvFocus) { var t = $('#pv #' + pvFocus); if (t) pv.scrollTop = Math.max(0, t.offsetTop * 0.7333 - 12); }
    var q = makeQR(pageUrl(cur.id), 5); var qi = $('#qr'); if (qi && q) { qi.src = q; $('#qrdl').href = makeQR(pageUrl(cur.id), 12); }
  }

  function save(now) {
    clearTimeout(saveT);
    var s = $('#saved'); if (s) s.textContent = 'Сохраняем…';
    var go = function () { store.put(cur).then(function () { var e = $('#saved'); if (e) e.textContent = 'Сохранено'; }); };
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
    var live = function (sel, fn) { var el = $(sel); if (el) el.addEventListener('input', function () { fn(el.value); updatePreview(); save(); }); };
    live('#e-last', function (v) { p.lastName = v.trim(); $('.cr-title').textContent = fullName(p) || 'Новая страница'; });
    live('#e-first', function (v) { p.firstName = v.trim(); $('.cr-title').textContent = fullName(p) || 'Новая страница'; });
    live('#e-patr', function (v) { p.patronymic = v.trim(); });
    ['born', 'died'].forEach(function (k) {
      var el = $('#e-' + k);
      el.addEventListener('input', function () {
        el.value = el.value.replace(/[^\d.]/g, '');
        var v = el.value.trim(), ok = !v || parseDate(v);
        $('#e-' + k + '-err').hidden = !!ok; $('#e-' + k + '-err').textContent = 'Формат: ДД.ММ.ГГГГ или ГГГГ';
        el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (ok) { p[k] = v; updatePreview(); save(); }
      });
    });
    live('#e-epi', function (v) { p.epitaph = v.trim(); });
    live('#e-place', function (v) { p.burial = p.burial || {}; p.burial.text = v; });
    live('#e-coords', function (v) { p.burial = p.burial || {}; p.burial.coords = v; });
    var bf = $('#bio-free');
    if (bf) bf.addEventListener('input', function () {
      p.bio = [{ title: '', text: bf.value }];
      $('#bio-cnt span').textContent = bf.value.length;
      $('#bio-up').hidden = bf.value.length < FREE_BIO * 0.9;
      updatePreview(); save();
    });
    $$('[data-ct]').forEach(function (i) { i.addEventListener('input', function () { p.bio[+i.getAttribute('data-ct')].title = i.value; updatePreview(); save(); }); });
    $$('[data-cx]').forEach(function (i) { i.addEventListener('input', function () { p.bio[+i.getAttribute('data-cx')].text = i.value; updatePreview(); save(); }); });
    var ac = $('#addchap'); if (ac) ac.addEventListener('click', function () { p.bio.push({ title: '', text: '' }); save(true); renderEditor(); var n = $$('[data-ct]'); n[n.length - 1].focus(); });
    $$('[data-delchap]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('Удалить главу?')) return; p.bio.splice(+b.getAttribute('data-delchap'), 1); save(true); renderEditor(); }); });
    // портрет
    var upf = $('#upf');
    upf.addEventListener('change', function () {
      var f = upf.files[0]; if (!f) return;
      readPhoto(f, 1400).then(function (d) { p.portrait = d; save(true); renderEditor(); }).catch(function () { toast('Не удалось прочитать фото. Подойдёт JPG или PNG.'); });
    });
    // фото
    var phf = $('#phf');
    if (phf) phf.addEventListener('change', function () {
      var files = Array.prototype.slice.call(phf.files, 0, EXT_PHOTOS - p.photos.length);
      toast('Загружаем фото: ' + files.length);
      files.reduce(function (pr, f) { return pr.then(function () { return readPhoto(f, 1600).then(function (d) { p.photos.push(d); }, function () {}); }); }, Promise.resolve())
        .then(function () { save(true); renderEditor(); var s = $('#s-photos'); if (s) s.scrollIntoView(); });
    });
    $$('[data-delph]').forEach(function (b) { b.addEventListener('click', function () { p.photos.splice(+b.getAttribute('data-delph'), 1); save(true); renderEditor(); $('#s-photos').scrollIntoView(); }); });
    // видео
    var av = $('#addvid'); if (av) av.addEventListener('click', function () { p.videos.push(''); save(true); renderEditor(); var n = $$('[data-vid]'); n[n.length - 1].focus(); });
    $$('[data-vid]').forEach(function (i) {
      i.addEventListener('input', function () {
        p.videos[+i.getAttribute('data-vid')] = i.value.trim(); updatePreview(); save();
        if (!i.value.trim() || videoEmbed(i.value)) { $('#vid-err').hidden = true; i.setAttribute('aria-invalid', 'false'); }
      });
      i.addEventListener('blur', function () { var bad = i.value.trim() && !videoEmbed(i.value); $('#vid-err').hidden = !bad; i.setAttribute('aria-invalid', bad ? 'true' : 'false'); });
    });
    $$('[data-delvid]').forEach(function (b) { b.addEventListener('click', function () { p.videos.splice(+b.getAttribute('data-delvid'), 1); save(true); renderEditor(); $('#s-video').scrollIntoView(); }); });
    // родственники
    var ar = $('#addrel'); if (ar) ar.addEventListener('click', function () { p.relatives.push({ name: '', relation: '' }); save(true); renderEditor(); var n = $$('[data-rn]'); n[n.length - 1].focus(); });
    $$('[data-rn]').forEach(function (i) { i.addEventListener('input', function () { p.relatives[+i.getAttribute('data-rn')].name = i.value; updatePreview(); save(); }); });
    $$('[data-rr]').forEach(function (i) { i.addEventListener('input', function () { p.relatives[+i.getAttribute('data-rr')].relation = i.value; updatePreview(); save(); }); });
    $$('[data-delrel]').forEach(function (b) { b.addEventListener('click', function () { p.relatives.splice(+b.getAttribute('data-delrel'), 1); save(true); renderEditor(); $('#s-rel').scrollIntoView(); }); });
    // апгрейд, табличка, удаление
    $$('[data-upgrade]').forEach(function (b) { b.addEventListener('click', openUpgrade); });
    $('#plaque').addEventListener('click', function () {
      openModal('<h2 class="cr-modal__t">Именная QR-табличка — ' + PRICE_PLAQUE + '</h2><p>Изготовим под заказ табличку 6×6 см с уникальным QR-кодом этой страницы, проверим, упакуем и отправим СДЭК. Напишите нам — пришлём макет на согласование и ссылку на оплату.</p>' +
        msgButtons('Здравствуйте! Хочу заказать изготовление именной QR-таблички (' + PRICE_PLAQUE + ') для страницы: ' + fullName(p) + ', ' + span(p) + '.'));
    });
    $('#delpage').addEventListener('click', function () {
      if (!confirm('Удалить страницу «' + (fullName(p) || 'без имени') + '»? Это нельзя отменить.')) return;
      store.del(p.id).then(function () { toast('Страница удалена'); location.hash = '#/'; });
    });
  }

  function msgButtons(text) {
    return '<div class="cr-modal__btns"><a class="btn btn--solid" href="' + esc(msgLink('wa', text)) + '" target="_blank" rel="noopener">Написать в WhatsApp</a>' +
      '<a class="btn" href="' + esc(CFG.tg) + '" target="_blank" rel="noopener">Telegram</a>' +
      (CFG.max ? '<a class="btn" href="' + esc(CFG.max) + '" target="_blank" rel="noopener">MAX</a>'
        : CFG.maxPhone ? '<button type="button" class="btn" data-copy="' + esc(CFG.maxPhone) + '" data-copy-msg="Номер ' + esc(CFG.maxPhone) + ' скопирован. В MAX: «Новый чат» → вставьте номер">MAX</button>' : '') + '</div>';
  }

  function openUpgrade() {
    var p = cur;
    openModal('<h2 class="cr-modal__t">Расширенная страница — ' + PRICE_EXT + '</h2>' +
      '<ul class="h-list"><li>' + ICON.check + '<span>Биография без ограничений, по главам</span></li><li>' + ICON.check + '<span>До ' + EXT_PHOTOS + ' фотографий</span></li><li>' + ICON.check + '<span>Видео с Rutube и VK Видео</span></li><li>' + ICON.check + '<span>Родственники и семейное древо</span></li></ul>' +
      '<p>Разовая оплата, без подписки. Онлайн-оплата подключается — сейчас оформить можно через мессенджер, откроем расширенную вручную.</p>' +
      msgButtons('Здравствуйте! Хочу подключить расширенную страницу (' + PRICE_EXT + ') для: ' + fullName(p) + ', ' + span(p) + '.') +
      '<button type="button" class="linkbtn cr-demo-on" id="demo-on">Посмотреть возможности (демо, без оплаты)</button>');
    $('#demo-on').addEventListener('click', function () {
      p.plan = 'extended'; p.demo = true;
      if (p.bio && p.bio.length === 1 && !p.bio[0].title) p.bio[0].title = '';
      save(true); closeModal(); renderEditor(); toast('Расширенные возможности включены (демо)');
    });
  }

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
  window.addEventListener('hashchange', route);
  route();
})();
