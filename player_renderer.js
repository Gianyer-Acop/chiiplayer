const { ipcRenderer } = require('electron');

let spotifyToken = null;
let currentTrackId = null;
let isTrackSaved = false;
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const togglePet = document.getElementById('toggle-pet');
  const playerView = document.getElementById('player-view');
  
  togglePet.addEventListener('change', (e) => ipcRenderer.send('toggle-pet-visibility', e.target.checked));
  
  // Upload único de GIF
  document.getElementById('img-pet').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      ipcRenderer.send('update-pet-image', { path: e.target.files[0].path });
    }
  });

  btnLogout.addEventListener('click', () => {
    ipcRenderer.send('logout-spotify');
  });

  ipcRenderer.on('logged-out', () => {
    window.location.reload(); 
  });
  
  // TENTATIVA DE AUTO-LOGIN COM REFRESH TOKEN (Silencioso)
  try {
    btnLogin.innerText = "Verificando sessão...";
    btnLogin.disabled = true;
    spotifyToken = await ipcRenderer.invoke('login-spotify');
    
    // Sucesso no Auto-Login!
    showDashboard();
  } catch (err) {
    // Falhou ou não existe sessão prévia. O usuário terá que clicar para logar.
    btnLogin.innerText = "Conectar Spotify";
    btnLogin.disabled = false;
  }

  btnLogin.addEventListener('click', async () => {
    try {
      btnLogin.innerText = "Conectando...";
      btnLogin.disabled = true;
      spotifyToken = await ipcRenderer.invoke('login-spotify');
      showDashboard();
    } catch (err) {
      btnLogin.innerText = "Conectar Spotify";
      btnLogin.disabled = false;
      alert("Falha: " + err.message);
    }
  });

  document.getElementById('btn-play').addEventListener('click', () => spotifyCommand('play'));
  document.getElementById('btn-prev').addEventListener('click', () => spotifyCommand('previous'));
  document.getElementById('btn-next').addEventListener('click', () => spotifyCommand('next'));
  document.getElementById('btn-fav').addEventListener('click', async () => await toggleFavorite());

  function showDashboard() {
    btnLogin.style.display = 'none';
    btnLogout.style.display = 'inline-block';
    playerView.style.display = 'block';
    fetchCurrentTrack();
    if(pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(fetchCurrentTrack, 5000);
  }
});

// UX V3: Animação avançada de troca de música (Fade + Slide)
function updateTrackNameUI(newText) {
  const el = document.getElementById('track-name');
  if (el.innerText !== newText) {
    el.style.opacity = 0;
    el.style.transform = 'translateY(10px)'; // Caiu pro abismo
    setTimeout(() => {
      el.innerText = newText;
      el.style.opacity = 1;
      el.style.transform = 'translateY(0)'; // Voltou novo
    }, 300);
  }
}

async function fetchCurrentTrack() {
  if (!spotifyToken) return;
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': `Bearer ${spotifyToken}` }
    });
    
    if (res.status === 204) {
      updateTrackNameUI("Nada tocando no momento zZz");
      document.getElementById('track-name').style.opacity = 1;
      ipcRenderer.send('pet-state', 'sleeping');

      if (currentTrackId !== null) {
        currentTrackId = null;
        updateFavoriteButton(false);
      }
      return;
    }
    
    const data = await res.json();
    if (data && data.item) {
      const newTrackId = data.item.id;
      const trackName = data.item.name;
      const artistName = data.item.artists.map(a => a.name).join(', ');
      
      updateTrackNameUI(`${trackName} - ${artistName}`);
      document.getElementById('track-name').style.opacity = 1;

      ipcRenderer.send('pet-state', data.is_playing ? 'dancing' : 'sleeping');

      if (currentTrackId !== newTrackId) {
        currentTrackId = newTrackId;
        await checkIfTrackIsSaved(newTrackId);
      }
    }
  } catch (error) {
    console.error("Erro no fetchCurrentTrack:", error);
  }
}

async function checkIfTrackIsSaved(trackId) {
  if (!spotifyToken || !trackId) return;
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/library/contains?uris=spotify:track:${trackId}`, {
      headers: { 'Authorization': `Bearer ${spotifyToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      isTrackSaved = data[0];
      updateFavoriteButton(isTrackSaved);
    }
  } catch (error) {}
}

function updateFavoriteButton(saved) {
  const btn = document.getElementById('btn-fav');
  if (saved) {
    btn.innerText = "💚 Faixa Salva (Remover)";
    btn.style.background = "#1db954";
    btn.style.color = "white";
  } else {
    btn.innerText = "🤍 Favoritar Faixa";
    btn.style.background = "#282828";
    btn.style.color = "white";
  }
}

async function toggleFavorite() {
  if (!spotifyToken || !currentTrackId) return;
  
  const previousState = isTrackSaved;
  isTrackSaved = !isTrackSaved;
  updateFavoriteButton(isTrackSaved); // Optimistic UX
  
  const method = previousState ? 'DELETE' : 'PUT';
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/library?uris=spotify:track:${currentTrackId}`, {
      method: method,
      headers: { 'Authorization': `Bearer ${spotifyToken}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (error) {
    isTrackSaved = previousState;
    updateFavoriteButton(isTrackSaved);
    alert("Erro ao alterar favorito: " + error.message);
  }
}

async function spotifyCommand(command) {
  if (!spotifyToken) return;
  document.getElementById('track-name').style.opacity = 0.5; // Optimistic Loading

  let method = command === 'play' ? 'PUT' : 'POST';
  let endpoint = `https://api.spotify.com/v1/me/player/${command}`;
  
  if (command === 'play') {
    const res = await fetch('https://api.spotify.com/v1/me/player', { headers: { 'Authorization': `Bearer ${spotifyToken}` }});
    if (res.status === 200) {
      const data = await res.json();
      endpoint = `https://api.spotify.com/v1/me/player/${data.is_playing ? 'pause' : 'play'}`;
    }
  }

  try {
    await fetch(endpoint, { method: method, headers: { 'Authorization': `Bearer ${spotifyToken}` } });
    setTimeout(fetchCurrentTrack, 400); // Re-fetch rapido para sincronizar a UI
  } catch (error) {
    document.getElementById('track-name').style.opacity = 1; 
  }
}
