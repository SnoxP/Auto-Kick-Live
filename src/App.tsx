import { useCallback, useEffect, useState } from 'react';
import { BroadcasterView } from './components/BroadcasterView';
import { DiscoverView } from './components/DiscoverView';
import { HistoryView } from './components/HistoryView';
import { KickLoginModal } from './components/KickLoginModal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { WatcherWorkspace } from './components/WatcherWorkspace';
import type { AppStatePayload, BotConfig, BroadcasterConfig, NavTab } from './types/kick';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('watcher');
  const [state, setState] = useState<AppStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [botBusy, setBotBusy] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) {
        throw new Error(`Erro HTTP ${res.status} ao carregar estado do bot.`);
      }
      const data = (await res.json()) as AppStatePayload;
      setState(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Falha ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const isStreamingOrWatching = Boolean(state?.bot.running || state?.broadcaster.running);

  useEffect(() => {
    const intervalMs = isStreamingOrWatching ? 1500 : 4000;
    const timer = setInterval(() => {
      void fetchState();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isStreamingOrWatching, fetchState]);

  const handleToggleBot = async () => {
    if (!state) return;
    setBotBusy(true);
    try {
      await fetch(state.bot.running ? '/api/bot/stop' : '/api/bot/start', {
        method: 'POST',
      });
      await fetchState();
    } finally {
      setBotBusy(false);
    }
  };

  const handleAddChannel = async (slug: string) => {
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao adicionar canal.');
    }
    await fetchState();
  };

  const handleRemoveChannel = async (slug: string) => {
    await fetch(`/api/channels/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    await fetchState();
  };

  const handleChannelPriority = async (slug: string, direction: 'up' | 'down' | 'watch-now') => {
    await fetch(`/api/channels/${encodeURIComponent(slug)}/priority`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    await fetchState();
  };

  const handleRefreshChannels = async () => {
    await fetch('/api/bot/refresh', { method: 'POST' });
    await fetchState();
  };

  const handleUpdateConfig = async (partial: Partial<BotConfig>) => {
    await fetch('/api/bot/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    await fetchState();
  };

  const handleAddRule = async (rule: {
    name: string;
    triggerType: 'keyword' | 'mention';
    pattern: string;
    replyTemplate: string;
    cooldownSeconds: number;
  }) => {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao criar regra.');
    }
    await fetchState();
  };

  const handleToggleRule = async (id: string) => {
    await fetch(`/api/rules/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' });
    await fetchState();
  };

  const handleDeleteRule = async (id: string) => {
    await fetch(`/api/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await fetchState();
  };

  const handleStartBroadcaster = async (payload: {
    mode: BroadcasterConfig['mode'];
    sceneId: BroadcasterConfig['sceneId'];
    overlayText: string;
    resolution: BroadcasterConfig['resolution'];
    fps: BroadcasterConfig['fps'];
    bitrateKbps: BroadcasterConfig['bitrateKbps'];
    rtmpUrl?: string;
    streamKey?: string;
  }) => {
    const res = await fetch('/api/broadcaster/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível iniciar o transmissor.');
    }
    await fetchState();
  };

  const handleStopBroadcaster = async () => {
    await fetch('/api/broadcaster/stop', { method: 'POST' });
    await fetchState();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/kick/logout', { method: 'POST' });
    await fetchState();
  };

  const handleClearLogs = async () => {
    await fetch('/api/logs', { method: 'DELETE' });
    await fetchState();
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#F1F5F9] flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={state?.user || null}
        botRunning={Boolean(state?.bot.running)}
        broadcasterRunning={Boolean(state?.broadcaster.running)}
        onOpenLoginModal={() => setLoginModalOpen(true)}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeTab={activeTab}
          user={state?.user || null}
          botRunning={Boolean(state?.bot.running)}
          onToggleBot={handleToggleBot}
          onOpenLoginModal={() => setLoginModalOpen(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          busy={botBusy || !state}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
          {loading && !state ? (
            <div className="space-y-4">
              <div className="h-24 rounded-xl bg-[#13171D] border border-[#222831] animate-pulse" />
              <div className="h-96 rounded-xl bg-[#13171D] border border-[#222831] animate-pulse" />
            </div>
          ) : loadError && !state ? (
            <div
              role="alert"
              className="rounded-xl bg-red-950/40 border border-red-900/50 p-6 space-y-3"
            >
              <p className="text-sm font-semibold text-white">Erro ao carregar o painel</p>
              <p className="text-xs text-red-200">{loadError}</p>
              <button
                type="button"
                onClick={fetchState}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#53FC18] text-[#081205]"
              >
                Tentar Novamente
              </button>
            </div>
          ) : state ? (
            <>
              {activeTab === 'watcher' && (
                <WatcherWorkspace
                  bot={state.bot}
                  channels={state.channels}
                  chatMessages={state.chatMessages}
                  rules={state.rules}
                  user={state.user}
                  onAddChannel={handleAddChannel}
                  onRemoveChannel={handleRemoveChannel}
                  onChannelPriority={handleChannelPriority}
                  onRefreshChannels={handleRefreshChannels}
                  onUpdateConfig={handleUpdateConfig}
                  onAddRule={handleAddRule}
                  onToggleRule={handleToggleRule}
                  onDeleteRule={handleDeleteRule}
                  onOpenLoginModal={() => setLoginModalOpen(true)}
                />
              )}

              {activeTab === 'discover' && (
                <DiscoverView
                  queuedChannels={state.channels}
                  onAddChannel={handleAddChannel}
                />
              )}

              {activeTab === 'broadcaster' && (
                <BroadcasterView
                  broadcaster={state.broadcaster}
                  onStartBroadcaster={handleStartBroadcaster}
                  onStopBroadcaster={handleStopBroadcaster}
                />
              )}

              {activeTab === 'history' && (
                <HistoryView logs={state.logs} onClearLogs={handleClearLogs} />
              )}
            </>
          ) : null}
        </main>
      </div>

      <KickLoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        oauthConfigured={Boolean(state?.oauthConfigured)}
        callbackUrl={state?.callbackUrl || ''}
        user={state?.user || null}
        onAuthSuccess={fetchState}
        onLogout={handleLogout}
      />
    </div>
  );
}
