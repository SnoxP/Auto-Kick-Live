import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FeaturedStream } from '../src/types/kick.ts';

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

