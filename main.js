const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');

let authServer = null;
let playerWindow = null;
let petWindow = null;
let showPet = true; 

// Sistema de Persistência (Refresh Token) salvo na pasta segura do usuário
const configPath = path.join(app.getPath('userData'), 'spotify_config.json');

function saveRefreshToken(token) { fs.writeFileSync(configPath, JSON.stringify({ refresh_token: token })); }
function getRefreshToken() {
  if (fs.existsSync(configPath)) {
    try { return JSON.parse(fs.readFileSync(configPath)).refresh_token; } catch(e){}
  }
  return null;
}
function clearRefreshToken() { if (fs.existsSync(configPath)) fs.unlinkSync(configPath); }

function createPlayerWindow() {
  playerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Dashboard do Reprodutor',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  playerWindow.loadFile('player.html');
  playerWindow.on('close', (e) => {
    if (showPet && petWindow) {
      e.preventDefault(); 
      playerWindow.hide();
    } else {
      app.quit(); 
    }
  });
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 150,
    height: 150,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  petWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createPlayerWindow();
  createPetWindow();

  ipcMain.on('move-pet-window', (event, { x, y }) => {
    if (petWindow) {
      const currentPos = petWindow.getPosition();
      petWindow.setPosition(currentPos[0] + x, currentPos[1] + y);
    }
  });

  ipcMain.on('show-player', () => {
    if (playerWindow) {
      playerWindow.show();
      playerWindow.focus();
    }
  });

  ipcMain.on('toggle-pet-visibility', (event, visible) => {
    showPet = visible;
    if (petWindow) {
      if (visible) petWindow.show();
      else petWindow.hide();
    }
  });

  ipcMain.on('update-pet-image', (event, data) => {
    if (petWindow) petWindow.webContents.send('update-pet-image', data);
  });

  ipcMain.on('pet-state', (event, state) => {
    if (petWindow) petWindow.webContents.send('pet-state', state);
  });

  ipcMain.on('logout-spotify', () => {
    clearRefreshToken();
    if (playerWindow) playerWindow.webContents.send('logged-out');
  });

  ipcMain.handle('login-spotify', async () => {
    return new Promise(async (resolve, reject) => {
      const clientId = '11653720a77046c0b795614e059dfce0';
      
      // AUTO-LOGIN: Se temos um refresh_token guardado, renovamos o acesso no background!
      const existingRefresh = getRefreshToken();
      if (existingRefresh) {
        try {
          const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: existingRefresh,
              client_id: clientId
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.refresh_token) saveRefreshToken(data.refresh_token);
            resolve(data.access_token);
            return; // Já conectou! Não precisa abrir o Chrome.
          } else {
            clearRefreshToken(); // Token revogado, vamos para o fluxo normal.
          }
        } catch (e) {
          clearRefreshToken();
        }
      }

      // FLUXO NORMAL: Abrir navegador se não logado
      const redirectUri = 'http://127.0.0.1:8888/callback';
      const scopes = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-modify-public playlist-modify-private user-library-modify user-library-read';
      
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&code_challenge_method=S256&code_challenge=${codeChallenge}&show_dialog=true`;

      if (authServer) authServer.close();

      authServer = http.createServer(async (req, res) => {
        try {
          const urlObj = new URL(req.url, `http://${req.headers.host}`);
          if (urlObj.pathname === '/callback') {
            const code = urlObj.searchParams.get('code');
            const error = urlObj.searchParams.get('error');

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`<h1>Erro no Login: ${error}</h1>`);
              reject(new Error(error));
            } else if (code) {
              const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  client_id: clientId,
                  grant_type: 'authorization_code',
                  code: code,
                  redirect_uri: redirectUri,
                  code_verifier: codeVerifier
                })
              });

              if (!tokenRes.ok) {
                const errText = await tokenRes.text();
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<h1>Erro na troca do token</h1><p>${errText}</p>`);
                reject(new Error(errText));
              } else {
                const data = await tokenRes.json();
                
                // SALVANDO SESSÃO PERSISTENTE PARA O FUTURO
                saveRefreshToken(data.refresh_token);

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
                  <body style="background: #191414; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
                    <h1 style="color: #1db954;">Login Concluído!</h1>
                    <p>O seu Dashboard já está conectado. Pode fechar esta aba e focar no player.</p>
                    <script>window.close()</script>
                  </body>
                `);
                resolve(data.access_token);
              }
            }
            authServer.close();
            authServer = null;
          }
        } catch (e) {
          console.error(e);
          res.writeHead(500);
          res.end('Erro interno');
          reject(e);
          if (authServer) authServer.close();
          authServer = null;
        }
      });

      authServer.listen(8888, '127.0.0.1', () => { shell.openExternal(authUrl); });
      
      setTimeout(() => {
        if (authServer && authServer.listening) {
          authServer.close();
          authServer = null;
          reject(new Error('Login esgotado.'));
        }
      }, 5 * 60 * 1000);
    });
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
