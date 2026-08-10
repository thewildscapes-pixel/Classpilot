import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Layers,
  Clock,
  Wrench,
  FileText,
  Activity,
  HardDrive,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface IntegrityLogItem {
  id: string;
  timestamp: string;
  status: 'HEALTHY' | 'MISMATCH_DETECTED' | 'AUTO_REPAIRED';
  issuesCount: number;
  autoRepaired: boolean;
  details: {
    checkedTablesCount?: number;
    checkedIndexesCount?: number;
    issues?: string[];
    repairs?: string[];
  };
}

interface IntegrityLogsResponse {
  healthStatus: 'HEALTHY' | 'MISMATCH_DETECTED' | 'AUTO_REPAIRED';
  lastRunTimestamp: string;
  totalChecksLogged: number;
  logs: IntegrityLogItem[];
}

export const AdminSqliteIntegrityView: React.FC = () => {
  const [data, setData] = useState<IntegrityLogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const fetchIntegrityLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/integrity-logs');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to fetch SQLite integrity logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrityLogs();
    // Auto refresh status every 30 seconds
    const timer = setInterval(fetchIntegrityLogs, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleRunManualAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await fetch('/api/admin/integrity-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoFix: true }),
      });

      if (res.ok) {
        const result = await res.json();
        await fetchIntegrityLogs();
        const auditRes = result.result;
        setNotice({
          title: 'Database Schema Audit Completed!',
          message: auditRes?.issuesCount === 0
            ? '✅ SQLite database structure is 100% verified with zero schema mismatches!'
            : `⚡ Verification finished: ${auditRes?.issuesCount} issue(s) evaluated, ${auditRes?.details?.repairs?.length || 0} auto-repair(s) executed.`,
          type: auditRes?.issuesCount === 0 ? 'success' : 'warning',
        });
      }
    } catch (err) {
      console.error('Audit execution error:', err);
      alert('Failed to trigger manual database audit.');
    } finally {
      setIsAuditing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% HEALTHY</span>
          </span>
        );
      case 'AUTO_REPAIRED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Wrench className="w-3.5 h-3.5" />
            <span>AUTO-REPAIRED</span>
          </span>
        );
      case 'MISMATCH_DETECTED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>MISMATCH DETECTED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
            <span>{status}</span>
          </span>
        );
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700/80 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-bold font-heading text-white">SQLite Database & Schema Integrity Checker</h2>
                  {data && getStatusBadge(data.healthStatus)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automated background process validating SQLite table structures, indexes, column specifications, and PRAGMA integrity every 5 minutes.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchIntegrityLogs}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium rounded-xl transition"
              title="Refresh log feed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleRunManualAudit}
              disabled={isAuditing}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg transition disabled:opacity-50"
            >
              <ShieldCheck className={`w-4 h-4 ${isAuditing ? 'animate-pulse' : ''}`} />
              <span>{isAuditing ? 'Auditing Schema...' : 'Run Immediate Schema Audit'}</span>
            </button>
          </div>
        </div>

        {/* Notice Alert */}
        {notice && (
          <div
            className={`p-3.5 rounded-xl border flex items-start justify-between text-xs ${
              notice.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <div>
              <p className="font-bold">{notice.title}</p>
              <p className="mt-0.5">{notice.message}</p>
            </div>
            <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white font-bold ml-4">
              ×
            </button>
          </div>
        )}

        {/* Quick System Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/50">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Tables Monitored</span>
            </div>
            <p className="text-lg font-bold text-white">8 System Tables</p>
            <p className="text-[10px] text-slate-400">Faculty, Routine, Students, etc.</p>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/50">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Index Coverage</span>
            </div>
            <p className="text-lg font-bold text-emerald-400">9 Active Indexes</p>
            <p className="text-[10px] text-slate-400">Optimized query execution</p>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/50">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Background Interval</span>
            </div>
            <p className="text-lg font-bold text-amber-300">Every 5 Minutes</p>
            <p className="text-[10px] text-slate-400">Automated SQLite checker</p>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/50">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span>Integrity Logs Kept</span>
            </div>
            <p className="text-lg font-bold text-purple-300">{data?.totalChecksLogged || 0} Reports</p>
            <p className="text-[10px] text-slate-400">Historical audit trail</p>
          </div>
        </div>
      </div>

      {/* Integrity Logs History Table */}
      <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-sm text-white font-heading">Schema Verification Audit Logs</h3>
          </div>
          <span className="text-xs text-slate-400">
            Last Audit: {data?.lastRunTimestamp ? new Date(data.lastRunTimestamp).toLocaleString() : 'N/A'}
          </span>
        </div>

        {isLoading && !data ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
            <p className="text-xs">Loading SQLite integrity verification logs...</p>
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No audit logs found yet. Click "Run Immediate Schema Audit" above to run an audit.
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const dateStr = new Date(log.timestamp).toLocaleString();
              const issues = log.details?.issues || [];
              const repairs = log.details?.repairs || [];

              return (
                <div
                  key={log.id}
                  className="bg-slate-900/70 rounded-xl border border-slate-700/60 overflow-hidden transition"
                >
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition"
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusBadge(log.status)}
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{dateStr}</p>
                        <p className="text-[11px] text-slate-400">
                          {log.issuesCount === 0
                            ? 'All 8 tables & 9 indexes passed structural integrity check.'
                            : `${log.issuesCount} schema mismatch(es) detected • ${repairs.length} auto-fix(es) applied.`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="text-[11px] text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                        {log.details?.checkedTablesCount || 8} Tables Verified
                      </span>
                      <button className="text-slate-400 hover:text-white">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-slate-950/80 border-t border-slate-800 space-y-3 text-xs">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                        <div className="p-2 bg-slate-900 rounded-lg">
                          <span className="text-slate-400 block">Monitored Tables</span>
                          <span className="font-bold text-slate-200">{log.details?.checkedTablesCount || 8}</span>
                        </div>
                        <div className="p-2 bg-slate-900 rounded-lg">
                          <span className="text-slate-400 block">Indexed Performance</span>
                          <span className="font-bold text-slate-200">{log.details?.checkedIndexesCount || 9}</span>
                        </div>
                        <div className="p-2 bg-slate-900 rounded-lg">
                          <span className="text-slate-400 block">Issues Found</span>
                          <span className="font-bold text-slate-200">{log.issuesCount}</span>
                        </div>
                        <div className="p-2 bg-slate-900 rounded-lg">
                          <span className="text-slate-400 block">Auto-Repairs Applied</span>
                          <span className="font-bold text-emerald-400">{repairs.length}</span>
                        </div>
                      </div>

                      {issues.length > 0 && (
                        <div className="space-y-1">
                          <p className="font-semibold text-rose-300 text-[11px]">Schema Mismatches / Warnings:</p>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-300 pl-1">
                            {issues.map((iss, idx) => (
                              <li key={idx} className="text-[11px]">
                                {iss}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {repairs.length > 0 && (
                        <div className="space-y-1">
                          <p className="font-semibold text-emerald-300 text-[11px]">Auto-Migration & Repair Actions Taken:</p>
                          <ul className="list-disc list-inside space-y-0.5 text-emerald-200 pl-1">
                            {repairs.map((rep, idx) => (
                              <li key={idx} className="text-[11px]">
                                {rep}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {issues.length === 0 && (
                        <p className="text-emerald-400 text-[11px] flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>PRAGMA structure check confirmed zero table alterations or index rebuilds required.</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
