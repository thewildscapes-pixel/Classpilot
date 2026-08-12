import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { User, Faculty, TimetableEntry, DayOfWeek, FacultySelfImportRecord } from '../types';
import { saveFacultySelfImportToFirestore } from '../lib/firebaseService';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  Clock,
  MapPin,
  BookOpen,
  Calendar,
  History,
  Info,
  Loader2,
  Trash2,
  Plus,
} from 'lucide-react';

interface FacultySelfImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  currentFaculty?: Faculty;
  onImportSuccess: (entries: TimetableEntry[], record: FacultySelfImportRecord) => void;
  existingRecord?: FacultySelfImportRecord | null;
}

const VALID_DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const FacultySelfImportModal: React.FC<FacultySelfImportModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentFaculty,
  onImportSuccess,
  existingRecord,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [parsedEntries, setParsedEntries] = useState<Partial<TimetableEntry>[]>([]);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  });
  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');

  if (!isOpen) return null;

  const facultyName = currentFaculty?.name || currentUser.name || 'Faculty Member';
  const facultyId = currentFaculty?.id || currentUser.facultyId || currentUser.id || 'fac_unknown';

  // Normalize Day of Week
  const normalizeDay = (raw: string): DayOfWeek => {
    if (!raw) return 'Monday';
    const clean = raw.trim().toLowerCase();
    if (clean.includes('mon')) return 'Monday';
    if (clean.includes('tue')) return 'Tuesday';
    if (clean.includes('wed')) return 'Wednesday';
    if (clean.includes('thu')) return 'Thursday';
    if (clean.includes('fri')) return 'Friday';
    if (clean.includes('sat')) return 'Saturday';
    return 'Monday';
  };

  // Helper to format time to HH:MM (24-hr)
  const normalizeTime = (raw: string): string => {
    if (!raw) return '09:00';
    let str = String(raw).trim();
    if (str.length === 5 && str.includes(':')) return str;

    // Handle 12-hour format e.g., "9:00 AM", "09.00", "9:00"
    str = str.replace('.', ':');
    const match = str.match(/(\d{1,2})[:](\d{2})\s*(AM|PM)?/i);
    if (match) {
      let hrs = parseInt(match[1], 10);
      const mins = match[2];
      const ampm = match[3] ? match[3].toUpperCase() : '';
      if (ampm === 'PM' && hrs < 12) hrs += 12;
      if (ampm === 'AM' && hrs === 12) hrs = 0;
      return `${hrs.toString().padStart(2, '0')}:${mins}`;
    }
    return '09:00';
  };

  // Parse file content
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsParsing(true);
    setSyncStatus({ type: 'idle', message: '' });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

        if (rawRows.length === 0) {
          setSyncStatus({ type: 'error', message: 'The uploaded file contains no rows or data sheets.' });
          setIsParsing(false);
          return;
        }

        const entries: Partial<TimetableEntry>[] = [];

        rawRows.forEach((row, idx) => {
          // Normalize column keys
          const normalizedRow: Record<string, any> = {};
          Object.keys(row).forEach((k) => {
            normalizedRow[k.trim().toLowerCase()] = row[k];
          });

          // Find day column
          const dayKey = Object.keys(normalizedRow).find((k) => k.includes('day'));
          const rawDay = dayKey ? String(normalizedRow[dayKey]) : 'Monday';
          const day = normalizeDay(rawDay);

          // Find time columns
          const timeKey = Object.keys(normalizedRow).find(
            (k) => k.includes('time') || k.includes('period') || k.includes('slot')
          );
          const startTimeKey = Object.keys(normalizedRow).find((k) => k.includes('start'));
          const endTimeKey = Object.keys(normalizedRow).find((k) => k.includes('end'));

          let startTime = '09:00';
          let endTime = '10:00';

          if (startTimeKey && normalizedRow[startTimeKey]) {
            startTime = normalizeTime(String(normalizedRow[startTimeKey]));
          }
          if (endTimeKey && normalizedRow[endTimeKey]) {
            endTime = normalizeTime(String(normalizedRow[endTimeKey]));
          }

          if ((!startTimeKey || !endTimeKey) && timeKey && normalizedRow[timeKey]) {
            const rawTimeStr = String(normalizedRow[timeKey]);
            if (rawTimeStr.includes('-') || rawTimeStr.includes('to')) {
              const parts = rawTimeStr.split(/-|to/);
              startTime = normalizeTime(parts[0]);
              endTime = normalizeTime(parts[1]);
            } else {
              startTime = normalizeTime(rawTimeStr);
            }
          }

          // Find Subject & Code
          const subjectKey = Object.keys(normalizedRow).find(
            (k) => k.includes('subject') || k.includes('paper') || k.includes('course') || k.includes('class')
          );
          const codeKey = Object.keys(normalizedRow).find((k) => k.includes('code'));

          const subjectName = subjectKey ? String(normalizedRow[subjectKey]).trim() : 'Class Lecture';
          const subjectCode = codeKey ? String(normalizedRow[codeKey]).trim() : 'SUB-101';

          // Find Room
          const roomKey = Object.keys(normalizedRow).find(
            (k) => k.includes('room') || k.includes('hall') || k.includes('lab') || k.includes('venue')
          );
          const room = roomKey ? String(normalizedRow[roomKey]).trim() : 'Room 12';

          // Find Batch / Semester
          const batchKey = Object.keys(normalizedRow).find(
            (k) => k.includes('batch') || k.includes('sem') || k.includes('program') || k.includes('stream') || k.includes('year')
          );
          const batch = batchKey ? String(normalizedRow[batchKey]).trim() : 'FYUGP 1st Semester';

          // Find Department
          const deptKey = Object.keys(normalizedRow).find((k) => k.includes('dept') || k.includes('department'));
          const department = deptKey ? String(normalizedRow[deptKey]).trim() : currentFaculty?.department || currentUser.department || 'Commerce';

          // Skip completely empty rows
          if (!subjectName && !roomKey && !dayKey) return;

          entries.push({
            id: `self_${facultyId}_${Date.now()}_${idx}`,
            facultyId: facultyId,
            facultyName: facultyName,
            subjectCode: subjectCode || 'SUB-101',
            subjectName: subjectName || 'Subject Lecture',
            room: room || 'Lecture Hall',
            day: day,
            startTime: startTime,
            endTime: endTime,
            batch: batch || 'FYUGP Semester',
            department: department,
            semesterCycle: 'Odd',
            programSemester: batch,
            paperCategory: 'Major',
            notes: 'Self-Imported by Faculty',
          });
        });

        if (entries.length === 0) {
          setSyncStatus({
            type: 'error',
            message: 'Could not extract valid routine entries from the file. Please ensure column headers include Day, Time, Subject, Room, and Batch.',
          });
        } else {
          setParsedEntries(entries);
          setSyncStatus({
            type: 'idle',
            message: `Extracted ${entries.length} routine rows. Review or edit below before saving to central database.`,
          });
        }
      } catch (err: any) {
        console.error('Self import parse error:', err);
        setSyncStatus({
          type: 'error',
          message: `Failed to parse spreadsheet file: ${err.message || 'Invalid format'}`,
        });
      } finally {
        setIsParsing(false);
      }
    };

    reader.readAsArrayBuffer(uploadedFile);
  };

  // Update single row field in preview
  const handleUpdateParsedRow = (idx: number, field: keyof TimetableEntry, val: any) => {
    setParsedEntries((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  // Remove single row in preview
  const handleRemoveParsedRow = (idx: number) => {
    setParsedEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  // Add blank row
  const handleAddBlankRow = () => {
    setParsedEntries((prev) => [
      ...prev,
      {
        id: `self_${facultyId}_${Date.now()}_${prev.length}`,
        facultyId,
        facultyName,
        subjectCode: 'COMM-101',
        subjectName: 'Business Studies',
        room: 'Room 14',
        day: 'Monday',
        startTime: '09:00',
        endTime: '10:00',
        batch: 'FYUGP 1st Sem - Commerce',
        department: currentFaculty?.department || currentUser.department || 'Commerce',
        paperCategory: 'Major',
      },
    ]);
  };

  // Confirm Import & Save to Central Firestore Database
  const handleConfirmSync = async () => {
    if (parsedEntries.length === 0) {
      setSyncStatus({ type: 'error', message: 'No routine entries to save. Please upload a file first.' });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ type: 'idle', message: 'Writing routine to central Firestore database...' });

    const formattedEntries: TimetableEntry[] = parsedEntries.map((e, i) => ({
      id: e.id || `self_${facultyId}_${Date.now()}_${i}`,
      facultyId: facultyId,
      facultyName: facultyName,
      subjectCode: e.subjectCode || 'SUB-100',
      subjectName: e.subjectName || 'Class Period',
      room: e.room || 'Room 12',
      day: (e.day as DayOfWeek) || 'Monday',
      startTime: e.startTime || '09:00',
      endTime: e.endTime || '10:00',
      batch: e.batch || 'FYUGP',
      department: e.department || currentFaculty?.department || currentUser.department || 'Commerce',
      semesterCycle: 'Odd',
      programSemester: e.batch || 'FYUGP 1st Sem',
      paperCategory: e.paperCategory || 'Major',
      notes: e.notes || 'Faculty Self-Imported',
      updatedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    }));

    const importRecord: FacultySelfImportRecord = {
      id: (facultyId || facultyName).toLowerCase().replace(/[^a-z0-9]/g, '_'),
      facultyId,
      facultyName,
      employeeId: currentUser.employeeId || currentFaculty?.employeeId || '',
      phone: currentUser.phone || currentFaculty?.phone || '',
      email: currentUser.email || currentFaculty?.email || '',
      department: currentFaculty?.department || currentUser.department || 'Commerce',
      importedAt: new Date().toISOString(),
      fileName: file?.name || 'Self_Import_Routine.xlsx',
      entriesCount: formattedEntries.length,
      entries: formattedEntries,
    };

    // Store in localStorage for instant local working copy
    try {
      localStorage.setItem(`classpilot_self_import_${facultyId}`, JSON.stringify(importRecord));
    } catch (e) {
      console.warn('LocalStorage save note:', e);
    }

    // Write to central Firestore database and CONFIRM success before informing user
    const res = await saveFacultySelfImportToFirestore(importRecord);

    setIsSyncing(false);

    if (res.success) {
      setSyncStatus({
        type: 'success',
        message: `Success! ${formattedEntries.length} classes saved locally and synced to central database for Admin review.`,
      });

      onImportSuccess(formattedEntries, importRecord);

      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setSyncStatus({
        type: 'error',
        message: `Local copy saved! Central database write note: ${res.error || 'Network pending'}. Will retry on reconnect.`,
      });
      // Still update app state with local working copy
      onImportSuccess(formattedEntries, importRecord);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Faculty Self-Service Routine Import
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Interim Workaround
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Import your official routine file to sync your personal timetable directly with the central database.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-5 pt-2">
          <button
            onClick={() => setActiveTab('import')}
            className={`pb-3 px-4 text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'import'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" /> Import & Preview File
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-4 text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" /> Previous Sync History ({existingRecord?.importHistory?.length || 0})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'history' ? (
            <div className="space-y-4">
              {existingRecord ? (
                <div className="space-y-3">
                  <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/80 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Active Self-Import Record
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        File: <span className="text-slate-200 font-semibold">{existingRecord.fileName}</span> | Total Classes:{' '}
                        <span className="text-blue-400 font-bold">{existingRecord.entriesCount}</span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Last synced to Central Database:{' '}
                        {new Date(existingRecord.importedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4">
                    Import Audit Logs & Timestamps
                  </h5>

                  <div className="space-y-2">
                    {(existingRecord.importHistory || []).map((h, i) => (
                      <div
                        key={i}
                        className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-3">
                          <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                          <div>
                            <p className="text-slate-200 font-medium">{h.fileName}</p>
                            <p className="text-[10px] text-slate-500">
                              {new Date(h.importedAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 font-bold text-[11px] border border-blue-500/20">
                          {h.entriesCount} classes
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 space-y-2">
                  <Info className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-400">No previous self-imports recorded for your profile.</p>
                  <p className="text-xs text-slate-500">Upload your routine file in the "Import & Preview" tab to start.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Identity Banner */}
              <div className="p-3.5 bg-blue-950/40 border border-blue-800/50 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs">
                    {facultyName.charAt(0)}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Importing Routine For</span>
                    <span className="text-white font-bold text-sm">{facultyName}</span>
                    <span className="text-slate-400 ml-2">({currentFaculty?.department || currentUser.department || 'Faculty'})</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[11px] rounded border border-slate-700">
                  ID: {facultyId}
                </span>
              </div>

              {/* Upload Drop Zone */}
              <div className="relative border-2 border-dashed border-slate-700 hover:border-blue-500/80 rounded-2xl p-6 text-center bg-slate-900/50 transition-all group cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="space-y-3 pointer-events-none">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400 group-hover:scale-110 transition-transform">
                    {isParsing ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileSpreadsheet className="w-6 h-6" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-200">
                      {file ? file.name : 'Click or Drag & Drop Routine Excel / CSV File'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Supports .xlsx, .xls, and .csv files with Day, Time, Subject, Room, and Batch columns.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Banner */}
              {syncStatus.message && (
                <div
                  className={`p-3.5 rounded-xl border flex items-center space-x-3 text-xs ${
                    syncStatus.type === 'error'
                      ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                      : syncStatus.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-blue-950/40 border-blue-800/60 text-blue-300'
                  }`}
                >
                  {syncStatus.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  ) : syncStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <Info className="w-4 h-4 shrink-0 text-blue-400" />
                  )}
                  <span className="font-medium">{syncStatus.message}</span>
                </div>
              )}

              {/* Parsed Preview Table */}
              {parsedEntries.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      Extracted Routine Preview ({parsedEntries.length} periods)
                    </h3>
                    <button
                      onClick={handleAddBlankRow}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Class Period
                    </button>
                  </div>

                  <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-64">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-800/90 text-slate-300 sticky top-0 z-10 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5 border-b border-slate-700">Day</th>
                          <th className="p-2.5 border-b border-slate-700">Time (Start - End)</th>
                          <th className="p-2.5 border-b border-slate-700">Subject / Course</th>
                          <th className="p-2.5 border-b border-slate-700">Subject Code</th>
                          <th className="p-2.5 border-b border-slate-700">Room</th>
                          <th className="p-2.5 border-b border-slate-700">Batch / Semester</th>
                          <th className="p-2.5 border-b border-slate-700 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-200">
                        {parsedEntries.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-2">
                              <select
                                value={row.day || 'Monday'}
                                onChange={(e) => handleUpdateParsedRow(idx, 'day', e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                              >
                                {VALID_DAYS.map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <div className="flex items-center space-x-1">
                                <input
                                  type="text"
                                  value={row.startTime || '09:00'}
                                  onChange={(e) => handleUpdateParsedRow(idx, 'startTime', e.target.value)}
                                  className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                                />
                                <span className="text-slate-500">-</span>
                                <input
                                  type="text"
                                  value={row.endTime || '10:00'}
                                  onChange={(e) => handleUpdateParsedRow(idx, 'endTime', e.target.value)}
                                  className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                                />
                              </div>
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.subjectName || ''}
                                onChange={(e) => handleUpdateParsedRow(idx, 'subjectName', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.subjectCode || ''}
                                onChange={(e) => handleUpdateParsedRow(idx, 'subjectCode', e.target.value)}
                                className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.room || ''}
                                onChange={(e) => handleUpdateParsedRow(idx, 'room', e.target.value)}
                                className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.batch || ''}
                                onChange={(e) => handleUpdateParsedRow(idx, 'batch', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                onClick={() => handleRemoveParsedRow(idx)}
                                className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            Self-imported routine updates your view instantly and alerts Admin for verification.
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            {activeTab === 'import' && (
              <button
                onClick={handleConfirmSync}
                disabled={isSyncing || parsedEntries.length === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Writing to Database...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm & Sync to Central Database
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
