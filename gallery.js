(async () => {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), albumsEl = $("#albums"), head = $("#albumHead"), status = $("#status"), box = $("#lightbox");
  const lbImg = $("#lbImg"), lbSpin = $("#lbSpin"), lbErr = $("#lbErr");
  $("#year").textContent = new Date().getFullYear();

  /* ---------- Header motion ---------- */
  const bar = $("#bar"), prog = $("#progress"), hero = $("#hero");
  const heroText = hero.textContent;
  hero.setAttribute("aria-label", heroText);
  hero.textContent = "";
  [...heroText].forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch === " " ? "\u00a0" : ch;
    s.style.setProperty("--i", i);
    s.setAttribute("aria-hidden", "true");
    hero.appendChild(s);
  });
  let lastY = 0, ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      bar.classList.toggle("small", y > 40);
      bar.classList.toggle("hide", y > lastY && y > 200 && !box.open);
      prog.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";
      lastY = y; ticking = false;
    });
  }, { passive: true });

  let items;
  try {
    const r = await fetch("gallery/images.json");
    if (!r.ok) throw new Error(r.status);
    items = await r.json();
  } catch (e) {
    status.textContent = "Could not load the photos. Open this page from a web server, not from a file.";
    return;
  }
  status.hidden = true;
  items.forEach((it, i) => { it.id = i + 1; it.title = it.title || "Photo " + (i + 1); });

  let view = items, album = null, cols = 0, current = 0, opener = null, pushed = false;

  /* ---------- Albums (sub-folders of images/) ---------- */
  if (items.some((i) => i.album)) items.forEach((i) => { i.album = i.album || "Other"; });
  const albums = [...new Set(items.map((i) => i.album).filter(Boolean))];
  const hasAlbums = albums.length > 0;
  const subtitle = $("#sub");
  const countText = (n) => n + (n === 1 ? " photo" : " photos");
  const albumHash = () => (hasAlbums && album ? "#album/" + encodeURIComponent(album) : "");

  albums.forEach((name) => {
    const list = items.filter((i) => i.album === name), cover = list.find((i) => i.cover) || list[0];
    const a = document.createElement("a");
    a.className = "acard"; a.href = "#album/" + encodeURIComponent(name);
    const img = new Image();
    img.width = cover.w; img.height = cover.h; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
    img.onload = () => img.classList.add("ready");
    img.src = cover.thumb;
    const t = document.createElement("span"); t.className = "atitle"; t.textContent = name;
    const n = document.createElement("span"); n.className = "acount"; n.textContent = countText(list.length);
    const meta = document.createElement("span"); meta.className = "ameta"; meta.append(t, n);
    a.append(meta, img);
    albumsEl.appendChild(a);
  });

  function showHome() {
    album = null; view = items; head.hidden = true;
    if (hasAlbums) {
      grid.hidden = true; albumsEl.hidden = false;
      subtitle.textContent = "Choose an album to start browsing.";
    } else {
      albumsEl.hidden = true; grid.hidden = false;
      subtitle.textContent = "Tap a photo to view it full size, or download a copy.";
      render(true);
    }
    scrollTo(0, 0);
  }
  function showAlbum(name) {
    album = name; view = items.filter((i) => i.album === name);
    albumsEl.hidden = true; head.hidden = false; grid.hidden = false;
    $("#albumTitle").textContent = name;
    $("#albumCount").textContent = countText(view.length);
    subtitle.textContent = "Tap a photo to view it full size, or download a copy.";
    render(true); scrollTo(0, 0);
    $("#albumTitle").focus({ preventScroll: true });
  }
  function route() {
    const m = location.hash.match(/^#album\/(.+)$/);
    const name = m && decodeURIComponent(m[1]);
    if (hasAlbums && name && albums.includes(name)) showAlbum(name); else showHome();
  }

  /* ---------- Masonry that keeps left-to-right order ---------- */
  const colCount = () => { const w = grid.clientWidth; return w < 600 ? 2 : w < 900 ? 3 : w < 1200 ? 4 : 5; };
  const base = (p) => decodeURIComponent(p.split("/").pop());

  function render(force) {
    const n = colCount();
    if (n === cols && !force) return;
    cols = n;
    grid.replaceChildren();
    const columns = [], heights = new Array(n).fill(0);
    for (let c = 0; c < n; c++) { const d = document.createElement("div"); d.className = "col"; columns.push(d); grid.appendChild(d); }
    view.forEach((it, i) => {
      const c = heights.indexOf(Math.min(...heights));
      heights[c] += it.h / it.w;
      const card = document.createElement("figure");
      card.className = "card"; card.style.margin = 0;
      card.style.aspectRatio = it.w + " / " + it.h;
      const open = document.createElement("button");
      open.className = "open"; open.type = "button";
      open.setAttribute("aria-label", "View " + it.title);
      const img = new Image();
      img.width = it.w; img.height = it.h; img.alt = it.title; img.loading = "lazy"; img.decoding = "async";
      img.onload = () => img.classList.add("ready");
      img.src = it.thumb;
      open.appendChild(img);
      open.onclick = () => { opener = open; openAt(i); };
      const dl = document.createElement("a");
      dl.className = "dl"; dl.textContent = "Download";
      dl.href = it.full; dl.download = base(it.full);
      dl.setAttribute("aria-label", "Download " + it.title);
      card.append(open, dl);
      columns[c].appendChild(card);
    });
    status.hidden = true;
  }
  let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (!grid.hidden) render(false); }, 150); });

  /* ---------- Lightbox ---------- */
  function show(i) {
    current = (i + view.length) % view.length;
    const it = view[current];
    $("#lbTitle").textContent = it.title;
    $("#lbCount").textContent = (current + 1) + " / " + view.length;
    const dl = $("#lbDownload"); dl.href = it.full; dl.setAttribute("download", base(it.full));
    lbImg.classList.add("loading"); lbErr.hidden = true; lbSpin.hidden = false;
    const pre = new Image();
    pre.onload = () => {
      if (view[current] !== it) return;
      lbImg.src = it.full; lbImg.alt = it.title;
      lbImg.classList.remove("loading"); lbSpin.hidden = true;
    };
    pre.onerror = () => { if (view[current] === it) { lbSpin.hidden = true; lbErr.hidden = false; } };
    pre.src = it.full;
    const h = "#photo-" + it.id;
    if (location.hash !== h) {
      if (!pushed) { history.pushState(null, "", h); pushed = true; }
      else history.replaceState(null, "", h);
    }
    new Image().src = view[(current + 1) % view.length].full;
  }
  function openAt(i) { if (!box.open) box.showModal(); show(i); }
  function openById(id, fromLoad) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (hasAlbums) { if (album !== it.album) showAlbum(it.album); }
    else if (!grid.childElementCount) showHome();
    const i = view.indexOf(it);
    if (fromLoad) pushed = false;
    openAt(i);
  }

  let silent = false;
  box.addEventListener("close", () => {
    if (silent) silent = false;
    else if (pushed) { pushed = false; history.back(); }
    else if (/^#photo-/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + albumHash());
    if (opener) opener.focus();
  });
  addEventListener("popstate", () => {
    const m = location.hash.match(/^#photo-(\d+)$/);
    if (m) { openById(+m[1]); return; }
    if (box.open) { pushed = false; silent = true; box.close(); }
    route();
  });

  $("#lbClose").onclick = () => box.close();
  $("#lbPrev").onclick = () => show(current - 1);
  $("#lbNext").onclick = () => show(current + 1);
  addEventListener("keydown", (e) => {
    if (!box.open) return;
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });
  $("#stage").addEventListener("click", (e) => { if (e.target === e.currentTarget) box.close(); });

  if (navigator.share) {
    const s = $("#lbShare"); s.hidden = false;
    s.onclick = () => navigator.share({ title: view[current].title, url: location.href }).catch(() => {});
  }

  // Swipe (ignored during pinch-zoom)
  let x0 = null, multi = false;
  box.addEventListener("touchstart", (e) => {
    multi = e.touches.length > 1; x0 = multi ? null : e.touches[0].clientX;
  }, { passive: true });
  box.addEventListener("touchend", (e) => {
    if (x0 === null || multi) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  const m = location.hash.match(/^#photo-(\d+)$/);
  if (m) openById(+m[1], true); else route();
})();