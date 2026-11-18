import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCampaignProgress,
  evaluateChatTrigger,
  formatAfkDuration,
  isChannelEligibleForCampaign,
  isChannelInPlatformEvent,
  normalizeKickSlug,
  parseFfmpegProgressLine,
  selectNextAfkChannel,
  sortPlatformEvents,
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

test('isChannelEligibleForCampaign matches specific channel lists and category-wide campaigns', () => {
  const csCampaign = {
    status: 'active' as const,
    categoryName: 'Counter-Strike 2',
    categorySlug: 'counter-strike-2',
    channelSlugs: ['gaill1nh0', 'michel'],
  };
  const catWideCampaign = {
    status: 'active' as const,
    categoryName: 'Return Of The King',
    categorySlug: 'return-of-the-king',
    channelSlugs: [],
  };

  assert.equal(
    isChannelEligibleForCampaign({ slug: 'michel', category: 'Counter-Strike 2', isLive: true }, csCampaign),
    true,
  );
  assert.equal(
    isChannelEligibleForCampaign({ slug: 'gaules', category: 'Counter-Strike 2', isLive: true }, csCampaign),
    false,
  );
  assert.equal(
    isChannelEligibleForCampaign({ slug: 'michel', category: 'Counter-Strike 2', isLive: false }, csCampaign),
    false,
  );
  assert.equal(
    isChannelEligibleForCampaign({ slug: 'anyone', category: 'Return Of The King', isLive: true }, catWideCampaign),
    true,
  );
});

test('computeCampaignProgress computes percentages and reward completion from watchedSeconds', () => {
  const rewards = [
    { id: 'r1', name: '1h Ticket', imageUrl: null, requiredMinutes: 60 },
    { id: 'r2', name: '2h Ticket', imageUrl: null, requiredMinutes: 120 },
  ];

  // 90 minutes = 5400 seconds -> r1 completed (100%), r2 at 75%
  const progress = computeCampaignProgress(5400, rewards);
  assert.equal(progress.completedCount, 1);
  assert.equal(progress.totalCount, 2);
  assert.equal(progress.overallPercent, 75);
  assert.equal(progress.rewardProgress[0].completed, true);
  assert.equal(progress.rewardProgress[1].percent, 75);
});

test('isChannelInPlatformEvent detects participation via channel event ID or stream slug', () => {
  const liveEvent = {
    id: 'ev-1',
    phase: 'live' as const,
    activeStreamSlugs: ['n3on', 'jonvlogs'],
  };

  assert.equal(
    isChannelInPlatformEvent({ slug: 'jonvlogs', isLive: true }, liveEvent, null),
    true,
  );
  assert.equal(
    isChannelInPlatformEvent({ slug: 'esportsawards', isLive: true }, liveEvent, 'ev-1'),
    true,
  );
  assert.equal(
    isChannelInPlatformEvent({ slug: 'gaules', isLive: true }, liveEvent, null),
    false,
  );
  assert.equal(
    isChannelInPlatformEvent({ slug: 'jonvlogs', isLive: false }, liveEvent, 'ev-1'),
    false,
  );
});

test('sortPlatformEvents prioritizes live events with active streams and highest viewers', () => {
  const sorted = sortPlatformEvents([
    { id: '1', phase: 'post' as const, numLivestreams: 5, viewCount: 99999 },
    { id: '2', phase: 'live' as const, numLivestreams: 0, viewCount: 0 },
    { id: '3', phase: 'pre' as const, numLivestreams: 0, viewCount: 0 },
    { id: '4', phase: 'live' as const, numLivestreams: 6, viewCount: 35000 },
  ]);
  assert.deepEqual(
    sorted.map((e) => e.id),
    ['4', '2', '3', '1'],
  );
});
