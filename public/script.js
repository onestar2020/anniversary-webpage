document.addEventListener('DOMContentLoaded', () => {
  // Start Date: Dec 29, 2017
  const startDate = new Date('2017-12-29T00:00:00');

  // Real-Time Live Counter Function
  function updateLiveCounter() {
    const now = new Date();
    const diff = now - startDate;

    const secondsTotal = Math.floor(diff / 1000);
    const minutesTotal = Math.floor(secondsTotal / 60);
    const hoursTotal = Math.floor(minutesTotal / 60);
    const daysTotal = Math.floor(hoursTotal / 24);

    const years = Math.floor(daysTotal / 365.25);
    const remainingDays = Math.floor(daysTotal % 365.25);
    const hours = hoursTotal % 24;
    const minutes = minutesTotal % 60;
    const seconds = secondsTotal % 60;

    document.getElementById('years').textContent = years;
    document.getElementById('days').textContent = remainingDays;
    document.getElementById('hours').textContent = hours;
    document.getElementById('minutes').textContent = minutes;
    document.getElementById('seconds').textContent = seconds;
  }

  setInterval(updateLiveCounter, 1000);
  updateLiveCounter();

  // Background Audio Control
  const bgMusic = document.getElementById('bgMusic');
  const musicBtn = document.getElementById('musicBtn');
  const musicText = document.getElementById('musicText');
  let isPlaying = false;

  musicBtn.addEventListener('click', () => {
    if (isPlaying) {
      bgMusic.pause();
      musicText.textContent = 'Play Our Song';
    } else {
      bgMusic.play().catch(e => console.log('Audio playback allowed after user interaction'));
      musicText.textContent = 'Pause Music';
    }
    isPlaying = !isPlaying;
  });

  // Modal and Elements
  const timelineContainer = document.getElementById('timelineContainer');
  const openAdminBtn = document.getElementById('openAdminBtn');
  const closeAdminBtn = document.getElementById('closeAdminBtn');
  const adminModal = document.getElementById('adminModal');
  const memoryForm = document.getElementById('memoryForm');
  const statusMsg = document.getElementById('statusMsg');

  openAdminBtn.addEventListener('click', () => adminModal.style.display = 'flex');
  closeAdminBtn.addEventListener('click', () => adminModal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === adminModal) adminModal.style.display = 'none';
  });

  // Load Memories
  async function loadMemories() {
    try {
      const res = await fetch('/api/memories');
      const memories = await res.json();
      
      if (!memories || memories.length === 0) {
        timelineContainer.innerHTML = '<p class="loading">No memories saved yet. Click "Add New Memory" to start!</p>';
        return;
      }

      timelineContainer.innerHTML = memories.map(item => `
        <div class="timeline-item">
          <div class="timeline-date"><i class="fa-regular fa-calendar-alt"></i> ${formatDate(item.date)}</div>
          <h3 class="timeline-title">${escapeHTML(item.title)}</h3>
          ${item.text ? `<p class="timeline-text">${escapeHTML(item.text)}</p>` : ''}
          ${renderMedia(item)}
        </div>
      `).join('');
    } catch (err) {
      timelineContainer.innerHTML = '<p class="loading">Error loading memories database.</p>';
    }
  }

  function renderMedia(item) {
    if (!item.mediaUrl) return '';

    if (item.type === 'image') {
      return `<img src="${item.mediaUrl}" class="timeline-media" alt="${escapeHTML(item.title)}" loading="lazy">`;
    } else if (item.type === 'video') {
      if (item.mediaUrl.startsWith('http')) {
        return `<iframe class="timeline-media" height="280" src="${item.mediaUrl}" frameborder="0" allowfullscreen></iframe>`;
      }
      return `<video src="${item.mediaUrl}" class="timeline-media" controls></video>`;
    } else if (item.type === 'audio') {
      return `<audio src="${item.mediaUrl}" controls style="width:100%; margin-top:10px;"></audio>`;
    }
    return '';
  }

  // Submit Memory Form
  memoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusMsg.style.color = '#70d6ff';
    statusMsg.textContent = 'Saving memory...';

    const formData = new FormData(memoryForm);

    try {
      const response = await fetch('/api/memories', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Server error occurred.');
      }

      statusMsg.style.color = '#38ef7d';
      statusMsg.textContent = 'Memory saved successfully!';
      memoryForm.reset();
      
      setTimeout(() => {
        adminModal.style.display = 'none';
        statusMsg.textContent = '';
        loadMemories();
      }, 1000);

    } catch (err) {
      statusMsg.style.color = '#ff4b72';
      statusMsg.textContent = err.message;
    }
  });

  function formatDate(dateStr) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString('fil-PH', options);
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  loadMemories();
});