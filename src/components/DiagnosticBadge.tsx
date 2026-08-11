import React, { useState } from 'react';
import { Database, ShieldCheck, AlertTriangle, Activity, X } from 'lucide-react';
import { TimetableEntry } from '../types';

interface DiagnosticBadgeProps {
  timetable: TimetableEntry[];
  className?: string;
  onPurgeMockData?: () => void;
}

export const DiagnosticBadge: React.FC<DiagnosticBadgeProps> = ({
  timetable,
  className = '',
  onPurgeMockData,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const isMock = React.useMemo(() => {
    if (!timetable || timetable.length === 0) return true;
    return timetable.every(
      (e) =>
        e.id &&
        (e.id.startsWith('tt_dg_') || e.id.startsWith('tt_jb_') || e.id.startsWith('tt_rs_'))
    );
  }, [timetable]);

  const recordCount = timetable ? timetable.length : 0;

  return (
    <div className={`relative inline-block text-left ${className}`}>
      {/* Badge Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={isMock ? 'Fallback Mock Data Active' : 'Live Backend Database Active'}
        className={`group flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-sm transition-all duration-200 focus:outline-none ${
          isMock
            ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:border-emerald-500/50'
        }`}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isMock ? 'bg-amber-400' : 'bg-emerald-400'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isMock ? 'bg-amber-400' : 'bg-emerald-400'
            }`}
          />
        </span>

        <Database className="w-3.5 h-3.5" />

        <span className="font-mono text-[11px] tracking-wide">
          {isMock ? 'MOCK DATA' : 'BACKEND DB'}
        </span>

        <span
          className={`px-1.5 py-0.2 text-[10px] rounded-md font-bold ${
            isMock ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'
          }`}
        >
          {recordCount}
        </span>
      </button>

      {/* Popover / Overlay Card */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-4 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-slate-100">Dataset Provenance</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-2.5">
            <div className="flex items-start space-x-2.5 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
              {isMock ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-semibold text-slate-100 block">
                  {isMock ? 'Fallback Mock Data Active' : 'Live Database Connected'}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  {isMock
                    ? 'The application is currently utilizing default seed mock entries (INITIAL_TIMETABLE). Upload or update routines in the Admin panel to sync custom database records.'
                    : 'The current timetable state is loaded from the live backend database (Firestore & Express SQLite store).'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Records</span>
                <span className="font-mono font-bold text-white text-sm">{recordCount}</span>
              </div>
              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                <span
                  className={`font-mono font-bold text-xs ${
                    isMock ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {isMock ? 'MOCK_SEED' : 'LIVE_SYNC'}
                </span>
              </div>
            </div>

            {onPurgeMockData && (
              <button
                type="button"
                onClick={() => {
                  onPurgeMockData();
                  setIsOpen(false);
                }}
                className="w-full mt-2 py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Purge Default Seed Data & Keep Custom Only</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
