const { ipcRenderer } = require('electron');

let isDragging = false;
let mouseX = 0;
let mouseY = 0;
let clickTimer = null;
let clickCount = 0;

let currentPetState = 'sleeping'; 
let animatedUri = "url('file:///C:/Users/usuario/.gemini/antigravity-ide/brain/a826ce8b-171f-4b3c-9d11-541336410321/hachiware_pet_1780494676819.png')";
let staticUri = animatedUri; // Fallback inicial

// Função Ninja: Usa um Canvas nativo pra bater uma foto e congelar a animação de um GIF!
function generateStaticFrame(imageSrc, callback) {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0); // Desenha o primeiro frame
    const dataUrl = canvas.toDataURL('image/png'); // Pega a foto como base64
    callback(`url('${dataUrl}')`);
  };
  img.src = imageSrc;
}

document.addEventListener('DOMContentLoaded', () => {
  const pet = document.getElementById('pet-element');

  pet.addEventListener('mousedown', (e) => {
    isDragging = true;
    mouseX = e.screenX;
    mouseY = e.screenY;
    
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

// Fase 3 (V3): O usuário sobe APENAS UM arquivo. O JavaScript extrai a versão congelada automaticamente.
ipcRenderer.on('update-pet-image', (event, { path }) => {
  const formattedPath = path.replace(/\\/g, '/');
  const fileUrl = `file:///${formattedPath}`;
  
  animatedUri = `url('${fileUrl}')`;
  
  // Extrai o frame estático invisivelmente no background e atualiza a tela
  generateStaticFrame(fileUrl, (staticDataUri) => {
    staticUri = staticDataUri;
    updateVisuals();
  });
});

ipcRenderer.on('pet-state', (event, state) => {
  if (currentPetState !== state) {
    currentPetState = state;
    updateVisuals();
  }
});

function updateVisuals() {
  document.getElementById('pet-element').style.backgroundImage = (currentPetState === 'dancing') ? animatedUri : staticUri;
}
