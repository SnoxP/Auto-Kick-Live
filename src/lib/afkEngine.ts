import type { AutoReplyRule, ChannelItem, FailoverMode } from '../types/kick';

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
