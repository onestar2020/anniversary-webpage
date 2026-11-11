const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'HONTOOT12292017';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_VIDEO_MB = 200;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ---------- Sessions ----------
const sessions = new Map(); // token -> expiresAt
const loginAttempts = new Map(); // ip -> { count, resetAt }

function getSessionToken(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === 'sid') return decodeURIComponent(rest.join('='));
  }
  return null;
}

function requireAdmin(req, res, next) {
  const token = getSessionToken(req);
  const expires = token ? sessions.get(token) : null;
  if (!expires || expires < Date.now()) {
    if (expires) sessions.delete(token);
    return res.status(401).json({ error: 'Kailangan mag-login bilang admin.' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (rec && now < rec.resetAt && rec.count >= 8) {
    return res.status(429).json({ error: 'Masyadong maraming attempts. Subukan ulit pagkatapos ng 15 minuto.' });
  }
  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    if (!rec || now >= rec.resetAt) {
      loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    } else {
      rec.count++;
    }
    return res.status(401).json({ error: 'Maling Password! Subukan ulit.' });
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, now + SESSION_TTL);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL / 1000)}`);
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  const token = getSessionToken(req);
  const expires = token ? sessions.get(token) : null;
  res.json({ admin: !!(expires && expires >= Date.now()) });
});

// ---------- Uploads ----------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname).toLowerCase());
  }
});

const ALLOWED_TYPES = ['image/', 'video/', 'audio/'];
const upload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_MB * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.some(t => file.mimetype.startsWith(t))) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
});

function detectType(file) {
  if (file.mimetype.startsWith('image/')) return 'image';
  if (file.mimetype.startsWith('video/')) return 'video';
  if (file.mimetype.startsWith('audio/')) return 'audio';
  return 'file';
}

function classifyLink(url) {
  const u = url.trim();
  if (!u) return null;
  if (/drive\.google\.com/i.test(u)) {
    return { type: 'video', provider: 'gdrive', src: u, name: '' };
  }
  if (/youtube\.com|youtu\.be/i.test(u)) {
    return { type: 'video', provider: 'youtube', src: u, name: '' };
  }
  const clean = u.split('?')[0];
  if (/\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(clean)) return { type: 'image', provider: 'external', src: u, name: '' };
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(clean)) return { type: 'audio', provider: 'external', src: u, name: '' };
  return null;
}

function parseLinks(linksRaw) {
  if (!linksRaw) return { media: [], invalid: [] };
  const media = [];
  const invalid = [];
  for (const line of String(linksRaw).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = classifyLink(line);
    if (item) media.push(item);
    else invalid.push(line.trim());
  }
  return { media, invalid };
}

// ---------- Data ----------
const dataPath = path.join(__dirname, 'data', 'memories.json');
if (!fs.existsSync(path.dirname(dataPath))) fs.mkdirSync(path.dirname(dataPath), { recursive: true });

function saveMemories(memories) {
  fs.writeFileSync(dataPath, JSON.stringify(memories, null, 2));
}

function guessType(src) {
  const clean = src.split('?')[0].toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|bmp)$/.test(clean)) return 'image';
  if (/\.(mp4|webm|mov|mkv|m4v|avi)$/.test(clean)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(clean)) return 'audio';
  return 'video';
}

function loadMemories() {
  const memories = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]');
  let changed = false;
  for (const m of memories) {
    if (!Array.isArray(m.media)) {
      m.media = m.mediaUrl ? [{ type: m.type || guessType(m.mediaUrl), src: m.mediaUrl, provider: 'local', name: '' }] : [];
      delete m.mediaUrl;
      changed = true;
    }
  }
  if (changed) saveMemories(memories);
  return memories;
}

function deleteLocalFiles(media) {
  (media || []).forEach(item => {
    if (item.src && item.src.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, item.src);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { console.error('Failed to delete file:', filePath, e.message); }
      }
    }
  });
}

// ---------- API Routes ----------
app.get('/api/memories', (req, res) => {
  try {
    const memories = loadMemories();
    memories.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read memories data.' });
  }
});

app.post('/api/memories', requireAdmin, upload.array('media', 20), (req, res) => {
  try {
    const { date, title, text, links } = req.body;
    if (!title || !date) {
      req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(400).json({ error: 'Kailangan ang Title at Date!' });
    }
    const { media: linkMedia, invalid } = parseLinks(links);
    if (invalid.length > 0) {
      req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(400).json({ error: `Hindi suportadong link: ${invalid[0]}. Gumamit ng Google Drive, YouTube, o direktang image/audio file link.` });
    }
    const fileMedia = (req.files || []).map(f => ({
      type: detectType(f),
      provider: 'local',
      src: `/uploads/${f.filename}`,
      name: f.originalname
    }));
    const newMemory = {
      id: Date.now(),
      date,
      title,
      text: text || '',
      media: [...fileMedia, ...linkMedia]
    };
    const memories = loadMemories();
    memories.push(newMemory);
    saveMemories(memories);
    res.json({ success: true, memory: newMemory });
  } catch (error) {
    console.error(error);
    req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
    res.status(500).json({ error: 'Nagka-error sa pag-save ng alaala.' });
  }
});

app.put('/api/memories/:id', requireAdmin, upload.array('media', 20), (req, res) => {
  try {
    const memoryId = Number(req.params.id);
    const { title, date, text, links, keepMedia } = req.body;
    const memories = loadMemories();
    const index = memories.findIndex(m => m.id === memoryId);
    if (index === -1) {
      return res.status(404).json({ error: 'Hindi nahanap ang memory.' });
    }

    const existing = memories[index].media || [];
    let keep = existing;
    const removed = [];
    if (keepMedia !== undefined) {
      const keepSet = new Set(JSON.parse(keepMedia || '[]'));
      for (const item of existing) {
        if (!keepSet.has(item.src)) removed.push(item);
      }
      keep = existing.filter(item => keepSet.has(item.src));
    }

    const { media: linkMedia, invalid } = parseLinks(links);
    if (invalid.length > 0) {
      req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(400).json({ error: `Hindi suportadong link: ${invalid[0]}. Gumamit ng Google Drive, YouTube, o direktang image/audio file link.` });
    }
    const fileMedia = (req.files || []).map(f => ({
      type: detectType(f),
      provider: 'local',
      src: `/uploads/${f.filename}`,
      name: f.originalname
    }));

    memories[index].title = title || memories[index].title;
    memories[index].date = date || memories[index].date;
    memories[index].text = text !== undefined ? text : memories[index].text;
    memories[index].media = [...keep, ...fileMedia, ...linkMedia];

    saveMemories(memories);
    if (removed.length > 0) deleteLocalFiles(removed);
    res.json({ success: true, memory: memories[index] });
  } catch (err) {
    console.error(err);
    req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
    res.status(500).json({ error: 'Error sa pag-update ng memory.' });
  }
});

app.delete('/api/memories/:id', requireAdmin, (req, res) => {
  try {
    const memoryId = Number(req.params.id);
    const memories = loadMemories();
    const memoryToDelete = memories.find(m => m.id === memoryId);
    if (!memoryToDelete) {
      return res.status(404).json({ error: 'Hindi nahanap ang memory.' });
    }
    deleteLocalFiles(memoryToDelete.media);
    saveMemories(memories.filter(m => m.id !== memoryId));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Nagka-error sa pagbura ng memory.' });
  }
});

// Friendly multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Masyadong malaki ang file. Limit ay ${MAX_VIDEO_MB}MB.` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Hanggang 20 files lang bawat memory.' });
    }
    return res.status(400).json({ error: 'Hindi suportadong file type. Images, videos, at music lang.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
