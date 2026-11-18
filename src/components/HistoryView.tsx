import { AlertTriangle, CheckCircle2, Info, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { ActivityLogEntry } from '../types/kick';

interface HistoryViewProps {
  logs: ActivityLogEntry[];
  onClearLogs: () => Promise<void>;
}

type CategoryFilter = 'all' | ActivityLogEntry['category'];

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'Todos',
  watcher: 'Watcher',
  failover: 'Failover',
  chat: 'Chat',
  drops: 'Eventos/Drops',
  oauth: 'Conta Kick',
  broadcaster: 'Transmissor',
};

export function HistoryView({ logs, onClearLogs }: HistoryViewProps) {
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const filtered =
    filter === 'all' ? logs : logs.filter((entry) => entry.category === filter);

  return (
    <section className="rounded-xl bg-[#13171D] border border-[#222831] overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-[#222831]">
        <div className="flex items-center gap-1 flex-wrap p-0.5 rounded-lg bg-[#0D1014] border border-[#222831]">
          {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                filter === cat ? 'bg-[#1D242E] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClearLogs}
          disabled={logs.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-[#1A2029] border border-[#28303D] hover:text-white disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Limpar Histórico</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center space-y-2">
          <p className="text-sm font-medium text-white">Nenhum evento registrado</p>
          <p className="text-xs text-slate-400">
            As ações do Bot AFK, trocas de canal e transmissões aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#222831] text-[11px] font-medium text-slate-400">
                <th className="py-2.5 px-4">Horário</th>
                <th className="py-2.5 px-4">Módulo</th>
                <th className="py-2.5 px-4">Nível</th>
                <th className="py-2.5 px-4">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C222B] text-xs">
              {filtered.map((entry) => {
                const Icon =
                  entry.level === 'success'
                    ? CheckCircle2
                    : entry.level === 'warning'
                      ? AlertTriangle
                      : entry.level === 'error'
                        ? XCircle
                        : Info;
                const levelColor =
                  entry.level === 'success'
                    ? 'text-[#53FC18]'
                    : entry.level === 'warning'
                      ? 'text-amber-400'
                      : entry.level === 'error'
                        ? 'text-red-400'
                        : 'text-slate-300';

                return (
                  <tr key={entry.id} className="hover:bg-[#171C24]">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">
                      {CATEGORY_LABELS[entry.category]}
                    </td>
                    <td className={`py-2.5 px-4 whitespace-nowrap ${levelColor}`}>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Icon className="h-3.5 w-3.5" />
                        <span>
                          {entry.level === 'success'
                            ? 'Sucesso'
                            : entry.level === 'warning'
                              ? 'Aviso'
                              : entry.level === 'error'
                                ? 'Erro'
                                : 'Info'}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-200">{entry.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
