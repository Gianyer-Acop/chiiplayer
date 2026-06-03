/**
 * main.js — Processo principal do Electron (refatorado)
 * 
 * Orquestra as janelas do player e do pet, gerencia IPC,
 * e delega autenticação ao módulo SpotifyAuth.
 */
const { app, ipcMain } = require('electron');
const path = require('path');
const SpotifyAuth = require('../services/spotifyAuth');
const PetBoundary = require('./petBoundary');
const { createPlayerWindow, createPetWindow } = require('./createWindows');

let playerWindow = null;
let petWindow = null;
let showPet = true;
let spotifyAuth = null;

app.whenReady().then(() => {
  spotifyAuth = new SpotifyAuth(app.getPath('userData'));

  playerWindow = createPlayerWindow();
  petWindow = createPetWindow();

  // ─── Fechar player esconde em vez de fechar (se pet visível) ──
  playerWindow.on('close', (e) => {
    if (showPet && petWindow) {
      e.preventDefault();
      playerWindow.hide();
    } else {
      app.quit();
    }
  });

  // ─── IPC: Mover pet com limites de tela ──────────────────────
  ipcMain.on('move-pet-window', (event, { x, y }) => {
    if (!petWindow) return;
    const { hitEdge } = PetBoundary.movePet(petWindow, { x, y });
    if (hitEdge) {
      petWindow.webContents.send('pet-hit-edge', hitEdge);
    }
  });

  // ─── IPC: Mostrar player ─────────────────────────────────────
  ipcMain.on('show-player', () => {
    if (playerWindow) {
      playerWindow.show();
      playerWindow.focus();
    }
  });

  // ─── IPC: Toggle visibilidade do pet ─────────────────────────
  ipcMain.on('toggle-pet-visibility', (event, visible) => {
    showPet = visible;
    if (petWindow) {
      if (visible) petWindow.show();
      else petWindow.hide();
    }
  });

  // ─── IPC: Atualizar imagem do pet ────────────────────────────
  ipcMain.on('update-pet-image', (event, data) => {
    if (petWindow) petWindow.webContents.send('update-pet-image', data);
  });

  // ─── IPC: Estado do pet (playing/paused/etc.) ────────────────
  ipcMain.on('pet-state', (event, state) => {
    if (petWindow) petWindow.webContents.send('pet-state', state);
  });

  // ─── IPC: Atualizar bocadilho de texto do pet ────────────────
  ipcMain.on('pet-bubble-update', (event, data) => {
    if (petWindow) petWindow.webContents.send('pet-bubble-update', data);
  });

  // ─── IPC: Logout ─────────────────────────────────────────────
  ipcMain.on('logout-spotify', () => {
    spotifyAuth.logout();
    if (playerWindow) playerWindow.webContents.send('logged-out');
  });

  // ─── IPC: Login (handle = async, retorna access_token) ───────
  ipcMain.handle('login-spotify', async () => {
    return await spotifyAuth.login();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
