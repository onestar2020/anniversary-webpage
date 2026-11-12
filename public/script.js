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
  // Naka-host ang mga kanta sa Google Drive at naka-set ng admin (KV 'bg-music')
  // dahil hindi pwedeng ilagay ang copyrighted songs sa public repo.
  const bgMusic = document.getElementById('bgMusic');
  const musicBtn = document.getElementById('musicBtn');
  const musicText = document.getElementById('musicText');
  const prevSongBtn = document.getElementById('prevSongBtn');
  const nextSongBtn = document.getElementById('nextSongBtn');
  const nowPlaying = document.getElementById('nowPlaying');
  const volumeWrap = document.getElementById('volumeWrap');
  const volumeSlider = document.getElementById('volumeSlider');
  let userWantsMusic = true;
  let pausedForMedia = false;
  let autoMuted = false;
  let playlist = [];
  let songIndex = 0;

  // Volume: ginagamit ang Web Audio gain dahil sa iPhone walang epekto ang
  // audio.volume — ang gain node lang ang gumagana roon.
  let musicVolume = 0.35;
  let audioCtx = null;
  let gainNode = null;
  try {
    const saved = parseFloat(localStorage.getItem('annivMusicVolume'));
    if (saved >= 0 && saved <= 1) musicVolume = saved;
  } catch (e) {}

  function wakeAudioCtx() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }

  function applyVolume() {
    if (gainNode) gainNode.gain.value = musicVolume;
    else bgMusic.volume = musicVolume;
    volumeSlider.value = Math.round(musicVolume * 100);
    try { localStorage.setItem('annivMusicVolume', String(musicVolume)); } catch (e) {}
  }

  // Nililikha lang ang AudioContext SA UNANG TAP (user gesture): sa iOS, ang
  // context na ginawa bago may interaction ay nai-stuck sa suspended kahit
  // mag-resume pa — kaya tahimik ang tugtog kahit naka-unmute na.
  function ensureWebAudio() {
    if (gainNode) { wakeAudioCtx(); return; }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      const src = audioCtx.createMediaElementSource(bgMusic);
      gainNode = audioCtx.createGain();
      gainNode.gain.value = musicVolume;
      src.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      bgMusic.volume = 1;
    } catch (e) {
      audioCtx = null;
      gainNode = null;
      bgMusic.volume = musicVolume;
    }
  }

  applyVolume();

  volumeSlider.addEventListener('input', () => {
    musicVolume = Number(volumeSlider.value) / 100;
    applyVolume();
    ensureWebAudio();
  });

  function setMusicLabel() {
    musicBtn.classList.toggle('waiting', !bgMusic.paused && autoMuted);
    musicText.textContent = !bgMusic.paused && autoMuted
      ? 'Tap para may tunog'
      : (bgMusic.paused ? 'Play Our Song' : 'Pause Music');
  }

  function updateMusicUI() {
    const cur = playlist[songIndex];
    if (cur && playlist.length) {
      nowPlaying.textContent = '\u266A ' + cur.name;
      nowPlaying.style.display = '';
      musicBtn.style.display = '';
      volumeWrap.style.display = '';
    } else {
      nowPlaying.style.display = 'none';
      musicBtn.style.display = 'none';
      volumeWrap.style.display = 'none';
    }
    const many = playlist.length > 1;
    prevSongBtn.style.display = many ? '' : 'none';
    nextSongBtn.style.display = many ? '' : 'none';
    setMusicLabel();
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
    ensureWebAudio();
    if (autoMuted) {
      autoMuted = false;
      bgMusic.muted = false;
      setMusicLabel();
      return;
    }
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

  function switchSong(step) {
    if (playlist.length < 2) return;
    songIndex = (songIndex + step + playlist.length) % playlist.length;
    userWantsMusic = true;
    pausedForMedia = false;
    ensureWebAudio();
    startSong();
  }
  prevSongBtn.addEventListener('click', () => switchSong(-1));
  nextSongBtn.addEventListener('click', () => switchSong(1));

  function armAutoplayFallback() {
    // Binabaran ng browser ang autoplay na may tunog hangga't walang interaction —
    // unang tap/keypress kahit saan ang magbubukas ng kanta.
    const startMusic = (ev) => {
      document.removeEventListener('pointerdown', startMusic);
      document.removeEventListener('keydown', startMusic);
      // Ang musicBtn click mismo ang mag-unmute (tingnan ang musicBtn handler)
      if (ev && ev.target && ev.target.closest && ev.target.closest('#musicBtn')) return;
      ensureWebAudio();
      if (autoMuted) {
        autoMuted = false;
        bgMusic.muted = false;
        setMusicLabel();
      }
      if (userWantsMusic && !pausedForMedia && bgMusic.paused) bgMusic.play().then(setMusicLabel).catch(() => {});
    };
    document.addEventListener('pointerdown', startMusic);
    document.addEventListener('keydown', startMusic);
  }

  function startSong() {
    const cur = playlist[songIndex];
    if (!cur || !cur.id) return;
    wakeAudioCtx();
    bgMusic.src = '/api/bg-music/stream?v=' + encodeURIComponent(cur.id);
    bgMusic.load();
    bgMusic.play().then(setMusicLabel).catch(() => {
      // Hinadlangan ng browser ang tunog sa first visit — naka-mute muna ang
      // tugtog (palaging pinapayagan ito ng browser), tapos unang tap = may tunog agad.
      bgMusic.muted = true;
      autoMuted = true;
      bgMusic.play().then(setMusicLabel).catch(() => {});
    });
    armAutoplayFallback();
    updateMusicUI();
  }

  function stopMusicPlayback() {
    bgMusic.pause();
    bgMusic.removeAttribute('src');
    bgMusic.load();
    playlist = [];
    songIndex = 0;
    pausedForMedia = false;
    userWantsMusic = true;
    autoMuted = false;
    bgMusic.muted = false;
    updateMusicUI();
  }

  bgMusic.addEventListener('error', () => {
    if (!playlist.length) musicBtn.style.display = 'none';
  });

  // ---------- Kilig gate: "Kailan mo ako sinagot?" ----------
  (function initGate() {
    const gate = document.getElementById('gateOverlay');
    if (!gate) return;
    const card = document.getElementById('gateCard');
    const monthSel = document.getElementById('gateMonth');
    const daySel = document.getElementById('gateDay');
    const yearSel = document.getElementById('gateYear');
    const btn = document.getElementById('gateBtn');
    const msg = document.getElementById('gateMsg');
    const KEY = 'annivGateOk';

    // Nakasagot na dati: alisin agad ang gate bago pa unang maipinta
    let unlocked = false;
    try { unlocked = localStorage.getItem(KEY) === '1'; } catch (e) {}
    if (unlocked) { gate.remove(); return; }

    const MONTHS = ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre'];
    const mkOption = (val, text) => { const o = document.createElement('option'); o.value = val; o.textContent = text; return o; };
    monthSel.appendChild(mkOption('', 'Buwan'));
    MONTHS.forEach((m, i) => monthSel.appendChild(mkOption(i + 1, m)));
    daySel.appendChild(mkOption('', 'Araw'));
    for (let d = 1; d <= 31; d++) daySel.appendChild(mkOption(d, d));
    yearSel.appendChild(mkOption('', 'Taon'));
    for (let y = 2015; y <= 2021; y++) yearSel.appendChild(mkOption(y, y));

    let wrongCount = 0;
    btn.addEventListener('click', () => {
      const m = monthSel.value, d = daySel.value, y = yearSel.value;
      if (!m || !d || !y) {
        msg.textContent = 'Piliin mo muna ang buwan, araw, at taon 😊';
        return;
      }
      if (m === '12' && d === '29' && y === '2017') {
        msg.textContent = '';
        burstHearts();
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
        setTimeout(() => {
          gate.classList.add('gate-pass');
          setTimeout(() => gate.remove(), 850);
        }, 450);
      } else {
        wrongCount++;
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        msg.textContent = 'Hmm... subukan muli 😘' + (wrongCount >= 3 ? '\nClue: malapit sa Pasko 🎄' : '');
      }
    });

    function burstHearts() {
      const r = card.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (let i = 0; i < 14; i++) {
        const s = document.createElement('i');
        s.className = 'fa-solid fa-heart gate-burst-heart';
        const ang = Math.random() * Math.PI * 2;
        const dist = 90 + Math.random() * 140;
        s.style.left = cx + 'px';
        s.style.top = cy + 'px';
        s.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
        s.style.setProperty('--dy', Math.round(Math.sin(ang) * dist - 70) + 'px');
        s.style.animationDelay = (Math.random() * 0.15) + 's';
        s.style.fontSize = Math.round(14 + Math.random() * 18) + 'px';
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 1500);
      }
    }
  })();

  // ---------- Envelope intro ----------
  (function initEnvelopeIntro() {
    const intro = document.getElementById('envelopeIntro');
    const box = document.getElementById('envelopeBox');
    if (!intro || !box) return;
    document.body.classList.add('intro-open');
    let opened = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      intro.classList.add('intro-done');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        intro.remove();
        document.body.classList.remove('intro-open');
      }, 900);
    };
    const reveal = () => {
      if (opened) return;
      opened = true;
      // Ang click na ito ang user gesture — dito sinisimulan ang tunog para
      // siguradong may music habang bumubukas ang liham (importante sa iOS).
      ensureWebAudio();
      if (autoMuted) {
        autoMuted = false;
        bgMusic.muted = false;
        // Safety net: kung pending pa ang naunang play() (na-interrupt/blocked),
        // mag-play ulit dito sa gesture para siguradong tutugtog.
        if (bgMusic.paused && bgMusic.currentSrc) {
          bgMusic.play().then(setMusicLabel).catch(() => {});
        } else {
          setMusicLabel();
        }
      } else if (userWantsMusic && !pausedForMedia && bgMusic.paused && bgMusic.currentSrc) {
        bgMusic.play().then(setMusicLabel).catch(() => {});
      }
      box.classList.add('open');
      intro.classList.add('open');
      // Mananatiling nakabukas ang letter para mabasa — ikalawang tap kahit
      // saan (o Enter/Space) ang magpapatuloy, o awtomatiko pagkatapos ng 9s.
      setTimeout(() => document.addEventListener('click', finish, { once: true }), 450);
      setTimeout(finish, 9000);
    };
    box.addEventListener('click', reveal);
    const onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (document.getElementById('gateOverlay')) return;
      if (!opened) reveal();
      else finish();
    };
    document.addEventListener('keydown', onKey);
  })();

  (async function initMusic() {
    try {
      const res = await fetch('/api/bg-music');
      const data = await res.json();
      playlist = (data && Array.isArray(data.songs)) ? data.songs : [];
    } catch (e) {
      playlist = [];
    }
    songIndex = 0;
    // Random na pagkakasunod-sunod bawat pagbukas ng page
    for (let i = playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }
    if (playlist.length) startSong();
    updateMusicUI();
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
  const playlistList = document.getElementById('playlistList');
  const songFile = document.getElementById('songFile');
  const songLinks = document.getElementById('songLinks');
  const saveSongBtn = document.getElementById('saveSongBtn');
  const removeSongBtn = document.getElementById('removeSongBtn');
  const songStatusMsg = document.getElementById('songStatusMsg');

  function renderPlaylist() {
    if (!playlist.length) {
      playlistList.innerHTML = '<p class="playlist-empty">Wala pang naka-set na kanta.</p>';
      return;
    }
    playlistList.innerHTML = playlist.map((s, i) => `
      <div class="existing-media-item">
        <div class="mini-icon"><i class="fa-solid fa-music"></i></div>
        <span class="existing-name">${esc(s.name || ('Kanta ' + (i + 1)))}</span>
        <button type="button" class="remove-media-btn" data-remove-song="${escAttr(s.id)}" title="Remove">&times;</button>
      </div>`).join('');
  }

  musicAdminBtn.addEventListener('click', () => {
    songStatusMsg.textContent = '';
    renderPlaylist();
    showModal(bgMusicModal);
  });

  closeBgMusicBtn.addEventListener('click', () => hideModal(bgMusicModal));

  playlistList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-song]');
    if (!btn) return;
    removeOneSong(btn.dataset.removeSong);
  });

  async function removeOneSong(id) {
    const wasCurrent = !!(playlist[songIndex] && playlist[songIndex].id === id);
    songStatusMsg.style.color = '#70d6ff';
    songStatusMsg.textContent = 'Bine-bura ang kanta...';
    try {
      const res = await fetch('/api/bg-music?id=' + encodeURIComponent(id), { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error occurred.');
      playlist = data.songs || [];
      if (!playlist.length) {
        stopMusicPlayback();
      } else {
        if (wasCurrent || songIndex >= playlist.length) {
          songIndex = Math.min(songIndex, playlist.length - 1);
          if (userWantsMusic && !pausedForMedia) startSong();
          else updateMusicUI();
        } else {
          updateMusicUI();
        }
      }
      renderPlaylist();
      songStatusMsg.style.color = '#38ef7d';
      songStatusMsg.textContent = 'Nabura ang kanta.';
    } catch (err) {
      songStatusMsg.style.color = '#ff4b72';
      songStatusMsg.textContent = err.message;
    }
  }

  saveSongBtn.addEventListener('click', async () => {
    const files = Array.from(songFile.files);
    const links = songLinks.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!files.length && !links.length) {
      songStatusMsg.style.color = '#ff4b72';
      songStatusMsg.textContent = 'Pumili ng file o mag-paste ng Drive link.';
      return;
    }
    saveSongBtn.disabled = true;
    try {
      // Isa-isang file kada request — ang sabay-sabay na maraming kanta ay
      // lumalampas sa request size limit ng Cloudflare.
      for (let i = 0; i < files.length; i++) {
        songStatusMsg.style.color = '#70d6ff';
        songStatusMsg.textContent = `Ina-upload: ${i + 1}/${files.length} — ${files[i].name}`;
        const fd = new FormData();
        fd.append('song', files[i]);
        const res = await fetch('/api/bg-music', { method: 'POST', body: fd });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) throw new Error((data && data.error) || `Hindi na-upload ang ${files[i].name}.`);
        playlist = data.songs || [];
      }
      if (links.length) {
        songStatusMsg.style.color = '#70d6ff';
        songStatusMsg.textContent = 'Sine-save ang mga Drive link...';
        const fd = new FormData();
        fd.append('links', songLinks.value);
        const res = await fetch('/api/bg-music', { method: 'POST', body: fd });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) throw new Error((data && data.error) || 'Server error occurred.');
        playlist = data.songs || [];
      }
      songIndex = 0;
      userWantsMusic = true;
      pausedForMedia = false;
      if (playlist.length) startSong();
      renderPlaylist();
      songStatusMsg.style.color = '#38ef7d';
      songStatusMsg.textContent = 'Naka-set na! ' + playlist.length + ' kanta sa playlist.';
      songFile.value = '';
      songLinks.value = '';
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
      stopMusicPlayback();
      renderPlaylist();
      songStatusMsg.style.color = '#38ef7d';
      songStatusMsg.textContent = 'Music naka-off na.';
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

  const storyAiBtn = document.getElementById('storyAiBtn');

  async function fileToSmallJpeg(file, maxDim = 1024) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }

  storyAiBtn.addEventListener('click', async () => {
    const textEl = document.getElementById('text');
    if (textEl.value.trim() && !confirm('Papalitan ang story na nakasulat. Tuloy?')) return;
    const oldLabel = storyAiBtn.textContent;
    storyAiBtn.disabled = true;
    storyAiBtn.textContent = '✨ Nag-iisip...';
    statusMsg.style.color = '#70d6ff';
    statusMsg.textContent = 'Ginagawa ang sweet story...';
    try {
      let image = null;
      const photo = Array.from(document.getElementById('media').files)
        .find(f => (f.type || '').startsWith('image/'));
      if (photo) {
        try { image = await fileToSmallJpeg(photo); } catch (e) { image = null; }
      }
      const res = await fetch('/api/story-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('title').value,
          date: document.getElementById('date').value,
          image
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error((data && data.error) || 'Hindi nagawa ang story. Subukan ulit.');
      textEl.value = data.story;
      statusMsg.textContent = '';
    } catch (err) {
      statusMsg.style.color = '#ff4b72';
      statusMsg.textContent = err.message;
    } finally {
      storyAiBtn.disabled = false;
      storyAiBtn.textContent = oldLabel;
    }
  });

  // ---------- Duplicate detection ----------
  async function fileSha256(file) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const mediaInput = document.getElementById('media');
  const dupNotice = document.getElementById('dupNotice');
  let dupSkipIdx = new Set();
  let dupCheckPromise = Promise.resolve();
  let uploadingNow = false;
  let wakeLock = null;

  // Panatilihin ang screen na gising habang nag-u-upload — kapag nag-lock o
  // naka-background ang phone, pinapatay ng OS ang page at napuputol ang upload.
  async function keepAwake(on) {
    try {
      if (on) wakeLock = await navigator.wakeLock.request('screen');
      else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* hindi supported — tuloy pa rin */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && uploadingNow) keepAwake(true);
  });

  window.addEventListener('beforeunload', (e) => {
    if (!uploadingNow) return;
    e.preventDefault();
    e.returnValue = '';
  });

  mediaInput.addEventListener('change', () => {
    dupSkipIdx = new Set();
    dupNotice.hidden = true;
    const files = Array.from(mediaInput.files);
    if (!files.length) { dupCheckPromise = Promise.resolve(); return; }
    submitBtn.disabled = true;
    statusMsg.style.color = '#70d6ff';
    dupCheckPromise = (async () => {
      let index = [];
      try {
        const res = await fetch('/api/media-hashes');
        if (!res.ok) return; // walang pre-check, pero hahulihin pa rin ng server ang mga kopya
        const data = await res.json().catch(() => null);
        index = (data && data.hashes) || [];
      } catch (e) {
        return;
      }
      const byHash = new Map(index.map(e => [e.h, e]));
      const seen = new Map();
      const lines = [];
      for (let i = 0; i < files.length; i++) {
        statusMsg.textContent = `Sinusuri ang mga file: ${i + 1}/${files.length}...`;
        let h;
        try { h = await fileSha256(files[i]); } catch (e) { continue; }
        const existing = byHash.get(h);
        if (existing) {
          dupSkipIdx.add(i);
          lines.push(files[i].name + ' — nasa na sa "' + existing.t + '" (' + formatDate(existing.d) + ')');
        } else if (seen.has(h)) {
          dupSkipIdx.add(i);
          lines.push(files[i].name + ' — kopya ng ' + seen.get(h) + ' sa mga napili mo');
        } else {
          seen.set(h, files[i].name);
        }
      }
      if (lines.length) {
        dupNotice.textContent = lines.length + ' kopya ang hindi isasama sa upload:\n' + lines.join('\n');
        dupNotice.hidden = false;
      }
    })().catch(() => {}).finally(() => {
      submitBtn.disabled = false;
      statusMsg.textContent = '';
    });
  });

  // Isang file, may isang retry para sa flaky mobile network.
  // Hindi nilolog ang 409 (duplicate) at 401 (expired session) — permanenteng sagot.
  async function uploadOneWithRetry(memId, file) {
    let lastError = 'Upload failed.';
    for (let attempt = 0; attempt < 2; attempt++) {
      const fd = new FormData();
      fd.append('media', file);
      try {
        const up = await fetch(`/api/memories/${memId}/files`, { method: 'POST', body: fd });
        const upRes = await up.json().catch(() => null);
        if (up.status === 409 && upRes && upRes.duplicate) return { skip: upRes.duplicate };
        if (up.ok && upRes) return { ok: true };
        if (up.status === 401 || up.status === 400) return { error: (upRes && upRes.error) || lastError };
        lastError = (upRes && upRes.error) || `Upload failed (HTTP ${up.status}).`;
      } catch (err) {
        lastError = err.message || lastError;
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
    }
    return { error: lastError };
  }

  memoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusMsg.style.color = '#70d6ff';
    statusMsg.textContent = editingId ? 'Updating memory...' : 'Saving memory...';
    submitBtn.disabled = true;

    const filesInput = document.getElementById('media');
    const files = Array.from(filesInput.files);

    const formData = new FormData();
    formData.append('date', document.getElementById('date').value);
    formData.append('title', document.getElementById('title').value);
    formData.append('text', document.getElementById('text').value);
    formData.append('links', document.getElementById('links').value);
    if (editingId) formData.append('keepMedia', JSON.stringify(editKept.map(m => m.src)));

    try {
      // Hintayin muna ang duplicate pre-check (nakadisable ang Save habang
      // sinusuri, pero kung na-click na agad, dito nagkaka-ayos ang daloy).
      await dupCheckPromise;

      // 1) Metadata + links muna — ang maraming file sa isang request ay
      //    lumalampas sa 100MB body limit ng Cloudflare (HTML error ang sagot).
      let url = '/api/memories';
      let method = 'POST';
      if (editingId) {
        url = `/api/memories/${editingId}`;
        method = 'PUT';
      }
      const response = await fetch(url, { method, body: formData });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error((result && result.error) || 'Server error occurred.');

      // 2) Isa-isang file, kanya-kanyang request, may progress at retry
      uploadingNow = true;
      keepAwake(true);
      const memId = editingId || (result.memory && result.memory.id);
      const failed = [];
      const skippedDup = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        statusMsg.textContent = `Nag-a-upload: ${i + 1}/${files.length} — ${f.name}`;
        if (dupSkipIdx.has(i)) {
          skippedDup.push(f.name);
          continue;
        }
        if (f.size > 36 * 1024 * 1024 || !['image/', 'video/', 'audio/'].some(t => (f.type || '').startsWith(t))) {
          failed.push(f.name);
          continue;
        }
        const up = await uploadOneWithRetry(memId, f);
        if (up.skip) skippedDup.push(`${f.name} (nasa "${up.skip.title}")`);
        else if (up.error) failed.push(f.name);
      }
      dupSkipIdx = new Set();

      if (failed.length) {
        statusMsg.style.color = '#ffb347';
        statusMsg.textContent = `Naka-save ang memory! Pero hindi na-upload: ${failed.join(', ')}.` +
          (skippedDup.length ? ` (${skippedDup.length} kopya ang na-skip.)` : '') +
          ' Puwede mong i-add ulit via Edit.';
        setTimeout(() => {
          hideModal(memoryModal);
          editingId = null;
          loadMemories();
        }, 5000);
      } else if (skippedDup.length) {
        statusMsg.style.color = '#38ef7d';
        statusMsg.textContent = `Naka-save ang memory! ${skippedDup.length} kopya ang na-skip: ${skippedDup.join(', ')}.`;
        setTimeout(() => {
          hideModal(memoryModal);
          editingId = null;
          loadMemories();
        }, 4000);
      } else {
        statusMsg.style.color = '#38ef7d';
        statusMsg.textContent = editingId ? 'Memory updated!' : 'Memory saved successfully!';
        setTimeout(() => {
          hideModal(memoryModal);
          editingId = null;
          loadMemories();
        }, 800);
      }
    } catch (err) {
      statusMsg.style.color = '#ff4b72';
      statusMsg.textContent = err.message;
    } finally {
      uploadingNow = false;
      keepAwake(false);
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
