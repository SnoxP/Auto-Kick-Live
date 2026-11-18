import type {
  AutoReplyRule,
  ChannelItem,
  DropCampaign,
  DropReward,
  FailoverMode,
  KickPlatformEvent,
} from '../types/kick';

/**
 * Extracts and normalizes a Kick channel slug from a username, @handle, or URL.
 * Returns null when the input does not match Kick's valid slug format.
 */
export function normalizeKickSlug(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;

  if (/^https?:\/\//i.test(candidate) || /^(?:www\.)?kick\.com\//i.test(candidate)) {
    const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    try {
      const parsed = new URL(withProtocol);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname !== 'kick.com' && hostname !== 'www.kick.com') {
        return null;
      }
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length === 0) {
        return null;
      }
      const first = segments[0].toLowerCase();
      if (['categories', 'browse', 'following', 'dashboard', 'transactions', 'video'].includes(first)) {
        return null;
      }
      candidate = segments[0];
    } catch {
      return null;
    }
  }

  candidate = candidate.replace(/^@+/, '').toLowerCase();

  // Kick slugs allow letters, numbers, underscores, and hyphens (2-32 chars).
  if (!/^[a-z0-9_-]{2,32}$/.test(candidate)) {
    return null;
  }

  return candidate;
}

/**
 * Selects the next channel to run AFK based on live status and failover mode.
 */
export function selectNextAfkChannel(
  channels: ChannelItem[],
  currentSlug: string | null,
  mode: FailoverMode,
): ChannelItem | null {
  if (channels.length === 0) {
    return null;
  }

  const sorted = [...channels].sort((a, b) => a.priority - b.priority);
  const liveChannels = sorted.filter((c) => c.isLive);

  if (liveChannels.length === 0) {
    return null;
  }

  if (mode === 'priority') {
    const current = liveChannels.find((c) => c.slug === currentSlug);
    if (current) {
      return current;
    }
    return liveChannels[0];
  }

  // Round-robin rotates to the next live channel after currentSlug
  if (!currentSlug) {
    return liveChannels[0];
  }

  const currentIndex = liveChannels.findIndex((c) => c.slug === currentSlug);
  if (currentIndex === -1) {
    return liveChannels[0];
  }

  return liveChannels[(currentIndex + 1) % liveChannels.length];
}

/**
 * Formats an elapsed number of seconds as HH:MM:SS.
 */
export function formatAfkDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Evaluates an incoming Kick chat message against configured AFK auto-reply rules.
 * Ignores messages sent by the authenticated bot account and enforces cooldowns.
 */
export function evaluateChatTrigger(
  message: string,
  sender: string,
  botUsername: string | null,
  rules: AutoReplyRule[],
  nowMs: number,
): { rule: AutoReplyRule; reply: string } | null {
  const normalizedMsg = message.trim().toLowerCase();
  if (!normalizedMsg) {
    return null;
  }

  if (botUsername && sender.trim().toLowerCase() === botUsername.trim().toLowerCase()) {
    return null;
  }

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    const cooldownMs = Math.max(5, rule.cooldownSeconds) * 1000;
    if (rule.lastTriggeredAt !== null && nowMs - rule.lastTriggeredAt < cooldownMs) {
      continue;
    }

    const pattern = rule.pattern.trim().toLowerCase();
    if (!pattern) {
      continue;
    }

    let matched = false;
    if (rule.triggerType === 'mention') {
      const target = botUsername ? botUsername.trim().toLowerCase() : pattern.replace(/^@+/, '');
      if (target && (normalizedMsg.includes(`@${target}`) || normalizedMsg.includes(target))) {
        matched = true;
      }
    } else {
      matched = normalizedMsg.includes(pattern);
    }

    if (matched) {
      const reply = rule.replyTemplate
        .replace(/\{user\}/gi, sender)
        .replace(/\{bot\}/gi, botUsername || 'BotAFK');
      return { rule, reply };
    }
  }

  return null;
}

/**
 * Parses FFmpeg stderr progress lines into frame, fps, and bitrate telemetry.
 */
export function parseFfmpegProgressLine(line: string): {
  frame?: number;
  fps?: number;
  bitrate?: string;
} | null {
  if (!line.includes('frame=') && !line.includes('bitrate=')) {
    return null;
  }

  const frameMatch = line.match(/frame=\s*(\d+)/);
  const fpsMatch = line.match(/fps=\s*([\d.]+)/);
  const bitrateMatch = line.match(/bitrate=\s*([^\s]+)/);

  if (!frameMatch && !fpsMatch && !bitrateMatch) {
    return null;
  }

  return {
    frame: frameMatch ? Number(frameMatch[1]) : undefined,
    fps: fpsMatch ? Number(fpsMatch[1]) : undefined,
    bitrate: bitrateMatch ? bitrateMatch[1] : undefined,
  };
}

/**
 * Checks whether a live channel qualifies for progress on a Kick Drop campaign.
 */
export function isChannelEligibleForCampaign(
  channel: Pick<ChannelItem, 'slug' | 'category' | 'isLive'> | null | undefined,
  campaign: Pick<DropCampaign, 'status' | 'categoryName' | 'categorySlug' | 'channelSlugs'>,
): boolean {
  if (!channel || !channel.isLive || campaign.status !== 'active') {
    return false;
  }

  const normalizedSlug = channel.slug.trim().toLowerCase();
  if (campaign.channelSlugs.length > 0) {
    return campaign.channelSlugs.some((s) => s.trim().toLowerCase() === normalizedSlug);
  }

  // Category-wide campaign: match by normalized category name or slug
  const chCat = channel.category.trim().toLowerCase();
  const campCat = campaign.categoryName.trim().toLowerCase();
  const campSlug = campaign.categorySlug.trim().toLowerCase().replace(/-/g, ' ');
  return Boolean(chCat && (chCat === campCat || chCat === campSlug));
}

/**
 * Computes real-time reward completion percentages from accumulated AFK watch seconds.
 */
export function computeCampaignProgress(watchedSeconds: number, rewards: DropReward[]): {
  completedCount: number;
  totalCount: number;
  overallPercent: number;
  rewardProgress: Array<{
    id: string;
    earnedMinutes: number;
    requiredMinutes: number;
    percent: number;
    completed: boolean;
  }>;
} {
  const safeSeconds = Math.max(0, watchedSeconds);
  const earnedMinutesExact = safeSeconds / 60;

  const rewardProgress = rewards.map((r) => {
    const required = Math.max(1, r.requiredMinutes);
    const earned = Math.min(required, Number(earnedMinutesExact.toFixed(1)));
    const percent = Math.min(100, Math.round((earnedMinutesExact / required) * 100));
    return {
      id: r.id,
      earnedMinutes: earned,
      requiredMinutes: required,
      percent,
      completed: earnedMinutesExact >= required,
    };
  });

  const completedCount = rewardProgress.filter((r) => r.completed).length;
  const maxRequired = rewards.reduce((max, r) => Math.max(max, r.requiredMinutes), 0);
  const overallPercent =
    maxRequired > 0 ? Math.min(100, Math.round((earnedMinutesExact / maxRequired) * 100)) : 0;

  return {
    completedCount,
    totalCount: rewards.length,
    overallPercent,
    rewardProgress,
  };
}

/**
 * Checks whether a live channel is currently broadcasting for a Kick platform event.
 */
export function isChannelInPlatformEvent(
  channel: Pick<ChannelItem, 'slug' | 'isLive'> | null | undefined,
  event: Pick<KickPlatformEvent, 'id' | 'phase' | 'activeStreamSlugs'>,
  activeChannelEventId: string | null,
): boolean {
  if (!channel || !channel.isLive || event.phase !== 'live') {
    return false;
  }
  if (activeChannelEventId && activeChannelEventId === event.id) {
    return true;
  }
  const normalizedSlug = channel.slug.trim().toLowerCase();
  return event.activeStreamSlugs.some((s) => s.trim().toLowerCase() === normalizedSlug);
}

/**
 * Sorts Kick platform events by phase (live -> pre -> post), active streams count, and viewers.
 */
export function sortPlatformEvents<T extends Pick<KickPlatformEvent, 'phase' | 'numLivestreams' | 'viewCount'>>(
  events: T[],
): T[] {
  const phaseOrder: Record<KickPlatformEvent['phase'], number> = {
    live: 0,
    pre: 1,
    post: 2,
  };
  return [...events].sort((a, b) => {
    const pDiff = phaseOrder[a.phase] - phaseOrder[b.phase];
    if (pDiff !== 0) return pDiff;
    if (b.numLivestreams !== a.numLivestreams) return b.numLivestreams - a.numLivestreams;
    return b.viewCount - a.viewCount;
  });
}
