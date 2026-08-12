import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Faculty, TimetableEntry, FacultySelfImportRecord } from '../types';
import { isFacultyNameMatch } from '../utils/timeUtils';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  UserCheck,
  UserX,
  Eye,
  History,
  Info,
  RefreshCw,
  FileText,
  Building,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';

interface AdminFacultySelfImportsViewProps {
  facultyList: Faculty[];
  masterTimetable: TimetableEntry[];
  selfImportRecords: FacultySelfImportRecord[];
  onRefreshSelfImports?: () => void;
}

interface DiscrepancyItem {
  type: 'mismatched_room' | 'mismatched_time' | 'subject_diff' | 'self_import_only' | 'master_only';
  day: string;
  timeStr: string;
  description: string;
  selfEntry?: TimetableEntry;
  masterEntry?: TimetableEntry;
}

export const AdminFacultySelfImportsView: React.FC<AdminFacultySelfImportsViewProps> = ({
  facultyList,
  masterTimetable,
  selfImportRecords,
  onRefreshSelfImports,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'imported' | 'pending'>('all');
  const [selectedFacultyForView, setSelectedFacultyForView] = useState<Faculty | null>(null);

  // Map self imports by faculty identity
  const selfImportsMap = useMemo(() => {
    const map = new Map<string, FacultySelfImportRecord>();
    selfImportRecords.forEach((rec) => {
      if (rec.facultyId) map.set(rec.facultyId.toLowerCase(), rec);
      if (rec.facultyName) {
        const key = rec.facultyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        map.set(key, rec);
      }
    });
    return map;
  }, [selfImportRecords]);

  // Merge registered faculty list with any additional self-imported faculty records
  const allFacultyOverview = useMemo(() => {
    const list: Array<{
      fac: Faculty;
      importRecord: FacultySelfImportRecord | null;
      masterEntries: TimetableEntry[];
      selfEntries: TimetableEntry[];
      discrepancies: DiscrepancyItem[];
    }> = [];

    const processedKeys = new Set<string>();

    facultyList.forEach((f) => {
      const key = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      processedKeys.add(key);

      const importRecord =
        selfImportsMap.get(f.id.toLowerCase()) ||
        selfImportsMap.get(key) ||
        selfImportRecords.find((r) => isFacultyNameMatch(r.facultyName, f.name)) ||
        null;

      const masterEntries = masterTimetable.filter(
        (e) => (e.facultyId && e.facultyId === f.id) || isFacultyNameMatch(e.facultyName, f.name)
      );

      const selfEntries = importRecord ? importRecord.entries || [] : [];

      // Calculate discrepancies
      const discrepancies: DiscrepancyItem[] = [];

      selfEntries.forEach((s) => {
        const matchInMaster = masterEntries.find(
          (m) =>
            m.day.toLowerCase() === s.day.toLowerCase() &&
            m.startTime === s.startTime
        );

        if (!matchInMaster) {
          discrepancies.push({
            type: 'self_import_only',
            day: s.day,
            timeStr: `${s.startTime} - ${s.endTime}`,
            description: `Self-imported class "${s.subjectName}" (${s.room}) is NOT present in Master Routine.`,
            selfEntry: s,
          });
        } else {
          if (matchInMaster.room !== s.room) {
            discrepancies.push({
              type: 'mismatched_room',
              day: s.day,
              timeStr: `${s.startTime} - ${s.endTime}`,
              description: `Room mismatch: Self-import specifies "${s.room}", Master Routine specifies "${matchInMaster.room}".`,
              selfEntry: s,
              masterEntry: matchInMaster,
            });
          }
          if (matchInMaster.subjectName.toLowerCase() !== s.subjectName.toLowerCase()) {
            discrepancies.push({
              type: 'subject_diff',
              day: s.day,
              timeStr: `${s.startTime} - ${s.endTime}`,
              description: `Subject mismatch: Self-import says "${s.subjectName}", Master says "${matchInMaster.subjectName}".`,
              selfEntry: s,
              masterEntry: matchInMaster,
            });
          }
        }
      });

      // Find classes in master but missing from self-import
      masterEntries.forEach((m) => {
        const matchInSelf = selfEntries.find(
          (s) =>
            s.day.toLowerCase() === m.day.toLowerCase() &&
            s.startTime === m.startTime
        );
        if (!matchInSelf && selfEntries.length > 0) {
          discrepancies.push({
            type: 'master_only',
            day: m.day,
            timeStr: `${m.startTime} - ${m.endTime}`,
            description: `Class "${m.subjectName}" (${m.room}) exists in Master Routine but omitted from Self-Import.`,
            masterEntry: m,
          });
        }
      });

      list.push({
        fac: f,
        importRecord,
        masterEntries,
        selfEntries,
        discrepancies,
      });
    });

    // Handle extra records in selfImportsRecords not in facultyList
    selfImportRecords.forEach((rec) => {
      const key = rec.facultyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        const fac: Faculty = {
          id: rec.facultyId || `fac_${key}`,
          name: rec.facultyName,
          email: rec.email || '',
          department: rec.department || 'Commerce',
          designation: 'Faculty Member',
          phone: rec.phone || '',
          employeeId: rec.employeeId || '',
          isVerified: true,
        };

        const masterEntries = masterTimetable.filter((e) => isFacultyNameMatch(e.facultyName, rec.facultyName));
        const selfEntries = rec.entries || [];

        list.push({
          fac,
          importRecord: rec,
          masterEntries,
          selfEntries,
          discrepancies: [],
        });
      }
    });

    return list;
  }, [facultyList, masterTimetable, selfImportRecords, selfImportsMap]);

  // Filtered roster
  const filteredRoster = useMemo(() => {
    return allFacultyOverview.filter((item) => {
      const nameMatch =
        item.fac.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.fac.department.toLowerCase().includes(searchTerm.toLowerCase());

      if (!nameMatch) return false;

      if (filterStatus === 'imported') return Boolean(item.importRecord);
      if (filterStatus === 'pending') return !item.importRecord;
      return true;
    });
  }, [allFacultyOverview, searchTerm, filterStatus]);

  // Summary counts
  const totalFacultyCount = allFacultyOverview.length;
  const totalImportedCount = allFacultyOverview.filter((i) => Boolean(i.importRecord)).length;
  const totalPendingCount = totalFacultyCount - totalImportedCount;
  const totalDiscrepanciesCount = allFacultyOverview.reduce((acc, i) => acc + i.discrepancies.length, 0);

  // Consolidated Download as Excel File
  const handleDownloadConsolidatedExcel = () => {
    const exportRows: any[] = [];

    allFacultyOverview.forEach((item) => {
      if (item.importRecord && item.importRecord.entries) {
        item.importRecord.entries.forEach((e) => {
          exportRows.push({
            'Faculty Name': item.fac.name,
            'Faculty ID': item.fac.id,
            Department: item.fac.department,
            Day: e.day,
            'Start Time': e.startTime,
            'End Time': e.endTime,
            'Subject Name': e.subjectName,
            'Subject Code': e.subjectCode,
            Room: e.room,
            'Batch / Semester': e.batch,
            'Imported Timestamp': item.importRecord?.importedAt || '',
            'Source File': item.importRecord?.fileName || '',
          });
        });
      }
    });

    if (exportRows.length === 0) {
      alert('No self-imported faculty routines available to download.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consolidated Self-Imports');
    XLSX.writeFile(
      workbook,
      `ClassPilot_Faculty_Self_Imported_Routines_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const selectedOverviewItem = useMemo(() => {
    if (!selectedFacultyForView) return null;
    return allFacultyOverview.find((i) => i.fac.id === selectedFacultyForView.id) || null;
  }, [selectedFacultyForView, allFacultyOverview]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Faculty</span>
            <span className="text-2xl font-black text-white">{totalFacultyCount}</span>
            <span className="text-xs text-slate-400 block mt-0.5">Faculty Profiles</span>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Self-Imported</span>
            <span className="text-2xl font-black text-emerald-400">{totalImportedCount}</span>
            <span className="text-xs text-slate-400 block mt-0.5">Routines Uploaded</span>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Pending Import</span>
            <span className="text-2xl font-black text-amber-400">{totalPendingCount}</span>
            <span className="text-xs text-slate-400 block mt-0.5">Awaiting Self-Import</span>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
            <UserX className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Flagged Conflicts</span>
            <span className="text-2xl font-black text-rose-400">{totalDiscrepanciesCount}</span>
            <span className="text-xs text-slate-400 block mt-0.5">Discrepancies vs Master</span>
          </div>
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Roster & Control Bar */}
      <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 space-y-4 shadow-md">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Faculty Self-Import Tracker & Master Cross-Check
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-extrabold">
                Realtime Firestore Sync
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitor self-imported routines uploaded directly by faculty members, download combined Excel files, and cross-check against Master Routine.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            {onRefreshSelfImports && (
              <button
                onClick={onRefreshSelfImports}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                title="Refresh from central Firestore"
              >
                <RefreshCw className="w-4 h-4 text-blue-400" /> Refresh Data
              </button>
            )}

            <button
              onClick={handleDownloadConsolidatedExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download Combined Excel
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-700/60">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by faculty name or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 text-white text-xs rounded-xl pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700/80 w-full sm:w-auto">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({allFacultyOverview.length})
            </button>
            <button
              onClick={() => setFilterStatus('imported')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'imported' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Imported ({totalImportedCount})
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'pending' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pending ({totalPendingCount})
            </button>
          </div>
        </div>

        {/* Table Roster */}
        <div className="border border-slate-700/80 rounded-xl overflow-x-auto bg-slate-900/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-slate-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="p-3">Faculty Member</th>
                <th className="p-3">Department</th>
                <th className="p-3 text-center">Self-Import Status</th>
                <th className="p-3 text-center">Self-Imported Classes</th>
                <th className="p-3 text-center">Master Routine Classes</th>
                <th className="p-3 text-center">Discrepancies</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200 font-medium">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No faculty profiles match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRoster.map((item) => {
                  const hasImported = Boolean(item.importRecord);
                  const hasDiscrepancy = item.discrepancies.length > 0;

                  return (
                    <tr key={item.fac.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-white text-sm">{item.fac.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.fac.phone || item.fac.employeeId || `ID: ${item.fac.id}`}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                          {item.fac.department || 'Commerce'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {hasImported ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Imported</span>
                            <span className="text-[10px] text-emerald-500/80 font-normal ml-1">
                              ({new Date(item.importRecord!.importedAt).toLocaleDateString()})
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pending</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-bold text-white">{item.selfEntries.length}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-bold text-slate-300">{item.masterEntries.length}</span>
                      </td>
                      <td className="p-3 text-center">
                        {hasDiscrepancy ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20 text-[11px]">
                            <AlertTriangle className="w-3 h-3" />
                            {item.discrepancies.length} Flagged
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">0</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedFacultyForView(item.fac)}
                          className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-bold rounded-lg border border-blue-500/30 flex items-center gap-1 mx-auto transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> Inspect & Cross-Check
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect & Cross-Check Modal Drawer */}
      {selectedOverviewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Cross-Check Routine: {selectedOverviewItem.fac.name}
                  <span className="text-xs text-slate-400 font-normal">({selectedOverviewItem.fac.department})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Side-by-side comparison of faculty self-imported routine vs master routine.
                </p>
              </div>
              <button
                onClick={() => setSelectedFacultyForView(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-6 flex-1">
              {/* Discrepancy Alert Section */}
              {selectedOverviewItem.discrepancies.length > 0 && (
                <div className="p-4 bg-rose-950/30 border border-rose-800/50 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    Flagged Discrepancies ({selectedOverviewItem.discrepancies.length})
                  </h4>
                  <ul className="space-y-1.5 text-xs text-rose-200">
                    {selectedOverviewItem.discrepancies.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 bg-rose-900/20 p-2 rounded border border-rose-800/30">
                        <span className="font-bold text-rose-400 shrink-0">[{d.day} {d.timeStr}]:</span>
                        <span>{d.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Side by Side Comparison Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Self Imported Routine Panel */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4" /> Self-Imported Routine ({selectedOverviewItem.selfEntries.length})
                    </h4>
                    {selectedOverviewItem.importRecord && (
                      <span className="text-[10px] text-slate-400">
                        File: {selectedOverviewItem.importRecord.fileName}
                      </span>
                    )}
                  </div>

                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800 text-slate-300 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-2 border-b border-slate-700">Day & Time</th>
                          <th className="p-2 border-b border-slate-700">Subject</th>
                          <th className="p-2 border-b border-slate-700">Room</th>
                          <th className="p-2 border-b border-slate-700">Batch</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-200">
                        {selectedOverviewItem.selfEntries.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-slate-500">
                              No self-imported classes.
                            </td>
                          </tr>
                        ) : (
                          selectedOverviewItem.selfEntries.map((e, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-2 font-bold text-slate-300">
                                {e.day.slice(0, 3)} {e.startTime}
                              </td>
                              <td className="p-2 font-semibold text-white">{e.subjectName}</td>
                              <td className="p-2 text-emerald-400 font-bold">{e.room}</td>
                              <td className="p-2 text-slate-400 text-[11px]">{e.batch}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Master Routine Panel */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4" /> Master Routine ({selectedOverviewItem.masterEntries.length})
                    </h4>
                    <span className="text-[10px] text-slate-400">Admin Source</span>
                  </div>

                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800 text-slate-300 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-2 border-b border-slate-700">Day & Time</th>
                          <th className="p-2 border-b border-slate-700">Subject</th>
                          <th className="p-2 border-b border-slate-700">Room</th>
                          <th className="p-2 border-b border-slate-700">Batch</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-200">
                        {selectedOverviewItem.masterEntries.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-slate-500">
                              No master routine classes assigned.
                            </td>
                          </tr>
                        ) : (
                          selectedOverviewItem.masterEntries.map((e, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-2 font-bold text-slate-300">
                                {e.day.slice(0, 3)} {e.startTime}
                              </td>
                              <td className="p-2 font-semibold text-white">{e.subjectName}</td>
                              <td className="p-2 text-blue-400 font-bold">{e.room}</td>
                              <td className="p-2 text-slate-400 text-[11px]">{e.batch}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Import Audit Logs */}
              {selectedOverviewItem.importRecord && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-blue-400" />
                    Self-Import Audit History
                  </h4>
                  <div className="space-y-1.5">
                    {(selectedOverviewItem.importRecord.importHistory || []).map((h, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <div>
                            <span className="font-semibold text-white">{h.fileName}</span>
                            <span className="text-[10px] text-slate-400 ml-2">
                              {new Date(h.importedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold">
                          {h.entriesCount} classes
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex justify-end">
              <button
                onClick={() => setSelectedFacultyForView(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700"
              >
                Close Comparison View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
