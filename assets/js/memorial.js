/* помниобомне.рф — поведение страниц памяти и каталога. Без зависимостей. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Тост ---------- */
  var toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* ---------- Поделиться ---------- */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (ok, fail) {
      var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(e); }
      document.body.removeChild(t);
    });
  }
  $$('[data-share]').forEach(function (b) {
    b.addEventListener('click', function () {
      var data = { title: document.title, url: location.href.split('#')[0] };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      copy(data.url).then(function () { toast('Ссылка скопирована'); }, function () { toast('Не удалось скопировать: ' + data.url); });
    });
  });

  /* ---------- QR-код страницы ---------- */
  $$('[data-qr]').forEach(function (el) {   // QR-код в сердце, как в логотипе
    // дуги и код одного бежевого цвета
    if (window.heartQR) try { el.innerHTML = window.heartQR(el.getAttribute('data-qr'), { bg: false, color: '#bb9174' }); } catch (e) {}
  });

  /* ---------- Копирование (номер для MAX) ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    var v = b.getAttribute('data-copy'), msg = b.getAttribute('data-copy-msg') || 'Скопировано';
    copy(v).then(function () { toast(msg); }, function () { toast(v); });
  });

  /* ---------- Вкладки: подсветка текущего раздела ---------- */
  var tabs = $$('.tabs a');
  if (tabs.length && 'IntersectionObserver' in window) {
    var byId = {};
    tabs.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var cur = null;
      tabs.forEach(function (a) { var id = a.getAttribute('href').slice(1); if (!cur && visible[id]) cur = id; });
      if (!cur) return;
      tabs.forEach(function (a) { a.classList.toggle('is-active', a === byId[cur]); });
      var act = byId[cur], bar = act.parentNode;
      if (act.offsetLeft < bar.scrollLeft || act.offsetLeft + act.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: act.offsetLeft - 16, behavior: 'smooth' });
    }, { rootMargin: '-120px 0px -55% 0px' });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Биография: свернуть длинную ---------- */
  $$('.bio.is-collapsed').forEach(function (bio) {
    var btn = $('.bio__more', bio);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var open = bio.classList.toggle('is-collapsed') === false;
      btn.textContent = open ? 'Свернуть' : 'Читать полностью';
      btn.setAttribute('aria-expanded', String(open));
      if (!open) bio.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ---------- Фото: показать все ---------- */
  $$('[data-gallery-more]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('.gallery__item[hidden]').forEach(function (it) { it.hidden = false; });
      btn.remove();
    });
  });

  /* ---------- Видео и карта: грузим только по клику ---------- */
  $$('[data-embed]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = btn.getAttribute('data-embed');
      f.title = btn.getAttribute('aria-label') || '';
      f.allow = 'autoplay; fullscreen; picture-in-picture; clipboard-write';
      f.allowFullscreen = true;
      btn.parentNode.replaceChild(f, btn);
    });
  });

  /* ---------- Просмотр фото ---------- */
  var items = $$('[data-lb]');
  if (items.length) {
    var lb = document.createElement('div');
    lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Просмотр фото');
    var ico = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
    lb.innerHTML =
      '<div class="lb__bar"><span class="lb__count"></span><button type="button" class="lb__close" aria-label="Закрыть">' + ico('<path d="M18 6 6 18M6 6l12 12"/>') + '</button></div>' +
      '<div class="lb__img"><img alt=""></div>' +
      '<button type="button" class="lb__prev" aria-label="Предыдущее фото">' + ico('<path d="m15 18-6-6 6-6"/>') + '</button>' +
      '<button type="button" class="lb__next" aria-label="Следующее фото">' + ico('<path d="m9 18 6-6-6-6"/>') + '</button>' +
      '<div class="lb__cap"></div>';
    document.body.appendChild(lb);
    var img = $('.lb__img img', lb), cnt = $('.lb__count', lb), cap = $('.lb__cap', lb);
    var idx = 0, lastFocus = null;
    var show = function (i) {
      idx = (i + items.length) % items.length;
      var it = items[idx];
      img.src = it.getAttribute('data-lb');
      img.alt = it.getAttribute('data-alt') || '';
      cnt.textContent = (idx + 1) + ' из ' + items.length;
      cap.textContent = it.getAttribute('data-caption') || '';
      var nx = items[(idx + 1) % items.length]; (new Image()).src = nx.getAttribute('data-lb');
    };
    var open = function (i) {
      lastFocus = document.activeElement; show(i);
      lb.classList.add('is-open'); document.documentElement.style.overflow = 'hidden';
      $('.lb__close', lb).focus();
    };
    var close = function () {
      lb.classList.remove('is-open'); document.documentElement.style.overflow = ''; img.removeAttribute('src');
      if (lastFocus) lastFocus.focus();
    };
    items.forEach(function (it, i) { it.addEventListener('click', function () { open(i); }); });
    // фото внутри биографии открывают то же фото галереи (без дублей в просмотре)
    var galleryBtns = $$('.gallery .gallery__item button');
    $$('[data-lb-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = galleryBtns[+b.getAttribute('data-lb-go')];
        if (g) open(items.indexOf(g));
      });
    });
    $('.lb__close', lb).addEventListener('click', close);
    $('.lb__prev', lb).addEventListener('click', function () { show(idx - 1); });
    $('.lb__next', lb).addEventListener('click', function () { show(idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb__img')) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'Tab') { // фокус не уходит из окна
        var f = $$('button', lb).filter(function (b) { return b.offsetParent !== null; });
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    var x0 = null, y0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(idx + (dx < 0 ? 1 : -1));
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
      x0 = null;
    });
  }

  /* ---------- Семейное древо: линии родства ---------- */
  $$('[data-tree]').forEach(function (tree) {
    var svg = $('.tree__lines', tree);
    var links = (svg.getAttribute('data-links') || '').split(';').filter(Boolean).map(function (x) {
      var p = x.split(':'); return { child: p[0], parents: p[1].split(',') };
    });
    var node = function (k) { return $('[data-node="' + k + '"]', tree); };
    var draw = function () {
      var box = tree.getBoundingClientRect(), d = '';
      var rel = function (el) { var r = el.getBoundingClientRect(); return { x: r.left - box.left + r.width / 2, top: r.top - box.top, bottom: r.bottom - box.top }; };
      links.forEach(function (l) {
        var c = node(l.child); if (!c) return;
        var cp = rel(c);
        var ps = l.parents.map(node).filter(Boolean).map(rel);
        if (!ps.length) return;
        var py = Math.max.apply(null, ps.map(function (p) { return p.bottom; }));
        var mid = py + (cp.top - py) / 2;
        ps.forEach(function (p) { d += 'M' + p.x + ' ' + p.bottom + 'V' + mid; });
        var xs = ps.map(function (p) { return p.x; }).concat([cp.x]);
        d += 'M' + Math.min.apply(null, xs) + ' ' + mid + 'H' + Math.max.apply(null, xs);
        d += 'M' + cp.x + ' ' + mid + 'V' + cp.top;
      });
      svg.innerHTML = '<path d="' + d + '"/>';
    };
    draw();
    window.addEventListener('resize', draw);
    $$('img', tree).forEach(function (im) { if (!im.complete) im.addEventListener('load', draw); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  });

  /* ---------- Заявка: проверка и отправка в WhatsApp (сервера пока нет) ---------- */
  var form = $('#order-form');
  if (form) {
    var fName = $('#of-name', form), fPhone = $('#of-phone', form), fWho = $('#of-who', form), fAgree = $('#of-agree', form);
    var setErr = function (input, errId, bad) {
      input.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) input.setAttribute('aria-describedby', errId); else input.removeAttribute('aria-describedby');
      $('#' + errId).hidden = !bad;
    };
    var digits = function (v) { return v.replace(/\D/g, ''); };
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var badName = fName.value.trim().length < 2;
      var d = digits(fPhone.value), badPhone = d.length < 10 || d.length > 11;
      var badAgree = !fAgree.checked;
      setErr(fName, 'of-name-err', badName);
      setErr(fPhone, 'of-phone-err', badPhone);
      $('#of-agree-err').hidden = !badAgree;
      var first = badName ? fName : badPhone ? fPhone : badAgree ? fAgree : null;
      if (first) { first.focus(); return; }
      var text = 'Здравствуйте! Хочу заказать страницу памяти.\nИмя: ' + fName.value.trim() + '\nТелефон: ' + fPhone.value.trim() +
        (fWho.value.trim() ? '\nО ком: ' + fWho.value.trim() : '');
      var url = form.getAttribute('data-wa') + '?text=' + encodeURIComponent(text);
      var ok = $('.h-form__ok', form);
      ok.hidden = false;
      ok.innerHTML = 'Спасибо! Открываем WhatsApp с готовым сообщением — нажмите «Отправить». Если не открылось, <a href="' + url + '" target="_blank" rel="noopener">нажмите здесь</a>.';
      window.open(url, '_blank', 'noopener');
    });
    // ошибка снимается сразу, как только поле заполнено верно
    fName.addEventListener('input', function () { if (fName.getAttribute('aria-invalid') === 'true' && fName.value.trim().length >= 2) setErr(fName, 'of-name-err', false); });
    fPhone.addEventListener('input', function () { var n = digits(fPhone.value).length; if (fPhone.getAttribute('aria-invalid') === 'true' && n >= 10 && n <= 11) setErr(fPhone, 'of-phone-err', false); });
    fAgree.addEventListener('change', function () { if (fAgree.checked) $('#of-agree-err').hidden = true; });
  }

  /* ---------- Каталог: поиск по ФИО ---------- */
  var q = $('#q');
  if (q) {
    var cards = $$('[data-name]');
    var count = $('.catalog__count'), empty = $('.catalog__empty');
    var norm = function (s) { return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); };
    var plural = function (n) { var m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? 'страница' : (m >= 2 && m <= 4 && (h < 12 || h > 14)) ? 'страницы' : 'страниц'; };
    var run = function () {
      var v = norm(q.value), n = 0;
      cards.forEach(function (c) { var hit = !v || v.split(' ').every(function (w) { return c.getAttribute('data-name').indexOf(w) !== -1; }); c.hidden = !hit; if (hit) n++; });
      count.textContent = v ? 'Найдено: ' + n + ' ' + plural(n) : '';   // общий счётчик не показываем (решение Ольги)
      empty.hidden = n !== 0;
    };
    q.addEventListener('input', run);
    var pre = new URLSearchParams(location.search).get('q');
    if (pre) q.value = pre;
    run();
  }
})();
