const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days (seconds)
const MAX_FILE_MB = 36; // Apps Script text/plain POST limit is ~50MB; base64 inflates by 4/3 (36MB -> ~48MB on the wire)

const EXT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.flac': 'audio/flac'
};

function extType(name) {
  const ext = (name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  return EXT_TYPES[ext] || 'application/octet-stream';
}

function detectType(name, mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  const t = extType(name);
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
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

function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function isAdmin(request, env) {
  const token = getCookie(request, 'sid');
  if (!token) return false;
  const val = await env.KV.get('session:' + token);
  return !!val;
}

// Best-effort per-isolate rate limiting (resets on isolate restart)
const loginAttempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now >= rec.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  rec.count++;
  return rec.count > 8;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// Apps Script web apps don't parse multipart file parts from server-side
// requests (e.parameters stays empty), so each file is sent as a JSON body
// with base64 data read from e.postData.contents.
async function uploadOneToDrive(env, file) {
  const payload = {
    key: env.DRIVE_SCRIPT_KEY,
    name: file.name,
    type: file.type || extType(file.name),
    data: toBase64(await file.arrayBuffer())
  };
  let res;
  try {
    res = await fetch(env.DRIVE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    throw new Error('Hindi maabot ang Drive uploader: ' + err.message);
  }
  if (!res.ok) throw new Error(`Drive upload failed (HTTP ${res.status}) para sa ${file.name}.`);
  const data = await res.json();
  if (!data.ok || !data.file) {
    throw new Error(`Drive upload failed para sa ${file.name}: ${data.error || 'unknown'}`);
  }
  return data.file;
}

async function uploadFilesToDrive(env, files) {
  if (!env.DRIVE_SCRIPT_URL || !env.DRIVE_SCRIPT_KEY) {
    throw new Error('Drive upload hindi pa naka-set up. Kailangan munang i-deploy ang Apps Script at i-set ang DRIVE_SCRIPT_URL at DRIVE_SCRIPT_KEY secrets.');
  }
  const results = [];
  for (const f of files) results.push(await uploadOneToDrive(env, f));
  return results;
}

function collectValidFiles(form) {
  const files = [];
  for (const file of form.getAll('media')) {
    if (typeof file === 'string') continue;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return { error: `Masyadong malaki ang ${file.name}. Limit ay ${MAX_FILE_MB}MB.` };
    }
    if (!['image/', 'video/', 'audio/'].some(t => (file.type || '').startsWith(t))) {
      return { error: 'Hindi suportadong file type. Images, videos, at music lang.' };
    }
    files.push(file);
  }
  return { files };
}

function driveEntries(files, uploaded) {
  return uploaded.map((u, i) => ({
    type: detectType(files[i].name, files[i].type),
    provider: 'gdrive',
    src: 'https://drive.google.com/file/d/' + u.id + '/view',
    name: files[i].name
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Static assets first (public/), worker handles the rest
    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // ---------- Auth ----------
    if (path === '/api/login' && request.method === 'POST') {
      if (tooManyAttempts(ip)) {
        return json({ error: 'Masyadong maraming attempts. Subukan ulit pagkatapos ng 15 minuto.' }, 429);
      }
      const body = await request.json().catch(() => ({}));
      const password = env.ADMIN_PASSWORD || 'HONTOOT12292017';
      if (!body.password || body.password !== password) {
        return json({ error: 'Maling Password! Subukan ulit.' }, 401);
      }
      loginAttempts.delete(ip);
      const token = crypto.randomUUID() + crypto.randomUUID();
      await env.KV.put('session:' + token, '1', { expirationTtl: SESSION_TTL });
      return json({ success: true }, 200, {
        'Set-Cookie': `sid=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL}`
      });
    }

    if (path === '/api/logout' && request.method === 'POST') {
      const token = getCookie(request, 'sid');
      if (token) await env.KV.delete('session:' + token);
      return json({ success: true }, 200, {
        'Set-Cookie': 'sid=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0'
      });
    }

    if (path === '/api/me') {
      return json({ admin: await isAdmin(request, env) });
    }

    // ---------- Media serving ----------
    if (path.startsWith('/api/media/')) {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const key = path.slice('/api/media/'.length);
      const { value, metadata } = await env.KV.getWithMetadata(key, 'arrayBuffer');
      if (!value) return json({ error: 'Hindi nahanap ang media.' }, 404);
      return new Response(value, {
        headers: {
          'Content-Type': (metadata && metadata.ct) || extType(key),
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // ---------- Drive audio proxy ----------
    // Chrome's media loader hangs on direct Drive download URLs, so audio
    // files stream through the worker same-origin instead.
    if (path === '/api/drive-audio') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const id = url.searchParams.get('id');
      if (!id || !/^[\w-]{10,60}$/.test(id)) return json({ error: 'Invalid file id' }, 400);
      let upstream;
      try {
        upstream = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
      } catch (err) {
        return json({ error: 'Hindi maabot ang Drive audio.' }, 502);
      }
      if (!upstream.ok) return json({ error: 'Hindi nahanap ang audio file.' }, 502);
      const headers = new Headers();
      headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=86400');
      const len = upstream.headers.get('content-length');
      if (len) headers.set('Content-Length', len);
      return new Response(upstream.body, { status: 200, headers });
    }

    // ---------- Background music playlist (admin-set, streams for everyone) ----------
    async function driveSongFromLink(link) {
      const m = link.match(/\/file\/d\/([\w-]+)/) || link.match(/[?&]id=([\w-]+)/);
      if (!m) {
        if (/\/drive\/folders\//.test(link)) {
          throw new Error('Folder link ito. Kailangan yung link ng mismong kanta: sa Drive, right-click sa mp3 file → Share → Copy link.');
        }
        throw new Error('Hindi valid na Google Drive file link.');
      }
      let check;
      try {
        check = await fetch(`https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t`);
      } catch (err) {
        throw new Error('Hindi maabot ang Drive file. Subukan ulit.');
      }
      const ctype = check.headers.get('content-type') || '';
      if (!check.ok || ctype.includes('text/html')) {
        throw new Error('Hindi pa public ang file. Sa Drive: right-click → Share → General access → "Anyone with the link" (Viewer), tapos try ulit.');
      }
      const cd = check.headers.get('content-disposition') || '';
      const nm = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      let name = 'Drive song';
      if (nm) { try { name = decodeURIComponent(nm[1]); } catch (e) { name = nm[1]; } }
      try { await check.body.cancel(); } catch (e) {}
      return { id: m[1], name };
    }

    if (path === '/api/bg-music') {
      if (request.method === 'GET') {
        return json((await env.KV.get('bg-music', 'json')) || { songs: [] });
      }
      if (request.method === 'POST') {
        if (!(await isAdmin(request, env))) {
          return json({ error: 'Kailangan mag-login bilang admin.' }, 401);
        }
        const form = await request.formData();
        const files = form.getAll('song').filter(f => typeof f !== 'string');
        const links = String(form.get('links') || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!files.length && !links.length) {
          return json({ error: 'Wala kang napiling file o na-paste na link.' }, 400);
        }
        for (const f of files) {
          if (!(f.type || '').startsWith('audio/')) {
            return json({ error: `Hindi music file ang ${f.name}. Music lang ang pwede (mp3, wav, m4a, atbp.).` }, 400);
          }
          if (f.size > MAX_FILE_MB * 1024 * 1024) {
            return json({ error: `Masyadong malaki ang ${f.name}. Limit ay ${MAX_FILE_MB}MB.` }, 400);
          }
        }
        const existing = (await env.KV.get('bg-music', 'json')) || { songs: [] };
        const songs = Array.isArray(existing.songs) ? [...existing.songs] : [];
        for (const f of files) {
          let uploaded;
          try {
            uploaded = await uploadOneToDrive(env, f);
          } catch (err) {
            return json({ error: err.message }, 500);
          }
          if (!songs.some(s => s.id === uploaded.id)) songs.push({ id: uploaded.id, name: f.name });
        }
        for (const link of links) {
          let entry;
          try {
            entry = await driveSongFromLink(link);
          } catch (err) {
            return json({ error: `May problema sa isang link (${link.slice(0, 60)}): ${err.message}` }, 400);
          }
          if (!songs.some(s => s.id === entry.id)) songs.push(entry);
        }
        await env.KV.put('bg-music', JSON.stringify({ songs }));
        return json({ ok: true, songs });
      }
      if (request.method === 'DELETE') {
        if (!(await isAdmin(request, env))) {
          return json({ error: 'Kailangan mag-login bilang admin.' }, 401);
        }
        const id = url.searchParams.get('id');
        if (id) {
          const existing = (await env.KV.get('bg-music', 'json')) || { songs: [] };
          const songs = (Array.isArray(existing.songs) ? existing.songs : []).filter(s => s.id !== id);
          if (songs.length) await env.KV.put('bg-music', JSON.stringify({ songs }));
          else await env.KV.delete('bg-music');
          return json({ ok: true, songs });
        }
        await env.KV.delete('bg-music');
        return json({ ok: true, songs: [] });
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    if (path === '/api/bg-music/stream') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const info = await env.KV.get('bg-music', 'json');
      const songs = info && Array.isArray(info.songs) ? info.songs : [];
      const qi = Number(url.searchParams.get('i') || '0');
      const idx = Number.isInteger(qi) && qi >= 0 && qi < songs.length ? qi : 0;
      const target = songs[idx];
      if (!target || !target.id) return json({ error: 'Walang music na naka-set.' }, 404);
      let upstream;
      try {
        upstream = await fetch(`https://drive.usercontent.google.com/download?id=${target.id}&export=download&confirm=t`);
      } catch (err) {
        return json({ error: 'Hindi maabot ang music file.' }, 502);
      }
      if (!upstream.ok) return json({ error: 'Hindi makuha ang music file.' }, 502);
      const headers = new Headers();
      headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=86400');
      const len = upstream.headers.get('content-length');
      if (len) headers.set('Content-Length', len);
      return new Response(upstream.body, { status: 200, headers });
    }

    // ---------- Memories ----------
    if (path === '/api/memories') {
      if (request.method === 'GET') {
        const memories = (await env.KV.get('memories', 'json')) || [];
        memories.sort((a, b) => new Date(a.date) - new Date(b.date));
        return json(memories);
      }

      if (request.method === 'POST') {
        if (!(await isAdmin(request, env))) {
          return json({ error: 'Kailangan mag-login bilang admin.' }, 401);
        }
        const form = await request.formData();
        const date = form.get('date');
        const title = form.get('title');
        const text = form.get('text') || '';
        const links = form.get('links');

        if (!title || !date) return json({ error: 'Kailangan ang Title at Date!' }, 400);

        const { media: linkMedia, invalid } = parseLinks(links);
        if (invalid.length > 0) {
          return json({ error: `Hindi suportadong link: ${invalid[0]}. Gumamit ng Google Drive, YouTube, o direktang image/audio file link.` }, 400);
        }

        const { files, error: fileError } = collectValidFiles(form);
        if (fileError) return json({ error: fileError }, 400);
        let fileMedia = [];
        if (files.length) {
          try {
            fileMedia = driveEntries(files, await uploadFilesToDrive(env, files));
          } catch (err) {
            return json({ error: err.message }, 500);
          }
        }

        const memories = (await env.KV.get('memories', 'json')) || [];
        const newMemory = {
          id: Date.now(),
          date,
          title,
          text,
          media: [...fileMedia, ...linkMedia]
        };
        memories.push(newMemory);
        await env.KV.put('memories', JSON.stringify(memories));
        return json({ success: true, memory: newMemory });
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    const memMatch = path.match(/^\/api\/memories\/(\d+)$/);
    if (memMatch) {
      if (!(await isAdmin(request, env))) {
        return json({ error: 'Kailangan mag-login bilang admin.' }, 401);
      }
      const id = Number(memMatch[1]);
      const memories = (await env.KV.get('memories', 'json')) || [];
      const idx = memories.findIndex(m => m.id === id);
      if (idx === -1) return json({ error: 'Hindi nahanap ang memory.' }, 404);

      if (request.method === 'DELETE') {
        for (const m of memories[idx].media || []) {
          if (m.src && m.src.startsWith('/api/media/')) {
            await env.KV.delete(m.src.slice('/api/media/'.length));
          }
        }
        memories.splice(idx, 1);
        await env.KV.put('memories', JSON.stringify(memories));
        return json({ success: true });
      }

      if (request.method === 'PUT') {
        const form = await request.formData();
        const title = form.get('title');
        const date = form.get('date');
        const text = form.get('text');
        const links = form.get('links');
        const keepRaw = form.get('keepMedia');

        const existing = memories[idx].media || [];
        let keep = existing;
        const removed = [];
        if (keepRaw !== null) {
          const keepSet = new Set(JSON.parse(keepRaw || '[]'));
          for (const item of existing) {
            if (!keepSet.has(item.src)) removed.push(item);
          }
          keep = existing.filter(item => keepSet.has(item.src));
        }

        const { media: linkMedia, invalid } = parseLinks(links);
        if (invalid.length > 0) {
          return json({ error: `Hindi suportadong link: ${invalid[0]}. Gumamit ng Google Drive, YouTube, o direktang image/audio file link.` }, 400);
        }

        const { files, error: fileError } = collectValidFiles(form);
        if (fileError) return json({ error: fileError }, 400);
        let fileMedia = [];
        if (files.length) {
          try {
            fileMedia = driveEntries(files, await uploadFilesToDrive(env, files));
          } catch (err) {
            return json({ error: err.message }, 500);
          }
        }

        memories[idx].title = title || memories[idx].title;
        memories[idx].date = date || memories[idx].date;
        memories[idx].text = text !== null ? text : memories[idx].text;
        memories[idx].media = [...keep, ...fileMedia, ...linkMedia];

        await env.KV.put('memories', JSON.stringify(memories));
        for (const item of removed) {
          if (item.src && item.src.startsWith('/api/media/')) {
            await env.KV.delete(item.src.slice('/api/media/'.length));
          }
        }
        return json({ success: true, memory: memories[idx] });
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    return json({ error: 'Not found' }, 404);
  }
};
