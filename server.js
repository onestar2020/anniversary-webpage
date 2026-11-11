const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Multer Storage Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const dataPath = path.join(__dirname, 'data', 'memories.json');
if (!fs.existsSync(path.dirname(dataPath))) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
}
if (!fs.existsSync(dataPath)) {
  fs.writeFileSync(dataPath, JSON.stringify([]));
}

const ADMIN_PASSWORD = "HONTOOT12292017";

// GET ALL MEMORIES
app.get('/api/memories', (req, res) => {
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    const memories = JSON.parse(data || '[]');
    memories.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read memories data.' });
  }
});

// CREATE NEW MEMORY
app.post('/api/memories', upload.array('media', 10), (req, res) => {
  try {
    const { password, date, title, text, type, videoLink } = req.body;
    if (!password || password.trim() !== ADMIN_PASSWORD) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
      return res.status(401).json({ error: 'Maling Password! Subukan ulit.' });
    }
    if (!title || !date) {
      return res.status(400).json({ error: 'Kailangan ang Title at Date!' });
    }
    const memories = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]');
    let mediaUrls = [];
    if (req.files && req.files.length > 0) {
      mediaUrls = req.files.map(f => `/uploads/${f.filename}`);
    } else if (videoLink) {
      mediaUrls = [videoLink];
    }
    const newMemory = {
      id: Date.now(),
      date,
      title,
      text: text || '',
      type: type || (req.files && req.files.length > 0 ? 'image' : 'text'),
      mediaUrls
    };
    memories.push(newMemory);
    fs.writeFileSync(dataPath, JSON.stringify(memories, null, 2));
    res.json({ success: true, memory: newMemory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Nagka-error sa pag-save ng alaala.' });
  }
});

// EDIT MEMORY (ADMIN ONLY)
app.put('/api/memories/:id', upload.array('media', 10), (req, res) => {
  try {
    const { password, title, date, text, videoLink } = req.body;
    if (!password || password.trim() !== ADMIN_PASSWORD) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      }
      return res.status(401).json({ error: 'Maling Admin Password!' });
    }
    const memoryId = parseInt(req.params.id);
    let memories = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]');
    const index = memories.findIndex(m => m.id === memoryId);
    if (index === -1) {
      return res.status(404).json({ error: 'Hindi nahanap ang memory.' });
    }
    memories[index].title = title || memories[index].title;
    memories[index].date = date || memories[index].date;
    memories[index].text = text !== undefined ? text : memories[index].text;
    
    // Update media if newly uploaded
    if (req.files && req.files.length > 0) {
      if (memories[index].mediaUrls) {
        memories[index].mediaUrls.forEach(url => {
          if (url.startsWith('/uploads/')) {
            const oldPath = path.join(__dirname, url);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
        });
      }
      memories[index].mediaUrls = req.files.map(f => `/uploads/${f.filename}`);
    } else if (videoLink) {
      memories[index].mediaUrls = [videoLink];
    }
    fs.writeFileSync(dataPath, JSON.stringify(memories, null, 2));
    res.json({ success: true, memory: memories[index] });
  } catch (err) {
    res.status(500).json({ error: 'Error sa pag-update ng memory.' });
  }
});

// DELETE MEMORY (ADMIN ONLY)
app.delete('/api/memories/:id', (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.trim() !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Maling Admin Password!' });
    }
    const memoryId = parseInt(req.params.id);
    let memories = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]');
    const memoryToDelete = memories.find(m => m.id === memoryId);
    if (!memoryToDelete) {
      return res.status(404).json({ error: 'Hindi nahanap ang memory.' });
    }
    if (memoryToDelete.mediaUrls && Array.isArray(memoryToDelete.mediaUrls)) {
      memoryToDelete.mediaUrls.forEach(url => {
        if (url.startsWith('/uploads/')) {
          const filePath = path.join(__dirname, url);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      });
    }
    memories = memories.filter(m => m.id !== memoryId);
    fs.writeFileSync(dataPath, JSON.stringify(memories, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Nagka-error sa pagbura ng memory.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});