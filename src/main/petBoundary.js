/**
 * petBoundary.js — Utilitário de limites de tela para o pet
 * 
 * Usa a API `screen` do Electron para detectar as bordas de todos os
 * monitores disponíveis e implementar "collision" (rebote) quando
 * o pet é arrastado até a borda.
 */
const { screen } = require('electron');

class PetBoundary {
  /**
   * Retorna a área de trabalho do display onde o pet está atualmente.
   * @param {Electron.BrowserWindow} petWindow
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  static getWorkArea(petWindow) {
    const bounds = petWindow.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const display = screen.getDisplayNearestPoint({ x: centerX, y: centerY });
    return display.workArea;
  }

  /**
   * Calcula a nova posição do pet garantindo que ele não saia
   * da área de trabalho visível. Se bater na borda, "rebote" é aplicado.
   * 
   * @param {Electron.BrowserWindow} petWindow
   * @param {{ x: number, y: number }} delta — deslocamento desejado
   * @returns {{ newX: number, newY: number, hitEdge: string|null }}
   */
  static clampPosition(petWindow, delta) {
    const bounds = petWindow.getBounds();
    let newX = bounds.x + delta.x;
    let newY = bounds.y + delta.y;
    
    // Calcula o centro da nova posição para achar o monitor "alvo"
    const centerX = newX + bounds.width / 2;
    const centerY = newY + bounds.height / 2;
    const targetDisplay = screen.getDisplayNearestPoint({ x: centerX, y: centerY });
    const workArea = targetDisplay.workArea;

    let hitEdge = null;

    // Limites horizontais (no monitor alvo)
    if (newX < workArea.x) {
      newX = workArea.x;
      hitEdge = 'left';
    } else if (newX + bounds.width > workArea.x + workArea.width) {
      newX = workArea.x + workArea.width - bounds.width;
      hitEdge = 'right';
    }

    // Limites verticais (no monitor alvo)
    if (newY < workArea.y) {
      newY = workArea.y;
      hitEdge = hitEdge ? hitEdge + '+top' : 'top';
    } else if (newY + bounds.height > workArea.y + workArea.height) {
      newY = workArea.y + workArea.height - bounds.height;
      hitEdge = hitEdge ? hitEdge + '+bottom' : 'bottom';
    }

    return { newX, newY, hitEdge };
  }

  /**
   * Move o pet respeitando as bordas. Retorna info de colisão.
   * @param {Electron.BrowserWindow} petWindow
   * @param {{ x: number, y: number }} delta
   * @returns {{ hitEdge: string|null }}
   */
  static movePet(petWindow, delta) {
    const { newX, newY, hitEdge } = PetBoundary.clampPosition(petWindow, delta);
    petWindow.setPosition(newX, newY);
    return { hitEdge };
  }
}

module.exports = PetBoundary;
