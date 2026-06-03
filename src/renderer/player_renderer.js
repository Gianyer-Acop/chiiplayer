/**
 * player_renderer.js — Renderer do Player (refatorado)
 * 
 * Integra os componentes VinylCover, QueueList e PlaylistManager.
 * Gerencia o estado da reprodução, comunica com o pet via IPC,
 * e utiliza o módulo SpotifyApi para chamadas à API.
 */
const { ipcRenderer } = require('electron');
const SpotifyApi = require('../services/spotifyApi');
const anime = require('animejs');

let api = null;
let spotifyToken = null;
let currentTrackId = null;
let currentTrackUri = null;
let isTrackSaved = false;
let isPlaying = false;
let pollingInterval = null;
let vinylAnimation = null;
let userId = null;

// ═══════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const btnTheme = document.getElementById('btn-theme');
  const togglePet = document.getElementById('toggle-pet');
  const playerView = document.getElementById('player-view');
  const emptyState = document.getElementById('empty-state');

  // ─── Theme Toggle ────────────────────────────────────────────
  const savedTheme = localStorage.getItem('chiikawa-theme') || 'light';
  applyTheme(savedTheme);

  btnTheme.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('chiikawa-theme', next);
  });

  // ─── Pet Toggle ──────────────────────────────────────────────
  togglePet.addEventListener('change', (e) => {
    ipcRenderer.send('toggle-pet-visibility', e.target.checked);
  });

  // ─── Upload GIF do Pet ───────────────────────────────────────
  document.getElementById('img-pet').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      ipcRenderer.send('update-pet-image', { path: e.target.files[0].path });
    }
  });

  // ─── Logout ──────────────────────────────────────────────────
  btnLogout.addEventListener('click', () => ipcRenderer.send('logout-spotify'));
  ipcRenderer.on('logged-out', () => window.location.reload());

  // ─── Auto-Login (tenta usar refresh token salvo) ─────────────
  try {
    btnLogin.innerText = 'Verificando...';
    btnLogin.disabled = true;
    spotifyToken = await ipcRenderer.invoke('login-spotify');
    api = new SpotifyApi(spotifyToken);
    await showDashboard();
  } catch (err) {
    btnLogin.innerText = 'Conectar Spotify';
    btnLogin.disabled = false;
  }

  // ─── Login manual ────────────────────────────────────────────
  btnLogin.addEventListener('click', async () => {
    try {
      btnLogin.innerText = 'Conectando...';
      btnLogin.disabled = true;
      spotifyToken = await ipcRenderer.invoke('login-spotify');
      api = new SpotifyApi(spotifyToken);
      await showDashboard();
    } catch (err) {
      btnLogin.innerText = 'Conectar Spotify';
      btnLogin.disabled = false;
      showToast('Falha no login: ' + err.message);
    }
  });

  // ─── Controles de Reprodução ─────────────────────────────────
  document.getElementById('btn-play').addEventListener('click', handlePlayPause);
  document.getElementById('btn-prev').addEventListener('click', () => handleCommand('previous'));
  document.getElementById('btn-next').addEventListener('click', () => handleCommand('next'));
  document.getElementById('btn-fav').addEventListener('click', toggleFavorite);

  // ─── Playlist Sidebar ────────────────────────────────────────
  document.getElementById('btn-add-playlist').addEventListener('click', openPlaylistSidebar);
  document.getElementById('btn-close-sidebar').addEventListener('click', closePlaylistSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closePlaylistSidebar);
  document.getElementById('create-playlist-form').addEventListener('submit', handleCreatePlaylist);

  // ─── Vinil animation setup ───────────────────────────────────
  setupVinylAnimation();

  // ─── Função principal showDashboard ──────────────────────────
  async function showDashboard() {
    btnLogin.style.display = 'none';
    btnLogout.style.display = 'inline-flex';
    playerView.style.display = 'block';
    emptyState.style.display = 'none';
    playerView.classList.add('animate-in');

    // Pega userId para criação de playlists
    try {
      const user = await api.getCurrentUser();
      userId = user.id;
    } catch (e) { /* ok */ }

    await fetchCurrentTrack();
    await fetchQueue();

    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
      await fetchCurrentTrack();
      await fetchQueue();
    }, 5000);
  }

  // Inicializa ícones Lucide
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

// ═══════════════════════════════════════════════════════════════
//  TEMA
// ═══════════════════════════════════════════════════════════════

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ═══════════════════════════════════════════════════════════════
//  VINIL GIRATÓRIO (anime.js)
// ═══════════════════════════════════════════════════════════════

function setupVinylAnimation() {
  vinylAnimation = anime({
    targets: '#vinyl-disc',
    rotate: '1turn',
    duration: 3000,
    loop: true,
    easing: 'linear',
    autoplay: false
  });
}

function updateVinylSpeed(bpm) {
  if (!vinylAnimation) return;
  // Velocidade base: 1 rotação a cada 3s (≈ 20 RPM)
  // Se temos BPM, ajustamos: tempo mais rápido = giro mais rápido
  const baseDuration = 3000;
  const speedFactor = bpm ? Math.max(0.5, Math.min(2, bpm / 120)) : 1;
  const newDuration = baseDuration / speedFactor;

  // Recria a animação com a nova duração
  vinylAnimation.pause();
  vinylAnimation = anime({
    targets: '#vinyl-disc',
    rotate: '1turn',
    duration: newDuration,
    loop: true,
    easing: 'linear',
    autoplay: isPlaying
  });
}

function setVinylPlaying(playing) {
  if (!vinylAnimation) return;
  if (playing) vinylAnimation.play();
  else vinylAnimation.pause();
}

// ═══════════════════════════════════════════════════════════════
//  FETCH TRACK ATUAL
// ═══════════════════════════════════════════════════════════════

async function fetchCurrentTrack() {
  if (!api) return;

  try {
    const data = await api.getCurrentlyPlaying();

    if (!data || !data.item) {
      updateTrackUI('Nenhuma música tocando', '', 'Dormindo...', null);
      setPlayingState(false);
      ipcRenderer.send('pet-state', 'sleeping');
      sendPetBubble('Dormindo...', 'sleeping');

      if (currentTrackId !== null) {
        currentTrackId = null;
        currentTrackUri = null;
        updateFavoriteButton(false);
      }
      return;
    }

    const track = data.item;
    const newTrackId = track.id;
    const trackName = track.name;
    const artistName = track.artists.map(a => a.name).join(', ');
    const albumArt = track.album.images?.[0]?.url || '';
    const playing = data.is_playing;

    // Atualizar UI
    updateTrackUI(trackName, artistName, playing ? 'Tocando' : 'Pausado', albumArt);
    setPlayingState(playing);

    // Atualizar estado do pet
    ipcRenderer.send('pet-state', playing ? 'dancing' : 'sleeping');

    // Enviar info ao bocadilho do pet
    if (playing) {
      sendPetBubble(trackName, 'playing');
    } else {
      sendPetBubble(trackName, 'paused');
    }

    // Se mudou de música, atualizar favorito e BPM
    if (currentTrackId !== newTrackId) {
      currentTrackId = newTrackId;
      currentTrackUri = track.uri;
      await checkIfTrackIsSaved(newTrackId);

      // Buscar BPM para ajustar velocidade do vinil e mostrar na tela
      try {
        const features = await api.getAudioFeatures(newTrackId);
        if (features && features.tempo) {
          const bpm = Math.round(features.tempo);
          updateVinylSpeed(bpm);
          const bpmEl = document.getElementById('track-bpm');
          if (bpmEl) {
            bpmEl.innerText = `BPM: ${bpm}`;
            bpmEl.style.display = 'block';
          }
        }
      } catch (e) { /* API pode não ter features para todas as músicas */ }
    }
  } catch (error) {
    console.error('Erro no fetchCurrentTrack:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
//  UI UPDATES
// ═══════════════════════════════════════════════════════════════

function updateTrackUI(name, artist, status, albumArt) {
  const nameEl = document.getElementById('track-name');
  const artistEl = document.getElementById('track-artist');
  const statusEl = document.getElementById('track-status');
  const coverEl = document.getElementById('vinyl-cover');

  // Animação fade na troca de música
  if (nameEl.innerText !== name) {
    nameEl.style.opacity = 0;
    nameEl.style.transform = 'translateY(8px)';
    artistEl.style.opacity = 0;

    setTimeout(() => {
      nameEl.innerText = name;
      artistEl.innerText = artist;
      nameEl.style.opacity = 1;
      nameEl.style.transform = 'translateY(0)';
      artistEl.style.opacity = 1;
    }, 250);
  }

  statusEl.innerText = status;

  if (albumArt && coverEl.src !== albumArt) {
    coverEl.src = albumArt;
    coverEl.style.background = 'none';
  }
}

function setPlayingState(playing) {
  isPlaying = playing;
  const icon = document.getElementById('icon-play');
  if (icon) {
    icon.setAttribute('data-lucide', playing ? 'pause' : 'play');
    if (window.lucide) window.lucide.createIcons({ attrs: { class: ['lucide'] }, nameAttr: 'data-lucide' });
  }
  setVinylPlaying(playing);
}

// ═══════════════════════════════════════════════════════════════
//  COMANDOS DE REPRODUÇÃO
// ═══════════════════════════════════════════════════════════════

async function handlePlayPause() {
  if (!api) return;
  const statusEl = document.getElementById('track-status');
  statusEl.innerText = 'Processando...';
  sendPetBubble('Mudando...', 'loading');

  try {
    await api.play();
    setTimeout(fetchCurrentTrack, 400);
  } catch (error) {
    statusEl.innerText = 'Erro';
  }
}

async function handleCommand(cmd) {
  if (!api) return;
  const statusEl = document.getElementById('track-status');
  statusEl.innerText = cmd === 'next' ? 'Próxima...' : 'Anterior...';
  sendPetBubble(cmd === 'next' ? 'Próxima!' : 'Voltando!', 'loading');

  try {
    if (cmd === 'next') await api.next();
    else await api.previous();
    setTimeout(async () => {
      await fetchCurrentTrack();
      await fetchQueue();
    }, 400);
  } catch (error) {
    statusEl.innerText = 'Erro';
  }
}

// ═══════════════════════════════════════════════════════════════
//  FAVORITOS
// ═══════════════════════════════════════════════════════════════

async function checkIfTrackIsSaved(trackId) {
  if (!api || !trackId) return;
  try {
    isTrackSaved = await api.isTrackSaved(trackId);
    updateFavoriteButton(isTrackSaved);
  } catch (e) { /* silencioso */ }
}

function updateFavoriteButton(saved) {
  const btn = document.getElementById('btn-fav');
  const iconFav = document.getElementById('icon-fav');
  if (saved) {
    if (iconFav) { iconFav.style.fill = 'currentColor'; }
    btn.innerHTML = `<i data-lucide="heart" style="width: 14px; height: 14px; fill: currentColor;"></i> Salva`;
    btn.classList.add('saved');
  } else {
    btn.innerHTML = `<i data-lucide="heart" style="width: 14px; height: 14px;"></i> Favoritar`;
    btn.classList.remove('saved');
  }
  if (window.lucide) window.lucide.createIcons();
}

async function toggleFavorite() {
  if (!api || !currentTrackId) return;
  const previous = isTrackSaved;
  isTrackSaved = !isTrackSaved;
  updateFavoriteButton(isTrackSaved); // Optimistic

  try {
    if (previous) await api.removeTrack(currentTrackId);
    else await api.saveTrack(currentTrackId);
    showToast(isTrackSaved ? '💚 Faixa salva!' : '🤍 Faixa removida');
  } catch (error) {
    isTrackSaved = previous;
    updateFavoriteButton(isTrackSaved);
    showToast('Erro ao alterar favorito');
  }
}

// ═══════════════════════════════════════════════════════════════
//  FILA DE REPRODUÇÃO (Queue)
// ═══════════════════════════════════════════════════════════════

async function fetchQueue() {
  if (!api) return;
  try {
    const queueData = await api.getQueue();
    renderQueue(queueData.queue || []);
  } catch (e) {
    console.error('Erro ao buscar fila:', e);
  }
}

function renderQueue(queue) {
  const list = document.getElementById('queue-list');
  if (!queue.length) {
    list.innerHTML = '<li class="queue-item"><span class="queue-item-name" style="color: var(--text-muted);">Fila vazia</span></li>';
    return;
  }

  // Mostrar no máximo 10 items
  const items = queue.slice(0, 10);
  list.innerHTML = items.map((track, i) => {
    const cover = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';
    const name = track.name || 'Desconhecido';
    const artist = track.artists?.map(a => a.name).join(', ') || '';
    const durationMs = track.duration_ms || 0;
    const mins = Math.floor(durationMs / 60000);
    const secs = String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0');

    return `
      <li class="queue-item" data-uri="${track.uri || ''}">
        <span class="queue-item-index">${i + 1}</span>
        ${cover ? `<img class="queue-item-cover" src="${cover}" alt="">` : ''}
        <div class="queue-item-info">
          <div class="queue-item-name">${name}</div>
          <div class="queue-item-artist">${artist}</div>
        </div>
        <span class="queue-item-duration">${mins}:${secs}</span>
      </li>
    `;
  }).join('');

  // Adiciona evento de clique para tocar a faixa da fila
  document.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', async () => {
      const uri = item.dataset.uri;
      if (uri) {
        try {
          showToast('Trocando faixa...');
          await api.playTrack(uri);
          setTimeout(async () => {
            await fetchCurrentTrack();
            await fetchQueue();
          }, 400);
        } catch (error) {
          showToast('Erro ao reproduzir faixa.');
        }
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR DE PLAYLISTS
// ═══════════════════════════════════════════════════════════════

function openPlaylistSidebar() {
  document.getElementById('sidebar').classList.add('active');
  document.getElementById('sidebar-overlay').classList.add('active');
  loadPlaylists();
}

function closePlaylistSidebar() {
  document.getElementById('sidebar').classList.remove('active');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

async function loadPlaylists() {
  if (!api) return;
  const list = document.getElementById('playlist-list');
  list.innerHTML = '<div style="text-align:center; padding:20px; color: var(--text-muted);">Carregando...</div>';

  try {
    const data = await api.getUserPlaylists();
    const playlists = data.items || [];

    if (!playlists.length) {
      list.innerHTML = '<div class="empty-state"><p>Nenhuma playlist encontrada</p></div>';
      return;
    }

    list.innerHTML = playlists.map(pl => {
      const coverImg = pl.images?.[0]?.url;
      const icon = coverImg
        ? `<img src="${coverImg}" style="width:44px;height:44px;border-radius:6px;object-fit:cover;">`
        : `<div class="playlist-item-icon">🎵</div>`;

      return `
        <div class="playlist-item" data-playlist-id="${pl.id}" title="Adicionar música atual a '${pl.name}'">
          ${icon}
          <div class="playlist-item-info">
            <div class="playlist-item-name">${pl.name}</div>
            <div class="playlist-item-count">${pl.tracks?.total || 0} músicas</div>
          </div>
        </div>
      `;
    }).join('');

    // Clique para adicionar música à playlist
    list.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', async () => {
        const playlistId = item.dataset.playlistId;
        await addCurrentTrackToPlaylist(playlistId);
      });
    });
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Erro ao carregar playlists</p></div>';
  }
}

async function addCurrentTrackToPlaylist(playlistId) {
  if (!api || !currentTrackUri) {
    showToast('Nenhuma música tocando para adicionar');
    return;
  }

  try {
    await api.addTrackToPlaylist(playlistId, currentTrackUri);
    showToast('✅ Adicionada à playlist!');
    closePlaylistSidebar();
  } catch (e) {
    showToast('❌ Erro ao adicionar à playlist');
  }
}

async function handleCreatePlaylist(e) {
  e.preventDefault();
  if (!api || !userId) return;

  const nameInput = document.getElementById('new-playlist-name');
  const name = nameInput.value.trim();
  if (!name) return;

  try {
    await api.createPlaylist(userId, name, 'Criada pelo Chiikawa Spotify 🐾');
    nameInput.value = '';
    showToast(`✅ Playlist "${name}" criada!`);
    await loadPlaylists();
  } catch (e) {
    showToast('❌ Erro ao criar playlist');
  }
}

// ═══════════════════════════════════════════════════════════════
//  COMUNICAÇÃO COM O PET (IPC)
// ═══════════════════════════════════════════════════════════════

function sendPetBubble(text, status) {
  ipcRenderer.send('pet-bubble-update', { text, status });
}

// ═══════════════════════════════════════════════════════════════
//  TOAST (Notificações leves)
// ═══════════════════════════════════════════════════════════════

let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
