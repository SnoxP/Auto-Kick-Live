import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateChatTrigger,
  formatAfkDuration,
  normalizeKickSlug,
  parseFfmpegProgressLine,
  selectNextAfkChannel,
} from './afkEngine';
import type { AutoReplyRule, ChannelItem } from '../types/kick';

function makeChannel(overrides: Partial<ChannelItem> & { slug: string }): ChannelItem {
  return {
    displayName: overrides.slug,
    channelId: 100,
    chatroomId: 200,
    broadcasterUserId: 300,
    profilePic: null,
    isLive: false,
    viewerCount: 0,
    sessionTitle: 'Stream',
    category: 'Just Chatting',
    thumbnailUrl: null,
    priority: 1,
    watchedSeconds: 0,
    lastCheckedAt: null,
    statusError: null,
    ...overrides,
  };
}

test('normalizeKickSlug parses usernames, @handles, and kick.com URLs', () => {
  assert.equal(normalizeKickSlug('Gaules'), 'gaules');
  assert.equal(normalizeKickSlug('  @Coringa_BR  '), 'coringa_br');
  assert.equal(normalizeKickSlug('https://kick.com/xQc/videos'), 'xqc');
  assert.equal(normalizeKickSlug('kick.com/cellbit?ref=afk'), 'cellbit');
  assert.equal(normalizeKickSlug('https://twitch.tv/gaules'), null);
  assert.equal(normalizeKickSlug('https://kick.com/categories'), null);
  assert.equal(normalizeKickSlug('a'), null);
  assert.equal(normalizeKickSlug(''), null);
});

test('selectNextAfkChannel respects priority and round-robin failover', () => {
  const channels: ChannelItem[] = [
    makeChannel({ slug: 'offline_top', isLive: false, priority: 0 }),
    makeChannel({ slug: 'gaules', isLive: true, priority: 1 }),
    makeChannel({ slug: 'coringa', isLive: true, priority: 2 }),
  ];

  // Priority keeps current live channel if still live
  assert.equal(selectNextAfkChannel(channels, 'coringa', 'priority')?.slug, 'coringa');
  // Priority switches to highest-priority live channel when current goes offline
  assert.equal(selectNextAfkChannel(channels, 'offline_top', 'priority')?.slug, 'gaules');

  // Round-robin advances to the next live channel
  assert.equal(selectNextAfkChannel(channels, 'gaules', 'round-robin')?.slug, 'coringa');
  assert.equal(selectNextAfkChannel(channels, 'coringa', 'round-robin')?.slug, 'gaules');

  // Returns null if no channels are live
  const allOffline = channels.map((c) => ({ ...c, isLive: false }));
  assert.equal(selectNextAfkChannel(allOffline, 'gaules', 'priority'), null);
});

test('formatAfkDuration formats HH:MM:SS reliably', () => {
  assert.equal(formatAfkDuration(0), '00:00:00');
  assert.equal(formatAfkDuration(65), '00:01:05');
  assert.equal(formatAfkDuration(3661), '01:01:01');
  assert.equal(formatAfkDuration(-12), '00:00:00');
});

test('evaluateChatTrigger matches keywords, replaces template tokens, and enforces cooldowns', () => {
  const rules: AutoReplyRule[] = [
    {
      id: 'r1',
      name: 'Resposta AFK',
      triggerType: 'keyword',
      pattern: '!afk',
      replyTemplate: 'Estou em modo AFK no momento, @{user}!',
      cooldownSeconds: 30,
      enabled: true,
      lastTriggeredAt: null,
      triggerCount: 0,
    },
    {
      id: 'r2',
      name: 'Menção',
      triggerType: 'mention',
      pattern: 'pedro',
      replyTemplate: 'Oi @{user}, {bot} registrou sua mensagem.',
      cooldownSeconds: 60,
      enabled: true,
      lastTriggeredAt: 100_000,
      triggerCount: 1,
    },
  ];

  // Ignores bot's own messages
  assert.equal(evaluateChatTrigger('!afk', 'PedroBot', 'pedrobot', rules, 200_000), null);

  // Matches keyword rule
  const match = evaluateChatTrigger('eae galera !afk aqui', 'Viewer123', 'PedroBot', rules, 200_000);
  assert.ok(match);
  assert.equal(match.rule.id, 'r1');
  assert.equal(match.reply, 'Estou em modo AFK no momento, @Viewer123!');

  // Respects cooldown on r2 (100_000 + 60_000 = 160_000; at 120_000 still cooling down)
  assert.equal(evaluateChatTrigger('ei @PedroBot', 'Viewer123', 'PedroBot', rules, 120_000), null);

  // After cooldown passes, mention rule triggers
  const mentionMatch = evaluateChatTrigger('ei @PedroBot', 'Viewer123', 'PedroBot', rules, 170_000);
  assert.ok(mentionMatch);
  assert.equal(mentionMatch.rule.id, 'r2');
  assert.equal(mentionMatch.reply, 'Oi @Viewer123, PedroBot registrou sua mensagem.');
});

test('parseFfmpegProgressLine extracts frame, fps, and bitrate telemetry', () => {
  const parsed = parseFfmpegProgressLine(
    'frame=  180 fps=30.0 q=28.0 size=     512kB time=00:00:06.00 bitrate= 699.1kbits/s speed=1.00x',
  );
  assert.deepEqual(parsed, {
    frame: 180,
    fps: 30,
    bitrate: '699.1kbits/s',
  });
  assert.equal(parseFfmpegProgressLine('Stream mapping:'), null);
});
