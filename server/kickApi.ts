import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FeaturedStream, KickEventStream, KickPlatformEvent } from '../src/types/kick.ts';

const execFileAsync = promisify(execFile);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function curlGetJson<T>(url: string): Promise<{ status: number; data: T | null }> {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '-sS',
      '--max-time',
      '8',
      '-A',
      USER_AGENT,
      '-H',
      'Accept: application/json',
      '-w',
      '\n__HTTP_STATUS__:%{http_code}',
      url,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );

  const marker = '\n__HTTP_STATUS__:';
  const idx = stdout.lastIndexOf(marker);
  const body = idx >= 0 ? stdout.slice(0, idx) : stdout;
  const statusStr = idx >= 0 ? stdout.slice(idx + marker.length).trim() : '0';
  const status = Number(statusStr) || 0;

  if (!body.trim()) {
    return { status, data: null };
  }

  try {
    return { status, data: JSON.parse(body) as T };
  } catch {
    return { status, data: null };
  }
}

export interface KickChannelSnapshot {
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
}

export async function fetchKickChannel(slug: string): Promise<KickChannelSnapshot> {
  const { status, data } = await curlGetJson<{
    id?: number;
    user_id?: number;
    slug?: string;
    user?: { id?: number; username?: string; profile_pic?: string | null };
    chatroom?: { id?: number };
    livestream?: {
      is_live?: boolean;
      viewer_count?: number;
      session_title?: string;
      categories?: Array<{ name?: string }>;
      thumbnail?: { url?: string; src?: string };
    } | null;
  }>(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`);

  if (status === 404) {
    throw new Error(`Canal "${slug}" não encontrado na Kick.`);
  }
  if (status < 200 || status >= 300 || !data) {
    throw new Error(`Kick API retornou HTTP ${status || 'erro de rede'} para "${slug}".`);
  }

  const live = data.livestream;
  const isLive = Boolean(live && live.is_live !== false);

  return {
    slug: (data.slug || slug).toLowerCase(),
    displayName: data.user?.username || data.slug || slug,
    channelId: typeof data.id === 'number' ? data.id : null,
    chatroomId: typeof data.chatroom?.id === 'number' ? data.chatroom.id : null,
    broadcasterUserId:
      typeof data.user_id === 'number'
        ? data.user_id
        : typeof data.user?.id === 'number'
          ? data.user.id
          : null,
    profilePic: data.user?.profile_pic || null,
    isLive,
    viewerCount: isLive && typeof live?.viewer_count === 'number' ? live.viewer_count : 0,
    sessionTitle: isLive && live?.session_title ? live.session_title : 'Canal offline no momento',
    category:
      isLive && live?.categories && live.categories[0]?.name
        ? live.categories[0].name
        : 'Offline',
    thumbnailUrl: live?.thumbnail?.url || live?.thumbnail?.src || null,
  };
}

export async function fetchKickFeaturedStreams(lang: 'pt' | 'en' = 'pt'): Promise<FeaturedStream[]> {
  const endpoint =
    lang === 'pt'
      ? 'https://kick.com/stream/featured-livestreams/pt'
      : 'https://kick.com/stream/featured-livestreams/en';

  const { status, data: payload } = await curlGetJson<{
    data?: Array<{
      session_title?: string;
      viewer_count?: number;
      language?: string;
      thumbnail?: { src?: string; srcset?: string };
      categories?: Array<{ name?: string }>;
      channel?: {
        slug?: string;
        user?: { username?: string; profile_pic?: string | null };
      };
    }>;
  }>(endpoint);

  if (status < 200 || status >= 300 || !payload) {
    throw new Error(`Kick Featured API retornou HTTP ${status || 'erro de rede'}`);
  }

  const rows = payload.data || [];
  const results: FeaturedStream[] = [];

  for (const item of rows) {
    const slug = item.channel?.slug?.toLowerCase();
    if (!slug) {
      continue;
    }

    let thumb: string | null = item.thumbnail?.src || null;
    if (!thumb && item.thumbnail?.srcset) {
      const firstSrc = item.thumbnail.srcset.split(',')[0]?.trim().split(' ')[0];
      if (firstSrc) {
        thumb = firstSrc;
      }
    }

    results.push({
      slug,
      displayName: item.channel?.user?.username || slug,
      sessionTitle: item.session_title || 'Ao vivo na Kick',
      category: item.categories?.[0]?.name || 'Just Chatting',
      viewerCount: typeof item.viewer_count === 'number' ? item.viewer_count : 0,
      language: item.language || lang.toUpperCase(),
      thumbnailUrl: thumb,
      profilePic: item.channel?.user?.profile_pic || null,
    });
  }

  return results.slice(0, 18);
}

export async function fetchKickAuthenticatedUser(accessToken: string): Promise<{
  userId: number;
  username: string;
  email: string | null;
  profilePicture: string | null;
}> {
  const res = await fetch('https://api.kick.com/public/v1/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao obter perfil Kick (${res.status}): ${body.slice(0, 160)}`);
  }

  const payload = (await res.json()) as {
    data?: Array<{
      user_id?: number;
      id?: number;
      name?: string;
      username?: string;
      email?: string;
      profile_picture?: string;
    }>;
  };

  const user = payload.data?.[0];
  if (!user) {
    throw new Error('Perfil do usuário não retornado pela API da Kick.');
  }

  return {
    userId: user.user_id ?? user.id ?? 0,
    username: user.name || user.username || 'UsuarioKick',
    email: user.email || null,
    profilePicture: user.profile_picture || null,
  };
}

export async function sendKickChatMessage(
  accessToken: string,
  broadcasterUserId: number,
  content: string,
): Promise<void> {
  const res = await fetch('https://api.kick.com/public/v1/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      broadcaster_user_id: broadcasterUserId,
      content: content.slice(0, 500),
      type: 'user',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao enviar chat Kick (${res.status}): ${text.slice(0, 140)}`);
  }
}

export interface RawKickChatMessage {
  id: string;
  content: string;
  createdAt: string;
  sender: string;
  senderColor: string;
}

export async function fetchKickChatMessages(channelId: number): Promise<RawKickChatMessage[]> {
  const { status, data } = await curlGetJson<{
    data?: {
      messages?: Array<{
        id?: string;
        content?: string;
        created_at?: string;
        sender?: {
          username?: string;
          identity?: { color?: string };
        };
      }>;
    };
  }>(`https://kick.com/api/v2/channels/${channelId}/messages`);

  if (status < 200 || status >= 300 || !data?.data?.messages) {
    return [];
  }

  return data.data.messages
    .filter((m) => Boolean(m.id && m.content))
    .map((m) => ({
      id: String(m.id),
      content: String(m.content || ''),
      createdAt: m.created_at || new Date().toISOString(),
      sender: m.sender?.username || 'Viewer',
      senderColor: m.sender?.identity?.color || '#53FC18',
    }));
}

export async function fetchKickDropsCampaigns(): Promise<
  Array<{
    id: string;
    name: string;
    status: 'active' | 'upcoming' | 'expired';
    categoryName: string;
    categorySlug: string;
    categoryImageUrl: string | null;
    organizationName: string;
    organizationLogoUrl: string | null;
    startsAt: string;
    endsAt: string;
    connectUrl: string | null;
    channelSlugs: string[];
    rewards: Array<{
      id: string;
      name: string;
      imageUrl: string | null;
      requiredMinutes: number;
    }>;
  }>
> {
  const { status, data } = await curlGetJson<{
    data?: Array<{
      id?: string;
      name?: string;
      status?: string;
      starts_at?: string;
      ends_at?: string;
      connect_url?: string | null;
      category?: {
        name?: string;
        slug?: string;
        image_url?: string | null;
      };
      organization?: {
        name?: string;
        logo_url?: string | null;
      };
      channels?: Array<{ slug?: string }>;
      rewards?: Array<{
        id?: string;
        name?: string;
        image_url?: string | null;
        required_units?: number;
      }>;
    }>;
  }>('https://web.kick.com/api/v1/drops/campaigns');

  if (status < 200 || status >= 300 || !data?.data) {
    throw new Error(`Kick Drops API retornou HTTP ${status || 'erro de rede'}.`);
  }

  return data.data
    .filter((c) => Boolean(c.id && c.name))
    .map((c) => {
      const normalizedStatus =
        c.status === 'active'
          ? 'active'
          : c.status === 'upcoming'
            ? 'upcoming'
            : 'expired';

      return {
        id: String(c.id),
        name: String(c.name).trim(),
        status: normalizedStatus,
        categoryName: c.category?.name || 'Geral',
        categorySlug: c.category?.slug || '',
        categoryImageUrl: c.category?.image_url || null,
        organizationName: c.organization?.name || 'Kick',
        organizationLogoUrl: c.organization?.logo_url || null,
        startsAt: c.starts_at || '',
        endsAt: c.ends_at || '',
        connectUrl: c.connect_url || null,
        channelSlugs: (c.channels || [])
          .map((ch) => ch.slug?.trim().toLowerCase())
          .filter((s): s is string => Boolean(s)),
        rewards: (c.rewards || []).map((r) => {
          const rawImg = r.image_url || '';
          const fullImg = rawImg
            ? rawImg.startsWith('http')
              ? rawImg
              : `https://ext.cdn.kick.com/${rawImg.replace(/^\/+/, '')}`
            : null;
          return {
            id: String(r.id || Math.random()),
            name: r.name || 'Recompensa',
            imageUrl: fullImg,
            requiredMinutes: typeof r.required_units === 'number' ? r.required_units : 60,
          };
        }),
      };
    });
}

interface RawKickEvent {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  phase?: string;
  is_draft?: boolean;
  start_time?: string;
  end_time?: string | null;
  num_livestreams?: number;
  view_count?: number;
  languages?: string[];
  category?: {
    name?: string;
    slug?: string;
  };
  assets?: {
    thumbnail?: string | null;
    promo_poster?: string | null;
    banner?: string | null;
    promo_banner?: string | null;
  };
}

export async function fetchKickPlatformEvents(): Promise<
  Array<Omit<KickPlatformEvent, 'watchedSeconds' | 'activeStreamSlugs'>>
> {
  const { status, data } = await curlGetJson<{
    data?: {
      events?: RawKickEvent[];
    };
  }>('https://web.kick.com/api/v1/events/browse');

  if (status < 200 || status >= 300 || !data?.data?.events) {
    throw new Error(`Kick Events API retornou HTTP ${status || 'erro de rede'}.`);
  }

  return data.data.events
    .filter((e) => Boolean(e.id && e.title && !e.is_draft))
    .map((e) => {
      const phase: KickPlatformEvent['phase'] =
        e.phase === 'live' ? 'live' : e.phase === 'pre' ? 'pre' : 'post';

      return {
        id: String(e.id),
        slug: String(e.slug || e.id),
        title: String(e.title).trim(),
        description: String(e.description || '').trim(),
        phase,
        categoryName: e.category?.name || 'Special Events',
        categorySlug: e.category?.slug || 'special-events',
        startTime: e.start_time || '',
        endTime: e.end_time || null,
        numLivestreams: typeof e.num_livestreams === 'number' ? e.num_livestreams : 0,
        viewCount: typeof e.view_count === 'number' ? e.view_count : 0,
        thumbnailUrl: e.assets?.thumbnail || e.assets?.promo_poster || null,
        bannerUrl: e.assets?.promo_banner || e.assets?.banner || null,
        languages: Array.isArray(e.languages) ? e.languages : [],
      };
    });
}

export async function fetchKickEventStreams(eventIdOrSlug: string): Promise<KickEventStream[]> {
  const { status, data } = await curlGetJson<{
    data?: {
      streams?: Array<{
        channel?: { id?: number; slug?: string };
        user?: { username?: string; profile_picture_url?: string | null };
        livestream?: {
          title?: string;
          view_count?: number;
          language?: string;
          thumbnail?: { src?: string | null };
        };
      }>;
    };
  }>(`https://web.kick.com/api/v1/events/${encodeURIComponent(eventIdOrSlug)}/streams`);

  if (status < 200 || status >= 300 || !data?.data?.streams) {
    return [];
  }

  return data.data.streams
    .filter((s) => Boolean(s.channel?.slug))
    .map((s) => ({
      channelId: typeof s.channel?.id === 'number' ? s.channel.id : 0,
      slug: String(s.channel?.slug || '').toLowerCase(),
      username: s.user?.username || String(s.channel?.slug || ''),
      profilePic: s.user?.profile_picture_url || null,
      title: s.livestream?.title || 'Ao vivo no evento Kick',
      viewerCount: typeof s.livestream?.view_count === 'number' ? s.livestream.view_count : 0,
      language: s.livestream?.language || 'en',
      thumbnailUrl: s.livestream?.thumbnail?.src || null,
    }))
    .sort((a, b) => b.viewerCount - a.viewerCount);
}

export async function fetchKickChannelEvent(channelId: number): Promise<string | null> {
  const { status, data } = await curlGetJson<{
    data?: { id?: string; phase?: string } | null;
  }>(`https://web.kick.com/api/v1/channels/${channelId}/event`);

  if (status < 200 || status >= 300 || !data?.data?.id) {
    return null;
  }
  return data.data.phase === 'live' ? String(data.data.id) : null;
}


