/**
 * createWindows.js — Centraliza criação das BrowserWindow
 * 
 * Fábrica de janelas do Electron com configurações padronizadas.
 */
const { BrowserWindow } = require('electron');
const path = require('path');

function createPlayerWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: 'Chiikawa Spotify ♪',
    backgroundColor: '#f5f0eb',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'player.html'));
  return win;
}

function createPetWindow() {
  const win = new BrowserWindow({
    width: 180,
    height: 220,
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

  win.loadFile(path.join(__dirname, '..', 'renderer', 'pet.html'));
  return win;
}

module.exports = { createPlayerWindow, createPetWindow };
