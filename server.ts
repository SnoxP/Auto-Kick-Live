import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { botRunner } from './server/botRunner.ts';
import { fetchKickAuthenticatedUser, fetchKickFeaturedStreams } from './server/kickApi.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const KICK_AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';
const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';
const KICK_SCOPES = 'user:read channel:read chat:write';

interface PendingOAuth {
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

const pendingOAuthStates = new Map<string, PendingOAuth>();

function resolveCallbackUrl(req?: Request): string {
  const queryOrigin = typeof req?.query?.origin === 'string' ? req.query.origin.trim() : '';
  if (queryOrigin) {
    try {
      const u = new URL(queryOrigin);
      if (
        u.hostname.endsWith('.run.app') ||
        u.hostname.endsWith('.onrender.com') ||
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1'
      ) {
        return `${u.origin}/auth/kick/callback`;
      }
    } catch {
      // Ignore malformed origin query param
    }
  }

  const appUrl = process.env.APP_URL;
  if (appUrl && appUrl !== 'MY_APP_URL') {
    return `${appUrl.replace(/\/$/, '')}/auth/kick/callback`;
  }

  return `http://localhost:${PORT}/auth/kick/callback`;
}

function isKickOAuthConfigured(): boolean {
  return Boolean(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET);
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

async function startServer() {
  await botRunner.init();

  const app = express();
  app.use(express.json());

  // Kick OAuth 2.1 PKCE: construct provider URL
  app.get('/api/auth/kick/url', (req: Request, res: Response) => {
    const callbackUrl = resolveCallbackUrl(req);
    const clientId = process.env.KICK_CLIENT_ID;
    const clientSecret = process.env.KICK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.json({
        configured: false,
        url: null,
        callbackUrl,
      });
      return;
    }

    // Purge expired states (>10 min)
    const now = Date.now();
    for (const [key, entry] of pendingOAuthStates.entries()) {
      if (now - entry.createdAt > 10 * 60 * 1000) {
        pendingOAuthStates.delete(key);
      }
    }

    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    pendingOAuthStates.set(state, {
      codeVerifier,
      redirectUri: callbackUrl,
      createdAt: now,
    });

    res.cookie('kick_oauth_state', JSON.stringify({ state, codeVerifier, redirectUri: callbackUrl }), {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: callbackUrl,
      state,
      scope: KICK_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    res.json({
      configured: true,
      url: `${KICK_AUTHORIZE_URL}?${params.toString()}`,
      callbackUrl,
    });
  });

  // Kick OAuth 2.1 Callback (handles both /auth/kick/callback and trailing slash)
  const handleKickCallback = async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

    const sendPopupResult = (ok: boolean, message: string, username?: string) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>KickAFK — Autenticação Kick</title></head>
  <body style="background:#0B0E11;color:#F1F5F9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
    <div style="text-align:center;max-width:360px;padding:24px;">
      <p style="font-size:15px;line-height:1.5;">${message}</p>
    </div>
    <script>
      if (window.opener) {
        window.opener.postMessage(${JSON.stringify({
          type: ok ? 'KICK_OAUTH_SUCCESS' : 'KICK_OAUTH_ERROR',
          username: username || null,
          error: ok ? null : message,
        })}, '*');
        setTimeout(() => window.close(), 350);
      } else {
        setTimeout(() => { window.location.href = '/'; }, 1200);
      }
    </script>
  </body>
</html>`);
    };

    if (oauthError) {
      sendPopupResult(false, `Autorização recusada pela Kick: ${oauthError}`);
      return;
    }

    if (!code || !state) {
      sendPopupResult(false, 'Parâmetros de autorização ausentes no retorno da Kick.');
      return;
    }

    let pending = pendingOAuthStates.get(state);
    if (!pending) {
      const cookies = parseCookies(req);
      if (cookies.kick_oauth_state) {
        try {
          const parsed = JSON.parse(cookies.kick_oauth_state) as {
            state: string;
            codeVerifier: string;
            redirectUri: string;
          };
          if (parsed.state === state) {
            pending = {
              codeVerifier: parsed.codeVerifier,
              redirectUri: parsed.redirectUri,
              createdAt: Date.now(),
            };
          }
        } catch {
          // Ignore invalid cookie
        }
      }
    }
    pendingOAuthStates.delete(state);

    if (!pending) {
      sendPopupResult(false, 'Sessão OAuth expirada ou inválida. Tente conectar novamente.');
      return;
    }

    const clientId = process.env.KICK_CLIENT_ID;
    const clientSecret = process.env.KICK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      sendPopupResult(false, 'Credenciais OAuth da Kick não configuradas no servidor.');
      return;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.codeVerifier,
      });

      const tokenRes = await fetch(KICK_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Troca de token falhou (${tokenRes.status}): ${errText.slice(0, 140)}`);
      }

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        scope?: string;
      };

      if (!tokenData.access_token) {
        throw new Error('Access token não recebido da Kick.');
      }

      const profile = await fetchKickAuthenticatedUser(tokenData.access_token);
      botRunner.setUserSession(
        {
          userId: profile.userId,
          username: profile.username,
          email: profile.email,
          profilePicture: profile.profilePicture,
          connectedAt: new Date().toISOString(),
          scopes: (tokenData.scope || KICK_SCOPES).split(/\s+/).filter(Boolean),
        },
        tokenData.access_token,
      );

      res.clearCookie('kick_oauth_state', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      });
      res.cookie('kickafk_connected', '1', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      sendPopupResult(true, `Conta ${profile.username} conectada com sucesso!`, profile.username);
    } catch (err) {
      sendPopupResult(
        false,
        err instanceof Error ? err.message : 'Erro ao concluir autenticação com a Kick.',
      );
    }
  };

  app.get(['/auth/kick/callback', '/auth/kick/callback/'], handleKickCallback);

  app.post('/api/auth/kick/logout', (_req: Request, res: Response) => {
    botRunner.clearUserSession();
    res.clearCookie('kickafk_connected', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    res.json({ ok: true });
  });

  // Main state & bot control endpoints
  app.get('/api/state', (req: Request, res: Response) => {
    res.json(botRunner.getSnapshot(isKickOAuthConfigured(), resolveCallbackUrl(req)));
  });

  app.post('/api/channels', async (req: Request, res: Response) => {
    try {
      const slugInput = typeof req.body?.slug === 'string' ? req.body.slug : '';
      const created = await botRunner.addChannel(slugInput);
      res.status(201).json({ channel: created });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Não foi possível adicionar o canal.',
      });
    }
  });

  app.delete('/api/channels/:slug', (req: Request, res: Response) => {
    botRunner.removeChannel(String(req.params.slug || ''));
    res.json({ ok: true });
  });

  app.post('/api/channels/:slug/priority', (req: Request, res: Response) => {
    const dir = req.body?.direction;
    if (dir !== 'up' && dir !== 'down' && dir !== 'watch-now') {
      res.status(400).json({ error: 'Direção de prioridade inválida.' });
      return;
    }
    botRunner.moveChannelPriority(String(req.params.slug || ''), dir);
    res.json({ ok: true });
  });

  app.post('/api/bot/start', (_req: Request, res: Response) => {
    botRunner.startBot();
    res.json({ ok: true });
  });

  app.post('/api/bot/stop', (_req: Request, res: Response) => {
    botRunner.stopBot();
    res.json({ ok: true });
  });

  app.post('/api/bot/refresh', async (_req: Request, res: Response) => {
    await botRunner.refreshAllChannels();
    res.json({ ok: true });
  });

  app.patch('/api/bot/config', (req: Request, res: Response) => {
    botRunner.updateBotConfig(req.body || {});
    res.json({ ok: true });
  });

  app.post('/api/rules', (req: Request, res: Response) => {
    try {
      const rule = botRunner.addRule({
        name: String(req.body?.name || ''),
        triggerType: req.body?.triggerType === 'mention' ? 'mention' : 'keyword',
        pattern: String(req.body?.pattern || ''),
        replyTemplate: String(req.body?.replyTemplate || ''),
        cooldownSeconds: Number(req.body?.cooldownSeconds || 45),
      });
      res.status(201).json({ rule });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Erro ao criar regra.',
      });
    }
  });

  app.patch('/api/rules/:id/toggle', (req: Request, res: Response) => {
    botRunner.toggleRule(String(req.params.id || ''));
    res.json({ ok: true });
  });

  app.delete('/api/rules/:id', (req: Request, res: Response) => {
    botRunner.deleteRule(String(req.params.id || ''));
    res.json({ ok: true });
  });

  app.get('/api/kick/featured', async (req: Request, res: Response) => {
    try {
      const lang = req.query.lang === 'en' ? 'en' : 'pt';
      const streams = await fetchKickFeaturedStreams(lang);
      res.json({ streams });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erro ao buscar lives na Kick.',
        streams: [],
      });
    }
  });

  app.post('/api/broadcaster/start', (req: Request, res: Response) => {
    try {
      botRunner.startBroadcaster({
        mode: req.body?.mode === 'rtmp' ? 'rtmp' : 'dry-run',
        sceneId:
          req.body?.sceneId === 'rain-window' || req.body?.sceneId === 'synth-rack'
            ? req.body.sceneId
            : 'night-desk',
        overlayText: String(req.body?.overlayText || 'Live AFK 24/7'),
        resolution: req.body?.resolution === '1920x1080' ? '1920x1080' : '1280x720',
        fps: req.body?.fps === 60 ? 60 : 30,
        bitrateKbps:
          req.body?.bitrateKbps === 4500 || req.body?.bitrateKbps === 6000
            ? req.body.bitrateKbps
            : 2500,
        rtmpUrl: typeof req.body?.rtmpUrl === 'string' ? req.body.rtmpUrl : undefined,
        streamKey: typeof req.body?.streamKey === 'string' ? req.body.streamKey : undefined,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Falha ao iniciar transmissor FFmpeg.',
      });
    }
  });

  app.post('/api/broadcaster/stop', (_req: Request, res: Response) => {
    botRunner.stopBroadcaster(true);
    res.json({ ok: true });
  });

  app.delete('/api/logs', (_req: Request, res: Response) => {
    botRunner.clearLogs();
    res.json({ ok: true });
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KickAFK Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start KickAFK Studio server:', err);
  process.exit(1);
});
