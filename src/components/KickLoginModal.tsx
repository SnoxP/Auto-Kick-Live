import { Check, Copy, ExternalLink, KeyRound, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { KickUserSession } from '../types/kick';

interface KickLoginModalProps {
  open: boolean;
  onClose: () => void;
  oauthConfigured: boolean;
  callbackUrl: string;
  user: KickUserSession | null;
  onAuthSuccess: () => void;
  onLogout: () => void;
}

export function KickLoginModal({
  open,
  onClose,
  oauthConfigured,
  callbackUrl,
  user,
  onAuthSuccess,
  onLogout,
}: KickLoginModalProps) {
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return;
      }
      if (event.data?.type === 'KICK_OAUTH_SUCCESS') {
        setError(null);
        onAuthSuccess();
        onClose();
      } else if (event.data?.type === 'KICK_OAUTH_ERROR') {
        setError(event.data?.error || 'Falha na autenticação com a Kick.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthSuccess, onClose]);

  if (!open) {
    return null;
  }

  const effectiveCallback =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/kick/callback` : callbackUrl;

  const handleConnectKick = async () => {
    setError(null);
    setLoadingUrl(true);
    try {
      const res = await fetch(
        `/api/auth/kick/url?origin=${encodeURIComponent(window.location.origin)}`,
      );
      if (!res.ok) {
        throw new Error('Não foi possível gerar a URL de login da Kick.');
      }
      const data = (await res.json()) as { configured: boolean; url: string | null };
      if (!data.configured || !data.url) {
        setError(
          'O aplicativo OAuth da Kick ainda não possui KICK_CLIENT_ID e KICK_CLIENT_SECRET configurados nas variáveis de ambiente.',
        );
        return;
      }

      const popup = window.open(data.url, 'kick_oauth_popup', 'width=580,height=720');
      if (!popup) {
        setError(
          'O navegador bloqueou o popup de login da Kick. Permita popups para este site e tente novamente.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar login na Kick.');
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleCopyCallback = async () => {
    try {
      await navigator.clipboard.writeText(effectiveCallback);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kick-oauth-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-[#13171D] border border-[#252C37] p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="kick-oauth-title" className="text-lg font-semibold text-white">
              Conectar Conta da Plataforma Kick
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Autenticação oficial OAuth 2.1 (PKCE) via id.kick.com
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de login Kick"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1E252E] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3.5 rounded-lg bg-[#181E26] border border-[#293240] p-4">
              {user.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={user.username}
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-lg object-cover border border-[#323C4B]"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-[#1D261C] border border-[#344A2E] flex items-center justify-center text-base font-bold text-[#53FC18]">
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-white truncate">{user.username}</p>
                <p className="text-xs text-slate-400">
                  ID {user.userId} · Permissões: {user.scopes.join(' · ')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-[#1B212A] hover:text-white"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C]"
              >
                Desconectar Conta
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-[#171C24] border border-[#242C38] p-4 space-y-2.5 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-white font-medium">
                <ShieldCheck className="h-4 w-4 text-[#53FC18]" />
                <span>Permissões solicitadas no login oficial</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                user:read (identificar seu usuário) · channel:read (ler status da sua live) · chat:write (enviar respostas AFK automáticas pelo bot)
              </p>
            </div>

            {!oauthConfigured && (
              <div className="rounded-lg bg-[#1A1D21] border border-[#3B3322] p-4 space-y-3 text-xs text-slate-300">
                <div className="flex items-center gap-2 font-semibold text-amber-400">
                  <KeyRound className="h-4 w-4 shrink-0" />
                  <span>Configuração pendente para login direto via Kick OAuth</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Para habilitar o botão de login oficial da Kick nesta instância, cadastre um App no Portal de Desenvolvedores da Kick usando esta URL de Callback e adicione <code className="font-mono text-slate-200">KICK_CLIENT_ID</code> e <code className="font-mono text-slate-200">KICK_CLIENT_SECRET</code> nas configurações do servidor:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={effectiveCallback}
                    aria-label="URL de Callback OAuth da Kick"
                    className="flex-1 rounded-md bg-[#0E1217] border border-[#262E3A] px-2.5 py-1.5 font-mono text-xs text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={handleCopyCallback}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#212834] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2B3444] whitespace-nowrap shrink-0"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-[#53FC18]" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                <p className="text-slate-400">
                  Enquanto isso, você já pode usar o Bot Watcher AFK, o chat em tempo real via WebSocket e o Transmissor 24/7 normalmente.
                </p>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-red-950/50 border border-red-800/60 px-3.5 py-2.5 text-xs text-red-200"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <a
                href="https://kick.com/settings/developer"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
              >
                <span>Portal Developer da Kick</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-[#1B212A] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConnectKick}
                  disabled={loadingUrl || !oauthConfigured}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-[#081205] bg-[#53FC18] hover:bg-[#46DF12] disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {loadingUrl ? 'Abrindo Kick...' : 'Entrar com Kick.com'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
