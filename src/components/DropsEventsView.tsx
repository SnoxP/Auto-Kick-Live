import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Gift,
  Play,
  Radio,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  computeCampaignProgress,
  formatAfkDuration,
  isChannelEligibleForCampaign,
  isChannelInPlatformEvent,
} from '../lib/afkEngine';
import type {
  BotConfig,
  ChannelItem,
  DropCampaign,
  KickEventStream,
  KickPlatformEvent,
} from '../types/kick';

interface DropsEventsViewProps {
  bot: BotConfig;
  channels: ChannelItem[];
  platformEvents: KickPlatformEvent[];
  eventsLastSyncedAt: string | null;
  activeChannelEventId: string | null;
  campaigns: DropCampaign[];
  dropsLastSyncedAt: string | null;
  onRefreshEvents: () => Promise<void>;
  onEnqueueEvent: (eventId: string, slug?: string) => Promise<void>;
  onRefreshCampaigns: () => Promise<void>;
  onEnqueueCampaign: (campaignId: string) => Promise<void>;
}

type EventPhaseFilter = 'live' | 'pre' | 'post';
type CampaignFilter = 'active' | 'expired' | 'all';

export function DropsEventsView({
  bot,
  channels,
  platformEvents,
  eventsLastSyncedAt,
  activeChannelEventId,
  campaigns,
  dropsLastSyncedAt,
  onRefreshEvents,
  onEnqueueEvent,
  onRefreshCampaigns,
  onEnqueueCampaign,
}: DropsEventsViewProps) {
  const [eventPhase, setEventPhase] = useState<EventPhaseFilter>('live');
  const [eventSearch, setEventSearch] = useState('');
  const [refreshingEvents, setRefreshingEvents] = useState(false);
  const [enqueuingEventKey, setEnqueuingEventKey] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [eventStreamsMap, setEventStreamsMap] = useState<Record<string, KickEventStream[]>>({});
  const [loadingStreamsId, setLoadingStreamsId] = useState<string | null>(null);

  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('active');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [refreshingDrops, setRefreshingDrops] = useState(false);
  const [enqueuingCampaignId, setEnqueuingCampaignId] = useState<string | null>(null);

  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const activeChannel = useMemo(
    () => channels.find((c) => c.slug === bot.activeSlug) || null,
    [channels, bot.activeSlug],
  );

  const liveEventsCount = useMemo(
    () => platformEvents.filter((e) => e.phase === 'live').length,
    [platformEvents],
  );
  const liveWithStreamsCount = useMemo(
    () => platformEvents.filter((e) => e.phase === 'live' && e.numLivestreams > 0).length,
    [platformEvents],
  );
  const preEventsCount = useMemo(
    () => platformEvents.filter((e) => e.phase === 'pre').length,
    [platformEvents],
  );
  const postEventsCount = useMemo(
    () => platformEvents.filter((e) => e.phase === 'post').length,
    [platformEvents],
  );

  const activeCampaignsCount = useMemo(
    () => campaigns.filter((c) => c.status === 'active').length,
    [campaigns],
  );

  const currentFarmingEvent = useMemo(
    () =>
      platformEvents.find((ev) =>
        isChannelInPlatformEvent(activeChannel, ev, activeChannelEventId),
      ) || null,
    [platformEvents, activeChannel, activeChannelEventId],
  );

  const eligibleDropsCount = useMemo(
    () => campaigns.filter((c) => isChannelEligibleForCampaign(activeChannel, c)).length,
    [campaigns, activeChannel],
  );

  const filteredEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    return platformEvents.filter((ev) => {
      if (ev.phase !== eventPhase) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.categoryName.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q)
      );
    });
  }, [platformEvents, eventPhase, eventSearch]);

  const filteredCampaigns = useMemo(() => {
    const q = campaignSearch.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (campaignFilter === 'active' && c.status !== 'active') return false;
      if (campaignFilter === 'expired' && c.status === 'active') return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.categoryName.toLowerCase().includes(q) ||
        c.organizationName.toLowerCase().includes(q)
      );
    });
  }, [campaigns, campaignFilter, campaignSearch]);

  const handleRefreshEvents = async () => {
    setRefreshingEvents(true);
    setActionMsg(null);
    try {
      await onRefreshEvents();
      setActionMsg({ type: 'ok', text: 'Eventos da plataforma Kick sincronizados.' });
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao sincronizar eventos da Kick.',
      });
    } finally {
      setRefreshingEvents(false);
    }
  };

  const handleToggleEventStreams = async (eventId: string) => {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }
    setExpandedEventId(eventId);
    setLoadingStreamsId(eventId);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/streams`);
      const data = (await res.json()) as { streams?: KickEventStream[] };
      if (Array.isArray(data.streams)) {
        setEventStreamsMap((prev) => ({ ...prev, [eventId]: data.streams! }));
      }
    } catch {
      // Keep existing cached list if request fails
    } finally {
      setLoadingStreamsId(null);
    }
  };

  const handleTuneEvent = async (eventId: string, slug?: string) => {
    const key = slug ? `${eventId}:${slug}` : eventId;
    setEnqueuingEventKey(key);
    setActionMsg(null);
    try {
      await onEnqueueEvent(eventId, slug);
      setActionMsg({
        type: 'ok',
        text: slug
          ? `Canal ${slug} sintonizado no Bot Watcher AFK para o evento.`
          : 'Live do evento sintonizada no Bot Watcher AFK. O tempo no evento agora sobe em tempo real.',
      });
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Não foi possível sintonizar o evento.',
      });
    } finally {
      setEnqueuingEventKey(null);
    }
  };

  const handleRefreshDrops = async () => {
    setRefreshingDrops(true);
    setActionMsg(null);
    try {
      await onRefreshCampaigns();
      setActionMsg({ type: 'ok', text: 'Campanhas de /drops/campaigns atualizadas.' });
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar campanhas da Kick.',
      });
    } finally {
      setRefreshingDrops(false);
    }
  };

  const handleTuneCampaign = async (campaignId: string) => {
    setEnqueuingCampaignId(campaignId);
    setActionMsg(null);
    try {
      await onEnqueueCampaign(campaignId);
      setActionMsg({
        type: 'ok',
        text: 'Canal elegível sintonizado no Bot Watcher AFK. O progresso agora sobe em tempo real.',
      });
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Não foi possível sintonizar um canal agora.',
      });
    } finally {
      setEnqueuingCampaignId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section
        aria-label="Resumo de Eventos e Drops da Kick"
        className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#222831] rounded-xl overflow-hidden border border-[#222831]"
      >
        <div className="p-4 bg-[#13171D]">
          <p className="text-xs text-slate-400">Eventos Ao Vivo na Kick</p>
          <p className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-white">
            {liveEventsCount}
            <span className="ml-2 text-xs font-sans font-normal text-slate-400">
              ({liveWithStreamsCount} com lives agora)
            </span>
          </p>
        </div>

        <div className="p-4 bg-[#13171D]">
          <p className="text-xs text-slate-400">Campanhas de Drops Ativas</p>
          <p className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-white">
            {activeCampaignsCount}
          </p>
        </div>

        <div className="p-4 bg-[#13171D]">
          <p className="text-xs text-slate-400">Participando Agora</p>
          <p className="mt-1.5 text-sm font-semibold text-white truncate">
            {bot.running && currentFarmingEvent ? (
              <span className="text-[#53FC18]">
                {currentFarmingEvent.title} ({activeChannel?.displayName})
              </span>
            ) : bot.running && eligibleDropsCount > 0 ? (
              <span className="text-[#53FC18]">
                {eligibleDropsCount} drop(s) em {activeChannel?.displayName}
              </span>
            ) : (
              <span className="text-slate-300">Nenhum evento/drop sintonizado</span>
            )}
          </p>
        </div>

        <div className="p-4 bg-[#13171D]">
          <p className="text-xs text-slate-400">Última Sincronização Kick</p>
          <p className="mt-1.5 text-base font-mono font-semibold tabular-nums text-white">
            {eventsLastSyncedAt
              ? new Date(eventsLastSyncedAt).toLocaleTimeString('pt-BR')
              : '--:--:--'}
          </p>
        </div>
      </section>

      {actionMsg && (
        <div
          role={actionMsg.type === 'err' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-xs border ${
            actionMsg.type === 'err'
              ? 'bg-red-950/40 border-red-900/50 text-red-200'
              : 'bg-[#122014] border-[#264628] text-[#B6F7A2]'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Kick Platform Live Events Section */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-xl bg-[#13171D] border border-[#222831] p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">
                Eventos da Plataforma Kick (Ao Vivo)
              </h2>
              {eventsLastSyncedAt && (
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  · Sync {new Date(eventsLastSyncedAt).toLocaleTimeString('pt-BR')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Eventos oficiais e torneios acontecendo agora dentro da Kick. Veja os canais transmitindo e sintonize o Bot AFK com um clique.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0D1014] border border-[#222831]">
              <button
                type="button"
                onClick={() => setEventPhase('live')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  eventPhase === 'live'
                    ? 'bg-[#1D242E] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Ao Vivo ({liveEventsCount})
              </button>
              <button
                type="button"
                onClick={() => setEventPhase('pre')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  eventPhase === 'pre'
                    ? 'bg-[#1D242E] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Em Breve ({preEventsCount})
              </button>
              <button
                type="button"
                onClick={() => setEventPhase('post')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  eventPhase === 'post'
                    ? 'bg-[#1D242E] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Encerrados ({postEventsCount})
              </button>
            </div>

            <div className="relative w-48 sm:w-56">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Buscar evento ou categoria"
                aria-label="Buscar eventos da plataforma Kick"
                className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500"
              />
            </div>

            <button
              type="button"
              onClick={handleRefreshEvents}
              disabled={refreshingEvents}
              aria-label="Atualizar eventos da plataforma Kick"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28303D] hover:bg-[#222935] whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingEvents ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="rounded-xl bg-[#13171D] border border-[#222831] p-10 text-center space-y-2">
            <Calendar className="h-6 w-6 text-slate-500 mx-auto" />
            <p className="text-sm font-medium text-white">Nenhum evento encontrado neste filtro</p>
            <p className="text-xs text-slate-400">
              Altere o filtro acima ou clique em Atualizar para buscar os eventos da Kick.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredEvents.slice(0, 12).map((ev) => {
              const isWatchingThisEvent = isChannelInPlatformEvent(
                activeChannel,
                ev,
                activeChannelEventId,
              );
              const imgKey = `ev-${ev.id}`;
              const isExpanded = expandedEventId === ev.id;
              const streams = eventStreamsMap[ev.id] || [];
              const isLoadingStreams = loadingStreamsId === ev.id;

              return (
                <article
                  key={ev.id}
                  className="flex flex-col justify-between rounded-xl bg-[#13171D] border border-[#222831] p-4 space-y-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {ev.thumbnailUrl && !failedImages[imgKey] ? (
                          <img
                            src={ev.thumbnailUrl}
                            alt={ev.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedImages((prev) => ({ ...prev, [imgKey]: true }))
                            }
                            className="h-14 w-14 rounded-lg object-cover border border-[#27303D] shrink-0"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-lg bg-[#1A2029] border border-[#27303D] flex items-center justify-center shrink-0">
                            <Calendar className="h-5 w-5 text-slate-400" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-white truncate">
                            {ev.title}
                          </h3>
                          <p className="text-xs text-slate-400 truncate">
                            {ev.categoryName}
                            {ev.endTime
                              ? ` · Até ${new Date(ev.endTime).toLocaleDateString('pt-BR')}`
                              : ''}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span
                              className={
                                ev.phase === 'live'
                                  ? 'text-[#53FC18] font-semibold'
                                  : 'text-slate-400'
                              }
                            >
                              {ev.phase === 'live'
                                ? 'AO VIVO'
                                : ev.phase === 'pre'
                                  ? `Inicia ${new Date(ev.startTime).toLocaleDateString('pt-BR')}`
                                  : 'Encerrado'}
                            </span>
                            {ev.numLivestreams > 0 && (
                              <span>
                                · {ev.numLivestreams}{' '}
                                {ev.numLivestreams === 1 ? 'live' : 'lives'} ·{' '}
                                {ev.viewCount.toLocaleString('pt-BR')} espectadores
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {isWatchingThisEvent && bot.running && (
                        <span className="text-[11px] font-mono font-semibold text-[#53FC18] whitespace-nowrap shrink-0">
                          AO VIVO NO BOT
                        </span>
                      )}
                    </div>

                    {ev.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {ev.description}
                      </p>
                    )}

                    {isExpanded && (
                      <div className="rounded-lg bg-[#0E1217] border border-[#202630] p-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="font-medium text-slate-300">
                            Canais transmitindo este evento agora
                          </span>
                          {isLoadingStreams && <span>Carregando...</span>}
                        </div>

                        {!isLoadingStreams && streams.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            Nenhuma transmissão listada neste momento para este evento.
                          </p>
                        ) : (
                          <div className="divide-y divide-[#1B212A]">
                            {streams.slice(0, 5).map((st) => (
                              <div
                                key={st.slug}
                                className="py-2 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">
                                    {st.username}
                                  </p>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {st.title}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-slate-300">
                                    <Users className="h-3 w-3 text-slate-400" />
                                    {st.viewerCount.toLocaleString('pt-BR')}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={enqueuingEventKey === `${ev.id}:${st.slug}`}
                                    onClick={() => handleTuneEvent(ev.id, st.slug)}
                                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#1B2430] border border-[#2B3748] text-white hover:border-[#53FC18] hover:text-[#53FC18] whitespace-nowrap"
                                  >
                                    Sintonizar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1D232C]">
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      Tempo AFK no evento: {formatAfkDuration(ev.watchedSeconds)}
                    </span>

                    <div className="flex items-center gap-2">
                      <a
                        href={`https://kick.com/events/${ev.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir ${ev.title} na Kick`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-[#1A2029] border border-[#28303D] hover:text-white whitespace-nowrap"
                      >
                        <span>Kick</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      {ev.phase === 'live' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleEventStreams(ev.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28303D] hover:bg-[#222935] whitespace-nowrap"
                          >
                            <Radio className="h-3 w-3 text-[#53FC18]" />
                            <span>Ver Lives</span>
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={
                              enqueuingEventKey === ev.id ||
                              (isWatchingThisEvent && bot.running)
                            }
                            onClick={() => handleTuneEvent(ev.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                              isWatchingThisEvent && bot.running
                                ? 'bg-[#17281A] border border-[#2D5E33] text-[#53FC18] cursor-default'
                                : 'bg-[#53FC18] text-[#081205] hover:bg-[#46DF12] disabled:opacity-60'
                            }`}
                          >
                            {isWatchingThisEvent && bot.running ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Sintonizado</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 fill-current" />
                                <span>
                                  {enqueuingEventKey === ev.id
                                    ? 'Buscando live...'
                                    : 'Sintonizar Evento'}
                                </span>
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Kick /drops/campaigns Section */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-xl bg-[#13171D] border border-[#222831] p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Campanhas Kick (/drops/campaigns)</h2>
              {dropsLastSyncedAt && (
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  · Sync {new Date(dropsLastSyncedAt).toLocaleTimeString('pt-BR')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Campanhas de drops oficiais ativas na Kick. O progresso acompanha em tempo real o tempo assistido pelo Bot AFK em canais elegíveis; resgate os itens no Inventário da Kick.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0D1014] border border-[#222831]">
              <button
                type="button"
                onClick={() => setCampaignFilter('active')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  campaignFilter === 'active'
                    ? 'bg-[#1D242E] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Ativas ({activeCampaignsCount})
              </button>
              <button
                type="button"
                onClick={() => setCampaignFilter('expired')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  campaignFilter === 'expired'
                    ? 'bg-[#1D242E] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Encerradas
              </button>
              <button
                type="button"
                onClick={() => setCampaignFilter('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  campaignFilter === 'all'
                    ? 'bg-[#1D242E] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todas
              </button>
            </div>

            <div className="relative w-48 sm:w-56">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                placeholder="Buscar jogo ou campanha"
                aria-label="Buscar campanhas de drops"
                className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500"
              />
            </div>

            <button
              type="button"
              onClick={handleRefreshDrops}
              disabled={refreshingDrops}
              aria-label="Atualizar campanhas de drops"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28303D] hover:bg-[#222935] whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingDrops ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>

            <a
              href="https://kick.com/drops/inventory"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28303D] hover:text-white whitespace-nowrap"
            >
              <span>Inventário Kick</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {filteredCampaigns.length === 0 ? (
          <div className="rounded-xl bg-[#13171D] border border-[#222831] p-12 text-center space-y-2">
            <Gift className="h-7 w-7 text-slate-500 mx-auto" />
            <p className="text-sm font-medium text-white">Nenhuma campanha encontrada</p>
            <p className="text-xs text-slate-400">
              Ajuste o filtro ou clique em Atualizar para sincronizar as campanhas da Kick.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredCampaigns.map((campaign) => {
              const eligibleNow = isChannelEligibleForCampaign(activeChannel, campaign);
              const progress = computeCampaignProgress(campaign.watchedSeconds, campaign.rewards);
              const thumbKey = `camp-${campaign.id}`;
              const thumbUrl = campaign.categoryImageUrl || campaign.organizationLogoUrl;

              return (
                <article
                  key={campaign.id}
                  className="flex flex-col justify-between rounded-xl bg-[#13171D] border border-[#222831] p-4 space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {thumbUrl && !failedImages[thumbKey] ? (
                          <img
                            src={thumbUrl}
                            alt={campaign.categoryName}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedImages((prev) => ({ ...prev, [thumbKey]: true }))
                            }
                            className="h-12 w-12 rounded-lg object-cover border border-[#27303D] shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-[#1A2029] border border-[#27303D] flex items-center justify-center shrink-0">
                            <Gift className="h-5 w-5 text-slate-400" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-white truncate">
                            {campaign.name}
                          </h3>
                          <p className="text-xs text-slate-400 truncate">
                            {campaign.categoryName} · {campaign.organizationName}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                            {campaign.status === 'active' ? 'Ativa' : 'Encerrada'} ·{' '}
                            {campaign.channelSlugs.length > 0
                              ? campaign.channelSlugs.length === 1
                                ? '1 canal participante'
                                : `${campaign.channelSlugs.length} canais participantes`
                              : 'Qualquer canal da categoria'}
                            {campaign.endsAt
                              ? ` · Fim ${new Date(campaign.endsAt).toLocaleDateString('pt-BR')}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      {eligibleNow && bot.running && (
                        <span className="text-[11px] font-mono font-semibold text-[#53FC18] whitespace-nowrap shrink-0">
                          FARMANDO AGORA
                        </span>
                      )}
                    </div>

                    {/* Rewards list with real-time progress bars */}
                    <div className="divide-y divide-[#1D232C] border-t border-b border-[#1D232C]">
                      {campaign.rewards.slice(0, 4).map((reward, idx) => {
                        const rp = progress.rewardProgress[idx];
                        const rKey = `rw-${reward.id}`;
                        return (
                          <div key={reward.id} className="py-2.5 flex items-center gap-3">
                            {reward.imageUrl && !failedImages[rKey] ? (
                              <img
                                src={reward.imageUrl}
                                alt={reward.name}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedImages((prev) => ({ ...prev, [rKey]: true }))
                                }
                                className="h-9 w-9 rounded-md object-contain bg-[#0D1014] border border-[#242B35] p-1 shrink-0"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded-md bg-[#0D1014] border border-[#242B35] flex items-center justify-center shrink-0">
                                <Gift className="h-4 w-4 text-slate-500" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-slate-200 truncate">
                                  {reward.name}
                                </span>
                                <span className="font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                                  {rp
                                    ? `${rp.earnedMinutes}/${rp.requiredMinutes} min (${rp.percent}%)`
                                    : `${reward.requiredMinutes} min`}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-[#1C222B] overflow-hidden">
                                <div
                                  className="h-full bg-[#53FC18] transition-all duration-300"
                                  style={{ width: `${rp?.percent || 0}%` }}
                                />
                              </div>
                            </div>

                            {rp?.completed && (
                              <CheckCircle2 className="h-4 w-4 text-[#53FC18] shrink-0" />
                            )}
                          </div>
                        );
                      })}
                      {campaign.rewards.length > 4 && (
                        <p className="py-2 text-[11px] text-slate-400">
                          + {campaign.rewards.length - 4} recompensas adicionais nesta campanha
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      Tempo AFK nesta campanha: {formatAfkDuration(campaign.watchedSeconds)}
                    </span>

                    <div className="flex items-center gap-2">
                      {campaign.connectUrl && (
                        <a
                          href={campaign.connectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-[#1A2029] border border-[#28303D] hover:text-white whitespace-nowrap"
                        >
                          <span>Vincular</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}

                      {campaign.status === 'active' && (
                        <button
                          type="button"
                          disabled={
                            enqueuingCampaignId === campaign.id ||
                            (eligibleNow && bot.running)
                          }
                          onClick={() => handleTuneCampaign(campaign.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                            eligibleNow && bot.running
                              ? 'bg-[#17281A] border border-[#2D5E33] text-[#53FC18] cursor-default'
                              : 'bg-[#53FC18] text-[#081205] hover:bg-[#46DF12] disabled:opacity-60'
                          }`}
                        >
                          {eligibleNow && bot.running ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Sintonizado</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 fill-current" />
                              <span>
                                {enqueuingCampaignId === campaign.id
                                  ? 'Buscando canal...'
                                  : 'Sintonizar Canal'}
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
