import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Tv,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { formatAfkDuration } from '../lib/afkEngine';
import type { AutoReplyRule, BotConfig, ChannelItem, ChatMessageItem, KickUserSession } from '../types/kick';

interface WatcherWorkspaceProps {
  bot: BotConfig;
  channels: ChannelItem[];
  chatMessages: ChatMessageItem[];
  rules: AutoReplyRule[];
  user: KickUserSession | null;
  onAddChannel: (slug: string) => Promise<void>;
  onRemoveChannel: (slug: string) => Promise<void>;
  onChannelPriority: (slug: string, direction: 'up' | 'down' | 'watch-now') => Promise<void>;
  onRefreshChannels: () => Promise<void>;
  onUpdateConfig: (partial: Partial<BotConfig>) => Promise<void>;
  onAddRule: (rule: {
    name: string;
    triggerType: 'keyword' | 'mention';
    pattern: string;
    replyTemplate: string;
    cooldownSeconds: number;
  }) => Promise<void>;
  onToggleRule: (id: string) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onOpenLoginModal: () => void;
}

export function WatcherWorkspace({
  bot,
  channels,
  chatMessages,
  rules,
  user,
  onAddChannel,
  onRemoveChannel,
  onChannelPriority,
  onRefreshChannels,
  onUpdateConfig,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onOpenLoginModal,
}: WatcherWorkspaceProps) {
  const [channelInput, setChannelInput] = useState('');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [addingChannel, setAddingChannel] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rightTab, setRightTab] = useState<'chat' | 'rules'>('chat');
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<'keyword' | 'mention'>('keyword');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleReply, setRuleReply] = useState('@{user} estou em modo AFK no momento.');
  const [ruleCooldown, setRuleCooldown] = useState(45);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const activeChannel = channels.find((c) => c.slug === bot.activeSlug) || channels[0] || null;
  const liveCount = channels.filter((c) => c.isLive).length;

  // Screen WakeLock when bot is running to prevent host display/tab sleep
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (!bot.running || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
        setWakeLockActive(false);
        return;
      }
      try {
        const wl = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen');
        if (!cancelled) {
          sentinel = wl;
          setWakeLockActive(true);
        } else {
          await wl.release();
        }
      } catch {
        setWakeLockActive(false);
      }
    };

    void acquire();
    return () => {
      cancelled = true;
      setWakeLockActive(false);
      if (sentinel) {
        void sentinel.release().catch(() => undefined);
      }
    };
  }, [bot.running]);

  const handleSubmitChannel = async (e: FormEvent) => {
    e.preventDefault();
    setChannelError(null);
    if (!channelInput.trim()) {
      setChannelError('Digite o nome do canal ou cole a URL da Kick.');
      return;
    }
    setAddingChannel(true);
    try {
      await onAddChannel(channelInput);
      setChannelInput('');
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : 'Erro ao adicionar canal.');
    } finally {
      setAddingChannel(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshChannels();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateRule = async (e: FormEvent) => {
    e.preventDefault();
    setRuleError(null);
    try {
      await onAddRule({
        name: ruleName,
        triggerType: ruleType,
        pattern: rulePattern,
        replyTemplate: ruleReply,
        cooldownSeconds: ruleCooldown,
      });
      setRuleName('');
      setRulePattern('');
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : 'Não foi possível salvar a regra.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top KPI strip: single-elevation hairline row */}
      <section
        aria-label="Resumo da operação AFK"
        className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#222831] rounded-xl overflow-hidden border border-[#222831]"
      >
        <div className="p-4 bg-[#13171D]">
          <p className="text-xs text-slate-400">Tempo AFK na Sessão</p>
          <p className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-white">
            {formatAfkDuration(bot.totalSessionSeconds)}
          </p>
        </div>

        <div className="p-4 bg-[#13171D]">
          <p className="text-xs text-slate-400">Canais na Fila</p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-white">
            {liveCount} <span className="text-sm font-normal text-slate-400">ao vivo · {channels.length} total</span>
          </p>
        </div>

        <div className="p-4 bg-[#13171D]">
          <p className="text-xs text-slate-400">Canal Sintonizado</p>
          <p className="mt-1.5 text-xl font-semibold text-white truncate">
            {activeChannel ? activeChannel.displayName : 'Nenhum canal'}
          </p>
        </div>

        <div className="p-4 bg-[#13171D]">
          <p className="text-xs text-slate-400">Monitor de Chat</p>
          <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
            {bot.wsConnected ? (
              <>
                <Wifi className="h-4 w-4 text-[#53FC18] shrink-0" />
                <span className="text-[#53FC18] truncate">Conectado ({bot.wsChannelSlug})</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-300">Em espera</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Main 12-column operational split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 cols: Active Stream AFK Monitor & Player */}
        <section className="xl:col-span-7 flex flex-col rounded-xl bg-[#13171D] border border-[#222831] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#222831]">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                {activeChannel
                  ? `${activeChannel.displayName} — ${activeChannel.isLive ? 'Ao vivo' : 'Offline'}`
                  : 'Monitor da Live AFK'}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {activeChannel
                  ? `${activeChannel.category} · ${activeChannel.viewerCount.toLocaleString('pt-BR')} espectadores`
                  : 'Adicione um canal abaixo para iniciar'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center p-0.5 rounded-lg bg-[#0D1014] border border-[#222831]">
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ lowDataMode: false })}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    !bot.lowDataMode
                      ? 'bg-[#1D242E] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Player Kick
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ lowDataMode: true })}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    bot.lowDataMode
                      ? 'bg-[#1D242E] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Modo Econômico
                </button>
              </div>
            </div>
          </div>

          <div className="relative flex-1 bg-[#0A0D10] min-h-[300px] flex items-center justify-center">
            {!activeChannel ? (
              <div className="p-8 text-center max-w-sm space-y-2">
                <Tv className="h-8 w-8 text-slate-500 mx-auto" />
                <p className="text-sm font-medium text-white">Nenhum canal selecionado</p>
                <p className="text-xs text-slate-400">
                  Adicione um streamer da Kick na fila abaixo ou explore canais ao vivo em Descobrir Lives.
                </p>
              </div>
            ) : !bot.lowDataMode && activeChannel.isLive ? (
              <iframe
                src={`https://player.kick.com/${encodeURIComponent(activeChannel.slug)}?muted=true&autoplay=true`}
                title={`Player da live de ${activeChannel.displayName}`}
                className="w-full aspect-video border-0"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full p-6 flex flex-col justify-between gap-6">
                <div className="flex items-start gap-4">
                  {activeChannel.profilePic ? (
                    <img
                      src={activeChannel.profilePic}
                      alt={activeChannel.displayName}
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 rounded-xl object-cover border border-[#27303D] shrink-0"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-[#192028] border border-[#27303D] flex items-center justify-center text-base font-bold text-[#53FC18] shrink-0">
                      {activeChannel.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className={activeChannel.isLive ? 'text-[#53FC18] font-semibold' : 'text-slate-400'}>
                        {activeChannel.isLive ? 'AO VIVO' : 'OFFLINE'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{activeChannel.category}</span>
                      {wakeLockActive && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-300">Anti-hibernação ativo</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-white leading-snug">
                      {activeChannel.sessionTitle}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {bot.lowDataMode
                        ? 'Modo Econômico ativo: vídeo desativado para economizar banda enquanto o servidor mantém o monitoramento e o chat WebSocket.'
                        : 'Canal offline no momento. Se o Bot AFK estiver ativo, ele alternará automaticamente para o próximo canal ao vivo da fila.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#1E242D]">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-xs text-slate-400">Tempo AFK neste canal</p>
                      <p className="text-lg font-mono font-semibold tabular-nums text-white">
                        {formatAfkDuration(activeChannel.watchedSeconds)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Espectadores</p>
                      <p className="text-lg font-mono font-semibold tabular-nums text-white">
                        {activeChannel.viewerCount.toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <a
                    href={`https://kick.com/${encodeURIComponent(activeChannel.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-200 bg-[#181E26] border border-[#27303D] hover:text-white whitespace-nowrap"
                  >
                    <span>Abrir na Kick</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#101419] border-t border-[#222831] text-xs">
            <div className="flex items-center gap-3">
              <label htmlFor="failover-select" className="text-slate-400">
                Troca automática:
              </label>
              <select
                id="failover-select"
                value={bot.failoverMode}
                onChange={(e) =>
                  onUpdateConfig({
                    failoverMode: e.target.value === 'round-robin' ? 'round-robin' : 'priority',
                  })
                }
                className="rounded-md bg-[#181E26] border border-[#27303D] px-2.5 py-1 text-xs text-white"
              >
                <option value="priority">Por prioridade (Failover)</option>
                <option value="round-robin">Rodízio entre lives</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="poll-select" className="text-slate-400">
                Verificação:
              </label>
              <select
                id="poll-select"
                value={bot.pollIntervalSeconds}
                onChange={(e) => onUpdateConfig({ pollIntervalSeconds: Number(e.target.value) })}
                className="rounded-md bg-[#181E26] border border-[#27303D] px-2.5 py-1 text-xs text-white tabular-nums"
              >
                <option value={15}>A cada 15s</option>
                <option value={30}>A cada 30s</option>
                <option value={60}>A cada 60s</option>
                <option value={120}>A cada 2m</option>
              </select>
            </div>
          </div>
        </section>

        {/* Right 5 cols: Live Chat Feed & AFK Auto-Reply Rules */}
        <section className="xl:col-span-5 flex flex-col rounded-xl bg-[#13171D] border border-[#222831] overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#222831]">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0D1014] border border-[#222831]">
              <button
                type="button"
                onClick={() => setRightTab('chat')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  rightTab === 'chat'
                    ? 'bg-[#1D242E] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Chat ao Vivo
              </button>
              <button
                type="button"
                onClick={() => setRightTab('rules')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  rightTab === 'rules'
                    ? 'bg-[#1D242E] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Regras AFK ({rules.length})
              </button>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none whitespace-nowrap shrink-0">
              <input
                type="checkbox"
                checked={bot.autoReplyEnabled}
                onChange={(e) => onUpdateConfig({ autoReplyEnabled: e.target.checked })}
                className="rounded border-[#333C4A] bg-[#0E1217] accent-[#53FC18]"
              />
              <span>Auto-resposta</span>
            </label>
          </div>

          {rightTab === 'chat' ? (
            <div className="flex-1 flex flex-col min-h-[320px] max-h-[420px]">
              {!user && (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#171B21] border-b border-[#222831] text-xs">
                  <span className="text-slate-300">
                    Modo leitura. Conecte sua conta Kick para o bot enviar respostas no chat.
                  </span>
                  <button
                    type="button"
                    onClick={onOpenLoginModal}
                    className="text-[#53FC18] font-semibold hover:underline whitespace-nowrap shrink-0"
                  >
                    Conectar
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10 space-y-2">
                    <MessageSquare className="h-6 w-6 text-slate-500" />
                    <p className="text-xs font-medium text-slate-300">
                      {bot.running
                        ? 'Aguardando mensagens do chat da live...'
                        : 'Inicie o Bot AFK para capturar o chat em tempo real via WebSocket.'}
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="text-xs leading-relaxed">
                      <span className="font-mono text-[11px] text-slate-500 mr-2 tabular-nums">
                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="font-semibold mr-1.5" style={{ color: msg.senderColor || '#53FC18' }}>
                        {msg.sender}:
                      </span>
                      <span className="text-slate-200 break-words">{msg.content}</span>
                      {msg.triggeredRuleName && (
                        <span className="ml-2 text-[11px] font-mono text-[#53FC18]">
                          [{msg.triggeredRuleName}]
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-[320px] max-h-[420px] overflow-y-auto p-4 space-y-4">
              <form onSubmit={handleCreateRule} className="space-y-2.5 pb-3 border-b border-[#222831]">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="Nome da regra"
                    aria-label="Nome da regra AFK"
                    className="rounded-lg bg-[#0E1217] border border-[#242B35] px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
                  />
                  <select
                    value={ruleType}
                    onChange={(e) =>
                      setRuleType(e.target.value === 'mention' ? 'mention' : 'keyword')
                    }
                    aria-label="Tipo de gatilho"
                    className="rounded-lg bg-[#0E1217] border border-[#242B35] px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="keyword">Palavra-chave</option>
                    <option value="mention">Menção (@usuário)</option>
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={rulePattern}
                    onChange={(e) => setRulePattern(e.target.value)}
                    placeholder={ruleType === 'keyword' ? 'Ex: !drops' : 'Ex: seu_nick'}
                    aria-label="Padrão de gatilho"
                    className="col-span-2 rounded-lg bg-[#0E1217] border border-[#242B35] px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
                  />
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={ruleCooldown}
                    onChange={(e) => setRuleCooldown(Number(e.target.value))}
                    aria-label="Cooldown em segundos"
                    className="rounded-lg bg-[#0E1217] border border-[#242B35] px-3 py-1.5 text-xs font-mono tabular-nums text-white"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ruleReply}
                    onChange={(e) => setRuleReply(e.target.value)}
                    placeholder="Resposta (use {user})"
                    aria-label="Mensagem de resposta automática"
                    className="flex-1 rounded-lg bg-[#0E1217] border border-[#242B35] px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#53FC18] text-[#081205] hover:bg-[#46DF12] whitespace-nowrap shrink-0"
                  >
                    Criar
                  </button>
                </div>
                {ruleError && <p className="text-xs text-red-400">{ruleError}</p>}
              </form>

              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-start justify-between gap-3 py-2 border-b border-[#1D232C] last:border-b-0"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-white truncate">
                        {rule.name}{' '}
                        <span className="font-mono font-normal text-slate-400">
                          · {rule.pattern} · {rule.cooldownSeconds}s
                        </span>
                      </p>
                      <p className="text-xs text-slate-400 truncate">{rule.replyTemplate}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleRule(rule.id)}
                        aria-label={`${rule.enabled ? 'Desativar' : 'Ativar'} regra ${rule.name}`}
                        className={`px-2 py-1 rounded text-[11px] font-medium ${
                          rule.enabled
                            ? 'bg-[#1D2D1B] text-[#53FC18]'
                            : 'bg-[#1B212A] text-slate-400'
                        }`}
                      >
                        {rule.enabled ? 'Ativa' : 'Pausada'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRule(rule.id)}
                        aria-label={`Excluir regra ${rule.name}`}
                        className="p-1 text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Queue management & high-density data table */}
      <section className="rounded-xl bg-[#13171D] border border-[#222831] overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border-b border-[#222831]">
          <div>
            <h2 className="text-sm font-semibold text-white">Fila de Canais AFK</h2>
            <p className="text-xs text-slate-400">
              O bot acompanha o primeiro canal ao vivo da lista e realiza failover automático se a live cair.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={handleSubmitChannel} className="flex items-center gap-2">
              <input
                type="text"
                value={channelInput}
                onChange={(e) => {
                  setChannelInput(e.target.value);
                  if (channelError) setChannelError(null);
                }}
                placeholder="Ex: gaules ou kick.com/gaules"
                aria-label="Adicionar canal da Kick"
                className="w-56 sm:w-64 rounded-lg bg-[#0D1014] border border-[#262D38] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#53FC18]"
              />
              <button
                type="submit"
                disabled={addingChannel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#53FC18] text-[#081205] hover:bg-[#46DF12] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{addingChannel ? 'Buscando...' : 'Adicionar'}</span>
              </button>
            </form>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28303D] hover:bg-[#222935] whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {channelError && (
          <div
            role="alert"
            className="flex items-center gap-2 px-4 py-2.5 bg-red-950/40 border-b border-red-900/50 text-xs text-red-200"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
            <span>{channelError}</span>
          </div>
        )}

        {channels.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-white">Sua fila AFK está vazia</p>
            <p className="text-xs text-slate-400">
              Digite o nome de um canal acima (como gaules ou coringa) para começar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#222831] text-[11px] font-medium text-slate-400">
                  <th className="py-2.5 px-4">Prioridade</th>
                  <th className="py-2.5 px-4">Canal</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Categoria</th>
                  <th className="py-2.5 px-4 text-right">Espectadores</th>
                  <th className="py-2.5 px-4 text-right">Tempo AFK</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C222B] text-xs">
                {channels.map((ch, idx) => {
                  const isWatching = bot.activeSlug === ch.slug;
                  return (
                    <tr
                      key={ch.slug}
                      className={`hover:bg-[#171C24] transition-colors ${
                        isWatching ? 'bg-[#161D17]' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400">
                        #{idx + 1}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {ch.profilePic ? (
                            <img
                              src={ch.profilePic}
                              alt={ch.displayName}
                              referrerPolicy="no-referrer"
                              className="h-7 w-7 rounded-md object-cover border border-[#28313E] shrink-0"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-md bg-[#1C222B] flex items-center justify-center text-[11px] font-bold text-slate-300 shrink-0">
                              {ch.displayName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{ch.displayName}</p>
                            <p
                              className={`text-[11px] truncate max-w-[240px] ${
                                ch.statusError ? 'text-amber-400' : 'text-slate-400'
                              }`}
                            >
                              {ch.statusError || ch.sessionTitle}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {ch.isLive ? (
                          <span className="font-semibold text-[#53FC18]">
                            {isWatching && bot.running ? 'Rodando AFK' : 'Ao vivo'}
                          </span>
                        ) : (
                          <span className="text-slate-400">Offline</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">{ch.category}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                        {ch.viewerCount.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                        {formatAfkDuration(ch.watchedSeconds)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onChannelPriority(ch.slug, 'watch-now')}
                            aria-label={`Assistir ${ch.displayName} agora`}
                            title="Sintonizar agora"
                            className="p-1.5 rounded-md text-slate-300 hover:bg-[#222A35] hover:text-[#53FC18]"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => onChannelPriority(ch.slug, 'up')}
                            aria-label={`Subir prioridade de ${ch.displayName}`}
                            className="p-1.5 rounded-md text-slate-400 hover:bg-[#222A35] hover:text-white disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === channels.length - 1}
                            onClick={() => onChannelPriority(ch.slug, 'down')}
                            aria-label={`Descer prioridade de ${ch.displayName}`}
                            className="p-1.5 rounded-md text-slate-400 hover:bg-[#222A35] hover:text-white disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveChannel(ch.slug)}
                            aria-label={`Remover ${ch.displayName} da fila`}
                            className="p-1.5 rounded-md text-slate-400 hover:bg-[#2A1B1E] hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
