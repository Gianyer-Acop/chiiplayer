/**
 * pet_renderer.js — Renderer do Pet (refatorado)
 * 
 * Gerencia o drag, duplo-clique para abrir player,
 * atualização de imagem, estado visual (animado/estático),
 * e bocadilho de texto com status da música.
 */
const { ipcRenderer } = require('electron');

let isDragging = false;
let mouseX = 0;
let mouseY = 0;
let clickTimer = null;
let clickCount = 0;
let currentPetState = 'sleeping';
let bubbleTimeout = null;

// Imagem padrão do pet
let animatedUri = "url('file:///C:/Users/usuario/.gemini/antigravity-ide/brain/a826ce8b-171f-4b3c-9d11-541336410321/hachiware_pet_1780494676819.png')";
let staticUri = animatedUri;

// ─── Gera frame estático a partir de GIF ───────────────────────
function generateStaticFrame(imageSrc, callback) {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    callback(`url('${dataUrl}')`);
  };
  img.src = imageSrc;
}

// ─── Inicialização ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const pet = document.getElementById('pet-element');

  // ─── Drag ────────────────────────────────────────────────────
  pet.addEventListener('mousedown', (e) => {
    isDragging = true;
    mouseX = e.screenX;
    mouseY = e.screenY;

    // Duplo-clique para abrir o player
    clickCount++;
    if (clickCount === 1) {
      clickTimer = setTimeout(() => { clickCount = 0; }, 350);
    } else if (clickCount === 2) {
      clearTimeout(clickTimer);
      clickCount = 0;
      ipcRenderer.send('show-player');
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const deltaX = e.screenX - mouseX;
      const deltaY = e.screenY - mouseY;
      mouseX = e.screenX;
      mouseY = e.screenY;
      ipcRenderer.send('move-pet-window', { x: deltaX, y: deltaY });
    }
  });

  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mouseleave', () => { isDragging = false; });
});

// ─── Atualizar imagem do pet ───────────────────────────────────
ipcRenderer.on('update-pet-image', (event, { path }) => {
  const formattedPath = path.replace(/\\/g, '/');
  const fileUrl = `file:///${formattedPath}`;
  animatedUri = `url('${fileUrl}')`;

  generateStaticFrame(fileUrl, (staticDataUri) => {
    staticUri = staticDataUri;
    updateVisuals();
  });
});

// ─── Estado do pet (dancing/sleeping) ──────────────────────────
ipcRenderer.on('pet-state', (event, state) => {
  if (currentPetState !== state) {
    currentPetState = state;
    updateVisuals();
  }
});

// ─── Bocadilho de texto com status da música ───────────────────
ipcRenderer.on('pet-bubble-update', (event, { text, status }) => {
  const bubble = document.getElementById('pet-bubble');
  if (!bubble) return;

  // Atualizar texto
  bubble.textContent = text;

  // Remover classes de status anteriores
  bubble.className = 'pet-bubble';
  bubble.classList.add(`status-${status}`);
  bubble.classList.add('visible');

  // Auto-esconder após 8 segundos (exceto se estiver tocando)
  if (bubbleTimeout) clearTimeout(bubbleTimeout);
  if (status === 'sleeping') {
    bubbleTimeout = setTimeout(() => {
      bubble.classList.remove('visible');
      bubble.classList.add('hidden');
    }, 5000);
  }
});

// ─── Colisão nas bordas ────────────────────────────────────────
ipcRenderer.on('pet-hit-edge', (event, edge) => {
  const pet = document.getElementById('pet-element');
  pet.classList.add('hit-edge');
  setTimeout(() => pet.classList.remove('hit-edge'), 300);
});

// ─── Visual do pet (animado vs estático) ───────────────────────
function updateVisuals() {
  const pet = document.getElementById('pet-element');
  pet.style.backgroundImage = (currentPetState === 'dancing') ? animatedUri : staticUri;
}
