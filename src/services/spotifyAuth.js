/**
 * spotifyAuth.js — Módulo de autenticação Spotify (PKCE Flow)
 * 
 * Centraliza toda a lógica de login, refresh token e persistência de sessão.
 * Extraído do main.js original para melhor organização.
 */
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const CLIENT_ID = '11653720a77046c0b795614e059dfce0';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-modify-public',
  'playlist-modify-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-modify',
  'user-library-read'
].join(' ');

let authServer = null;

class SpotifyAuth {
  constructor(userDataPath) {
    this.configPath = path.join(userDataPath, 'spotify_config.json');
  }

  // ─── Persistência do Refresh Token ───────────────────────────
  saveRefreshToken(token) {
    fs.writeFileSync(this.configPath, JSON.stringify({ refresh_token: token }));
  }

  getRefreshToken() {
    if (fs.existsSync(this.configPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.configPath)).refresh_token;
      } catch (e) { /* arquivo corrompido */ }
    }
    return null;
  }

  clearRefreshToken() {
    if (fs.existsSync(this.configPath)) fs.unlinkSync(this.configPath);
  }

  // ─── Tentar auto-login com refresh token salvo ───────────────
  async tryAutoLogin() {
    const existingRefresh = this.getRefreshToken();
    if (!existingRefresh) return null;

    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: existingRefresh,
          client_id: CLIENT_ID
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.refresh_token) this.saveRefreshToken(data.refresh_token);
        return data.access_token;
      } else {
        this.clearRefreshToken();
        return null;
      }
    } catch (e) {
      this.clearRefreshToken();
      return null;
    }
  }

  // ─── Fluxo completo de login (PKCE + servidor HTTP local) ────
  async login() {
    // Tenta auto-login primeiro
    const autoToken = await this.tryAutoLogin();
    if (autoToken) return autoToken;

    // Fluxo PKCE com navegador externo
    return new Promise((resolve, reject) => {
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&code_challenge_method=S256` +
        `&code_challenge=${codeChallenge}` +
        `&show_dialog=true`;

      if (authServer) authServer.close();

      authServer = http.createServer(async (req, res) => {
        try {
          const urlObj = new URL(req.url, `http://${req.headers.host}`);
          if (urlObj.pathname !== '/callback') return;

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
                client_id: CLIENT_ID,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
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
              this.saveRefreshToken(data.refresh_token);

              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <body style="background:#191414;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">
                  <h1 style="color:#1db954">Login Concluído!</h1>
                  <p>Pode fechar esta aba e voltar ao player.</p>
                  <script>window.close()</script>
                </body>
              `);
              resolve(data.access_token);
            }
          }

          authServer.close();
          authServer = null;
        } catch (e) {
          console.error(e);
          res.writeHead(500);
          res.end('Erro interno');
          reject(e);
          if (authServer) authServer.close();
          authServer = null;
        }
      });

      authServer.listen(8888, '127.0.0.1', () => {
        shell.openExternal(authUrl);
      });

      // Timeout de 5 minutos
      setTimeout(() => {
        if (authServer && authServer.listening) {
          authServer.close();
          authServer = null;
          reject(new Error('Login esgotado.'));
        }
      }, 5 * 60 * 1000);
    });
  }

  logout() {
    this.clearRefreshToken();
  }
}

module.exports = SpotifyAuth;
