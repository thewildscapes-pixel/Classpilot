import React, { useState, useEffect } from 'react';
import { ClassDiaryEntry, AttendanceRecord, SyllabusTopic, User, TimetableEntry, Student, Faculty } from '../types';
import {
  subscribeToClassDiaryRealtime,
  saveClassDiaryToFirestore,
} from '../lib/firebaseService';
import {
  generateFacultyClassDiaryPDF,
  generateAdminConsolidatedPDF,
} from '../utils/pdfGenerator';
import {
  BookOpen,
  Calendar,
  Clock,
  Plus,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Upload,
  Download,
  Users,
  Search,
  Sparkles,
  Paperclip,
  Trash2,
  Edit2,
  BarChart3,
  RefreshCw,
  Eye,
  Check,
  X,
  Printer,
  Mail,
  UserCheck,
} from 'lucide-react';

interface ClassDiaryViewProps {
  currentUser: User;
  timetable: TimetableEntry[];
  selectedClassForDiary?: TimetableEntry | null;
  students?: Student[];
  faculties?: Faculty[];
}

const DEFAULT_SYLLABUS_TOPICS: SyllabusTopic[] = [];

const DEFAULT_STUDENTS: { studentId: string; rollNo: string; name: string }[] = [];

export const ClassDiaryView: React.FC<ClassDiaryViewProps> = ({
  currentUser,
  timetable,
  selectedClassForDiary,
  students = [],
  faculties = [],
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'records' | 'attendance' | 'syllabus'>('records');
  const [diaryEntries, setDiaryEntries] = useState<ClassDiaryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_class_diary') || localStorage.getItem('lecturapulse_class_diary');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((e: any) => ({
            ...e,
            batch: e.batch || e.classBatch || '',
            topicTaught: e.topicTaught || '',
            subjectCode: e.subjectCode || '',
            subjectName: e.subjectName || '',
            room: e.room || 'LH-01',
            department: e.department || 'Commerce',
            syllabusUnit: e.syllabusUnit || 'Unit 1',
            durationMins: e.durationMins || 60,
            remarks: e.remarks || '',
            attendance: e.attendance || [],
          }));
        }
      }
    } catch (e) {}
    return [];
  });
  const [syllabusTopics, setSyllabusTopics] = useState<SyllabusTopic[]>(DEFAULT_SYLLABUS_TOPICS);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('All');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineDrafts, setOfflineDrafts] = useState<ClassDiaryEntry[]>([]);

  // Helper function to safely merge incoming diary entries into state and localStorage
  const mergeEntries = (existing: ClassDiaryEntry[], incoming: ClassDiaryEntry[]): ClassDiaryEntry[] => {
    const entryMap = new Map<string, ClassDiaryEntry>();
    existing.forEach((e) => {
      if (e && e.id) {
        entryMap.set(e.id, {
          ...e,
          batch: e.batch || (e as any).classBatch || '',
          topicTaught: e.topicTaught || '',
          subjectCode: e.subjectCode || '',
          subjectName: e.subjectName || '',
          room: e.room || 'LH-01',
          department: e.department || 'Commerce',
          syllabusUnit: e.syllabusUnit || 'Unit 1',
          durationMins: e.durationMins || 60,
          remarks: e.remarks || '',
          attendance: e.attendance || [],
        });
      }
    });
    incoming.forEach((e) => {
      if (e && e.id) {
        const prev = entryMap.get(e.id);
        entryMap.set(e.id, {
          ...prev,
          ...e,
          batch: e.batch || (e as any).classBatch || prev?.batch || '',
          topicTaught: e.topicTaught || prev?.topicTaught || '',
          subjectCode: e.subjectCode || prev?.subjectCode || '',
          subjectName: e.subjectName || prev?.subjectName || '',
          room: e.room || prev?.room || 'LH-01',
          department: e.department || prev?.department || 'Commerce',
          syllabusUnit: e.syllabusUnit || prev?.syllabusUnit || 'Unit 1',
          durationMins: e.durationMins || prev?.durationMins || 60,
          remarks: e.remarks || prev?.remarks || '',
          attendance: (e.attendance && e.attendance.length > 0) ? e.attendance : (prev?.attendance || []),
        });
      }
    });
    const merged = Array.from(entryMap.values()).sort(
      (a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()
    );
    try {
      localStorage.setItem('classpilot_class_diary', JSON.stringify(merged));
      localStorage.setItem('lecturapulse_class_diary', JSON.stringify(merged));
    } catch (e) {}
    return merged;
  };

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Form Fields - initialized dynamically from active timetable entries if available
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState<string>('09:00');
  const [formEndTime, setFormEndTime] = useState<string>('10:00');
  const [formSubjectCode, setFormSubjectCode] = useState<string>(timetable[0]?.subjectCode || '');
  const [formSubjectName, setFormSubjectName] = useState<string>(timetable[0]?.subjectName || '');
  const [formBatch, setFormBatch] = useState<string>(timetable[0]?.batch || '');
  const [formRoom, setFormRoom] = useState<string>(timetable[0]?.room || '');
  const [formTopic, setFormTopic] = useState<string>('');
  const [formSyllabusUnit, setFormSyllabusUnit] = useState<string>('Unit 1');
  const [formDuration, setFormDuration] = useState<number>(60);
  const [formRemarks, setFormRemarks] = useState<string>('');
  const [formAttendance, setFormAttendance] = useState<AttendanceRecord[]>([]);

  // Open modal automatically if selectedClassForDiary was clicked from Today's Class view
  useEffect(() => {
    if (selectedClassForDiary) {
      setEditingEntryId(null);
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormStartTime(selectedClassForDiary.startTime || '09:00');
      setFormEndTime(selectedClassForDiary.endTime || '10:00');
      setFormSubjectCode(selectedClassForDiary.subjectCode || 'COM-101');
      setFormSubjectName(selectedClassForDiary.subjectName || 'Financial Accounting');
      setFormBatch(selectedClassForDiary.batch || 'FYUGP 1st Sem');
      setFormRoom(selectedClassForDiary.room || 'LH-01');
      setFormTopic('');
      setFormSyllabusUnit('Unit 1');
      setFormDuration(60);
      setFormRemarks('');
      setFormAttendance(DEFAULT_STUDENTS.map(s => ({ ...s, status: 'Present' })));
      setIsModalOpen(true);
    }
  }, [selectedClassForDiary]);

  // Track current time for live lock countdown recalculations
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 10000); // refresh every 10 sec
    return () => clearInterval(timer);
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch diary entries from backend, Firestore realtime, & offline storage
  useEffect(() => {
    // Subscribe to Firestore real-time Class Diary snapshot
    const unsubscribe = subscribeToClassDiaryRealtime(
      currentUser.facultyId || currentUser.id || 'fac_1',
      currentUser.role === 'admin',
      (entries) => {
        if (entries && entries.length > 0) {
          setDiaryEntries((prev) => mergeEntries(prev, entries));
        }
      }
    );

    fetchDiaryEntries();
    loadOfflineDrafts();

    return () => unsubscribe();
  }, [currentUser.id, currentUser.facultyId, currentUser.role]);

  const fetchDiaryEntries = async () => {
    try {
      const res = await fetch('/api/class-diary');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setDiaryEntries((prev) => mergeEntries(prev, data));
        } else {
          loadLocalDiaryEntries();
        }
      } else {
        // Fallback to local dataset
        loadLocalDiaryEntries();
      }
    } catch (e) {
      loadLocalDiaryEntries();
    }
  };

  const loadLocalDiaryEntries = () => {
    try {
      const saved = localStorage.getItem('classpilot_class_diary') || localStorage.getItem('lecturapulse_class_diary');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDiaryEntries((prev) => mergeEntries(prev, parsed));
          return;
        }
      }
    } catch (err) {}
  };

  const loadOfflineDrafts = () => {
    try {
      const draftsRaw = localStorage.getItem('classpilot_diary_offline_drafts') || localStorage.getItem('lecturapulse_diary_offline_drafts');
      if (draftsRaw) {
        setOfflineDrafts(JSON.parse(draftsRaw));
      }
    } catch (e) {}
  };

  // Check 24h Lock Status
  const checkIsLocked = (entry: ClassDiaryEntry): boolean => {
    const lockWindowMs = 24 * 60 * 60 * 1000; // 24 hours
    const startMs = entry.classStartTimestamp || new Date(`${entry.date}T${entry.startTime}`).getTime();
    return (nowMs - startMs) > lockWindowMs;
  };

  // Format remaining lock time
  const getLockCountdown = (entry: ClassDiaryEntry): { isLocked: boolean; text: string } => {
    const lockWindowMs = 24 * 60 * 60 * 1000;
    const startMs = entry.classStartTimestamp || new Date(`${entry.date}T${entry.startTime}`).getTime();
    const elapsed = nowMs - startMs;

    if (elapsed > lockWindowMs) {
      return { isLocked: true, text: 'Locked (24h Window Expired)' };
    }

    const remainingMs = lockWindowMs - elapsed;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return { isLocked: false, text: `${hours}h ${mins}m left to edit` };
  };

  const handleImportRosterForCurrentClass = () => {
    let matched = students.filter(
      (s) =>
        s.classBatch.toLowerCase().includes(formBatch.toLowerCase()) ||
        formBatch.toLowerCase().includes(s.classBatch.toLowerCase())
    );

    if (matched.length === 0) {
      matched = students;
    }

    if (matched.length === 0) {
      alert('No student rosters uploaded yet. Please upload a student roster in Admin -> Manage Students tab first.');
      return;
    }

    const formattedAttendance: AttendanceRecord[] = matched.map((s) => ({
      studentId: s.id,
      rollNo: s.rollNo,
      name: s.name,
      status: 'Present',
      remarks: '',
    }));

    setFormAttendance(formattedAttendance);
    alert(`Imported ${formattedAttendance.length} students into class attendance list.`);
  };

  const handleDownloadPDFReport = () => {
    generateFacultyClassDiaryPDF(
      {
        name: currentUser.name || 'Faculty Member',
        department: currentUser.department || 'Commerce',
        email: currentUser.email,
      },
      diaryEntries,
      'Odd Semester 2025–26'
    );
  };

  const handleDownloadAdminConsolidatedPDFReport = () => {
    generateAdminConsolidatedPDF(diaryEntries, faculties, 'Odd Semester 2025–26');
  };

  const handlePrintClassDiary = () => {
    window.print();
  };

  const handleEmailSummaryReport = () => {
    const totalClasses = diaryEntries.length;
    const summaryText = `ClassPilot Logbook Summary for ${currentUser.name} (${currentUser.department}): Total Classes Conducted: ${totalClasses}. Logged entries compliant with NAAC SSR standards.`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Class Diary Summary - ${currentUser.name}`)}&body=${encodeURIComponent(summaryText)}`;
    window.open(mailtoUrl, '_blank');
  };

  // Open Create/Edit Modal
  const handleOpenModal = (entry?: ClassDiaryEntry) => {
    if (entry) {
      if (checkIsLocked(entry)) {
        alert('This class diary entry is permanently locked because more than 24 hours have elapsed since the class start time.');
        return;
      }
      setEditingEntryId(entry.id);
      setFormDate(entry.date);
      setFormStartTime(entry.startTime);
      setFormEndTime(entry.endTime);
      setFormSubjectCode(entry.subjectCode);
      setFormSubjectName(entry.subjectName);
      setFormBatch(entry.batch);
      setFormRoom(entry.room);
      setFormTopic(entry.topicTaught);
      setFormSyllabusUnit(entry.syllabusUnit || '');
      setFormDuration(entry.durationMins);
      setFormRemarks(entry.remarks || '');
      setFormAttendance(entry.attendance || DEFAULT_STUDENTS.map(s => ({ ...s, status: 'Present' })));
    } else {
      setEditingEntryId(null);
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormStartTime('09:00');
      setFormEndTime('10:00');
      setFormSubjectCode('COM-101');
      setFormSubjectName('Financial Accounting');
      setFormBatch('FYUGP 1st Sem - Commerce');
      setFormRoom('LH-01');
      setFormTopic('');
      setFormSyllabusUnit('Unit 1: Accounting Framework');
      setFormDuration(60);
      setFormRemarks('');
      setFormAttendance(DEFAULT_STUDENTS.map(s => ({ ...s, status: 'Present' })));
    }
    setIsModalOpen(true);
  };

  // Save Entry (Online or Offline Draft)
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTopic.trim()) {
      alert('Please describe the topic taught in class.');
      return;
    }

    const startTimestamp = new Date(`${formDate}T${formStartTime}`).getTime();

    const newEntry: ClassDiaryEntry = {
      id: editingEntryId || `diary_${Date.now()}`,
      facultyId: currentUser.facultyId || 'fac_1',
      facultyName: currentUser.name || 'Faculty Member',
      department: currentUser.department || 'Commerce',
      date: formDate,
      startTime: formStartTime,
      endTime: formEndTime,
      classStartTimestamp: startTimestamp,
      subjectCode: formSubjectCode,
      subjectName: formSubjectName,
      batch: formBatch,
      room: formRoom,
      topicTaught: formTopic.trim(),
      syllabusUnit: formSyllabusUnit,
      durationMins: formDuration,
      remarks: formRemarks.trim(),
      attendance: formAttendance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: isOnline,
    };

    if (!isOnline) {
      // Save to offline drafts
      const updatedDrafts = [...offlineDrafts.filter(d => d.id !== newEntry.id), newEntry];
      setOfflineDrafts(updatedDrafts);
      localStorage.setItem('classpilot_diary_offline_drafts', JSON.stringify(updatedDrafts));
      alert('Network offline: Entry saved locally as a draft. It will automatically sync when back online.');
      setIsModalOpen(false);
      return;
    }

    // Save to Firestore with persistent offline cache and 24-hour edit lock enforcement
    const firestoreResult = await saveClassDiaryToFirestore(newEntry);
    if (!firestoreResult.success) {
      alert(firestoreResult.message);
      return;
    }

    try {
      const method = editingEntryId ? 'PUT' : 'POST';
      const url = editingEntryId ? `/api/class-diary/${editingEntryId}` : '/api/class-diary';
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      });
    } catch (e) {
      console.log('Saved to Firestore local cache and scheduled for auto-sync');
    }

    setDiaryEntries((prev) => mergeEntries(prev, [newEntry]));

    setIsModalOpen(false);
  };

  // Sync Offline Drafts
  const handleSyncDrafts = async () => {
    if (offlineDrafts.length === 0) return;
    try {
      for (const draft of offlineDrafts) {
        await fetch('/api/class-diary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draft, isSynced: true }),
        });
      }
      setOfflineDrafts([]);
      localStorage.removeItem('classpilot_diary_offline_drafts');
      localStorage.removeItem('lecturapulse_diary_offline_drafts');
      fetchDiaryEntries();
      alert('All offline class diary drafts synced successfully!');
    } catch (e) {
      alert('Draft sync failed. Please check network connection.');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = 'ID,Date,Start Time,End Time,Subject Code,Subject Name,Batch,Room,Topic Taught,Syllabus Unit,Duration Mins,Faculty,Remarks\n';
    const rows = diaryEntries
      .map(
        (e) =>
          `"${e.id}","${e.date}","${e.startTime}","${e.endTime}","${e.subjectCode}","${e.subjectName}","${e.batch}","${e.room}","${e.topicTaught.replace(
            /"/g,
            '""'
          )}","${e.syllabusUnit || ''}","${e.durationMins}","${e.facultyName}","${(e.remarks || '').replace(/"/g, '""')}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Class_Diary_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Student Attendance Statistics
  const getStudentStats = () => {
    const statsMap: Record<string, { rollNo: string; name: string; totalClasses: number; presentCount: number }> = {};

    diaryEntries.forEach((entry) => {
      if (entry.attendance) {
        entry.attendance.forEach((rec) => {
          if (!statsMap[rec.studentId]) {
            statsMap[rec.studentId] = {
              rollNo: rec.rollNo,
              name: rec.name,
              totalClasses: 0,
              presentCount: 0,
            };
          }
          statsMap[rec.studentId].totalClasses += 1;
          if (rec.status === 'Present' || rec.status === 'Late') {
            statsMap[rec.studentId].presentCount += 1;
          }
        });
      }
    });

    return Object.values(statsMap).map((s) => ({
      ...s,
      percentage: s.totalClasses > 0 ? Math.round((s.presentCount / s.totalClasses) * 100) : 100,
    }));
  };

  const studentStats = getStudentStats();

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs text-blue-400 font-bold uppercase tracking-wider mb-1">
              <BookOpen className="w-4 h-4" />
              <span>Academic Class Diary & Record Log</span>
            </div>
            <h2 className="font-heading font-extrabold text-2xl text-white">
              Class Record Logbook
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Log topics taught, duration, student attendance, and syllabus progress.
              <span className="text-amber-400 font-semibold ml-1">
                🔒 24-Hour Lock Rule: Entries become permanently read-only after 24 hours.
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {offlineDrafts.length > 0 && (
              <button
                onClick={handleSyncDrafts}
                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Sync {offlineDrafts.length} Drafts</span>
              </button>
            )}

            <button
              onClick={handleDownloadPDFReport}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Download Formal Class Diary PDF Report"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Download PDF Logbook</span>
            </button>

            {currentUser.role === 'admin' && (
              <button
                onClick={handleDownloadAdminConsolidatedPDFReport}
                className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
                title="Consolidated Institutional Audit Report"
              >
                <Download className="w-3.5 h-3.5 text-indigo-300" />
                <span>Admin Bulk Audit PDF</span>
              </button>
            )}

            <button
              onClick={handlePrintClassDiary}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
              title="Print Class Diary Logbook"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>Print</span>
            </button>

            <button
              onClick={handleEmailSummaryReport}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
              title="Email Summary Report"
            >
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>Email</span>
            </button>

            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log New Class</span>
            </button>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center space-x-2 mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={() => setActiveSubTab('records')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'records'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Class Log Entries ({diaryEntries.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('attendance')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'attendance'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Attendance Tracker & Flagged Students</span>
          </button>

          <button
            onClick={() => setActiveSubTab('syllabus')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'syllabus'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Syllabus Progress Tracker</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: CLASS LOG ENTRIES */}
      {activeSubTab === 'records' && (
        <div className="space-y-4">
          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 p-4 rounded-2xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search topic, subject code, batch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">Subject:</span>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="All">All Subjects</option>
                <option value="COM-101">COM-101: Financial Accounting</option>
                <option value="COM-102">COM-102: Business Org</option>
                <option value="CS-101">CS-101: Problem Solving in C</option>
              </select>
            </div>
          </div>

          {/* Cards List */}
          <div className="grid grid-cols-1 gap-4">
            {diaryEntries
              .filter((e) => {
                const matchSearch =
                  e.topicTaught.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  e.subjectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  e.batch.toLowerCase().includes(searchTerm.toLowerCase());
                const matchSubject = filterSubject === 'All' || e.subjectCode === filterSubject;
                return matchSearch && matchSubject;
              })
              .map((entry) => {
                const lockInfo = getLockCountdown(entry);

                return (
                  <div
                    key={entry.id}
                    className={`p-5 rounded-3xl border transition-all ${
                      lockInfo.isLocked
                        ? 'bg-slate-900/90 border-slate-800'
                        : 'bg-slate-900 border-blue-500/30 ring-1 ring-blue-500/20'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold text-blue-300 text-xs">
                          {entry.subjectCode}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-extrabold text-sm text-white">
                              {entry.subjectName}
                            </h4>
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                              {entry.batch}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center space-x-3 mt-0.5">
                            <span>📅 {entry.date}</span>
                            <span>⏰ {entry.startTime} - {entry.endTime} ({entry.durationMins} mins)</span>
                            <span>📍 Room {entry.room}</span>
                          </div>
                        </div>
                      </div>

                      {/* Lock Status Badge */}
                      <div className="flex items-center space-x-3">
                        <div
                          className={`px-3 py-1 rounded-full text-[11px] font-bold border flex items-center space-x-1.5 ${
                            lockInfo.isLocked
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse'
                          }`}
                        >
                          {lockInfo.isLocked ? (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>Permanently Locked</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-amber-400" />
                              <span>{lockInfo.text}</span>
                            </>
                          )}
                        </div>

                        {!lockInfo.isLocked && (
                          <button
                            onClick={() => handleOpenModal(entry)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition-colors"
                            title="Edit Entry"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Topic Taught & Remarks */}
                    <div className="pt-4 space-y-2">
                      <div className="text-xs">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          Topic Taught
                        </span>
                        <p className="text-slate-200 font-semibold text-sm mt-0.5">
                          {entry.topicTaught}
                        </p>
                      </div>

                      {entry.syllabusUnit && (
                        <div className="text-xs text-slate-400 inline-block bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                          Syllabus Mapping: <span className="text-blue-300 font-medium">{entry.syllabusUnit}</span>
                        </div>
                      )}

                      {entry.remarks && (
                        <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800 italic">
                          "{entry.remarks}"
                        </div>
                      )}

                      {/* Attendance Summary */}
                      {entry.attendance && (
                        <div className="pt-2 flex items-center space-x-4 text-xs text-slate-400">
                          <span className="font-bold text-slate-300">Class Attendance:</span>
                          <span className="text-emerald-400 font-bold">
                            {entry.attendance.filter((a) => a.status === 'Present').length} Present
                          </span>
                          <span className="text-red-400 font-bold">
                            {entry.attendance.filter((a) => a.status === 'Absent').length} Absent
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ATTENDANCE TRACKER & FLAGGED STUDENTS */}
      {activeSubTab === 'attendance' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading font-extrabold text-lg text-white">
                Cumulative Attendance Summary
              </h3>
              <p className="text-xs text-slate-400">
                Automatically flags students with attendance below 75% for mandatory academic counseling
              </p>
            </div>
            <div className="text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl flex items-center space-x-1">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>NAAC 75% Threshold Active</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-3">Roll Number</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Classes Attended</th>
                  <th className="p-3">Total Conducted</th>
                  <th className="p-3">Attendance %</th>
                  <th className="p-3">Academic Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {studentStats.map((st) => {
                  const isLow = st.percentage < 75;

                  return (
                    <tr key={st.rollNo} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono text-slate-200 font-bold">{st.rollNo}</td>
                      <td className="p-3 font-bold text-white">{st.name}</td>
                      <td className="p-3 font-semibold text-emerald-400">{st.presentCount}</td>
                      <td className="p-3 font-semibold text-slate-300">{st.totalClasses}</td>
                      <td className="p-3 font-extrabold">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs ${
                            isLow
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {st.percentage}%
                        </span>
                      </td>
                      <td className="p-3">
                        {isLow ? (
                          <span className="text-red-400 font-bold flex items-center space-x-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>⚠️ Low Attendance Alert (&lt;75%)</span>
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Satisfactory Attendance</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SYLLABUS PROGRESS TRACKER */}
      {activeSubTab === 'syllabus' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div>
            <h3 className="font-heading font-extrabold text-lg text-white">
              Curriculum & Syllabus Completion Tracker
            </h3>
            <p className="text-xs text-slate-400">
              Tracks coverage of syllabus units automatically based on logged class diary topics
            </p>
          </div>

          <div className="space-y-4">
            {['COM-101: Financial Accounting', 'CS-101: Problem Solving in C'].map((subj) => {
              const code = subj.split(':')[0];
              const topics = syllabusTopics.filter((t) => t.subjectCode === code);
              const completedCount = topics.filter((t) => t.isCompleted).length;
              const percent = topics.length > 0 ? Math.round((completedCount / topics.length) * 100) : 0;

              return (
                <div key={subj} className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-white">{subj}</h4>
                      <p className="text-xs text-slate-400">
                        {completedCount} of {topics.length} syllabus modules covered
                      </p>
                    </div>
                    <span className="text-lg font-black text-blue-400">{percent}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Topic items */}
                  <div className="space-y-2 pt-2">
                    {topics.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs text-slate-300 p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                        <div className="flex items-center space-x-2">
                          {t.isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                          )}
                          <span className={t.isCompleted ? 'line-through text-slate-400' : 'text-slate-200'}>
                            {t.unitName}: {t.topicTitle}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          t.isCompleted ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {t.isCompleted ? 'Covered' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CREATE / EDIT ENTRY MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 space-y-5 text-white my-8 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="font-heading font-extrabold text-xl text-white flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-blue-400" />
                <span>{editingEntryId ? 'Edit Class Log Entry' : 'Log Conducted Class'}</span>
              </h3>
              <p className="text-xs text-slate-400">
                Log topics taught and student attendance.
                <span className="text-amber-400 ml-1">Must be saved within 24 hours of class time.</span>
              </p>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">End Time</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Subject Code & Name</label>
                  <input
                    type="text"
                    value={`${formSubjectCode} - ${formSubjectName}`}
                    onChange={(e) => {
                      const parts = e.target.value.split('-');
                      setFormSubjectCode(parts[0]?.trim() || 'COM-101');
                      setFormSubjectName(parts[1]?.trim() || 'Class Lecture');
                    }}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Batch / Semester</label>
                  <input
                    type="text"
                    value={formBatch}
                    onChange={(e) => setFormBatch(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Topic Taught *</label>
                <textarea
                  rows={2}
                  placeholder="Describe the main topic, key concepts, or numerical problems solved..."
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Mapped Syllabus Unit</label>
                <input
                  type="text"
                  placeholder="e.g. Unit 1: Accounting Framework"
                  value={formSyllabusUnit}
                  onChange={(e) => setFormSyllabusUnit(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                />
              </div>

              {/* Student Attendance Marking Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-slate-400 block">
                    Mark Class Student Attendance ({formAttendance.filter(a => a.status === 'Present').length}/{formAttendance.length} Present)
                  </label>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={handleImportRosterForCurrentClass}
                      className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white rounded-lg text-[10px] font-bold flex items-center space-x-1 transition-all cursor-pointer"
                    >
                      <UserCheck className="w-3 h-3" />
                      <span>Import Student Roster</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormAttendance(formAttendance.map(a => ({ ...a, status: 'Present' })));
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700"
                    >
                      All Present
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormAttendance(formAttendance.map(a => ({ ...a, status: 'Absent' })));
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700"
                    >
                      All Absent
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto bg-slate-800/80 rounded-xl p-2 border border-slate-700 space-y-1.5">
                  {formAttendance.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No attendance list attached. Click <span className="text-emerald-400 font-bold">Import Student Roster</span> above to populate from uploaded class roster.
                    </div>
                  ) : (
                    formAttendance.map((st, idx) => (
                      <div key={st.studentId || idx} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs p-2 bg-slate-900/60 hover:bg-slate-700/50 rounded-lg gap-2 border border-slate-800">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-emerald-400 font-bold">{st.rollNo}</span>
                          <span className="font-bold text-white">{st.name}</span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="Remarks (e.g. Late 10m)"
                            value={st.remarks || ''}
                            onChange={(e) => {
                              const updated = [...formAttendance];
                              updated[idx].remarks = e.target.value;
                              setFormAttendance(updated);
                            }}
                            className="bg-slate-800 border border-slate-700 text-[10px] text-slate-200 rounded px-2 py-1 focus:outline-none w-28"
                          />

                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...formAttendance];
                                updated[idx].status = 'Present';
                                setFormAttendance(updated);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                st.status === 'Present' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...formAttendance];
                                updated[idx].status = 'Absent';
                                setFormAttendance(updated);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                st.status === 'Absent' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              Absent
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Remarks / Class Notes</label>
                <input
                  type="text"
                  placeholder="e.g. All students completed task; assignment assigned for next class."
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs rounded-xl shadow-lg"
                >
                  Save Class Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
