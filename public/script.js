document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // ---------- Relationship start date ----------
  const START = new Date(2017, 11, 29, 0, 0, 0); // December 29, 2017

  // ---------- State ----------
  let isAdmin = false;
  let memories = [];
  let editingId = null;
  let editKept = [];
  const lightbox = { memory: null, index: 0, open: false };

  // ---------- Helpers ----------
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>'"]/g,
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }
  const escAttr = esc;

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return esc(dateStr);
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function toDriveEmbed(url) {
    const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
    return m ? `https://drive.google.com/file/d/${m[1]}/preview` : url;
  }

  function driveImgSrc(url, size) {
    const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
    return m ? `https://lh3.googleusercontent.com/d/${m[1]}${size ? '=' + size : ''}` : url;
  }

  function driveAudioSrc(url) {
    const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
    return m ? '/api/drive-audio?id=' + m[1] : url;
  }

  function toYouTubeEmbed(url) {
    const m = url.match(/[?&]v=([\w-]+)/) || url.match(/youtu\.be\/([\w-]+)/) ||
              url.match(/\/shorts\/([\w-]+)/) || url.match(/\/embed\/([\w-]+)/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : url;
  }

  function embedSrc(item) {
    if (item.provider === 'gdrive') return toDriveEmbed(item.src);
    if (item.provider === 'youtube') return toYouTubeEmbed(item.src);
    return item.src;
  }

  function hasProviderIcon(item) {
    return item.provider === 'gdrive' || item.provider === 'youtube';
  }

  // ---------- Realtime Timer ----------
  const $years = document.getElementById('years');
  const $months = document.getElementById('months');
  const $days = document.getElementById('days');
  const $hours = document.getElementById('hours');
  const $minutes = document.getElementById('minutes');
  const $seconds = document.getElementById('seconds');
  const $liveDate = document.getElementById('liveDate');
  const $heroTitle = document.getElementById('heroTitle');

  function calendarDiff(from, to) {
    let years = to.getFullYear() - from.getFullYear();
    let months = to.getMonth() - from.getMonth();
    let days = to.getDate() - from.getDate();
    let hours = to.getHours() - from.getHours();
    let minutes = to.getMinutes() - from.getMinutes();
    let seconds = to.getSeconds() - from.getSeconds();

    if (seconds < 0) { seconds += 60; minutes--; }
    if (minutes < 0) { minutes += 60; hours--; }
    if (hours < 0) { hours += 24; days--; }
    if (days < 0) {
      const prevMonthDays = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
      days += prevMonthDays;
      months--;
    }
    if (months < 0) { months += 12; years--; }
    return { years, months, days, hours, minutes, seconds };
  }

  let lastYears = null;

  function heartBurst() {
    const bg = document.getElementById('heartsBg');
    for (let i = 0; i < 16; i++) {
      const h = document.createElement('div');
      h.className = 'burst-heart';
      h.textContent = '\u2764';
      h.style.left = Math.random() * 100 + '%';
      h.style.animationDelay = Math.random() * 1.2 + 's';
      h.style.fontSize = (14 + Math.random() * 22) + 'px';
      h.style.color = Math.random() > 0.5 ? '#ff4b72' : '#70d6ff';
      bg.appendChild(h);
      setTimeout(() => h.remove(), 4000);
    }
  }

  function updateHeroTitle(years) {
    $heroTitle.textContent = `Happy ${ordinal(years)} Anniversary!`;
    document.title = `Our Journey | ${years} Years Together`;
  }

  function updateLiveCounter() {
    const now = new Date();
    const d = calendarDiff(START, now);
    $years.textContent = d.years;
    $months.textContent = d.months;
    $days.textContent = d.days;
    $hours.textContent = String(d.hours).padStart(2, '0');
    $minutes.textContent = String(d.minutes).padStart(2, '0');
    $seconds.textContent = String(d.seconds).padStart(2, '0');

    $liveDate.textContent = now.toLocaleString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit'
    });

    if (lastYears !== null && d.years !== lastYears) {
      updateHeroTitle(d.years);
      heartBurst();
    }
    lastYears = d.years;
  }

  updateHeroTitle(calendarDiff(START, new Date()).years);
  setInterval(updateLiveCounter, 1000);
  updateLiveCounter();

  // ---------- Background Music ----------
  // Ang kanta ay naka-host sa Google Drive at naka-set ng admin (KV 'bg-music')
  // dahil hindi pwedeng ilagay ang copyrighted songs sa public repo.
  const bgMusic = document.getElementById('bgMusic');
  const musicBtn = document.getElementById('musicBtn');
  const musicText = document.getElementById('musicText');
  let userWantsMusic = true;
  let pausedForMedia = false;
  let currentSong = null;

  bgMusic.volume = 0.35;

  function setMusicLabel() {
    musicText.textContent = bgMusic.paused ? 'Play Our Song' : 'Pause Music';
  }

  function pauseMusicForMedia() {
    if (!bgMusic.paused) {
      pausedForMedia = true;
      bgMusic.pause();
    }
    setMusicLabel();
  }

  function resumeMusicAfterMedia() {
    if (pausedForMedia && userWantsMusic && bgMusic.paused) {
      bgMusic.play().catch(() => {});
    }
    pausedForMedia = false;
    setMusicLabel();
  }

  musicBtn.addEventListener('click', () => {
    if (bgMusic.paused) {
      userWantsMusic = true;
      pausedForMedia = false;
      bgMusic.play().catch(() => {});
    } else {
      userWantsMusic = false;
      bgMusic.pause();
    }
    setMusicLabel();
  });

  function armAutoplayFallback() {
    // Binabaran ng browser ang autoplay na may tunog hangga't walang interaction —
    // unang tap/keypress kahit saan ang magbubukas ng kanta.
    const startMusic = () => {
      document.removeEventListener('pointerdown', startMusic);
      document.removeEventListener('keydown', startMusic);
      if (userWantsMusic && bgMusic.paused) bgMusic.play().then(setMusicLabel).catch(() => {});
    };
    document.addEventListener('pointerdown', startMusic);
    document.addEventListener('keydown', startMusic);
  }

  function startSong() {
    if (!currentSong || !currentSong.id) return;
    bgMusic.src = '/api/bg-music/stream?v=' + encodeURIComponent(currentSong.id);
    bgMusic.load();
    bgMusic.play().then(setMusicLabel).catch(armAutoplayFallback);
    bgMusic.addEventListener('canplay', () => { musicBtn.style.display = ''; }, { once: true });
    bgMusic.addEventListener('error', () => { musicBtn.style.display = 'none'; }, { once: true });
  }

  (async function initMusic() {
    try {
      const res = await fetch('/api/bg-music');
      currentSong = await res.json();
    } catch (e) {
      currentSong = null;
    }
    if (currentSong && currentSong.id) startSong();
  })();

  // ---------- Elements ----------
  const timelineContainer = document.getElementById('timelineContainer');
  const openAdminBtn = document.getElementById('openAdminBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const closeLoginBtn = document.getElementById('closeLoginBtn');

  const memoryModal = document.getElementById('memoryModal');
  const memoryModalTitle = document.getElementById('memoryModalTitle');
  const memoryForm = document.getElementById('memoryForm');
  const editMemoryId = document.getElementById('editMemoryId');
  const statusMsg = document.getElementById('statusMsg');
  const closeMemoryBtn = document.getElementById('closeMemoryBtn');
  const existingMediaGroup = document.getElementById('existingMediaGroup');
  const existingMediaList = document.getElementById('existingMediaList');
  const submitBtn = document.getElementById('submitBtn');

  const lightboxEl = document.getElementById('lightbox');
  const lightboxStage = document.getElementById('lightboxStage');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  const lightboxDots = document.getElementById('lightboxDots');
  const lightboxCounter = document.getElementById('lightboxCounter');
  const closeLightboxBtn = document.getElementById('closeLightboxBtn');

  function showModal(el) { el.style.display = 'flex'; }
  function hideModal(el) { el.style.display = 'none'; }

  // ---------- Admin State ----------
  async function fetchMe() {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      setAdmin(!!data.admin);
    } catch (e) {
      setAdmin(false);
    }
  }

  function setAdmin(admin) {
    isAdmin = admin;
    logoutBtn.style.display = admin ? '' : 'none';
    musicAdminBtn.style.display = admin ? '' : 'none';
    if (admin) {
      openAdminBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add New Memory';
    } else {
      openAdminBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add New Memory';
    }
    if (memories.length > 0) renderMemories();
  }

  openAdminBtn.addEventListener('click', () => {
    if (isAdmin) {
      openAddModal();
    } else {
      loginError.textContent = '';
      showModal(loginModal);
      loginPassword.focus();
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    setAdmin(false);
  });

  // ---------- Background Music Admin ----------
  const musicAdminBtn = document.getElementById('musicAdminBtn');
  const bgMusicModal = document.getElementById('bgMusicModal');
  const closeBgMusicBtn = document.getElementById('closeBgMusicBtn');
  const currentSongLabel = document.getElementById('currentSongLabel');
  const songFile = document.getElementById('songFile');
  const songDriveLink = document.getElementById('songDriveLink');
  const saveSongBtn = document.getElementById('saveSongBtn');
  const removeSongBtn = document.getElementById('removeSongBtn');
  const songStatusMsg = document.getElementById('songStatusMsg');

  async function refreshSongLabel() {
    try {
      const res = await fetch('/api/bg-music');
      const info = await res.json();
      currentSongLabel.textContent = (info && info.id)
        ? 'Kasalukuyang kanta: ' + (info.name || 'naka-set na')
        : 'Wala pang naka-set na kanta.';
    } catch (e) {
      currentSongLabel.textContent = '';
    }
  }

  musicAdminBtn.addEventListener('click', () => {
    songStatusMsg.textContent = '';
    refreshSongLabel();
    showModal(bgMusicModal);
  });

  closeBgMusicBtn.addEventListener('click', () => hideModal(bgMusicModal));

  saveSongBtn.addEventListener('click', async () => {
    const f = songFile.files[0];
    const link = songDriveLink.value.trim();
    if (!f && !link) {
      songStatusMsg.style.color = '#ff4b72';
      songStatusMsg.textContent = 'Pumili ng file o mag-paste ng Drive link.';
      return;
    }
    songStatusMsg.style.color = '#70d6ff';
    songStatusMsg.textContent = f ? 'Ina-upload ang kanta sa Drive...' : 'Sine-save ang Drive link...';
    saveSongBtn.disabled = true;
    const fd = new FormData();
    if (f) fd.append('song', f); else fd.append('driveLink', link);
    try {
      const res = await fetch('/api/bg-music', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error occurred.');
      currentSong = data;
      userWantsMusic = true;
      pausedForMedia = false;
      startSong();
      songStatusMsg.style.color = '#38ef7d';
      songStatusMsg.textContent = 'Kanta naka-set na: ' + (data.name || (f ? f.name : 'Drive song'));
      songFile.value = '';
      songDriveLink.value = '';
      refreshSongLabel();
    } catch (err) {
      songStatusMsg.style.color = '#ff4b72';
      songStatusMsg.textContent = err.message;
    } finally {
      saveSongBtn.disabled = false;
    }
  });

  removeSongBtn.addEventListener('click', async () => {
    songStatusMsg.style.color = '#70d6ff';
    songStatusMsg.textContent = 'Bine-bura ang music...';
    try {
      const res = await fetch('/api/bg-music', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error occurred.');
      currentSong = null;
      bgMusic.pause();
      bgMusic.removeAttribute('src');
      bgMusic.load();
      musicBtn.style.display = 'none';
      pausedForMedia = false;
      userWantsMusic = true;
      songStatusMsg.style.color = '#38ef7d';
      songStatusMsg.textContent = 'Music naka-off na.';
      refreshSongLabel();
    } catch (err) {
      songStatusMsg.style.color = '#ff4b72';
      songStatusMsg.textContent = err.message;
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.color = '#ff4b72';
    loginError.textContent = 'Checking password...';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      loginPassword.value = '';
      hideModal(loginModal);
      setAdmin(true);
      openAddModal();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  closeLoginBtn.addEventListener('click', () => hideModal(loginModal));
  closeMemoryBtn.addEventListener('click', () => { hideModal(memoryModal); editingId = null; });

  window.addEventListener('click', (e) => {
    if (e.target === loginModal) hideModal(loginModal);
    if (e.target === memoryModal) { hideModal(memoryModal); editingId = null; }
    if (e.target === bgMusicModal) hideModal(bgMusicModal);
    if (e.target === lightboxEl) closeLightbox();
  });

  // ---------- Load & Render Memories ----------
  async function loadMemories() {
    try {
      const res = await fetch('/api/memories');
      memories = await res.json();
      if (!Array.isArray(memories)) memories = [];
      renderMemories();
    } catch (err) {
      timelineContainer.innerHTML = '<p class="loading">Error loading memories database.</p>';
    }
  }

  function renderMemories() {
    if (memories.length === 0) {
      timelineContainer.innerHTML = '<p class="loading">No memories saved yet. Click "Add New Memory" to start!</p>';
      return;
    }

    timelineContainer.innerHTML = memories.map(item => {
      const media = item.media || [];
      const grid = renderMediaGrid(media);
      const actions = isAdmin ? `
        <div class="card-admin-actions">
          <button class="btn-edit" data-edit="${item.id}"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn-delete" data-delete="${item.id}"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>` : '';
      return `
        <div class="timeline-item">
          <div class="timeline-date"><i class="fa-regular fa-calendar-alt"></i> ${formatDate(item.date)}</div>
          <h3 class="timeline-title">${esc(item.title)}</h3>
          ${item.text ? `<p class="timeline-text">${esc(item.text)}</p>` : ''}
          ${grid}
          ${actions}
        </div>`;
    }).join('');

    // Staggered entrance animation
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0 });
    timelineContainer.querySelectorAll('.timeline-item').forEach(el => observer.observe(el));
    // Safety net: never leave cards invisible (e.g. odd viewports, printing)
    setTimeout(() => {
      timelineContainer.querySelectorAll('.timeline-item:not(.in-view)').forEach(el => el.classList.add('in-view'));
    }, 2500);
  }

  function renderMediaGrid(media) {
    if (!media.length) return '';
    const count = Math.min(media.length, 4);
    const moreCount = media.length - 4;
    const tiles = media.slice(0, 4).map((m, i) => {
      const tile = renderMediaTile(m, i);
      const badge = (i === 3 && moreCount > 0) ? `<div class="more-badge">+${moreCount}</div>` : '';
      return `<div class="tile-wrap" data-open="${i}">${tile}${badge}</div>`;
    }).join('');
    return `<div class="media-grid grid-${count}">${tiles}</div>`;
  }

  function renderMediaTile(item, idx) {
    if (item.type === 'image') {
      const src = item.provider === 'gdrive' ? driveImgSrc(item.src, 'w600') : item.src;
      return `<img class="tile-img" src="${escAttr(src)}" alt="memory photo" loading="lazy">`;
    }
    if (item.type === 'video') {
      if (hasProviderIcon(item)) {
        const icon = item.provider === 'gdrive' ? 'fa-google-drive' : 'fa-youtube';
        return `<div class="tile-link-card"><i class="fa-brands ${icon}"></i><span>Watch Video</span></div>`;
      }
      return `<video class="tile-img" src="${escAttr(item.src)}" muted playsinline preload="metadata"></video>
              <div class="play-badge"><i class="fa-solid fa-play"></i></div>`;
    }
    if (item.type === 'audio') {
      const name = item.name || item.src.split('/').pop();
      return `<div class="tile-link-card tile-audio"><i class="fa-solid fa-compact-disc"></i><span class="audio-name">${esc(name)}</span><i class="fa-solid fa-circle-play"></i></div>`;
    }
    return '';
  }

  // Card-level clicks (lightbox open, edit, delete)
  timelineContainer.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      openEditModal(Number(editBtn.dataset.edit));
      return;
    }
    const deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn) {
      doDelete(Number(deleteBtn.dataset.delete));
      return;
    }
    const openTile = e.target.closest('[data-open]');
    if (openTile) {
      const memEl = openTile.closest('.timeline-item');
      const cardIndex = Array.from(timelineContainer.querySelectorAll('.timeline-item')).indexOf(memEl);
      const memory = memories[cardIndex];
      if (memory && memory.media && memory.media.length) {
        openLightbox(memory, Number(openTile.dataset.open));
      }
    }
  });

  async function doDelete(id) {
    if (!confirm('Sigurado ka bang buburahin ang memory na ito? Hindi na ito maibabalik.')) return;
    try {
      const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      loadMemories();
    } catch (err) {
      alert(err.message);
    }
  }

  // ---------- Add / Edit Modal ----------
  function resetMediaForm() {
    memoryForm.reset();
    editingId = null;
    editKept = [];
    editMemoryId.value = '';
    existingMediaGroup.style.display = 'none';
    existingMediaList.innerHTML = '';
    memoryModalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Add New Memory';
    statusMsg.textContent = '';
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Save Memory';
  }

  function openAddModal() {
    resetMediaForm();
    // default date = today
    const today = new Date();
    document.getElementById('date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    showModal(memoryModal);
  }

  function openEditModal(id) {
    const memory = memories.find(m => m.id === id);
    if (!memory) return;
    resetMediaForm();
    editingId = id;
    editMemoryId.value = id;

    const d = new Date(memory.date);
    if (!isNaN(d.getTime())) {
      document.getElementById('date').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    document.getElementById('title').value = memory.title || '';
    document.getElementById('text').value = memory.text || '';

    editKept = (memory.media || []).map(m => ({ ...m }));
    renderExistingMedia();

    memoryModalTitle.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Memory';
    submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Memory';
    showModal(memoryModal);
  }

  function renderExistingMedia() {
    if (editingId === null) return;
    existingMediaGroup.style.display = editKept.length ? '' : 'none';
    existingMediaList.innerHTML = editKept.map((m, i) => {
      let preview;
      if (m.type === 'image') {
        const pSrc = m.provider === 'gdrive' ? driveImgSrc(m.src, 'w200') : m.src;
        preview = `<img src="${escAttr(pSrc)}" alt="">`;
      } else if (m.type === 'audio') {
        preview = `<div class="mini-icon"><i class="fa-solid fa-music"></i></div>`;
      } else {
        const icon = m.provider === 'gdrive' ? 'fa-google-drive' : (m.provider === 'youtube' ? 'fa-youtube' : 'fa-film');
        preview = `<div class="mini-icon"><i class="fa-brands ${icon}"></i></div>`;
      }
      const label = m.type === 'video' && hasProviderIcon(m) ? (m.provider === 'gdrive' ? 'Drive Video' : 'YouTube') : (m.name || m.src.split('/').pop());
      return `<div class="existing-media-item" data-idx="${i}">
        ${preview}<span class="existing-name">${esc(label)}</span>
        <button type="button" class="remove-media-btn" data-remove="${i}" title="Remove">&times;</button>
      </div>`;
    }).join('');
  }

  existingMediaList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    editKept.splice(Number(btn.dataset.remove), 1);
    renderExistingMedia();
  });

  memoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusMsg.style.color = '#70d6ff';
    statusMsg.textContent = editingId ? 'Updating memory...' : 'Saving memory...';
    submitBtn.disabled = true;

    const formData = new FormData();
    formData.append('date', document.getElementById('date').value);
    formData.append('title', document.getElementById('title').value);
    formData.append('text', document.getElementById('text').value);
    formData.append('links', document.getElementById('links').value);

    const filesInput = document.getElementById('media');
    for (const f of filesInput.files) formData.append('media', f);

    let url = '/api/memories';
    let method = 'POST';
    if (editingId) {
      url = `/api/memories/${editingId}`;
      method = 'PUT';
      formData.append('keepMedia', JSON.stringify(editKept.map(m => m.src)));
    }

    try {
      const response = await fetch(url, { method, body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error occurred.');

      statusMsg.style.color = '#38ef7d';
      statusMsg.textContent = editingId ? 'Memory updated!' : 'Memory saved successfully!';

      setTimeout(() => {
        hideModal(memoryModal);
        editingId = null;
        loadMemories();
      }, 800);
    } catch (err) {
      statusMsg.style.color = '#ff4b72';
      statusMsg.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---------- Lightbox (same-tab viewer) ----------
  function openLightbox(memory, index) {
    lightbox.memory = memory;
    lightbox.index = index || 0;
    lightbox.open = true;
    buildDots();
    renderLightboxItem();
    lightboxEl.classList.add('active');
    document.body.style.overflow = 'hidden';
    if ((memory.media || []).some(m => m.type === 'video' || m.type === 'audio')) pauseMusicForMedia();
  }

  function closeLightbox() {
    lightbox.open = false;
    lightboxEl.classList.remove('active');
    lightboxStage.innerHTML = '';
    document.body.style.overflow = '';
    resumeMusicAfterMedia();
  }

  function buildDots() {
    const items = lightbox.memory.media || [];
    lightboxDots.innerHTML = items.map((m, i) =>
      `<button class="dot" data-dot="${i}"></button>`).join('');
    lightboxDots.querySelectorAll('[data-dot]').forEach(btn => {
      btn.addEventListener('click', () => {
        lightbox.index = Number(btn.dataset.dot);
        renderLightboxItem();
      });
    });
  }

  function renderLightboxItem() {
    const items = lightbox.memory.media || [];
    if (!items.length) return;
    lightbox.index = (lightbox.index + items.length) % items.length;
    const item = items[lightbox.index];

    if (item.type === 'image') {
      const src = item.provider === 'gdrive' ? driveImgSrc(item.src) : item.src;
      lightboxStage.innerHTML = `<img src="${escAttr(src)}" alt="memory">`;
    } else if (item.type === 'video') {
      if (hasProviderIcon(item)) {
        lightboxStage.innerHTML = `<iframe src="${escAttr(embedSrc(item))}" allow="autoplay; fullscreen" allowfullscreen frameborder="0"></iframe>`;
      } else {
        lightboxStage.innerHTML = `<video src="${escAttr(item.src)}" controls autoplay playsinline></video>`;
      }
    } else if (item.type === 'audio') {
      const name = item.name || item.src.split('/').pop();
      const audioSrc = item.provider === 'gdrive' ? driveAudioSrc(item.src) : item.src;
      lightboxStage.innerHTML = `
        <div class="lightbox-audio">
          <i class="fa-solid fa-compact-disc disc-spin"></i>
          <div class="audio-title">${esc(name)}</div>
          <audio src="${escAttr(audioSrc)}" controls autoplay></audio>
        </div>`;
    }

    lightboxCounter.textContent = `${lightbox.index + 1} / ${items.length}`;
    lightboxDots.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === lightbox.index));
  }

  lightboxPrev.addEventListener('click', () => { lightbox.index--; renderLightboxItem(); });
  lightboxNext.addEventListener('click', () => { lightbox.index++; renderLightboxItem(); });
  closeLightboxBtn.addEventListener('click', closeLightbox);

  document.addEventListener('keydown', (e) => {
    if (!lightbox.open) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') { lightbox.index++; renderLightboxItem(); }
    if (e.key === 'ArrowLeft') { lightbox.index--; renderLightboxItem(); }
  });

  // Swipe support (mobile)
  let touchStartX = 0;
  lightboxEl.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });
  lightboxEl.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      lightbox.index += dx < 0 ? 1 : -1;
      renderLightboxItem();
    }
  }, { passive: true });

  // ---------- Init ----------
  fetchMe();
  loadMemories();
});
