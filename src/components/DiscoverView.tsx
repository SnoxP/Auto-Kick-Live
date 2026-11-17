import { Check, Plus, RefreshCw, Search, Tv } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ChannelItem, FeaturedStream } from '../types/kick';

interface DiscoverViewProps {
  queuedChannels: ChannelItem[];
  onAddChannel: (slug: string) => Promise<void>;
}

export function DiscoverView({ queuedChannels, onAddChannel }: DiscoverViewProps) {
  const [lang, setLang] = useState<'pt' | 'en'>('pt');
  const [streams, setStreams] = useState<FeaturedStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addingSlug, setAddingSlug] = useState<string | null>(null);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  const loadStreams = useCallback(async (selectedLang: 'pt' | 'en') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kick/featured?lang=${selectedLang}`);
      const data = (await res.json()) as { streams?: FeaturedStream[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar lives em destaque da Kick.');
      }
      setStreams(data.streams || []);
      setFailedThumbs({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar Kick.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStreams(lang);
  }, [lang, loadStreams]);

  const queuedSet = new Set(queuedChannels.map((c) => c.slug));
  const filtered = streams.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.displayName.toLowerCase().includes(q) ||
      s.sessionTitle.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  });

  const handleEnqueue = async (slug: string) => {
    setAddingSlug(slug);
    try {
      await onAddChannel(slug);
    } finally {
      setAddingSlug(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl bg-[#13171D] border border-[#222831] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0D1014] border border-[#222831]">
            <button
              type="button"
              onClick={() => setLang('pt')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                lang === 'pt' ? 'bg-[#1D242E] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Lives PT-BR
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                lang === 'en' ? 'bg-[#1D242E] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Lives Globais (EN)
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadStreams(lang)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-[#1A2029] border border-[#28303D] hover:bg-[#222935] whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar streamer ou categoria"
            aria-label="Filtrar lives ao vivo"
            className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#53FC18]"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-950/40 border border-red-900/50 p-4 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-[#13171D] border border-[#222831] overflow-hidden animate-pulse"
            >
              <div className="aspect-video bg-[#1B212A]" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-2/3 rounded bg-[#1E2530]" />
                <div className="h-3 w-1/2 rounded bg-[#1A2029]" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-[#13171D] border border-[#222831] p-12 text-center space-y-2">
          <Tv className="h-7 w-7 text-slate-500 mx-auto" />
          <p className="text-sm font-medium text-white">Nenhuma live encontrada</p>
          <p className="text-xs text-slate-400">
            Tente outro termo de busca ou altere o idioma das transmissões.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((stream) => {
            const inQueue = queuedSet.has(stream.slug);
            const showThumb = Boolean(stream.thumbnailUrl) && !failedThumbs[stream.slug];
            return (
              <article
                key={stream.slug}
                className="flex flex-col rounded-xl bg-[#13171D] border border-[#222831] overflow-hidden"
              >
                <div className="relative aspect-video bg-[#0B0E11] overflow-hidden">
                  {showThumb ? (
                    <img
                      src={stream.thumbnailUrl!}
                      alt={stream.sessionTitle}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedThumbs((prev) => ({ ...prev, [stream.slug]: true }))
                      }
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#18202B] to-[#0D1014]">
                      <Tv className="h-7 w-7 text-slate-500" />
                      <span className="text-xs font-medium text-slate-400">{stream.displayName}</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-xs text-white">
                    <span className="font-semibold text-[#53FC18]">AO VIVO</span>
                    <span className="font-mono tabular-nums">
                      {stream.viewerCount.toLocaleString('pt-BR')} viewers
                    </span>
                  </div>
                </div>

                <div className="flex-1 p-4 flex flex-col justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white line-clamp-1">
                      {stream.displayName}
                    </h3>
                    <p className="text-xs text-slate-300 line-clamp-2">{stream.sessionTitle}</p>
                    <p className="text-xs text-slate-400">{stream.category}</p>
                  </div>

                  <button
                    type="button"
                    disabled={inQueue || addingSlug === stream.slug}
                    onClick={() => handleEnqueue(stream.slug)}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      inQueue
                        ? 'bg-[#192418] text-[#53FC18] border border-[#2E482B]'
                        : 'bg-[#1D242E] text-white hover:bg-[#27303D] border border-[#2D3746]'
                    }`}
                  >
                    {inQueue ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Na Fila AFK</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        <span>
                          {addingSlug === stream.slug ? 'Adicionando...' : 'Adicionar à Fila'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
