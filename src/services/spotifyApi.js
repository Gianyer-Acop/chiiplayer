/**
 * spotifyApi.js — Módulo de chamadas à API do Spotify
 * 
 * Centraliza todas as chamadas HTTP à Web API do Spotify.
 * Usado pelo renderer do player para controlar reprodução,
 * gerenciar playlists e consultar a fila de músicas.
 */

const BASE_URL = 'https://api.spotify.com/v1';

class SpotifyApi {
  constructor(token) {
    this.token = token;
  }

  setToken(token) {
    this.token = token;
  }

  // ─── Headers padrão ──────────────────────────────────────────
  get headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  // ─── Estado atual de reprodução ──────────────────────────────
  async getCurrentlyPlaying() {
    const res = await fetch(`${BASE_URL}/me/player/currently-playing`, {
      headers: this.headers
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return await res.json();
  }

  async getPlayerState() {
    const res = await fetch(`${BASE_URL}/me/player`, {
      headers: this.headers
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return await res.json();
  }

  // ─── Controles de reprodução ─────────────────────────────────
  async play() {
    const state = await this.getPlayerState();
    if (!state) return;
    const endpoint = state.is_playing ? 'pause' : 'play';
    await fetch(`${BASE_URL}/me/player/${endpoint}`, {
      method: 'PUT',
      headers: this.headers
    });
  }

  async playTrack(uri) {
    await fetch(`${BASE_URL}/me/player/play`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ uris: [uri] })
    });
  }

  async next() {
    await fetch(`${BASE_URL}/me/player/next`, {
      method: 'POST',
      headers: this.headers
    });
  }

  async previous() {
    await fetch(`${BASE_URL}/me/player/previous`, {
      method: 'POST',
      headers: this.headers
    });
  }

  // ─── Fila de reprodução (Queue) ──────────────────────────────
  async getQueue() {
    const res = await fetch(`${BASE_URL}/me/player/queue`, {
      headers: this.headers
    });
    if (!res.ok) return { currently_playing: null, queue: [] };
    return await res.json();
  }

  async addToQueue(trackUri) {
    await fetch(`${BASE_URL}/me/player/queue?uri=${encodeURIComponent(trackUri)}`, {
      method: 'POST',
      headers: this.headers
    });
  }

  // ─── Biblioteca (Favoritos) ──────────────────────────────────
  async isTrackSaved(trackId) {
    const res = await fetch(`${BASE_URL}/me/tracks/contains?ids=${trackId}`, {
      headers: this.headers
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data[0];
  }

  async saveTrack(trackId) {
    await fetch(`${BASE_URL}/me/tracks?ids=${trackId}`, {
      method: 'PUT',
      headers: this.headers
    });
  }

  async removeTrack(trackId) {
    await fetch(`${BASE_URL}/me/tracks?ids=${trackId}`, {
      method: 'DELETE',
      headers: this.headers
    });
  }

  // ─── Playlists ───────────────────────────────────────────────
  async getUserPlaylists(limit = 50) {
    const res = await fetch(`${BASE_URL}/me/playlists?limit=${limit}`, {
      headers: this.headers
    });
    if (!res.ok) return { items: [] };
    return await res.json();
  }

  async createPlaylist(userId, name, description = '') {
    const res = await fetch(`${BASE_URL}/users/${userId}/playlists`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        name,
        description,
        public: false
      })
    });
    if (!res.ok) throw new Error('Erro ao criar playlist');
    return await res.json();
  }

  async addTrackToPlaylist(playlistId, trackUri) {
    const res = await fetch(`${BASE_URL}/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        uris: [trackUri]
      })
    });
    if (!res.ok) throw new Error('Erro ao adicionar à playlist');
    return await res.json();
  }

  async getCurrentUser() {
    const res = await fetch(`${BASE_URL}/me`, {
      headers: this.headers
    });
    if (!res.ok) throw new Error('Erro ao obter usuário');
    return await res.json();
  }

  // ─── Áudio Features (BPM/Tempo) ─────────────────────────────
  async getAudioFeatures(trackId) {
    const res = await fetch(`${BASE_URL}/audio-features/${trackId}`, {
      headers: this.headers
    });
    if (!res.ok) return null;
    return await res.json();
  }
}

module.exports = SpotifyApi;
