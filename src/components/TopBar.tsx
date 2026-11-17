import { LogIn, Play, Square, UserCheck } from 'lucide-react';
import type { KickUserSession, NavTab } from '../types/kick';
import { MobileMenuTrigger } from './Sidebar';

interface TopBarProps {
  activeTab: NavTab;
  user: KickUserSession | null;
  botRunning: boolean;
  onToggleBot: () => void;
  onOpenLoginModal: () => void;
  onOpenMobileMenu: () => void;
  busy: boolean;
}

const TAB_TITLES: Record<NavTab, string> = {
  watcher: 'Bot Watcher AFK',
  discover: 'Descobrir Lives',
  broadcaster: 'Transmissor 24/7 AFK',
  history: 'Histórico e Eventos',
};

export function TopBar({
  activeTab,
  user,
  botRunning,
  onToggleBot,
  onOpenLoginModal,
  onOpenMobileMenu,
  busy,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-[#0B0E11]/95 backdrop-blur border-b border-[#222831] px-4 sm:px-6 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuTrigger onClick={onOpenMobileMenu} />
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-400 hidden sm:inline whitespace-nowrap">KickAFK</span>
            <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
              /
            </span>
            <h1 className="text-base sm:text-lg font-semibold text-white truncate">
              {TAB_TITLES[activeTab]}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenLoginModal}
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-200 bg-[#151A21] border border-[#252C37] hover:bg-[#1C222B] hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            {user ? (
              <>
                <UserCheck className="h-3.5 w-3.5 text-[#53FC18]" />
                <span>{user.username}</span>
              </>
            ) : (
              <>
                <LogIn className="h-3.5 w-3.5 text-slate-400" />
                <span>Login Kick</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleBot}
            disabled={busy}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
              botRunning
                ? 'bg-[#DC2626] hover:bg-[#B91C1C] text-white'
                : 'bg-[#53FC18] hover:bg-[#46DF12] text-[#081205]'
            }`}
          >
            {botRunning ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Parar Bot AFK</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Iniciar Bot AFK</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
