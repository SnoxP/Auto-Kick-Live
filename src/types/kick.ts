export type NavTab = 'watcher' | 'discover' | 'broadcaster' | 'history';

export type FailoverMode = 'priority' | 'round-robin';

export interface KickUserSession {
  userId: number;
  username: string;
  email?: string | null;
  profilePicture?: string | null;
  connectedAt: string;
  scopes: string[];
}

export interface ChannelItem {
  slug: string;
  displayName: string;
  channelId: number | null;
  chatroomId: number | null;
  broadcasterUserId: number | null;
  profilePic: string | null;
  isLive: boolean;
  viewerCount: number;
  sessionTitle: string;
  category: string;
  thumbnailUrl: string | null;
  priority: number;
  watchedSeconds: number;
  lastCheckedAt: string | null;
  statusError: string | null;
}

export interface ChatMessageItem {
  id: string;
  channelSlug: string;
  sender: string;
  senderColor: string;
  content: string;
  createdAt: string;
  triggeredRuleName?: string;
}

export interface AutoReplyRule {
  id: string;
  name: string;
  triggerType: 'keyword' | 'mention';
  pattern: string;
  replyTemplate: string;
  cooldownSeconds: number;
  enabled: boolean;
  lastTriggeredAt: number | null;
  triggerCount: number;
}

export interface BotConfig {
  running: boolean;
  activeSlug: string | null;
  failoverMode: FailoverMode;
  pollIntervalSeconds: number;
  lowDataMode: boolean;
  autoReplyEnabled: boolean;
  startedAt: string | null;
  totalSessionSeconds: number;
  wsConnected: boolean;
  wsChannelSlug: string | null;
}

export interface BroadcasterConfig {
  running: boolean;
  mode: 'dry-run' | 'rtmp';
  sceneId: 'night-desk' | 'rain-window' | 'synth-rack';
  overlayText: string;
  resolution: '1280x720' | '1920x1080';
  fps: 30 | 60;
  bitrateKbps: 2500 | 4500 | 6000;
  rtmpUrl: string;
  hasStreamKey: boolean;
  startedAt: string | null;
  framesEncoded: number;
  currentFps: number;
  currentBitrate: string;
  elapsedSeconds: number;
  lastError: string | null;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  category: 'watcher' | 'failover' | 'chat' | 'oauth' | 'broadcaster';
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  channelSlug?: string;
}

export interface AppStatePayload {
  oauthConfigured: boolean;
  callbackUrl: string;
  user: KickUserSession | null;
  bot: BotConfig;
  channels: ChannelItem[];
  chatMessages: ChatMessageItem[];
  rules: AutoReplyRule[];
  broadcaster: BroadcasterConfig;
  logs: ActivityLogEntry[];
}

export interface FeaturedStream {
  slug: string;
  displayName: string;
  sessionTitle: string;
  category: string;
  viewerCount: number;
  language: string;
  thumbnailUrl: string | null;
  profilePic: string | null;
}
