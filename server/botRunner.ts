import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateChatTrigger,
  normalizeKickSlug,
  parseFfmpegProgressLine,
  selectNextAfkChannel,
} from '../src/lib/afkEngine.ts';
import type {
  ActivityLogEntry,
  AutoReplyRule,
  BotConfig,
  BroadcasterConfig,
  ChannelItem,
  ChatMessageItem,
  KickUserSession,
} from '../src/types/kick.ts';
import { fetchKickChannel, fetchKickChatMessages, sendKickChatMessage } from './kickApi.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'kickafk-state.json');

const SCENE_IMAGE_MAP: Record<BroadcasterConfig['sceneId'], string> = {
  'night-desk': path.resolve(process.cwd(), 'src/assets/images/afk_scene_night_desk_1794954955043.jpg'),
  'rain-window': path.resolve(process.cwd(), 'src/assets/images/afk_scene_rain_window_1794954954766.jpg'),
  'synth-rack': path.resolve(process.cwd(), 'src/assets/images/afk_scene_synth_rack_1794954955617.jpg'),
};

interface PersistedState {
  channels: ChannelItem[];
  rules: AutoReplyRule[];
  bot: BotConfig;
  broadcaster: Omit<BroadcasterConfig, 'running' | 'startedAt' | 'framesEncoded' | 'currentFps' | 'currentBitrate' | 'elapsedSeconds' | 'lastError' | 'hasStreamKey'>;
  logs: ActivityLogEntry[];
  user: KickUserSession | null;
}

class KickAfkBotRunner {
  private channels: ChannelItem[] = [];
  private rules: AutoReplyRule[] = [];
  private chatMessages: ChatMessageItem[] = [];
  private logs: ActivityLogEntry[] = [];
  private user: KickUserSession | null = null;
  private accessToken: string | null = null;
  private streamKey: string | null = null;

  private bot: BotConfig = {
    running: false,
    activeSlug: null,
    failoverMode: 'priority',
    pollIntervalSeconds: 30,
    lowDataMode: false,
    autoReplyEnabled: true,
    startedAt: null,
    totalSessionSeconds: 0,
    wsConnected: false,
    wsChannelSlug: null,
  };

  private broadcaster: BroadcasterConfig = {
    running: false,
    mode: 'dry-run',
    sceneId: 'night-desk',
    overlayText: 'Live AFK 24/7 — Volto em breve',
    resolution: '1280x720',
    fps: 30,
    bitrateKbps: 2500,
    rtmpUrl: 'rtmps://fa723fc1b171.global-contribute.live-video.net/app/',
    hasStreamKey: false,
    startedAt: null,
    framesEncoded: 0,
    currentFps: 0,
    currentBitrate: '0kbits/s',
    elapsedSeconds: 0,
    lastError: null,
  };

  private chatPollTimer: NodeJS.Timeout | null = null;
  private chatChannelId: number | null = null;
  private seenChatIds = new Set<string>();
  private chatPrimed = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private ffmpegProc: ChildProcess | null = null;
  private ffmpegTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    this.loadState();
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    // Kick off initial background status sync without blocking server boot
    void this.refreshAllChannels().catch(() => undefined);

    if (this.bot.running) {
      this.startTimers();
    }
  }

  private loadState(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        if (Array.isArray(parsed.channels) && parsed.channels.length > 0) {
          this.channels = parsed.channels;
        }
        if (Array.isArray(parsed.rules) && parsed.rules.length > 0) {
          this.rules = parsed.rules;
        }
        if (parsed.bot) {
          this.bot = {
            ...this.bot,
            ...parsed.bot,
            running: false,
            wsConnected: false,
            wsChannelSlug: null,
          };
        }
        if (parsed.broadcaster) {
          this.broadcaster = {
            ...this.broadcaster,
            ...parsed.broadcaster,
            running: false,
            hasStreamKey: false,
          };
        }
        if (Array.isArray(parsed.logs)) {
          this.logs = parsed.logs.slice(0, 100);
        }
        if (parsed.user) {
          this.user = parsed.user;
        }
      }
    } catch {
      // Fallback to clean seeded defaults if state file is unreadable
    }

    if (this.channels.length === 0) {
      this.channels = [
        {
          slug: 'gaules',
          displayName: 'Gaules',
          channelId: null,
          chatroomId: null,
          broadcasterUserId: null,
          profilePic: null,
          isLive: false,
          viewerCount: 0,
          sessionTitle: 'Aguardando sincronização com a Kick...',
          category: 'Counter-Strike 2',
          thumbnailUrl: null,
          priority: 1,
          watchedSeconds: 0,
          lastCheckedAt: null,
          statusError: null,
        },
        {
          slug: 'coringa',
          displayName: 'Coringa',
          channelId: null,
          chatroomId: null,
          broadcasterUserId: null,
          profilePic: null,
          isLive: false,
          viewerCount: 0,
          sessionTitle: 'Aguardando sincronização com a Kick...',
          category: 'Just Chatting',
          thumbnailUrl: null,
          priority: 2,
          watchedSeconds: 0,
          lastCheckedAt: null,
          statusError: null,
        },
        {
          slug: 'xqc',
          displayName: 'xQc',
          channelId: null,
          chatroomId: null,
          broadcasterUserId: null,
          profilePic: null,
          isLive: false,
          viewerCount: 0,
          sessionTitle: 'Aguardando sincronização com a Kick...',
          category: 'Just Chatting',
          thumbnailUrl: null,
          priority: 3,
          watchedSeconds: 0,
          lastCheckedAt: null,
          statusError: null,
        },
      ];
    }

    if (this.rules.length === 0) {
      this.rules = [
        {
          id: 'rule-afk-default',
          name: 'Resposta para !afk',
          triggerType: 'keyword',
          pattern: '!afk',
          replyTemplate: '@{user} estou acompanhando a live em modo AFK pelo KickAFK.',
          cooldownSeconds: 45,
          enabled: true,
          lastTriggeredAt: null,
          triggerCount: 0,
        },
        {
          id: 'rule-mention-default',
          name: 'Aviso de menção direta',
          triggerType: 'mention',
          pattern: 'afk',
          replyTemplate: 'Oi @{user}, recebi sua menção no chat e responderei assim que voltar.',
          cooldownSeconds: 90,
          enabled: false,
          lastTriggeredAt: null,
          triggerCount: 0,
        },
      ];
    }
  }

  private saveState(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data: PersistedState = {
        channels: this.channels,
        rules: this.rules,
        bot: {
          ...this.bot,
          wsConnected: false,
          wsChannelSlug: null,
        },
        broadcaster: {
          mode: this.broadcaster.mode,
          sceneId: this.broadcaster.sceneId,
          overlayText: this.broadcaster.overlayText,
          resolution: this.broadcaster.resolution,
          fps: this.broadcaster.fps,
          bitrateKbps: this.broadcaster.bitrateKbps,
          rtmpUrl: this.broadcaster.rtmpUrl,
        },
        logs: this.logs.slice(0, 100),
        user: this.user,
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Ignore disk write errors in read-only environments
    }
  }

  private addLog(
    category: ActivityLogEntry['category'],
    level: ActivityLogEntry['level'],
    message: string,
    channelSlug?: string,
  ): void {
    this.logs.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      category,
      level,
      message,
      channelSlug,
    });
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(0, 100);
    }
  }

  public getSnapshot(oauthConfigured: boolean, callbackUrl: string) {
    return {
      oauthConfigured,
      callbackUrl,
      user: this.user,
      bot: { ...this.bot },
      channels: [...this.channels].sort((a, b) => a.priority - b.priority),
      chatMessages: [...this.chatMessages],
      rules: [...this.rules],
      broadcaster: { ...this.broadcaster },
      logs: [...this.logs],
    };
  }

  public setUserSession(user: KickUserSession, accessToken: string): void {
    this.user = user;
    this.accessToken = accessToken;
    this.addLog('oauth', 'success', `Conta Kick conectada via OAuth 2.1: ${user.username}`);
    this.saveState();
  }

  public clearUserSession(): void {
    const prev = this.user?.username;
    this.user = null;
    this.accessToken = null;
    if (prev) {
      this.addLog('oauth', 'info', `Sessão Kick encerrada para ${prev}.`);
    }
    this.saveState();
  }

  public async addChannel(rawInput: string): Promise<ChannelItem> {
    const slug = normalizeKickSlug(rawInput);
    if (!slug) {
      throw new Error('Canal inválido. Digite o nome do canal ou um link da Kick (ex: kick.com/gaules).');
    }

    const existing = this.channels.find((c) => c.slug === slug);
    if (existing) {
      await this.refreshSingleChannel(slug);
      return this.channels.find((c) => c.slug === slug)!;
    }

    const maxPriority = this.channels.reduce((max, c) => Math.max(max, c.priority), 0);
    const snapshot = await fetchKickChannel(slug);

    const created: ChannelItem = {
      ...snapshot,
      priority: maxPriority + 1,
      watchedSeconds: 0,
      lastCheckedAt: new Date().toISOString(),
      statusError: null,
    };

    this.channels.push(created);
    this.addLog(
      'watcher',
      created.isLive ? 'success' : 'info',
      `Canal ${created.displayName} adicionado à fila (${created.isLive ? 'Ao vivo' : 'Offline'}).`,
      created.slug,
    );

    if (this.bot.running && !this.bot.activeSlug && created.isLive) {
      this.activateChannel(created);
    }

    this.saveState();
    return created;
  }

  public removeChannel(slug: string): void {
    const target = this.channels.find((c) => c.slug === slug);
    if (!target) {
      return;
    }
    this.channels = this.channels
      .filter((c) => c.slug !== slug)
      .sort((a, b) => a.priority - b.priority)
      .map((c, idx) => ({ ...c, priority: idx + 1 }));

    if (this.bot.activeSlug === slug) {
      this.bot.activeSlug = null;
      this.disconnectChatWs();
      if (this.bot.running) {
        const next = selectNextAfkChannel(this.channels, null, this.bot.failoverMode);
        if (next) {
          this.activateChannel(next);
        }
      }
    }

    this.addLog('watcher', 'info', `Canal ${target.displayName} removido da fila.`, slug);
    this.saveState();
  }

  public moveChannelPriority(slug: string, direction: 'up' | 'down' | 'watch-now'): void {
    const sorted = [...this.channels].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((c) => c.slug === slug);
    if (idx === -1) {
      return;
    }

    if (direction === 'watch-now') {
      const target = sorted[idx];
      this.activateChannel(target);
      if (!this.bot.running) {
        this.startBot();
      }
      this.saveState();
      return;
    }

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) {
      return;
    }

    const temp = sorted[idx];
    sorted[idx] = sorted[swapIdx];
    sorted[swapIdx] = temp;
    this.channels = sorted.map((c, i) => ({ ...c, priority: i + 1 }));
    this.saveState();
  }

  public async refreshSingleChannel(slug: string): Promise<void> {
    const idx = this.channels.findIndex((c) => c.slug === slug);
    if (idx === -1) {
      return;
    }
    try {
      const snap = await fetchKickChannel(slug);
      this.channels[idx] = {
        ...this.channels[idx],
        ...snap,
        lastCheckedAt: new Date().toISOString(),
        statusError: null,
      };
    } catch (err) {
      this.channels[idx] = {
        ...this.channels[idx],
        lastCheckedAt: new Date().toISOString(),
        statusError: err instanceof Error ? err.message : 'Erro ao consultar canal',
      };
    }
  }

  public async refreshAllChannels(): Promise<void> {
    await Promise.all(this.channels.map((c) => this.refreshSingleChannel(c.slug)));

    if (this.bot.running) {
      const active = this.channels.find((c) => c.slug === this.bot.activeSlug);
      if (!active || !active.isLive) {
        const next = selectNextAfkChannel(this.channels, this.bot.activeSlug, this.bot.failoverMode);
        if (next && next.slug !== this.bot.activeSlug) {
          this.addLog(
            'failover',
            'warning',
            `Failover automático: ${active?.displayName || 'canal anterior'} offline. Alternando para ${next.displayName}.`,
            next.slug,
          );
          this.activateChannel(next);
        } else if (!next && active) {
          this.addLog(
            'failover',
            'info',
            `Nenhum canal da fila está ao vivo no momento. Aguardando próximo canal ficar online.`,
          );
          this.bot.activeSlug = null;
          this.disconnectChatWs();
        }
      } else if (active.channelId && this.chatChannelId !== active.channelId) {
        this.connectChatWs(active);
      }
    }

    this.saveState();
  }

  public startBot(): void {
    if (this.bot.running) {
      return;
    }
    this.bot.running = true;
    this.bot.startedAt = new Date().toISOString();

    const preferred =
      this.channels.find((c) => c.slug === this.bot.activeSlug && c.isLive) ||
      selectNextAfkChannel(this.channels, null, this.bot.failoverMode) ||
      this.channels[0] ||
      null;

    if (preferred) {
      this.activateChannel(preferred);
    }

    this.addLog('watcher', 'success', 'Bot Watcher AFK iniciado.');
    this.startTimers();
    void this.refreshAllChannels();
    this.saveState();
  }

  public stopBot(): void {
    if (!this.bot.running) {
      return;
    }
    this.bot.running = false;
    this.stopTimers();
    this.disconnectChatWs();
    this.addLog('watcher', 'info', 'Bot Watcher AFK pausado pelo usuário.');
    this.saveState();
  }

  public updateBotConfig(partial: Partial<Pick<BotConfig, 'failoverMode' | 'pollIntervalSeconds' | 'lowDataMode' | 'autoReplyEnabled'>>): void {
    const prevPoll = this.bot.pollIntervalSeconds;
    if (partial.failoverMode === 'priority' || partial.failoverMode === 'round-robin') {
      this.bot.failoverMode = partial.failoverMode;
    }
    if (typeof partial.pollIntervalSeconds === 'number') {
      this.bot.pollIntervalSeconds = Math.min(300, Math.max(15, Math.floor(partial.pollIntervalSeconds)));
    }
    if (typeof partial.lowDataMode === 'boolean') {
      this.bot.lowDataMode = partial.lowDataMode;
    }
    if (typeof partial.autoReplyEnabled === 'boolean') {
      this.bot.autoReplyEnabled = partial.autoReplyEnabled;
    }

    if (this.bot.running && prevPoll !== this.bot.pollIntervalSeconds) {
      this.stopTimers();
      this.startTimers();
    }
    this.saveState();
  }

  private startTimers(): void {
    this.stopTimers();

    this.tickTimer = setInterval(() => {
      if (!this.bot.running) {
        return;
      }
      this.bot.totalSessionSeconds += 1;
      if (this.bot.activeSlug) {
        const active = this.channels.find((c) => c.slug === this.bot.activeSlug);
        if (active && active.isLive) {
          active.watchedSeconds += 1;
        }
      }
    }, 1000);

    this.pollTimer = setInterval(() => {
      if (this.bot.running) {
        void this.refreshAllChannels();
      }
    }, this.bot.pollIntervalSeconds * 1000);
  }

  private stopTimers(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private activateChannel(channel: ChannelItem): void {
    this.bot.activeSlug = channel.slug;
    if (channel.channelId) {
      this.connectChatWs(channel);
    } else {
      this.disconnectChatWs();
    }
  }

  private connectChatWs(channel: ChannelItem): void {
    if (!channel.channelId) {
      return;
    }
    if (this.chatPollTimer && this.chatChannelId === channel.channelId) {
      return;
    }

    this.disconnectChatWs();
    const targetChannelId = channel.channelId;
    this.chatChannelId = targetChannelId;
    this.chatPrimed = false;
    this.seenChatIds.clear();
    this.bot.wsConnected = true;
    this.bot.wsChannelSlug = channel.slug;

    const pollOnce = async () => {
      if (!this.bot.running || this.chatChannelId !== targetChannelId) {
        return;
      }
      try {
        const latest = await fetchKickChatMessages(targetChannelId);
        if (this.chatChannelId !== targetChannelId) {
          return;
        }
        this.bot.wsConnected = true;

        // API returns newest-first; iterate oldest-first for chronological ingestion
        const ordered = [...latest].reverse();
        const isInitialSeed = !this.chatPrimed;
        this.chatPrimed = true;

        for (const msg of ordered) {
          if (this.seenChatIds.has(msg.id)) {
            continue;
          }
          this.seenChatIds.add(msg.id);
          if (this.seenChatIds.size > 400) {
            const firstKey = this.seenChatIds.values().next().value;
            if (firstKey) this.seenChatIds.delete(firstKey);
          }

          let triggeredRuleName: string | undefined;
          const nowMs = Date.now();

          if (!isInitialSeed && this.bot.running && this.bot.autoReplyEnabled) {
            const match = evaluateChatTrigger(
              msg.content,
              msg.sender,
              this.user?.username || null,
              this.rules,
              nowMs,
            );

            if (match) {
              triggeredRuleName = match.rule.name;
              match.rule.lastTriggeredAt = nowMs;
              match.rule.triggerCount += 1;

              if (this.accessToken && channel.broadcasterUserId) {
                void sendKickChatMessage(this.accessToken, channel.broadcasterUserId, match.reply)
                  .then(() => {
                    this.addLog(
                      'chat',
                      'success',
                      `Resposta AFK enviada em ${channel.displayName} (${match.rule.name}): "${match.reply}"`,
                      channel.slug,
                    );
                    this.saveState();
                  })
                  .catch((err) => {
                    this.addLog(
                      'chat',
                      'error',
                      err instanceof Error ? err.message : 'Falha ao enviar resposta AFK no chat.',
                      channel.slug,
                    );
                  });
              } else {
                this.addLog(
                  'chat',
                  'warning',
                  `Regra "${match.rule.name}" acionada por ${msg.sender} em ${channel.displayName}. Conecte sua conta Kick para responder automaticamente.`,
                  channel.slug,
                );
              }
            }
          }

          this.chatMessages.unshift({
            id: msg.id,
            channelSlug: channel.slug,
            sender: msg.sender,
            senderColor: msg.senderColor,
            content: msg.content,
            createdAt: msg.createdAt,
            triggeredRuleName,
          });
        }

        if (this.chatMessages.length > 60) {
          this.chatMessages = this.chatMessages.slice(0, 60);
        }
      } catch {
        // Keep polling gracefully on transient errors
      }
    };

    void pollOnce();
    this.chatPollTimer = setInterval(() => {
      void pollOnce();
    }, 3000);
  }

  private disconnectChatWs(): void {
    this.bot.wsConnected = false;
    this.bot.wsChannelSlug = null;
    this.chatChannelId = null;
    this.chatPrimed = false;
    if (this.chatPollTimer) {
      clearInterval(this.chatPollTimer);
      this.chatPollTimer = null;
    }
  }

  public addRule(input: {
    name: string;
    triggerType: 'keyword' | 'mention';
    pattern: string;
    replyTemplate: string;
    cooldownSeconds: number;
  }): AutoReplyRule {
    if (!input.name.trim() || !input.pattern.trim() || !input.replyTemplate.trim()) {
      throw new Error('Preencha nome, gatilho e resposta da regra AFK.');
    }
    const created: AutoReplyRule = {
      id: `rule-${Date.now()}`,
      name: input.name.trim(),
      triggerType: input.triggerType,
      pattern: input.pattern.trim(),
      replyTemplate: input.replyTemplate.trim(),
      cooldownSeconds: Math.min(600, Math.max(5, Math.floor(input.cooldownSeconds || 30))),
      enabled: true,
      lastTriggeredAt: null,
      triggerCount: 0,
    };
    this.rules.unshift(created);
    this.saveState();
    return created;
  }

  public toggleRule(id: string): void {
    const rule = this.rules.find((r) => r.id === id);
    if (rule) {
      rule.enabled = !rule.enabled;
      this.saveState();
    }
  }

  public deleteRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
    this.saveState();
  }

  public startBroadcaster(config: {
    mode: BroadcasterConfig['mode'];
    sceneId: BroadcasterConfig['sceneId'];
    overlayText: string;
    resolution: BroadcasterConfig['resolution'];
    fps: BroadcasterConfig['fps'];
    bitrateKbps: BroadcasterConfig['bitrateKbps'];
    rtmpUrl?: string;
    streamKey?: string;
  }): void {
    this.stopBroadcaster(false);

    this.broadcaster.mode = config.mode;
    this.broadcaster.sceneId = config.sceneId;
    this.broadcaster.overlayText = config.overlayText.trim() || 'Live AFK 24/7';
    this.broadcaster.resolution = config.resolution;
    this.broadcaster.fps = config.fps;
    this.broadcaster.bitrateKbps = config.bitrateKbps;
    if (config.rtmpUrl !== undefined) {
      this.broadcaster.rtmpUrl = config.rtmpUrl.trim();
    }
    if (config.streamKey !== undefined && config.streamKey.trim()) {
      this.streamKey = config.streamKey.trim();
      this.broadcaster.hasStreamKey = true;
    }

    if (this.broadcaster.mode === 'rtmp') {
      if (!this.broadcaster.rtmpUrl || !this.streamKey) {
        throw new Error('Informe a URL RTMP da Kick e a Chave de Transmissão (Stream Key) para transmitir ao vivo.');
      }
    }

    const imagePath = SCENE_IMAGE_MAP[this.broadcaster.sceneId];
    if (!fs.existsSync(imagePath)) {
      throw new Error('Arquivo de cena visual não encontrado no servidor.');
    }

    const [width, height] = this.broadcaster.resolution.split('x');
    const escapedText = this.broadcaster.overlayText
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'");

    const filterGraph = [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=#0B0E11`,
      `drawtext=text='${escapedText}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.6:boxborderw=14:x=(w-text_w)/2:y=h-th-48`,
    ].join(',');

    const args: string[] = [
      '-hide_banner',
      '-loglevel',
      'info',
      '-re',
      '-loop',
      '1',
      '-i',
      imagePath,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf',
      filterGraph,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'stillimage',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      `${this.broadcaster.bitrateKbps}k`,
      '-maxrate',
      `${this.broadcaster.bitrateKbps}k`,
      '-bufsize',
      `${this.broadcaster.bitrateKbps * 2}k`,
      '-g',
      String(this.broadcaster.fps * 2),
      '-r',
      String(this.broadcaster.fps),
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '44100',
    ];

    if (this.broadcaster.mode === 'rtmp') {
      const base = this.broadcaster.rtmpUrl.endsWith('/')
        ? this.broadcaster.rtmpUrl
        : `${this.broadcaster.rtmpUrl}/`;
      args.push('-f', 'flv', `${base}${this.streamKey}`);
    } else {
      args.push('-f', 'null', '-');
    }

    this.broadcaster.running = true;
    this.broadcaster.startedAt = new Date().toISOString();
    this.broadcaster.framesEncoded = 0;
    this.broadcaster.currentFps = 0;
    this.broadcaster.currentBitrate = '0kbits/s';
    this.broadcaster.elapsedSeconds = 0;
    this.broadcaster.lastError = null;

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    this.ffmpegProc = proc;

    this.ffmpegTimer = setInterval(() => {
      if (this.broadcaster.running) {
        this.broadcaster.elapsedSeconds += 1;
      }
    }, 1000);

    proc.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split(/\r?\n|\r/);
      for (const line of lines) {
        const telemetry = parseFfmpegProgressLine(line);
        if (telemetry) {
          if (typeof telemetry.frame === 'number') {
            this.broadcaster.framesEncoded = telemetry.frame;
          }
          if (typeof telemetry.fps === 'number') {
            this.broadcaster.currentFps = telemetry.fps;
          }
          if (telemetry.bitrate) {
            this.broadcaster.currentBitrate = telemetry.bitrate;
          }
        } else if (/error|invalid|failed|connection refused/i.test(line)) {
          this.broadcaster.lastError = line.trim().slice(0, 180);
        }
      }
    });

    proc.on('exit', (code) => {
      if (this.ffmpegProc === proc) {
        this.ffmpegProc = null;
        const wasRunning = this.broadcaster.running;
        this.broadcaster.running = false;
        if (this.ffmpegTimer) {
          clearInterval(this.ffmpegTimer);
          this.ffmpegTimer = null;
        }
        if (wasRunning && code !== 0 && code !== null) {
          this.broadcaster.lastError =
            this.broadcaster.lastError || `FFmpeg encerrou com código ${code}.`;
          this.addLog('broadcaster', 'error', this.broadcaster.lastError);
          this.saveState();
        }
      }
    });

    this.addLog(
      'broadcaster',
      'success',
      this.broadcaster.mode === 'rtmp'
        ? `Transmissão AFK 24/7 iniciada para Kick RTMP (${this.broadcaster.resolution} @ ${this.broadcaster.fps}fps).`
        : `Encoder FFmpeg AFK iniciado em Modo Teste Local (${this.broadcaster.resolution} @ ${this.broadcaster.fps}fps).`,
    );
    this.saveState();
  }

  public stopBroadcaster(logEvent = true): void {
    if (this.ffmpegTimer) {
      clearInterval(this.ffmpegTimer);
      this.ffmpegTimer = null;
    }
    if (this.ffmpegProc) {
      const proc = this.ffmpegProc;
      this.ffmpegProc = null;
      this.broadcaster.running = false;
      try {
        proc.kill('SIGTERM');
      } catch {
        // Ignore kill error
      }
      if (logEvent) {
        this.addLog(
          'broadcaster',
          'info',
          `Transmissor AFK encerrado (${this.broadcaster.framesEncoded} frames codificados).`,
        );
        this.saveState();
      }
    } else {
      this.broadcaster.running = false;
    }
  }

  public clearLogs(): void {
    this.logs = [];
    this.saveState();
  }
}

export const botRunner = new KickAfkBotRunner();
