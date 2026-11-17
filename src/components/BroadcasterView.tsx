import { Play, Radio, Square } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { formatAfkDuration } from '../lib/afkEngine';
import type { BroadcasterConfig } from '../types/kick';

interface BroadcasterViewProps {
  broadcaster: BroadcasterConfig;
  onStartBroadcaster: (payload: {
    mode: BroadcasterConfig['mode'];
    sceneId: BroadcasterConfig['sceneId'];
    overlayText: string;
    resolution: BroadcasterConfig['resolution'];
    fps: BroadcasterConfig['fps'];
    bitrateKbps: BroadcasterConfig['bitrateKbps'];
    rtmpUrl?: string;
    streamKey?: string;
  }) => Promise<void>;
  onStopBroadcaster: () => Promise<void>;
}

const SCENES: Array<{
  id: BroadcasterConfig['sceneId'];
  label: string;
  subtitle: string;
  imageUrl: string;
}> = [
  {
    id: 'night-desk',
    label: 'Estúdio Noturno',
    subtitle: 'Setup minimalista com luz ambiente esmeralda',
    imageUrl: '/src/assets/images/afk_scene_night_desk_1794954955043.jpg',
  },
  {
    id: 'rain-window',
    label: 'Chuva na Cidade',
    subtitle: 'Janela noturna estilo lo-fi 24/7',
    imageUrl: '/src/assets/images/afk_scene_rain_window_1794954954766.jpg',
  },
  {
    id: 'synth-rack',
    label: 'Console de Áudio',
    subtitle: 'Mesa de transmissão industrial em alumínio',
    imageUrl: '/src/assets/images/afk_scene_synth_rack_1794954955617.jpg',
  },
];

export function BroadcasterView({
  broadcaster,
  onStartBroadcaster,
  onStopBroadcaster,
}: BroadcasterViewProps) {
  const [mode, setMode] = useState<BroadcasterConfig['mode']>(broadcaster.mode);
  const [sceneId, setSceneId] = useState<BroadcasterConfig['sceneId']>(broadcaster.sceneId);
  const [overlayText, setOverlayText] = useState(broadcaster.overlayText);
  const [resolution, setResolution] = useState<BroadcasterConfig['resolution']>(
    broadcaster.resolution,
  );
  const [fps, setFps] = useState<BroadcasterConfig['fps']>(broadcaster.fps);
  const [bitrateKbps, setBitrateKbps] = useState<BroadcasterConfig['bitrateKbps']>(
    broadcaster.bitrateKbps,
  );
  const [rtmpUrl, setRtmpUrl] = useState(broadcaster.rtmpUrl);
  const [streamKey, setStreamKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeScene = SCENES.find((s) => s.id === sceneId) || SCENES[0];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onStartBroadcaster({
        mode,
        sceneId,
        overlayText,
        resolution,
        fps,
        bitrateKbps,
        rtmpUrl: mode === 'rtmp' ? rtmpUrl : undefined,
        streamKey: mode === 'rtmp' && streamKey.trim() ? streamKey.trim() : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar transmissão FFmpeg.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 cols: Live visual preview & real FFmpeg telemetry */}
        <section className="xl:col-span-7 flex flex-col rounded-xl bg-[#13171D] border border-[#222831] overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[#222831]">
            <div>
              <h2 className="text-sm font-semibold text-white">Prévia da Transmissão AFK 24/7</h2>
              <p className="text-xs text-slate-400">
                Loop H.264 + AAC gerado em tempo real pelo servidor via FFmpeg
              </p>
            </div>
            <span
              className={`text-xs font-mono font-semibold ${
                broadcaster.running ? 'text-[#53FC18]' : 'text-slate-400'
              }`}
            >
              {broadcaster.running
                ? broadcaster.mode === 'rtmp'
                  ? 'TRANSMITINDO RTMP'
                  : 'TESTE LOCAL ATIVO'
                : 'PARADO'}
            </span>
          </div>

          <div className="relative aspect-video bg-[#090C0F] overflow-hidden">
            <img
              src={activeScene.imageUrl}
              alt={activeScene.label}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg bg-black/65 border border-white/15 text-center max-w-[90%]">
              <p className="text-sm sm:text-base font-semibold text-white truncate">
                {overlayText || 'Live AFK 24/7'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#222831] bg-[#101419] border-t border-[#222831]">
            <div className="p-3.5">
              <p className="text-[11px] text-slate-400">Tempo no Ar</p>
              <p className="mt-1 text-sm font-mono font-semibold tabular-nums text-white">
                {formatAfkDuration(broadcaster.elapsedSeconds)}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-[11px] text-slate-400">Frames Codificados</p>
              <p className="mt-1 text-sm font-mono font-semibold tabular-nums text-white">
                {broadcaster.framesEncoded.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-[11px] text-slate-400">Taxa Real (FPS)</p>
              <p className="mt-1 text-sm font-mono font-semibold tabular-nums text-white">
                {broadcaster.currentFps.toFixed(1)} fps
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-[11px] text-slate-400">Bitrate Real</p>
              <p className="mt-1 text-sm font-mono font-semibold tabular-nums text-white truncate">
                {broadcaster.currentBitrate === 'N/A'
                  ? `${broadcaster.bitrateKbps} kbps (teste)`
                  : broadcaster.currentBitrate}
              </p>
            </div>
          </div>
        </section>

        {/* Right 5 cols: Configuration form */}
        <section className="xl:col-span-5 rounded-xl bg-[#13171D] border border-[#222831] p-5 flex flex-col justify-between">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Configurar Live 24/7 AFK</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Escolha o cenário, o texto exibido e o destino da transmissão.
              </p>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">Cenário em Loop</span>
              <div className="grid grid-cols-3 gap-2">
                {SCENES.map((scene) => {
                  const selected = scene.id === sceneId;
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => setSceneId(scene.id)}
                      className={`text-left rounded-lg overflow-hidden border transition-colors ${
                        selected
                          ? 'border-[#53FC18] bg-[#18211A]'
                          : 'border-[#252C37] bg-[#0F1318] hover:border-slate-500'
                      }`}
                    >
                      <img
                        src={scene.imageUrl}
                        alt={scene.label}
                        referrerPolicy="no-referrer"
                        className="w-full aspect-video object-cover"
                      />
                      <p className="px-2 py-1.5 text-[11px] font-medium text-white truncate">
                        {scene.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="overlay-text" className="block text-xs font-medium text-slate-300">
                Texto do Overlay na Tela
              </label>
              <input
                id="overlay-text"
                type="text"
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                maxLength={80}
                placeholder="Ex: Live AFK 24/7 — Volto logo"
                className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#53FC18]"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="space-y-1.5">
                <label htmlFor="res-select" className="block text-xs font-medium text-slate-300">
                  Resolução
                </label>
                <select
                  id="res-select"
                  value={resolution}
                  onChange={(e) =>
                    setResolution(e.target.value === '1920x1080' ? '1920x1080' : '1280x720')
                  }
                  className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] px-2.5 py-2 text-xs text-white"
                >
                  <option value="1280x720">720p</option>
                  <option value="1920x1080">1080p</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="fps-select" className="block text-xs font-medium text-slate-300">
                  FPS
                </label>
                <select
                  id="fps-select"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value) === 60 ? 60 : 30)}
                  className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] px-2.5 py-2 text-xs font-mono text-white"
                >
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="bitrate-select" className="block text-xs font-medium text-slate-300">
                  Bitrate
                </label>
                <select
                  id="bitrate-select"
                  value={bitrateKbps}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setBitrateKbps(val === 4500 || val === 6000 ? val : 2500);
                  }}
                  className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] px-2.5 py-2 text-xs font-mono text-white"
                >
                  <option value={2500}>2500 kbps</option>
                  <option value={4500}>4500 kbps</option>
                  <option value={6000}>6000 kbps</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">Destino do Stream</span>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#0D1014] border border-[#222831]">
                <button
                  type="button"
                  onClick={() => setMode('dry-run')}
                  className={`py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === 'dry-run' ? 'bg-[#1D242E] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Teste Local (FFmpeg)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('rtmp')}
                  className={`py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === 'rtmp' ? 'bg-[#1D242E] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Kick RTMP Ao Vivo
                </button>
              </div>
            </div>

            {mode === 'rtmp' && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label htmlFor="rtmp-url" className="block text-xs font-medium text-slate-300">
                    URL de Ingestão RTMP da Kick
                  </label>
                  <input
                    id="rtmp-url"
                    type="text"
                    value={rtmpUrl}
                    onChange={(e) => setRtmpUrl(e.target.value)}
                    placeholder="rtmps://fa723fc1b171.global-contribute.live-video.net/app/"
                    className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] px-3 py-2 font-mono text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="stream-key" className="block text-xs font-medium text-slate-300">
                    Chave de Transmissão (Stream Key)
                  </label>
                  <input
                    id="stream-key"
                    type="password"
                    value={streamKey}
                    onChange={(e) => setStreamKey(e.target.value)}
                    placeholder={
                      broadcaster.hasStreamKey
                        ? 'Chave carregada na sessão (digite para substituir)'
                        : 'Cole sua Stream Key do painel da Kick'
                    }
                    className="w-full rounded-lg bg-[#0D1014] border border-[#262D38] px-3 py-2 font-mono text-xs text-white"
                  />
                </div>
              </div>
            )}

            {(error || broadcaster.lastError) && (
              <div
                role="alert"
                className="rounded-lg bg-red-950/40 border border-red-900/50 px-3 py-2 text-xs text-red-200"
              >
                {error || broadcaster.lastError}
              </div>
            )}

            <div className="pt-2 flex items-center gap-3">
              {broadcaster.running ? (
                <button
                  type="button"
                  onClick={onStopBroadcaster}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#DC2626] hover:bg-[#B91C1C] text-white whitespace-nowrap"
                >
                  <Square className="h-4 w-4 fill-current" />
                  <span>Parar Transmissão</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#53FC18] hover:bg-[#46DF12] text-[#081205] disabled:opacity-60 whitespace-nowrap"
                >
                  {mode === 'rtmp' ? (
                    <Radio className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4 fill-current" />
                  )}
                  <span>
                    {submitting
                      ? 'Iniciando FFmpeg...'
                      : mode === 'rtmp'
                        ? 'Transmitir Live AFK na Kick'
                        : 'Iniciar Transmissão Teste'}
                  </span>
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
