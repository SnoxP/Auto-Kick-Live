import { Compass, Gift, History, LogIn, LogOut, Menu, Radio, Tv, X } from 'lucide-react';
import type { KickUserSession, NavTab } from '../types/kick';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: KickUserSession | null;
  botRunning: boolean;
  broadcasterRunning: boolean;
  onOpenLoginModal: () => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof Tv }> = [
  { id: 'watcher', label: 'Bot Watcher AFK', icon: Tv },
  { id: 'discover', label: 'Descobrir Lives', icon: Compass },
  { id: 'drops', label: 'Eventos e Drops', icon: Gift },
  { id: 'broadcaster', label: 'Transmissor 24/7', icon: Radio },
  { id: 'history', label: 'Histórico', icon: History },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  user,
  botRunning,
  broadcasterRunning,
  onOpenLoginModal,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-[#11151B] border-r border-[#222831] p-4">
      <div>
        <div className="flex items-center justify-between px-2 py-2 mb-6">
          <a
            href="#watcher"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('watcher');
              onCloseMobile();
            }}
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#53FC18] text-[#081205] font-extrabold text-sm">
              K
            </span>
            <span>KickAFK</span>
          </a>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fechar menu lateral"
            className="lg:hidden rounded-md p-2 text-slate-400 hover:bg-[#1B212A] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Navegação principal" className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isItemLive =
              (item.id === 'watcher' && botRunning) ||
              (item.id === 'broadcaster' && broadcasterRunning);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#1B212A] text-white border border-[#2C3542]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#161B22] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#53FC18]' : 'text-slate-400'}`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {isItemLive && (
                  <span className="text-[11px] font-mono font-semibold text-[#53FC18] shrink-0">
                    ATIVO
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-[#222831]">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-2">
              {user.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={`Avatar de ${user.username}`}
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 rounded-lg object-cover border border-[#2C3542] shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-lg bg-[#1D261C] border border-[#344A2E] flex items-center justify-center text-sm font-bold text-[#53FC18] shrink-0">
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{user.username}</p>
                <p className="text-xs text-slate-400 truncate">Conta Kick conectada</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-[#171C23] border border-[#262D38] hover:bg-[#1E252E] hover:text-white transition-colors whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Desconectar Kick</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="px-1 text-xs text-slate-400 leading-relaxed">
              Conecte sua conta Kick para habilitar respostas automáticas no chat enquanto estiver AFK.
            </p>
            <button
              type="button"
              onClick={() => {
                onOpenLoginModal();
                onCloseMobile();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold text-[#081205] bg-[#53FC18] hover:bg-[#46DF12] transition-colors whitespace-nowrap"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Conectar Conta Kick</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[248px] shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[264px] max-w-[85vw] h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}

export function MobileMenuTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir menu de navegação"
      className="lg:hidden rounded-lg p-2 text-slate-300 bg-[#161B22] border border-[#242A33] hover:text-white shrink-0"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
