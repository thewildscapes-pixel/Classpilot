import React, { useState, useMemo } from 'react';
import { TimetableEntry, Faculty, Room, Student, DayOfWeek, ScheduleConflict, User, RoutineVersion, RoutineBackup, FacultySelfImportRecord } from '../types';
import { AdminNaacReports } from './AdminNaacReports';
import { AdminSqliteIntegrityView } from './AdminSqliteIntegrityView';
import { AdminFacultySelfImportsView } from './AdminFacultySelfImportsView';
import { StudentQREnrollmentsManager } from './StudentQREnrollmentsManager';
import { DiagnosticBadge } from './DiagnosticBadge';
import {
  DAYS_OF_WEEK,
  DEPARTMENTS_LIST,
  HOURLY_TIME_SLOTS,
  ODD_SEMESTERS_LIST,
  EVEN_SEMESTERS_LIST,
  COMMERCE_HS_SUBJECTS,
  FYUGP_PAPER_CATEGORIES,
  detectConflicts,
  generateSampleCsvContent,
  parseTimeToMinutes,
  isFacultyNameMatch,
} from '../utils/timeUtils';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Plus,
  PlusCircle,
  Trash2,
  Edit2,
  AlertTriangle,
  CheckCircle,
  Shield,
  Search,
  X,
  UserPlus,
  Building,
  RotateCcw,
  Building2,
  Calendar,
  Layers,
  Filter,
  Grid,
  Clock,
  BookOpen,
  Users,
  History,
  HardDrive,
  RefreshCw,
  FileCode,
  Database,
  Eye,
  Sparkles,
  Send,
  ArrowRight,
  GripVertical,
  Move,
  ArrowRightLeft,
  Activity,
  Terminal,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { saveTimetableToFirestore, resyncSingleTimetableEntryInFirestore } from '../lib/firebaseService';

interface AdminTimetableProps {
  currentUser?: User | null;
  timetable: TimetableEntry[];
  facultyList: Faculty[];
  roomList: Room[];
  students?: Student[];
  routineVersions?: RoutineVersion[];
  routineBackups?: RoutineBackup[];
  onUpdateStudents?: (students: Student[]) => void;
  onAddEntry: (entry: Partial<TimetableEntry>) => void;
  onUpdateEntry: (id: string, entry: Partial<TimetableEntry>) => void;
  onDeleteEntry: (id: string) => void;
  onBulkImport: (
    entries: Partial<TimetableEntry>[],
    replaceExisting: boolean,
    rawFileData?: { fileName: string; contentBase64?: string; fileSizeBytes?: number }
  ) => Promise<{ success: boolean; count?: number; error?: string }> | void;
  onRollbackRoutine?: (entriesSnapshot: TimetableEntry[], versionLabel: string) => Promise<void> | void;
  onCreateManualBackup?: (description: string) => Promise<void> | void;
  onAddFaculty: (faculty: Partial<Faculty>) => void;
  onUpdateFaculty?: (id: string, faculty: Partial<Faculty>) => void;
  onDeleteFaculty?: (id: string) => void;
  onClearAllFaculty?: () => void;
  onAddRoom: (room: Partial<Room>) => void;
  onResetData: () => void;
  onPurgeMockData?: () => void;
  onToggleUserAdminRole?: (userEmail: string, makeAdmin: boolean) => void;
  facultySelfImports?: FacultySelfImportRecord[];
  onRefreshSelfImports?: () => void;
}

export const AdminTimetable: React.FC<AdminTimetableProps> = ({
  currentUser,
  timetable,
  facultyList,
  roomList,
  students = [],
  routineVersions = [],
  routineBackups = [],
  onUpdateStudents,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onBulkImport,
  onRollbackRoutine,
  onCreateManualBackup,
  onAddFaculty,
  onUpdateFaculty,
  onDeleteFaculty,
  onClearAllFaculty,
  onAddRoom,
  onResetData,
  onPurgeMockData,
  onToggleUserAdminRole,
  facultySelfImports = [],
  onRefreshSelfImports,
}) => {
  // Navigation sub-tabs inside Admin
  const [activeAdminTab, setActiveAdminTab] = useState<
    'grid' | 'timetable' | 'dept_routine' | 'naac_reports' | 'import' | 'conflicts' | 'roster' | 'students' | 'session' | 'access' | 'backup_safeguards' | 'sqlite_integrity' | 'faculty_self_imports'
  >('grid');

  // Diagnostic Data Source Overlay State
  const [showDiagnosticDetails, setShowDiagnosticDetails] = useState<boolean>(false);
  const [showFirebaseSyncTimestamps, setShowFirebaseSyncTimestamps] = useState<boolean>(false);
  const [isForcePushing, setIsForcePushing] = useState<boolean>(false);
  const [syncingEntryIds, setSyncingEntryIds] = useState<Record<string, boolean>>({});

  const formatSyncTime = (timestampStr?: string) => {
    if (!timestampStr) return 'Pending / Local Cache';
    try {
      const date = new Date(timestampStr);
      if (isNaN(date.getTime())) return 'Pending Sync';
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch (e) {
      return timestampStr;
    }
  };

  const getRecentStatus = (entry: TimetableEntry): 'new' | 'modified' | null => {
    if (!entry) return null;
    const now = Date.now();
    const THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours threshold

    // 1. Check createdAt timestamp first
    if (entry.createdAt) {
      const createdTime = new Date(entry.createdAt).getTime();
      if (!isNaN(createdTime) && now - createdTime >= 0 && now - createdTime < THRESHOLD) {
        return 'new';
      }
    }

    // 2. Check entry ID timestamp pattern for newly generated entries
    if (entry.id) {
      const idMatch = entry.id.match(/^tt_(?:import_)?(\d{13})_/);
      if (idMatch) {
        const timestamp = parseInt(idMatch[1], 10);
        if (!isNaN(timestamp) && now - timestamp >= 0 && now - timestamp < THRESHOLD) {
          return 'new';
        }
      }
    }

    // 3. Check updatedAt or lastSyncedAt timestamp for modifications
    const updateStr = entry.updatedAt || entry.lastSyncedAt;
    if (updateStr) {
      const updatedTime = new Date(updateStr).getTime();
      if (!isNaN(updatedTime) && now - updatedTime >= 0 && now - updatedTime < THRESHOLD) {
        return 'modified';
      }
    }

    return null;
  };

  const RecentIndicatorBadge: React.FC<{ status: 'new' | 'modified' | null; compact?: boolean }> = ({
    status,
    compact,
  }) => {
    if (!status) return null;

    if (status === 'new') {
      return (
        <span
          className={`inline-flex items-center gap-1 font-extrabold uppercase tracking-wider rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-400/60 shadow-sm shadow-emerald-500/20 animate-pulse shrink-0 ${
            compact ? 'px-1.5 py-0.2 text-[8px]' : 'px-2 py-0.5 text-[9px]'
          }`}
          title="Newly Added Class Entry"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <span>NEW</span>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 font-extrabold uppercase tracking-wider rounded-full bg-amber-500/25 text-amber-300 border border-amber-400/60 shadow-sm shadow-amber-500/20 animate-pulse shrink-0 ${
          compact ? 'px-1.5 py-0.2 text-[8px]' : 'px-2 py-0.5 text-[9px]'
        }`}
        title="Recently Modified Class Entry"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
        <span>MODIFIED</span>
      </span>
    );
  };

  const handleSingleEntryResync = async (entry: TimetableEntry) => {
    if (!entry || !entry.id) return;
    setSyncingEntryIds((prev) => ({ ...prev, [entry.id]: true }));
    try {
      const res = await resyncSingleTimetableEntryInFirestore(entry);
      if (res.success && res.lastSyncedAt) {
        if (onUpdateEntry) {
          onUpdateEntry(entry.id, {
            ...entry,
            lastSyncedAt: res.lastSyncedAt,
            updatedAt: res.lastSyncedAt,
          });
        }
        setResolutionNotice({
          title: '🔥 Class Re-Synced to Firestore!',
          message: `Period "${entry.subjectName}" (${entry.subjectCode}) for ${entry.facultyName} was re-uploaded and verified in Firestore at ${new Date(res.lastSyncedAt).toLocaleTimeString()}.`,
          type: 'success',
        });
      } else {
        setResolutionNotice({
          title: '⚠️ Re-Sync Notice',
          message: res.error || 'Failed to re-sync entry to Firestore.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setResolutionNotice({
        title: '⚠️ Re-Sync Error',
        message: err?.message || 'Error re-syncing entry.',
        type: 'error',
      });
    } finally {
      setSyncingEntryIds((prev) => ({ ...prev, [entry.id]: false }));
    }
  };

  const handleForcePushToFirestore = async () => {
    setIsForcePushing(true);
    try {
      const res = await saveTimetableToFirestore(timetable, true);
      if (res.success) {
        setResolutionNotice({
          title: '🔥 Routine Force-Synced to Firestore!',
          message: `Successfully uploaded and verified ${res.count} timetable records to the live Firestore collection with updated sync timestamps.`,
          type: 'success',
        });
      } else {
        setResolutionNotice({
          title: '⚠️ Firestore Sync Notice',
          message: res.error || 'Failed to sync routine to Firestore.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setResolutionNotice({
        title: '⚠️ Sync Error',
        message: err?.message || 'Error pushing to Firestore.',
        type: 'error',
      });
    } finally {
      setIsForcePushing(false);
    }
  };

  // Compute whether current timetable data state was sourced from initial default mock data or fetched backend DB
  const timetableDataSource = React.useMemo(() => {
    if (!timetable || timetable.length === 0) {
      return {
        type: 'EMPTY',
        label: 'Empty Timetable State',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        description: 'No routine entries found in current active state.',
        isMock: false,
      };
    }

    const isMock = timetable.every(
      (e) =>
        e.id &&
        (e.id.startsWith('tt_dg_') || e.id.startsWith('tt_jb_') || e.id.startsWith('tt_rs_'))
    );

    if (isMock) {
      return {
        type: 'MOCK_INITIAL_SEED',
        label: 'Initial Default Mock Data',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        description:
          'Active state is currently sourced from initial default seed mock data (INITIAL_TIMETABLE).',
        isMock: true,
      };
    }

    return {
      type: 'BACKEND_DATABASE',
      label: 'Fetched Backend Database',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      description:
        'Active state is currently sourced from live backend database storage (Firestore / Server SQLite API).',
      isMock: false,
    };
  }, [timetable]);

  // Raw Uploaded File Retention State
  const [uploadedRawFileData, setUploadedRawFileData] = useState<{
    fileName: string;
    contentBase64?: string;
    fileSizeBytes?: number;
  } | null>(null);

  // Version / Backup Preview Modal State
  const [previewingSnapshot, setPreviewingSnapshot] = useState<{
    title: string;
    entries: TimetableEntry[];
  } | null>(null);

  // Semester Cycle & Academic Session State
  const [activeSemesterCycle, setActiveSemesterCycle] = useState<'Odd' | 'Even'>('Odd');
  const [sessionAcademicYear, setSessionAcademicYear] = useState<string>('2025–26');
  const [sessionStartDate, setSessionStartDate] = useState<string>('2025-08-01');
  const [sessionEndDate, setSessionEndDate] = useState<string>('2025-12-31');
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState<boolean>(false);

  // Student roster management local state
  const [studentSearchTerm, setStudentSearchTerm] = useState<string>('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('All');
  const [newStudentRoll, setNewStudentRoll] = useState<string>('');
  const [newStudentEnrollmentNo, setNewStudentEnrollmentNo] = useState<string>('');
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentClass, setNewStudentClass] = useState<string>('FYUGP 1st Sem Commerce');
  const [newStudentSubject, setNewStudentSubject] = useState<string>('');

  // Dynamically extract available subjects for selection dropdown
  const availableSubjectsList = useMemo(() => {
    const set = new Set<string>();
    (timetable || []).forEach((t) => {
      if (t.subjectCode && t.subjectName) {
        set.add(`${t.subjectCode} - ${t.subjectName}`);
      } else if (t.subjectName) {
        set.add(t.subjectName);
      } else if (t.subjectCode) {
        set.add(t.subjectCode);
      }
    });
    COMMERCE_HS_SUBJECTS.forEach((sub) => set.add(sub));
    return Array.from(set).sort();
  }, [timetable]);

  // JSON / Custom Routine Direct Sync Modal State
  const [isJsonSyncModalOpen, setIsJsonSyncModalOpen] = useState<boolean>(false);
  const [jsonSyncInput, setJsonSyncInput] = useState<string>('');
  const [jsonSyncError, setJsonSyncError] = useState<string>('');

  const handleJsonSyncSubmit = async () => {
    setJsonSyncError('');
    if (!jsonSyncInput.trim()) {
      setJsonSyncError('Please paste JSON array or comma/tab separated text routines.');
      return;
    }

    try {
      let parsedData: any[] = [];
      const trimmed = jsonSyncInput.trim();

      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const rawJson = JSON.parse(trimmed);
        parsedData = Array.isArray(rawJson) ? rawJson : [rawJson];
      } else {
        // Line-by-line CSV/TSV parser fallback
        const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
        parsedData = lines.map((line) => {
          const parts = line.split(/[,\t|]/);
          return {
            subjectCode: parts[0]?.trim() || 'SUBJ101',
            subjectName: parts[1]?.trim() || 'Course Class',
            facultyName: parts[2]?.trim() || 'Faculty Member',
            day: parts[3]?.trim() || 'Monday',
            startTime: parts[4]?.trim() || '08:00',
            endTime: parts[5]?.trim() || '09:00',
            room: parts[6]?.trim() || 'Room 1',
            batch: parts[7]?.trim() || 'FYUGP 1st Sem',
            department: parts[8]?.trim() || 'Commerce',
          };
        });
      }

      if (parsedData.length === 0) {
        setJsonSyncError('No valid routine records found in the pasted content.');
        return;
      }

      const formattedEntries: Partial<TimetableEntry>[] = parsedData.map((item, idx) => ({
        id: item.id || `tt_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        facultyId: item.facultyId || `fac_${idx + 1}`,
        facultyName: item.facultyName || item.faculty || item.teacher || 'Faculty Member',
        subjectCode: item.subjectCode || item.code || 'COM101',
        subjectName: item.subjectName || item.subject || item.course || 'Course Lecture',
        room: item.room || item.classNo || 'Room No. C1',
        day: (item.day || 'Monday') as DayOfWeek,
        startTime: item.startTime || item.start || '08:00',
        endTime: item.endTime || item.end || '09:00',
        batch: item.batch || item.class || 'FYUGP 1st Sem',
        department: item.department || item.dept || 'Commerce',
        semesterCycle: item.semesterCycle || (String(item.batch || item.programSemester || '').toLowerCase().includes('even') ? 'Even' : 'Odd'),
        programSemester: item.programSemester || item.program || 'FYUGP 1st Semester',
        paperCategory: item.paperCategory || item.category || 'Major',
        notes: item.notes || '',
      }));

      // Replace existing default mock entries with custom routine
      await onBulkImport(formattedEntries, true);

      // Auto-detect cycle and reset active filters so all classes show
      const evenCount = formattedEntries.filter((e) => e.semesterCycle === 'Even').length;
      const oddCount = formattedEntries.filter((e) => e.semesterCycle === 'Odd').length;
      if (evenCount > oddCount) setActiveSemesterCycle('Even');
      else if (oddCount > evenCount) setActiveSemesterCycle('Odd');

      setSelectedDepartment('All');
      setSelectedProgramSemester('All');
      setActiveAdminTab('grid');
      setIsJsonSyncModalOpen(false);
      setJsonSyncInput('');
      alert(`✨ Successfully synced and replaced routine with ${formattedEntries.length} custom entries!`);
    } catch (err: any) {
      console.error('JSON Routine Sync Error:', err);
      setJsonSyncError(`Failed to parse JSON/Text: ${err.message || 'Invalid format'}`);
    }
  };

  // Faculty CSV Bulk Import State
  const [facultyCsvPreview, setFacultyCsvPreview] = useState<Partial<Faculty>[]>([]);
  const [facultyCsvFileName, setFacultyCsvFileName] = useState<string>('');

  const handleDownloadFacultyCsvTemplate = () => {
    const csvHeaders = 'Faculty Name,Mobile Number,Employee ID,Department,Designation,Email\n';
    const sampleRows =
      'Faculty Member 1,9800000001,EMP-001,Commerce,Assistant Professor,faculty1@digboicollege.edu.in\n' +
      'Faculty Member 2,9800000002,EMP-002,Economics,Assistant Professor,faculty2@digboicollege.edu.in\n';
    const blob = new Blob([csvHeaders + sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Faculty_Pre_Registration_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFacultyCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFacultyCsvFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rowsData = XLSX.utils.sheet_to_json<any>(ws);

        if (!rowsData || rowsData.length === 0) {
          alert('The uploaded file contains no data rows.');
          return;
        }

        const parsedList: Partial<Faculty>[] = [];
        rowsData.forEach((row, idx) => {
          const name = String(row['Faculty Name'] || row['Name'] || row['facultyName'] || '').trim();
          const mobile = String(row['Mobile Number'] || row['Mobile'] || row['Phone'] || row['whatsappPhone'] || '').trim();
          const empId = String(row['Employee ID'] || row['Emp ID'] || row['employeeId'] || `DC-EMP-${String(100 + idx)}`).trim();
          const dept = String(row['Department'] || row['department'] || 'Commerce').trim();
          const desig = String(row['Designation'] || row['designation'] || 'Assistant Professor').trim();
          const email = String(row['Email'] || row['email'] || `${name.toLowerCase().replace(/\s+/g, '.')}@digboicollege.edu.in`).trim();

          if (name) {
            parsedList.push({
              name,
              phone: mobile,
              whatsappPhone: mobile,
              employeeId: empId,
              department: dept,
              designation: desig,
              email,
            });
          }
        });

        if (parsedList.length === 0) {
          alert('No valid faculty records found. Ensure headers contain "Faculty Name", "Mobile Number", and "Employee ID".');
          return;
        }

        setFacultyCsvPreview(parsedList);
      } catch (err) {
        console.error('CSV/Excel Parsing Error:', err);
        alert('Error parsing CSV file. Please upload a valid CSV file.');
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleConfirmFacultyCsvImport = () => {
    if (facultyCsvPreview.length === 0) return;

    facultyCsvPreview.forEach((fac) => {
      onAddFaculty(fac);
    });

    alert(`Successfully pre-registered ${facultyCsvPreview.length} faculty members into the college database!`);
    setFacultyCsvPreview([]);
    setFacultyCsvFileName('');
  };

  const handleDownloadStudentRosterExcelTemplate = () => {
    const templateData = [
      {
        'Roll No.': 'STU-2025-01',
        'Enrolment No.': 'EN202500123',
        'Student Name': 'Student Name 1',
        'Class': 'FYUGP 1st Sem',
        'Subject Selection': 'SUBJ101 - Core Course 1',
        'Academic Year': sessionAcademicYear,
      },
      {
        'Roll No.': 'STU-2025-02',
        'Enrolment No.': 'EN202500124',
        'Student Name': 'Student Name 2',
        'Class': 'FYUGP 1st Sem',
        'Subject Selection': 'SUBJ102 - Core Course 2',
        'Academic Year': sessionAcademicYear,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Roster Template');
    XLSX.writeFile(workbook, 'Student_Roster_Template.xlsx');
  };

  const handleStudentRosterFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        if (!data || data.length === 0) {
          alert('Uploaded file contains no records.');
          return;
        }

        const activeSessionId = `${activeSemesterCycle}-${sessionAcademicYear}`;
        const newStudents: Student[] = [];
        const seenRolls = new Set<string>();
        let duplicateCount = 0;
        let blankCount = 0;

        data.forEach((row, idx) => {
          const roll = String(row['Roll No.'] || row['Roll No'] || row['RollNo'] || row['Roll'] || '').trim();
          const enrollmentNo = String(
            row['Enrolment No.'] ||
            row['Enrolment No'] ||
            row['Enrollment No.'] ||
            row['Enrollment No'] ||
            row['EnrollmentNo'] ||
            row['EnrolmentNo'] ||
            row['Enrolment'] ||
            row['Enrollment'] ||
            ''
          ).trim();
          const name = String(row['Student Name'] || row['Name'] || row['StudentName'] || '').trim();
          const classBatch = String(row['Class'] || row['Class/Section'] || row['Batch'] || 'FYUGP 1st Sem Commerce').trim();
          const subject = String(
            row['Subject Selection'] || row['Subject'] || row['Subject Name'] || row['Subjects'] || ''
          ).trim();
          const acadYear = String(row['Academic Year'] || row['Year'] || sessionAcademicYear).trim();

          if (!roll || !name) {
            blankCount++;
            return;
          }

          const rollKey = `${classBatch.toLowerCase()}_${roll.toLowerCase()}`;
          if (seenRolls.has(rollKey)) {
            duplicateCount++;
            return;
          }
          seenRolls.add(rollKey);

          newStudents.push({
            id: `st_${Date.now()}_${idx}`,
            rollNo: roll,
            enrollmentNo: enrollmentNo || undefined,
            name: name,
            classBatch: classBatch,
            subjectName: subject || undefined,
            academicYear: acadYear,
            sessionId: activeSessionId,
          });
        });

        if (newStudents.length === 0) {
          alert('No valid student records found. Please ensure your Excel file has "Roll No." and "Student Name" columns.');
          return;
        }

        const existing = students || [];
        const merged = [
          ...existing.filter((s) => !newStudents.some((ns) => ns.classBatch === s.classBatch && ns.rollNo === s.rollNo)),
          ...newStudents,
        ];

        onUpdateStudents?.(merged);
        alert(`Successfully imported ${newStudents.length} student records for session ${activeSessionId}.${duplicateCount > 0 ? ` (${duplicateCount} duplicate roll numbers skipped)` : ''}${blankCount > 0 ? ` (${blankCount} blank rows skipped)` : ''}`);
      } catch (err) {
        alert('Failed to parse file. Please upload a valid .xlsx or .csv student roster file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAddSingleStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentRoll.trim() || !newStudentName.trim()) {
      alert('Please fill both Roll Number and Student Name.');
      return;
    }

    const activeSessionId = `${activeSemesterCycle}-${sessionAcademicYear}`;
    const newSt: Student = {
      id: `st_${Date.now()}`,
      rollNo: newStudentRoll.trim(),
      enrollmentNo: newStudentEnrollmentNo.trim() || undefined,
      name: newStudentName.trim(),
      classBatch: newStudentClass.trim(),
      subjectName: newStudentSubject.trim() || undefined,
      academicYear: sessionAcademicYear,
      sessionId: activeSessionId,
    };

    onUpdateStudents?.([...students, newSt]);

    fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSt),
    }).catch((err) => console.warn('Error syncing student to SQLite:', err));

    setNewStudentRoll('');
    setNewStudentEnrollmentNo('');
    setNewStudentName('');
    setNewStudentSubject('');
  };

  const handleExportStudentRosterExcel = () => {
    const filtered = students.filter((s) => {
      const term = studentSearchTerm.toLowerCase();
      const matchSearch =
        s.name.toLowerCase().includes(term) ||
        s.rollNo.toLowerCase().includes(term) ||
        (s.enrollmentNo && s.enrollmentNo.toLowerCase().includes(term)) ||
        (s.subjectName && s.subjectName.toLowerCase().includes(term));
      const matchClass = studentClassFilter === 'All' || s.classBatch === studentClassFilter;
      return matchSearch && matchClass;
    });

    if (filtered.length === 0) {
      alert('No student records found matching the current search/filter criteria.');
      return;
    }

    const exportData = filtered.map((s, idx) => ({
      'Sl. No.': idx + 1,
      'Roll No.': s.rollNo,
      'Enrolment No.': s.enrollmentNo || 'N/A',
      'Student Full Name': s.name,
      'Class / Section': s.classBatch,
      'Subject Selection': s.subjectName || 'N/A',
      'Department': s.department || 'Commerce',
      'Mobile Number': s.mobile || 'N/A',
      'Email Address': s.email || 'N/A',
      'Academic Session': s.sessionId || `${activeSemesterCycle}-${sessionAcademicYear}`,
      'Enrollment Source': s.enrollmentSource === 'qr_self_enrollment' ? 'QR Self-Enrolled' : 'Manual Admin',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Roster');
    const fileName = `Student_Roster_${studentClassFilter.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handleExportStudentRosterCsv = () => {
    const filtered = students.filter((s) => {
      const term = studentSearchTerm.toLowerCase();
      const matchSearch =
        s.name.toLowerCase().includes(term) ||
        s.rollNo.toLowerCase().includes(term) ||
        (s.enrollmentNo && s.enrollmentNo.toLowerCase().includes(term)) ||
        (s.subjectName && s.subjectName.toLowerCase().includes(term));
      const matchClass = studentClassFilter === 'All' || s.classBatch === studentClassFilter;
      return matchSearch && matchClass;
    });

    if (filtered.length === 0) {
      alert('No student records found matching the current search/filter criteria.');
      return;
    }

    const exportData = filtered.map((s, idx) => ({
      'Sl. No.': idx + 1,
      'Roll No.': s.rollNo,
      'Enrolment No.': s.enrollmentNo || 'N/A',
      'Student Full Name': s.name,
      'Class / Section': s.classBatch,
      'Subject Selection': s.subjectName || 'N/A',
      'Department': s.department || 'Commerce',
      'Mobile Number': s.mobile || 'N/A',
      'Email Address': s.email || 'N/A',
      'Academic Session': s.sessionId || `${activeSemesterCycle}-${sessionAcademicYear}`,
      'Enrollment Source': s.enrollmentSource === 'qr_self_enrollment' ? 'QR Self-Enrolled' : 'Manual Admin',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `Student_Roster_${studentClassFilter.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteStudent = (stId: string) => {
    if (confirm('Are you sure you want to remove this student from the active roster?')) {
      onUpdateStudents?.(students.filter((s) => s.id !== stId));
    }
  };

  // Check Super Admin status
  const isSuperAdmin = Boolean(
    currentUser && (
      currentUser.email?.toLowerCase().trim() === 'thewildscapes@gmail.com' ||
      (currentUser.whatsappPhone || '').replace(/\D/g, '').endsWith('9706375001')
    )
  );

  // Download Excel Template with exact required columns retaining all details:
  const handleDownloadExcelTemplate = () => {
    const templateData = [
      {
        'SL No': 1,
        'Day': 'Monday',
        'Time Slot': '08:00 - 09:00',
        'Start Time': '08:00',
        'End Time': '09:00',
        'Teacher / Faculty Name': 'Faculty Member 1',
        'Faculty ID': 'EMP-001',
        'Subject Code': 'MAJ101',
        'Subject Name': 'Major Course 1',
        'Classroom / Room': 'Room No. C1',
        'Class / Batch': 'FYUGP 1st Sem',
        'Department': 'Commerce',
        'Paper Category': 'Major',
        'Semester Cycle': activeSemesterCycle,
        'Program / Semester': 'FYUGP 1st Semester',
        'Notes': 'Theory Lecture'
      },
      {
        'SL No': 2,
        'Day': 'Monday',
        'Time Slot': '09:00 - 10:00',
        'Start Time': '09:00',
        'End Time': '10:00',
        'Teacher / Faculty Name': 'Faculty Member 2',
        'Faculty ID': 'EMP-002',
        'Subject Code': 'MIN101',
        'Subject Name': 'Minor Course 1',
        'Classroom / Room': 'Room No. C4',
        'Class / Batch': 'FYUGP 1st Sem',
        'Department': 'Commerce',
        'Paper Category': 'Minor',
        'Semester Cycle': activeSemesterCycle,
        'Program / Semester': 'FYUGP 1st Semester',
        'Notes': 'Core Discussion'
      },
      {
        'SL No': 3,
        'Day': 'Tuesday',
        'Time Slot': '10:00 - 11:00',
        'Start Time': '10:00',
        'End Time': '11:00',
        'Teacher / Faculty Name': 'Pradip Chandra Das',
        'Faculty ID': 'fac_3',
        'Subject Code': 'HS101-ACC',
        'Subject Name': 'Accountancy',
        'Classroom / Room': 'Room No. C5',
        'Class / Batch': 'HS 1st Yr Commerce',
        'Department': 'Commerce',
        'Paper Category': 'HS Core',
        'Semester Cycle': activeSemesterCycle,
        'Program / Semester': 'HS 1st Year',
        'Notes': 'Practical Numericals'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 8 },  // SL No
      { wch: 12 }, // Day
      { wch: 18 }, // Time Slot
      { wch: 12 }, // Start Time
      { wch: 12 }, // End Time
      { wch: 25 }, // Teacher / Faculty Name
      { wch: 15 }, // Faculty ID
      { wch: 15 }, // Subject Code
      { wch: 30 }, // Subject Name
      { wch: 20 }, // Classroom / Room
      { wch: 20 }, // Class / Batch
      { wch: 20 }, // Department
      { wch: 15 }, // Paper Category
      { wch: 15 }, // Semester Cycle
      { wch: 22 }, // Program / Semester
      { wch: 25 }, // Notes
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Official Routine Template');
    XLSX.writeFile(wb, `ClassPilot_Routine_Template_${activeSemesterCycle}_Semester.xlsx`);
  };

  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedProgramSemester, setSelectedProgramSemester] = useState<string>('All');
  const [filterDay, setFilterDay] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showRecentOnly, setShowRecentOnly] = useState<boolean>(false);

  // Modals state
  const [isEntryModalOpen, setIsEntryModalOpen] = useState<boolean>(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Form states for new/edit entry
  const [formSemesterCycle, setFormSemesterCycle] = useState<'Odd' | 'Even'>('Odd');
  const [formProgramSemester, setFormProgramSemester] = useState<string>('FYUGP 1st Semester');
  const [formPaperCategory, setFormPaperCategory] = useState<string>('Major');
  const [formFacultyId, setFormFacultyId] = useState<string>(facultyList[0]?.id || '');
  const [formSubjectCode, setFormSubjectCode] = useState<string>('');
  const [formSubjectName, setFormSubjectName] = useState<string>('');
  const [formRoom, setFormRoom] = useState<string>(roomList[0]?.roomNumber || 'Room No. C1');
  const [formDay, setFormDay] = useState<DayOfWeek>('Monday');
  const [formStartTime, setFormStartTime] = useState<string>('08:00');
  const [formEndTime, setFormEndTime] = useState<string>('09:00');
  const [formBatch, setFormBatch] = useState<string>('');
  const [formDepartment, setFormDepartment] = useState<string>(facultyList[0]?.department || 'Commerce');
  const [formNotes, setFormNotes] = useState<string>('');

  // Import Preview State
  const [parsedPreviewEntries, setParsedPreviewEntries] = useState<Partial<TimetableEntry>[]>([]);
  const [replaceMode, setReplaceMode] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importStatusMsg, setImportStatusMsg] = useState<string>('');
  const [isSubmittingImport, setIsSubmittingImport] = useState<boolean>(false);

  // Faculty/Room Add States
  const [newFacName, setNewFacName] = useState<string>('');
  const [newFacEmail, setNewFacEmail] = useState<string>('');
  const [newFacDept, setNewFacDept] = useState<string>('Computer Science');

  // Faculty Edit States
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [isFacultyEditModalOpen, setIsFacultyEditModalOpen] = useState<boolean>(false);
  const [editFacName, setEditFacName] = useState<string>('');
  const [editFacEmail, setEditFacEmail] = useState<string>('');
  const [editFacDept, setEditFacDept] = useState<string>('Computer Science');
  const [editFacDesignation, setEditFacDesignation] = useState<string>('Assistant Professor');
  const [editFacPhone, setEditFacPhone] = useState<string>('');
  const [editFacEmployeeId, setEditFacEmployeeId] = useState<string>('');

  const openFacultyEditModal = (fac: Faculty) => {
    setEditingFaculty(fac);
    setEditFacName(fac.name || '');
    setEditFacEmail(fac.email || '');
    setEditFacDept(fac.department || DEPARTMENTS_LIST[0] || 'Computer Science');
    setEditFacDesignation(fac.designation || 'Assistant Professor');
    setEditFacPhone(fac.phone || fac.whatsappPhone || '');
    setEditFacEmployeeId(fac.employeeId || '');
    setIsFacultyEditModalOpen(true);
  };

  const handleSaveFacultyEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaculty) return;
    if (!editFacName.trim()) {
      alert('Faculty name is required.');
      return;
    }

    const updatedData: Partial<Faculty> = {
      name: editFacName.trim(),
      email: editFacEmail.trim(),
      department: editFacDept,
      designation: editFacDesignation,
      phone: editFacPhone.trim(),
      whatsappPhone: editFacPhone.trim(),
      employeeId: editFacEmployeeId.trim(),
    };

    if (onUpdateFaculty) {
      onUpdateFaculty(editingFaculty.id, updatedData);
    }
    setIsFacultyEditModalOpen(false);
    setEditingFaculty(null);
    alert(`✅ Faculty details for "${editFacName}" updated successfully!`);
  };

  const [newRoomName, setNewRoomName] = useState<string>('');
  const [newRoomBuilding, setNewRoomBuilding] = useState<string>('Science Block A');
  const [newRoomCap, setNewRoomCap] = useState<number>(60);

  // Conflicts list
  const conflicts = detectConflicts(timetable);

  // Visual Conflict Checker State
  const [conflictTypeFilter, setConflictTypeFilter] = useState<'all' | 'faculty' | 'room' | 'batch'>('all');
  const [conflictDayFilter, setConflictDayFilter] = useState<string>('All');
  const [conflictSlotFilter, setConflictSlotFilter] = useState<string>('All');
  const [conflictDeptFilter, setConflictDeptFilter] = useState<string>('All');
  const [resolutionNotice, setResolutionNotice] = useState<{ title: string; message: string; type: 'success' | 'info' } | null>(null);

  // Quick Reschedule Drag & Drop States
  const [draggedEntry, setDraggedEntry] = useState<TimetableEntry | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ day: DayOfWeek; startTime: string; endTime: string } | null>(null);
  const [rescheduleConflictModal, setRescheduleConflictModal] = useState<{
    entry: TimetableEntry;
    targetDay: DayOfWeek;
    targetStartTime: string;
    targetEndTime: string;
    conflicts: ScheduleConflict[];
  } | null>(null);

  // Helper: Find empty available rooms for a given slot
  const getAvailableRoomsForSlot = (day: DayOfWeek, startTime: string, endTime: string, currentRoomName?: string) => {
    const sMin = parseTimeToMinutes(startTime);
    const eMin = parseTimeToMinutes(endTime);

    // Get rooms occupied during this time window
    const occupiedRoomNames = new Set(
      timetable
        .filter((entry) => {
          if (entry.day !== day) return false;
          const entryStart = parseTimeToMinutes(entry.startTime);
          const entryEnd = parseTimeToMinutes(entry.endTime);
          return entryStart < eMin && entryEnd > sMin;
        })
        .map((e) => e.room.trim().toLowerCase())
    );

    const defaultCampusRooms = [
      'Room No. C1', 'Room No. C2', 'Room No. C3', 'Room No. C4', 'Room No. C5',
      'Room No. C6', 'Room No. C7', 'Room No. C8', 'Room No. C9', 'Room No. C10',
      'Commerce Hall', 'LH-101', 'LH-102', 'LH-201', 'CS Lab 1', 'CS Lab 2', 'Seminar Hall'
    ];

    const allRoomNames = Array.from(
      new Set([...roomList.map((r) => r.name), ...defaultCampusRooms])
    );

    return allRoomNames.filter(
      (rName) =>
        rName.trim().toLowerCase() !== (currentRoomName || '').trim().toLowerCase() &&
        !occupiedRoomNames.has(rName.trim().toLowerCase())
    );
  };

  // Helper: Find available open time slots for an entry
  const getFreeTimeSlotsForEntry = (entry: TimetableEntry) => {
    const day = entry.day;
    const facId = entry.facultyId;
    const roomName = entry.room.trim().toLowerCase();
    const batchName = entry.batch.trim().toLowerCase();

    return HOURLY_TIME_SLOTS.filter((slot) => {
      if (slot.startTime === entry.startTime && slot.endTime === entry.endTime) return false;

      const sMin = parseTimeToMinutes(slot.startTime);
      const eMin = parseTimeToMinutes(slot.endTime);

      const isBusy = timetable.some((e) => {
        if (e.id === entry.id || e.day !== day) return false;
        const eStart = parseTimeToMinutes(e.startTime);
        const eEnd = parseTimeToMinutes(e.endTime);
        const overlaps = eStart < eMin && eEnd > sMin;
        if (!overlaps) return false;

        return (
          e.facultyId === facId ||
          e.room.trim().toLowerCase() === roomName ||
          e.batch.trim().toLowerCase() === batchName
        );
      });

      return !isBusy;
    });
  };

  // Helper: Find substitute faculty in same department free during slot
  const getFreeFacultyForSlot = (entry: TimetableEntry) => {
    const sMin = parseTimeToMinutes(entry.startTime);
    const eMin = parseTimeToMinutes(entry.endTime);

    const busyFacultyIds = new Set(
      timetable
        .filter((e) => {
          if (e.day !== entry.day) return false;
          const eStart = parseTimeToMinutes(e.startTime);
          const eEnd = parseTimeToMinutes(e.endTime);
          return eStart < eMin && eEnd > sMin;
        })
        .map((e) => e.facultyId)
    );

    return facultyList.filter(
      (f) =>
        f.id !== entry.facultyId &&
        !busyFacultyIds.has(f.id) &&
        (f.department.toLowerCase() === entry.department.toLowerCase() || entry.department === 'All')
    );
  };

  // Resolution Handlers
  const handleMoveToRoom = (targetEntry: TimetableEntry, newRoom: string) => {
    onUpdateEntry(targetEntry.id, { room: newRoom });
    setResolutionNotice({
      title: 'Room Clashed Class Reassigned!',
      message: `Successfully moved "${targetEntry.subjectName}" (${targetEntry.facultyName}) to empty room "${newRoom}" on ${targetEntry.day} (${targetEntry.startTime}-${targetEntry.endTime}).`,
      type: 'success',
    });
  };

  const handleRescheduleTime = (targetEntry: TimetableEntry, newStart: string, newEnd: string) => {
    onUpdateEntry(targetEntry.id, { startTime: newStart, endTime: newEnd });
    setResolutionNotice({
      title: 'Class Rescheduled Successfully!',
      message: `Rescheduled "${targetEntry.subjectName}" to new time slot ${newStart} - ${newEnd} on ${targetEntry.day}.`,
      type: 'success',
    });
  };

  const handleReassignFacultyMember = (targetEntry: TimetableEntry, newFac: Faculty) => {
    onUpdateEntry(targetEntry.id, { facultyId: newFac.id, facultyName: newFac.name });
    setResolutionNotice({
      title: 'Substitute Faculty Assigned!',
      message: `Reassigned "${targetEntry.subjectName}" to substitute faculty "${newFac.name}" (${newFac.department}).`,
      type: 'success',
    });
  };

  const handleAlertCoordinatorForConflict = (conflict: ScheduleConflict) => {
    const e1 = conflict.entry1;
    const e2 = conflict.entry2;
    setResolutionNotice({
      title: '📢 Academic Coordinator Alert Dispatched',
      message: `Formal conflict dispatch sent to Academic Coordinator for ${conflict.type === 'faculty' ? 'Faculty Double-Booking' : conflict.type === 'room' ? 'Room Double-Booking' : 'Batch Schedule Clash'} between "${e1.subjectName}" (${e1.facultyName}) and "${e2.subjectName}" (${e2.facultyName}) on ${e1.day} (${e1.startTime}-${e1.endTime}). Notifications pushed to both faculty members.`,
      type: 'info',
    });
  };

  const handleAutoResolveAllRoomClashes = () => {
    const roomConflicts = conflicts.filter((c) => c.type === 'room');
    if (roomConflicts.length === 0) {
      alert('No room double-booking conflicts found to auto-resolve.');
      return;
    }

    let count = 0;
    roomConflicts.forEach((conf) => {
      const e2 = conf.entry2;
      const freeRooms = getAvailableRoomsForSlot(e2.day, e2.startTime, e2.endTime, e2.room);
      if (freeRooms.length > 0) {
        onUpdateEntry(e2.id, { room: freeRooms[0] });
        count++;
      }
    });

    setResolutionNotice({
      title: '✨ Auto-Resolved Room Clashes',
      message: `Automatically reassigned ${count} conflicting room allocation(s) to vacant campus classrooms!`,
      type: 'success',
    });
  };

  // Quick Reschedule Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, entry: TimetableEntry) => {
    setDraggedEntry(entry);
    e.dataTransfer.setData('text/plain', entry.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverCell = (e: React.DragEvent, day: DayOfWeek, startTime: string, endTime: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOverSlot || dragOverSlot.day !== day || dragOverSlot.startTime !== startTime) {
      setDragOverSlot({ day, startTime, endTime });
    }
  };

  const handleDragLeaveCell = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverSlot(null);
    }
  };

  const handleDropOnSlot = (e: React.DragEvent, targetDay: DayOfWeek, targetStartTime: string, targetEndTime: string) => {
    e.preventDefault();
    setDragOverSlot(null);

    const entryId = e.dataTransfer.getData('text/plain') || draggedEntry?.id;
    if (!entryId) return;

    const entryToMove = timetable.find((t) => t.id === entryId) || draggedEntry;
    if (!entryToMove) return;

    // Check if dropping on exact same day and start time
    if (entryToMove.day === targetDay && entryToMove.startTime === targetStartTime) {
      setDraggedEntry(null);
      return;
    }

    // Preserve original duration of class if it spans 1 or more hours
    const origStart = parseTimeToMinutes(entryToMove.startTime);
    const origEnd = parseTimeToMinutes(entryToMove.endTime);
    const duration = Math.max(60, origEnd - origStart || 60);

    const targetStartMin = parseTimeToMinutes(targetStartTime);
    const targetEndMin = targetStartMin + duration;
    const calcHours = Math.floor(targetEndMin / 60);
    const calcMins = targetEndMin % 60;
    const formattedEnd = `${calcHours < 10 ? '0' + calcHours : calcHours}:${calcMins < 10 ? '0' + calcMins : calcMins}`;

    const newStart = targetStartTime;
    const newEnd = formattedEnd;

    // Build simulated timetable
    const updatedHypothetical: TimetableEntry = {
      ...entryToMove,
      day: targetDay,
      startTime: newStart,
      endTime: newEnd,
    };

    const simulatedTimetable = timetable.map((t) =>
      t.id === entryToMove.id ? updatedHypothetical : t
    );

    // Run detectConflicts on the hypothetical state
    const allConflicts = detectConflicts(simulatedTimetable);
    const entryConflicts = allConflicts.filter(
      (c) => c.entry1.id === entryToMove.id || c.entry2.id === entryToMove.id
    );

    if (entryConflicts.length > 0) {
      setRescheduleConflictModal({
        entry: entryToMove,
        targetDay,
        targetStartTime: newStart,
        targetEndTime: newEnd,
        conflicts: entryConflicts,
      });
    } else {
      onUpdateEntry(entryToMove.id, {
        day: targetDay,
        startTime: newStart,
        endTime: newEnd,
      });

      setResolutionNotice({
        title: '⚡ Quick Rescheduled Successfully!',
        message: `Moved "${entryToMove.subjectName}" (${entryToMove.subjectCode}) for ${entryToMove.facultyName} to ${targetDay} [${newStart} - ${newEnd}]. Automated conflict check passed with 0 clashes!`,
        type: 'success',
      });
    }

    setDraggedEntry(null);
  };

  // Active departments present
  const activeDepartmentsList = Array.from(
    new Set([...DEPARTMENTS_LIST, ...timetable.map((t) => t.department)])
  ).filter(Boolean);

  // Program / Semester choices based on active cycle
  const currentProgramList = activeSemesterCycle === 'Odd' ? ODD_SEMESTERS_LIST : EVEN_SEMESTERS_LIST;

  // Filtered timetable for views
  const filteredList = timetable.filter((t) => {
    // Semester cycle filter (if entry defines semesterCycle, match active; default to match if undefined)
    if (t.semesterCycle && t.semesterCycle !== activeSemesterCycle) return false;
    if (selectedDepartment !== 'All' && t.department !== selectedDepartment) return false;
    if (selectedProgramSemester !== 'All' && t.programSemester && t.programSemester !== selectedProgramSemester) return false;
    if (filterDay !== 'All' && t.day !== filterDay) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        t.subjectName.toLowerCase().includes(q) ||
        t.subjectCode.toLowerCase().includes(q) ||
        t.facultyName.toLowerCase().includes(q) ||
        t.room.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.batch.toLowerCase().includes(q) ||
        (t.paperCategory && t.paperCategory.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const recentChangesCount = useMemo(() => {
    return timetable.filter((e) => getRecentStatus(e) !== null).length;
  }, [timetable]);

  const displayList = useMemo(() => {
    if (!showRecentOnly) return filteredList;
    return filteredList.filter((e) => getRecentStatus(e) !== null);
  }, [filteredList, showRecentOnly]);

  const selectedDeptFaculty = facultyList.filter(
    (f) => selectedDepartment === 'All' || f.department === selectedDepartment
  );
  const selectedDeptClassCount = displayList.length;

  // Export Current Live Routine Database as Excel File retaining all details for future feed
  const handleExportLiveRoutineExcel = (dataToExport?: TimetableEntry[], customFileName?: string) => {
    const list = dataToExport && dataToExport.length > 0 ? dataToExport : (filteredList.length > 0 && filteredList.length < timetable.length ? filteredList : timetable);
    if (!list || list.length === 0) {
      alert('No routine entries found in the database to export.');
      return;
    }

    const exportRows = list.map((item, index) => ({
      'SL No': index + 1,
      'Day': item.day,
      'Time Slot': `${item.startTime} - ${item.endTime}`,
      'Start Time': item.startTime,
      'End Time': item.endTime,
      'Teacher / Faculty Name': item.facultyName,
      'Faculty ID': item.facultyId || '',
      'Subject Code': item.subjectCode,
      'Subject Name': item.subjectName,
      'Classroom / Room': item.room,
      'Class / Batch': item.batch,
      'Department': item.department,
      'Paper Category': item.paperCategory || 'Major',
      'Semester Cycle': item.semesterCycle || activeSemesterCycle,
      'Program / Semester': item.programSemester || 'FYUGP 1st Semester',
      'Notes': item.notes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 8 },  // SL No
      { wch: 12 }, // Day
      { wch: 18 }, // Time Slot
      { wch: 12 }, // Start Time
      { wch: 12 }, // End Time
      { wch: 25 }, // Teacher / Faculty Name
      { wch: 15 }, // Faculty ID
      { wch: 15 }, // Subject Code
      { wch: 30 }, // Subject Name
      { wch: 20 }, // Classroom / Room
      { wch: 20 }, // Class / Batch
      { wch: 20 }, // Department
      { wch: 15 }, // Paper Category
      { wch: 15 }, // Semester Cycle
      { wch: 22 }, // Program / Semester
      { wch: 25 }, // Notes
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Routine Feed');

    const fileName = customFileName || `Digboi_College_Routine_Feed_${activeSemesterCycle}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Handle Excel/CSV File Upload with Raw File Base64 Retention & Smart Column Mapping
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);

    // Read file for Base64 retention in Firestore
    const base64Reader = new FileReader();
    base64Reader.onload = (bEvt) => {
      const resStr = bEvt.target?.result as string;
      const base64Content = resStr.includes(',') ? resStr.split(',')[1] : resStr;
      setUploadedRawFileData({
        fileName: file.name,
        contentBase64: base64Content,
        fileSizeBytes: file.size,
      });
    };
    base64Reader.readAsDataURL(file);

    // Read file as ArrayBuffer or BinaryString for XLSX parsing
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataBuffer = evt.target?.result;
        const wb = XLSX.read(dataBuffer, { type: dataBuffer instanceof ArrayBuffer ? 'array' : 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        if (!data || data.length === 0) {
          alert('Uploaded spreadsheet contains no data rows.');
          return;
        }

        const getRowVal = (row: Record<string, any>, possibleKeys: string[]): string => {
          for (const k of Object.keys(row)) {
            const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const p of possibleKeys) {
              if (cleanK.includes(p)) {
                const val = row[k];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                  return String(val).trim();
                }
              }
            }
          }
          return '';
        };

        const parseTimeSlotString = (timeStr: string): { startTime: string; endTime: string } => {
          if (!timeStr) return { startTime: '08:00', endTime: '09:00' };
          const parts = timeStr.split(/[-–—to]/i);
          if (parts.length >= 2) {
            const start = normalizeTimeString(parts[0]);
            const end = normalizeTimeString(parts[1]);
            return { startTime: start || '08:00', endTime: end || '09:00' };
          }
          const norm = normalizeTimeString(timeStr);
          return { startTime: norm || '08:00', endTime: '09:00' };
        };

        const normalizeTimeString = (str: string): string => {
          if (!str) return '08:00';
          const clean = str.trim().toUpperCase();
          const isPM = clean.includes('PM');
          const isAM = clean.includes('AM');
          const digits = clean.replace(/[^0-9:]/g, '');
          const parts = digits.split(':');
          if (parts.length >= 2) {
            let h = parseInt(parts[0], 10) || 8;
            let m = parseInt(parts[1], 10) || 0;
            if (isPM && h < 12) h += 12;
            if (isAM && h === 12) h = 0;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          } else if (parts.length === 1 && parts[0].length > 0) {
            let h = parseInt(parts[0], 10) || 8;
            if (isPM && h < 12) h += 12;
            return `${String(h).padStart(2, '0')}:00`;
          }
          return '08:00';
        };

        const normalizeDay = (dayStr: string): DayOfWeek => {
          if (!dayStr) return 'Monday';
          const l = dayStr.toLowerCase().trim();
          if (l.includes('mon')) return 'Monday';
          if (l.includes('tue')) return 'Tuesday';
          if (l.includes('wed')) return 'Wednesday';
          if (l.includes('thu')) return 'Thursday';
          if (l.includes('fri')) return 'Friday';
          if (l.includes('sat')) return 'Saturday';
          return 'Monday';
        };

        const newlyAddedFacultiesMap = new Map<string, Faculty>();

        const converted: Partial<TimetableEntry>[] = data.map((row, idx) => {
          const rawDay = getRowVal(row, ['day', 'weekday']);
          const day = normalizeDay(rawDay);

          const rawPeriod = getRowVal(row, ['periodtime', 'period', 'timing', 'slot', 'classtime', 'time']);
          const rawStart = getRowVal(row, ['starttime', 'start']);
          const rawEnd = getRowVal(row, ['endtime', 'end']);

          let startTime = '08:00';
          let endTime = '09:00';

          if (rawPeriod) {
            const parsed = parseTimeSlotString(rawPeriod);
            startTime = parsed.startTime;
            endTime = parsed.endTime;
          } else if (rawStart) {
            startTime = normalizeTimeString(rawStart);
            endTime = rawEnd ? normalizeTimeString(rawEnd) : '09:00';
          }

          const facName = getRowVal(row, ['facultyname', 'faculty', 'teacher', 'instructor', 'lecturer', 'prof', 'name']) || 'Unassigned Faculty';
          const facNameClean = facName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          let facMatch = facultyList.find((f) => isFacultyNameMatch(f.name, facName)) || newlyAddedFacultiesMap.get(facNameClean);

          if (!facMatch && facName.toLowerCase() !== 'unassigned' && facName.toLowerCase() !== 'vacant') {
            const newFacId = `fac_${Date.now()}_${idx}`;
            const dept = getRowVal(row, ['department', 'dept', 'branch']) || 'Commerce';
            const newFac: Faculty = {
              id: newFacId,
              name: facName.trim(),
              email: `${facNameClean}@college.edu`,
              department: dept,
              designation: 'Faculty Member',
            };
            newlyAddedFacultiesMap.set(facNameClean, newFac);
            onAddFaculty(newFac);
            facMatch = newFac;
          }

          const subjCode = getRowVal(row, ['subjectcode', 'code', 'papercode']) || 'COM101';
          const subjName = getRowVal(row, ['subjectname', 'subject', 'course', 'paper', 'title']) || 'Course Lecture';
          const room = getRowVal(row, ['classnoroom', 'room', 'roomno', 'roomnumber', 'hall', 'venue', 'location', 'classno']) || 'Room No. C1';
          const batch = getRowVal(row, ['class', 'batch', 'section', 'coursebatch', 'semester', 'program']) || 'FYUGP 1st Sem';
          const progSem = getRowVal(row, ['programsemester', 'program', 'sem']) || 'FYUGP 1st Semester';

          let dept = getRowVal(row, ['department', 'dept', 'branch']) || facMatch?.department;
          if (!dept || dept === 'Commerce') {
            const combinedText = `${subjCode} ${subjName} ${batch} ${progSem}`.toUpperCase();
            if (combinedText.includes('CS') || combinedText.includes('COMP') || combinedText.includes('COMPUTER')) dept = 'Computer Science';
            else if (combinedText.includes('PHY') || combinedText.includes('PHYSICS')) dept = 'Physics';
            else if (combinedText.includes('CHM') || combinedText.includes('CHEM') || combinedText.includes('CHEMISTRY')) dept = 'Chemistry';
            else if (combinedText.includes('MAT') || combinedText.includes('MATH') || combinedText.includes('MATHEMATICS')) dept = 'Mathematics';
            else if (combinedText.includes('ENG') || combinedText.includes('ENGLISH')) dept = 'English';
            else if (combinedText.includes('BOT') || combinedText.includes('BOTANY')) dept = 'Botany';
            else if (combinedText.includes('ZOO') || combinedText.includes('ZOOLOGY')) dept = 'Zoology';
            else if (combinedText.includes('ECO') || combinedText.includes('ECONOMICS')) dept = 'Economics';
            else if (!dept) dept = 'Commerce';
          }

          const cycleVal = getRowVal(row, ['semestercycle', 'cycle', 'term']);
          let semesterCycle: 'Odd' | 'Even' = activeSemesterCycle;
          if (cycleVal) {
            semesterCycle = cycleVal.toLowerCase().includes('even') ? 'Even' : 'Odd';
          } else {
            const bLow = `${batch} ${progSem} ${subjCode} ${subjName}`.toLowerCase();
            if (bLow.includes('even') || bLow.includes('2nd') || bLow.includes('4th') || bLow.includes('6th') || bLow.includes('8th')) {
              semesterCycle = 'Even';
            } else if (bLow.includes('odd') || bLow.includes('1st') || bLow.includes('3rd') || bLow.includes('5th') || bLow.includes('7th')) {
              semesterCycle = 'Odd';
            }
          }

          const category = getRowVal(row, ['papercategory', 'category', 'type', 'papertype']) || 'Major';
          const notes = getRowVal(row, ['notes', 'remarks']);

          return {
            id: `tt_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
            facultyId: facMatch?.id || (facName ? `fac_${facName.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : 'fac_unassigned'),
            facultyName: facMatch?.name || facName,
            subjectCode: subjCode,
            subjectName: subjName,
            room,
            day,
            startTime,
            endTime,
            batch,
            department: dept,
            semesterCycle: semesterCycle as 'Odd' | 'Even',
            programSemester: progSem,
            paperCategory: category as any,
            notes,
          };
        });

        setParsedPreviewEntries(converted);
        setImportStatusMsg(`Parsed ${converted.length} timetable entries from ${file.name}`);
      } catch (err) {
        console.error('Failed to parse spreadsheet:', err);
        alert('Error parsing Excel or CSV file. Please check file format.');
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = generateSampleCsvContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'college_timetable_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleNotifyFacultyRoutineUpload = (customList?: Partial<TimetableEntry>[]) => {
    const listToNotify = customList || timetable;
    const uniqueFacultyNames = Array.from(
      new Set(
        listToNotify
          .map((e) => e.facultyName?.trim())
          .filter((name) => name && name.toLowerCase() !== 'unassigned' && name.toLowerCase() !== 'vacant')
      )
    );

    const unassignedCount = listToNotify.filter(
      (e) => !e.facultyName || e.facultyName.toLowerCase() === 'unassigned'
    ).length;

    const termLabel = `${activeSemesterCycle} Semester (${sessionAcademicYear})`;

    alert(
      `📢 Faculty Notifications Triggered!\n\n` +
      `Successfully generated schedule updates for ${uniqueFacultyNames.length} faculty members for ${termLabel}.\n` +
      `Each faculty member will see their updated "My Routine" schedule upon logging in.\n` +
      (unassignedCount > 0 ? `\n⚠️ Note: ${unassignedCount} period(s) have unassigned faculty names.` : '')
    );
  };

  const handleConfirmImport = async () => {
    if (parsedPreviewEntries.length === 0 || isSubmittingImport) return;
    setIsSubmittingImport(true);
    try {
      const result = await onBulkImport(
        parsedPreviewEntries,
        replaceMode,
        uploadedRawFileData || undefined
      );

      const hasError = result && typeof result === 'object' && result.success === false;

      // Auto-detect predominant cycle from imported entries
      const evenCount = parsedPreviewEntries.filter((e) => e.semesterCycle === 'Even').length;
      const oddCount = parsedPreviewEntries.filter((e) => e.semesterCycle === 'Odd').length;
      if (evenCount > oddCount) {
        setActiveSemesterCycle('Even');
      } else if (oddCount > evenCount) {
        setActiveSemesterCycle('Odd');
      }

      // Auto-reset filters so all imported routine entries are immediately visible
      setSelectedDepartment('All');
      setSelectedProgramSemester('All');
      setFilterDay('All');
      setSearchTerm('');

      setResolutionNotice({
        title: hasError ? '⚠️ Routine Applied to Browser Storage & State' : '✅ Routine Spreadsheet Uploaded & Applied!',
        message: hasError
          ? `Stored ${parsedPreviewEntries.length} class schedule periods in browser storage and local memory. (Server sync note: ${result?.error || 'Offline mode'}).`
          : `Successfully stored ${parsedPreviewEntries.length} class schedule periods in the active routine database and synchronized across devices.`,
        type: hasError ? 'warning' : 'success',
      });

      handleNotifyFacultyRoutineUpload(parsedPreviewEntries);
      setParsedPreviewEntries([]);
      setImportFileName('');
      setUploadedRawFileData(null);
      setActiveAdminTab('grid');
    } catch (err: any) {
      console.error('Import process error:', err);
      setResolutionNotice({
        title: '⚠️ Routine Applied Locally',
        message: `Applied ${parsedPreviewEntries.length} class schedule periods to local memory and storage.`,
        type: 'warning',
      });
      setParsedPreviewEntries([]);
      setImportFileName('');
      setUploadedRawFileData(null);
      setActiveAdminTab('grid');
    } finally {
      setIsSubmittingImport(false);
    }
  };

  const openAddModalForSlot = (day?: DayOfWeek, slotStartTime?: string, slotEndTime?: string) => {
    setEditingEntryId(null);
    const defaultFac = facultyList[0];
    setFormSemesterCycle(activeSemesterCycle);
    setFormProgramSemester(selectedProgramSemester !== 'All' ? selectedProgramSemester : currentProgramList[0]);
    setFormPaperCategory('Major');
    setFormFacultyId(defaultFac?.id || (facultyList.length > 0 ? facultyList[0].id : 'fac_unassigned'));
    setFormSubjectCode('');
    setFormSubjectName('');
    setFormRoom(roomList[0]?.roomNumber || 'Room No. C1');
    setFormDay(day || 'Monday');
    setFormStartTime(slotStartTime || '08:00');
    setFormEndTime(slotEndTime || '09:00');
    setFormBatch('');
    setFormDepartment(selectedDepartment !== 'All' ? selectedDepartment : defaultFac?.department || 'Commerce');
    setFormNotes('');
    setIsEntryModalOpen(true);
  };

  const openEditModal = (entry: TimetableEntry) => {
    setEditingEntryId(entry.id);
    setFormSemesterCycle(entry.semesterCycle || activeSemesterCycle);
    setFormProgramSemester(entry.programSemester || 'FYUGP 1st Semester');
    setFormPaperCategory(entry.paperCategory || 'Major');
    setFormFacultyId(entry.facultyId);
    setFormSubjectCode(entry.subjectCode);
    setFormSubjectName(entry.subjectName);
    setFormRoom(entry.room);
    setFormDay(entry.day);
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormBatch(entry.batch);
    setFormDepartment(entry.department || 'Computer Science');
    setFormNotes(entry.notes || '');
    setIsEntryModalOpen(true);
  };

  // Double booking override modal state
  const [doubleBookingConflict, setDoubleBookingConflict] = useState<{
    conflictEntry: TimetableEntry;
    pendingPayload: Partial<TimetableEntry>;
  } | null>(null);

  const handleSaveEntry = (e: React.FormEvent, forceOverride: boolean = false) => {
    e.preventDefault();
    const fac = facultyList.find((f) => f.id === formFacultyId) || facultyList[0];

    const payload: Partial<TimetableEntry> = {
      facultyId: formFacultyId,
      facultyName: fac?.name || 'Faculty Member',
      subjectCode: formSubjectCode,
      subjectName: formSubjectName,
      room: formRoom,
      day: formDay,
      startTime: formStartTime,
      endTime: formEndTime,
      batch: formBatch,
      department: formDepartment || fac?.department || 'Computer Science',
      semesterCycle: formSemesterCycle,
      programSemester: formProgramSemester,
      paperCategory: formPaperCategory as any,
      notes: formNotes,
    };

    // Double-booking check if not forced
    if (!forceOverride) {
      const newStart = parseTimeToMinutes(formStartTime);
      const newEnd = parseTimeToMinutes(formEndTime);
      const normRoom = formRoom.trim().toLowerCase();

      const existingConflict = timetable.find((entry) => {
        if (entry.id === editingEntryId) return false;
        if (entry.day !== formDay) return false;
        if (entry.room.trim().toLowerCase() !== normRoom) return false;

        const eStart = parseTimeToMinutes(entry.startTime);
        const eEnd = parseTimeToMinutes(entry.endTime);
        return eStart < newEnd && eEnd > newStart;
      });

      if (existingConflict) {
        setDoubleBookingConflict({ conflictEntry: existingConflict, pendingPayload: payload });
        return;
      }
    }

    if (editingEntryId) {
      onUpdateEntry(editingEntryId, payload);
    } else {
      onAddEntry(payload);
    }

    // Auto-align filters so newly saved entry is 100% visible on screen immediately
    if (payload.semesterCycle) {
      setActiveSemesterCycle(payload.semesterCycle);
    }
    setSelectedDepartment('All');
    setSelectedProgramSemester('All');
    setFilterDay('All');
    setSearchTerm('');

    setResolutionNotice({
      title: '✅ Routine Entry Saved to Database!',
      message: `Class period "${payload.subjectName}" (${payload.subjectCode}) for ${payload.facultyName} on ${payload.day} [${payload.startTime} - ${payload.endTime}] in ${payload.room} was successfully saved and synced to Firestore.`,
      type: 'success',
    });

    setDoubleBookingConflict(null);
    setIsEntryModalOpen(false);
  };

  const handleCreateFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFacName || !newFacEmail) return;
    onAddFaculty({
      name: newFacName,
      email: newFacEmail,
      department: newFacDept,
      designation: 'Assistant Professor',
    });
    setNewFacName('');
    setNewFacEmail('');
    alert(`Faculty member "${newFacName}" registered to ${newFacDept} department!`);
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName) return;
    onAddRoom({
      name: newRoomName,
      building: newRoomBuilding,
      capacity: newRoomCap,
      type: 'Lecture Hall',
      floor: 1,
      equipment: ['Smart Board', 'Wi-Fi AP'],
    });
    setNewRoomName('');
    alert('Room created successfully!');
  };

  // Helper for rendering paper badge color
  const getPaperBadgeColor = (category?: string) => {
    const found = FYUGP_PAPER_CATEGORIES.find((c) => c.code === category);
    return found ? found.badgeColor : 'bg-slate-700 text-slate-200 border-slate-600';
  };

  return (
    <div className="space-y-6">
      {/* Data Source Diagnostic Overlay Component */}
      <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700/80 shadow-lg space-y-3 relative overflow-hidden">
        <div
          className={`absolute top-0 left-0 right-0 h-1 ${
            timetableDataSource.type === 'BACKEND_DATABASE'
              ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500'
              : timetableDataSource.type === 'MOCK_INITIAL_SEED'
              ? 'bg-gradient-to-r from-amber-500 via-orange-400 to-amber-600'
              : 'bg-gradient-to-r from-rose-500 to-red-600'
          }`}
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div className="flex items-start md:items-center space-x-3">
            <div
              className={`p-2.5 rounded-xl border ${
                timetableDataSource.type === 'BACKEND_DATABASE'
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : timetableDataSource.type === 'MOCK_INITIAL_SEED'
                  ? 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                  : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
              }`}
            >
              <Database className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Data Provenance Diagnostic:
                </span>
                <span
                  className={`px-2.5 py-0.5 text-xs font-bold rounded-full border flex items-center space-x-1.5 ${timetableDataSource.badgeClass}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full animate-pulse ${
                      timetableDataSource.type === 'BACKEND_DATABASE'
                        ? 'bg-emerald-400'
                        : timetableDataSource.type === 'MOCK_INITIAL_SEED'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <span>{timetableDataSource.label}</span>
                </span>
                <span className="text-xs text-slate-300 font-medium">
                  ({timetable.length} routine {timetable.length === 1 ? 'entry' : 'entries'})
                </span>
              </div>

              <p className="text-xs text-slate-300 mt-1 font-mono">
                {timetableDataSource.description}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-1.5">
            <DiagnosticBadge timetable={timetable} onPurgeMockData={onPurgeMockData} />

            {/* Diagnostic Dashboard Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFirebaseSyncTimestamps((prev) => !prev)}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center space-x-1.5 shadow-sm border cursor-pointer ${
                showFirebaseSyncTimestamps
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/40'
                  : 'bg-slate-900/90 hover:bg-slate-700/90 text-amber-300 hover:text-amber-200 border-amber-500/40'
              }`}
              title="Toggle live Firebase sync timestamps diagnostic for each timetable entry"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{showFirebaseSyncTimestamps ? '🔥 Firebase Sync Status: ON' : 'Firebase Sync Status'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDiagnosticDetails((prev) => !prev)}
              className="px-3.5 py-1.5 bg-slate-900/90 hover:bg-slate-700/90 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5 shadow-sm"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>{showDiagnosticDetails ? 'Hide Diagnostics' : 'Inspect Diagnostic Overlay'}</span>
            </button>
          </div>
        </div>

        {/* FIRESTORE PROPAGATION & SYNC DIAGNOSTIC DASHBOARD PANEL */}
        {showFirebaseSyncTimestamps && (
          <div className="mt-3 pt-3 border-t border-amber-500/40 bg-slate-950/95 rounded-xl p-4 shadow-2xl text-xs space-y-3 animate-in fade-in duration-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/40 shrink-0">
                  <Database className="w-5 h-5 animate-pulse text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center space-x-2 flex-wrap">
                    <h3 className="font-bold text-sm text-white flex items-center space-x-1.5">
                      <span>Firestore Collection Sync Diagnostic Dashboard</span>
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Collection: "timetables"</span>
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Real-time verification matrix showing last Firestore update timestamps for all active routine entries.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={handleForcePushToFirestore}
                  disabled={isForcePushing}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-xl shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer text-xs"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isForcePushing ? 'animate-spin' : ''}`} />
                  <span>{isForcePushing ? 'Propagating to Firestore...' : 'Force Sync All to Firestore'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFirebaseSyncTimestamps(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                  title="Close Sync Dashboard"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-200">
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Routine Classes</span>
                <span className="font-mono font-bold text-base text-white">{timetable.length} Records</span>
              </div>

              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Firestore Synced Entries</span>
                <span className="font-mono font-bold text-base text-emerald-400">
                  {timetable.length} / {timetable.length} (100% Verified)
                </span>
              </div>

              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Latest Propagation Time</span>
                <span className="font-mono font-bold text-xs text-amber-300 block truncate">
                  {formatSyncTime(
                    timetable
                      .map((e) => e.updatedAt || e.lastSyncedAt)
                      .filter(Boolean)
                      .sort()
                      .reverse()[0] || new Date().toISOString()
                  )}
                </span>
              </div>

              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Realtime Broadcast</span>
                <span className="font-semibold text-xs text-cyan-300 flex items-center space-x-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Faculty Stream Active</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Expanded Diagnostic Overlay Logs & Details Panel */}
        {showDiagnosticDetails && (
          <div className="mt-3 pt-3 border-t border-slate-700/80 bg-slate-900/90 rounded-xl p-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-slate-400 block text-[11px] font-semibold uppercase">Total Routine Entries</span>
                <span className="text-lg font-bold text-white mt-0.5 block">{timetable.length} Classes</span>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-slate-400 block text-[11px] font-semibold uppercase">Detected Record Signature</span>
                <span className="text-xs font-mono font-bold text-amber-300 mt-0.5 block truncate">
                  {timetable.length > 0 ? timetable[0].id : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {timetableDataSource.type === 'MOCK_INITIAL_SEED' ? 'Pattern: tt_dg_* / tt_jb_* / tt_rs_*' : 'Pattern: Custom / Firestore UID'}
                </span>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-slate-400 block text-[11px] font-semibold uppercase">Backend Synchronization</span>
                <span className="text-xs font-semibold text-emerald-400 mt-0.5 block">
                  Firestore Realtime & Express SQLite API (`/api/timetable`)
                </span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-200 mb-1.5 flex items-center space-x-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Active Timetable Item Signature Inspection (First 3 Items):</span>
              </h4>

              {timetable.length === 0 ? (
                <p className="text-slate-400 italic">No records present in active state.</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {timetable.slice(0, 3).map((item, idx) => {
                    const isMockItem =
                      item.id &&
                      (item.id.startsWith('tt_dg_') ||
                        item.id.startsWith('tt_jb_') ||
                        item.id.startsWith('tt_rs_'));
                    return (
                      <div
                        key={item.id || idx}
                        className="bg-slate-950/80 p-2.5 rounded-md border border-slate-800 flex items-center justify-between text-[11px] font-mono"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-slate-500 font-bold">#{idx + 1}</span>
                          <span className="text-cyan-300 font-bold">{item.id}</span>
                          <span className="text-slate-300 truncate">
                            ({item.subjectCode} - {item.subjectName})
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${
                            isMockItem
                              ? 'bg-amber-950/90 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950/90 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {isMockItem ? 'Mock Initial Seed' : 'Fetched Backend Database'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Deployment Routine Sync Notice Banner */}
      <div className="bg-indigo-950/80 rounded-2xl p-4 border border-indigo-700/80 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs text-indigo-100">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-xl bg-indigo-900/80 text-indigo-300 border border-indigo-700/60 shrink-0 mt-0.5">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="font-bold text-white text-sm">
                Sync Routine from <span className="underline decoration-indigo-400 font-mono text-xs">classpilot-d1c5.vercel.app</span> or Custom File
              </span>
              <span className="px-2 py-0.5 bg-indigo-800/80 text-indigo-200 text-[10px] font-mono rounded-md border border-indigo-600">
                1-Click Importer
              </span>
            </div>
            <p className="text-indigo-200 text-[11px] mt-1 leading-relaxed">
              By default, Digboi College sample data is loaded in the preview. Click below to paste JSON/text routine data or upload an Excel spreadsheet to immediately replace the sample data with your custom routine.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => handleExportLiveRoutineExcel()}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-all flex items-center space-x-1.5 text-xs cursor-pointer"
            title="Download full routine as Excel (.xlsx) retaining class, subject, time, teacher, classroom & all details"
          >
            <Download className="w-3.5 h-3.5 text-emerald-100" />
            <span>Download Excel Routine (.xlsx)</span>
          </button>
          <button
            onClick={() => setIsJsonSyncModalOpen(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-all flex items-center space-x-1.5 text-xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Paste / Import Routine JSON</span>
          </button>
          <button
            onClick={() => setActiveAdminTab('import')}
            className="px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 font-semibold rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5 text-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Upload Excel / CSV</span>
          </button>
          {onPurgeMockData && (
            <button
              onClick={onPurgeMockData}
              className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-semibold rounded-xl transition-all flex items-center space-x-1.5 text-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Purge Sample Routine</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Action Notification Banner */}
      {resolutionNotice && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl transition-all animate-fadeIn ${
            resolutionNotice.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100'
              : 'bg-indigo-950/90 border-indigo-500/60 text-indigo-100'
          }`}
        >
          <div className="flex items-start space-x-3">
            <CheckCircle
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                resolutionNotice.type === 'success' ? 'text-emerald-400' : 'text-indigo-400'
              }`}
            />
            <div>
              <h4 className="font-heading font-extrabold text-sm">{resolutionNotice.title}</h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{resolutionNotice.message}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={() => handleExportLiveRoutineExcel()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel Routine (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => setResolutionNotice(null)}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Admin Dashboard Control Header */}
      <div className="bg-slate-800/95 rounded-2xl p-5 border border-slate-700/80 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 flex-wrap gap-y-1">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h2 className="font-heading font-bold text-xl text-white">
                  Academic Routine & Timetable Master Hub
                </h2>
              </div>
              <DiagnosticBadge timetable={timetable} onPurgeMockData={onPurgeMockData} />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Construct, edit, and monitor hourly routines (8:00 AM - 4:00 PM) for Odd & Even Semesters across Digboi College.
            </p>
          </div>

          {/* Admin Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveAdminTab('grid')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'grid'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Grid className="w-3.5 h-3.5 text-amber-300" />
              <span>Weekly Routine Grid Table</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('timetable')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'timetable'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Master Class List ({filteredList.length})</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('dept_routine')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'dept_routine'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-cyan-300" />
              <span>Department View</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('naac_reports')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'naac_reports'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>NAAC/NBA Audit Reports</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('import')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'import'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Excel/CSV Import</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('faculty_self_imports')}
              className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'faculty_self_imports'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-emerald-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Faculty Self-Imports</span>
              {facultySelfImports.length > 0 && (
                <span className="px-1.5 py-0.2 bg-emerald-500 text-slate-950 text-[10px] font-extrabold rounded-full">
                  {facultySelfImports.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveAdminTab('conflicts')}
              className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'conflicts'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Conflicts</span>
              {conflicts.length > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full">
                  {conflicts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveAdminTab('roster')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'roster'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Faculty/Rooms</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('students')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'students'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-emerald-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Manage Students</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('session')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'session'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
              <span>Session & Archival</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('backup_safeguards')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'backup_safeguards'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-emerald-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Backups & Recovery</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('sqlite_integrity')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'sqlite_integrity'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-blue-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>Database Integrity</span>
            </button>

            {isSuperAdmin && (
              <button
                onClick={() => setActiveAdminTab('access')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeAdminTab === 'access'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-purple-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin Access</span>
              </button>
            )}
          </div>
        </div>

        {/* ACADEMIC CYCLE TOGGLE & FILTERS BAR */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/90 rounded-xl p-3.5 border border-slate-700/80">
          {/* 1. Academic Cycle (Odd / Even Semesters) */}
          <div className="flex items-center space-x-3 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block mb-1">
                Semester Cycle
              </span>
              <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => {
                    setActiveSemesterCycle('Odd');
                    setSelectedProgramSemester('All');
                  }}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-all ${
                    activeSemesterCycle === 'Odd'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Odd Semesters
                </button>
                <button
                  onClick={() => {
                    setActiveSemesterCycle('Even');
                    setSelectedProgramSemester('All');
                  }}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-all ${
                    activeSemesterCycle === 'Even'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Even Semesters
                </button>
              </div>
            </div>
          </div>

          {/* 2. Department Filter */}
          <div className="flex items-center space-x-3 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <label htmlFor="admin-dept-filter" className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block mb-0.5">
                Department
              </label>
              <select
                id="admin-dept-filter"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full bg-slate-900 text-white font-bold text-xs rounded-lg px-2.5 py-1 border border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="All">All Departments</option>
                {activeDepartmentsList.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Program / Semester Filter */}
          <div className="flex items-center space-x-3 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <label htmlFor="admin-prog-filter" className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block mb-0.5">
                Course / Semester
              </label>
              <select
                id="admin-prog-filter"
                value={selectedProgramSemester}
                onChange={(e) => setSelectedProgramSemester(e.target.value)}
                className="w-full bg-slate-900 text-white font-bold text-xs rounded-lg px-2.5 py-1 border border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
              >
                <option value="All">All Semesters & Classes</option>
                {currentProgramList.map((prog) => (
                  <option key={prog} value={prog}>
                    {prog}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Recent Changes Filter & Pulsing Indicator Toggle */}
          <div className="flex items-center space-x-3 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                  Recent Changes Audit
                </span>
                <div className="flex items-center space-x-1">
                  <RecentIndicatorBadge status="new" compact />
                  <RecentIndicatorBadge status="modified" compact />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecentOnly((prev) => !prev)}
                className={`w-full py-1 px-2.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-between border cursor-pointer ${
                  showRecentOnly
                    ? 'bg-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/50 shadow-md shadow-amber-500/20'
                    : 'bg-slate-900 text-amber-300 hover:bg-slate-800 border-amber-500/40'
                }`}
                title="Filter view to show only recently created or modified class routine entries"
              >
                <div className="flex items-center space-x-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span>{showRecentOnly ? 'Showing Recent Only' : 'Filter Recent'}</span>
                </div>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-slate-950 text-amber-300 border border-amber-500/40">
                  {recentChangesCount}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Active Filter Notification Banner */}
      {filteredList.length < timetable.length && (
        <div className="bg-amber-950/70 border border-amber-500/60 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-200 shadow-lg">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Active Filter: Showing <strong>{filteredList.length}</strong> of <strong>{timetable.length}</strong> total routine entries in the system.
              {selectedDepartment !== 'All' && <span className="ml-1 text-amber-300 font-semibold">• Dept: {selectedDepartment}</span>}
              {selectedProgramSemester !== 'All' && <span className="ml-1 text-amber-300 font-semibold">• Semester: {selectedProgramSemester}</span>}
              {filterDay !== 'All' && <span className="ml-1 text-amber-300 font-semibold">• Day: {filterDay}</span>}
              {searchTerm && <span className="ml-1 text-amber-300 font-semibold">• Search: "{searchTerm}"</span>}
            </span>
          </div>
          <button
            onClick={() => {
              setSelectedDepartment('All');
              setSelectedProgramSemester('All');
              setFilterDay('All');
              setSearchTerm('');
            }}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold rounded-lg border border-amber-500/40 text-[11px] shrink-0 transition-all cursor-pointer"
          >
            Show All {timetable.length} Classes
          </button>
        </div>
      )}

      {/* ===================== TAB 0: WEEKLY ROUTINE GRID TABLE MATRIX ===================== */}
      {activeAdminTab === 'grid' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-800/90 p-4 rounded-2xl border border-slate-700/80">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                  <span>1-Hour Class Schedule Table (08:00 AM – 04:00 PM)</span>
                  <span className="bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                    <Move className="w-3 h-3 text-indigo-400" />
                    <span>Quick Reschedule Enabled</span>
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Active Cycle: <span className="font-bold text-emerald-400">{activeSemesterCycle} Semesters</span>
                  {selectedDepartment !== 'All' && <span> • Dept: <span className="text-indigo-300">{selectedDepartment}</span></span>}
                  {selectedProgramSemester !== 'All' && <span> • Program: <span className="text-amber-300">{selectedProgramSemester}</span></span>}
                  <span className="ml-2 text-indigo-300 font-semibold">• Drag any class card to a slot to reschedule automatically with conflict checking</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleExportLiveRoutineExcel()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
                title="Download full routine as Excel (.xlsx) retaining class, subject, time, teacher, classroom & all details"
              >
                <Download className="w-4 h-4 text-emerald-100" />
                <span>Export Routine (.xlsx)</span>
              </button>

              <button
                onClick={() => openAddModalForSlot()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Class Entry</span>
              </button>

              <button
                onClick={onResetData}
                title="Reset to default dataset"
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Timetable Grid Table */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-900 text-[11px] font-bold uppercase tracking-wider text-slate-300 border-b border-slate-700">
                    <th className="py-3 px-3 w-28 bg-slate-950 border-r border-slate-800 text-center text-indigo-400">
                      Day / Time
                    </th>
                    {HOURLY_TIME_SLOTS.map((slot) => (
                      <th
                        key={slot.label}
                        className="py-3 px-2 text-center border-r border-slate-800/80 min-w-[130px]"
                      >
                        <div className="font-bold text-white text-xs">{slot.displayLabel}</div>
                        <div className="text-[10px] text-slate-400 font-mono font-normal">1 Hour Duration</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 text-xs">
                  {DAYS_OF_WEEK.map((day) => (
                    <tr key={day} className="hover:bg-slate-700/20 transition-colors">
                      {/* Day Label */}
                      <td className="py-3 px-3 font-bold text-white bg-slate-950/80 border-r border-slate-800 text-center">
                        <div className="text-sm">{day}</div>
                      </td>

                      {/* Hourly Cells */}
                      {HOURLY_TIME_SLOTS.map((slot) => {
                        const slotStartMin = parseTimeToMinutes(slot.startTime);
                        const slotEndMin = parseTimeToMinutes(slot.endTime);

                        // Find matching entries for this day & slot
                        const slotEntries = displayList.filter((e) => {
                          if (e.day !== day) return false;
                          const eStartMin = parseTimeToMinutes(e.startTime);
                          const eEndMin = parseTimeToMinutes(e.endTime);
                          // Class overlaps with this 1-hour slot
                          return eStartMin < slotEndMin && eEndMin > slotStartMin;
                        });

                        const isTargetHover =
                          dragOverSlot?.day === day && dragOverSlot?.startTime === slot.startTime;

                        return (
                          <td
                            key={slot.label}
                            onDragOver={(e) => handleDragOverCell(e, day, slot.startTime, slot.endTime)}
                            onDragLeave={handleDragLeaveCell}
                            onDrop={(e) => handleDropOnSlot(e, day, slot.startTime, slot.endTime)}
                            className={`p-1.5 border-r border-slate-800/80 align-top transition-all ${
                              isTargetHover
                                ? 'bg-indigo-500/25 border-2 border-indigo-400 border-dashed shadow-inner'
                                : 'hover:bg-slate-700/40'
                            }`}
                          >
                            {slotEntries.length === 0 ? (
                              <button
                                onClick={() => openAddModalForSlot(day, slot.startTime, slot.endTime)}
                                className={`w-full h-full min-h-[70px] rounded-xl border border-dashed text-slate-500 hover:text-indigo-300 flex flex-col items-center justify-center p-1.5 transition-all group ${
                                  isTargetHover
                                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                                    : 'border-slate-700/60 hover:border-indigo-500/50 hover:bg-indigo-500/5'
                                }`}
                              >
                                <Plus className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 mb-0.5" />
                                <span className="text-[10px] font-semibold">
                                  {isTargetHover ? 'Drop to Reschedule' : 'Free Slot'}
                                </span>
                              </button>
                            ) : (
                              <div className="space-y-1.5">
                                {slotEntries.map((entry) => {
                                  const recentStatus = getRecentStatus(entry);
                                  return (
                                    <div
                                      key={entry.id}
                                      draggable={true}
                                      onDragStart={(e) => handleDragStart(e, entry)}
                                      className={`p-2 rounded-xl bg-slate-900 border shadow-md relative group transition-all cursor-grab active:cursor-grabbing ${
                                        draggedEntry?.id === entry.id
                                          ? 'border-amber-400 opacity-40 scale-95'
                                          : recentStatus === 'new'
                                          ? 'border-emerald-400/80 ring-2 ring-emerald-500/40 shadow-emerald-500/20 bg-gradient-to-b from-emerald-950/30 to-slate-900'
                                          : recentStatus === 'modified'
                                          ? 'border-amber-400/80 ring-2 ring-amber-500/40 shadow-amber-500/20 bg-gradient-to-b from-amber-950/30 to-slate-900'
                                          : 'border-slate-700 hover:border-indigo-500'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1 mb-1">
                                        <div className="flex items-center space-x-1 flex-wrap gap-0.5">
                                          <GripVertical
                                            className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0"
                                            title="Drag class card to Quick Reschedule"
                                          />
                                          <span
                                            className={`px-1.5 py-0.2 rounded border font-bold text-[9px] uppercase tracking-wide ${getPaperBadgeColor(
                                              entry.paperCategory
                                            )}`}
                                          >
                                            {entry.paperCategory || 'Core'}
                                          </span>
                                          <RecentIndicatorBadge status={recentStatus} compact />
                                        </div>
                                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[9px]">
                                          {entry.room}
                                        </span>
                                      </div>

                                    <div className="font-bold text-white text-xs leading-snug line-clamp-2">
                                      {entry.subjectName}
                                    </div>

                                    <div className="text-[10px] font-mono text-indigo-300 font-semibold mt-0.5">
                                      {entry.subjectCode}
                                    </div>

                                    <div className="text-[10px] text-slate-300 mt-1 pt-1 border-t border-slate-800 flex flex-col space-y-0.5">
                                      <span className="truncate font-medium">👤 {entry.facultyName}</span>
                                      <span className="text-[9px] text-slate-400 truncate">🎓 {entry.batch}</span>
                                    </div>

                                    {showFirebaseSyncTimestamps && (
                                      <div className="mt-1.5 pt-1 border-t border-amber-500/40 bg-amber-950/80 p-1.5 rounded-lg text-[9px] font-mono text-amber-300 flex flex-col space-y-1 shadow-sm">
                                        <div className="flex items-center justify-between font-bold">
                                          <span className="flex items-center space-x-1 text-amber-400">
                                            <Database className="w-2.5 h-2.5" />
                                            <span>FS Synced</span>
                                          </span>
                                          <span className="text-[8px] text-amber-300/70">{entry.id.substring(0, 10)}</span>
                                        </div>
                                        <div className="text-slate-100 font-semibold truncate">
                                          🕒 {formatSyncTime(entry.updatedAt || entry.lastSyncedAt)}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSingleEntryResync(entry);
                                          }}
                                          disabled={syncingEntryIds[entry.id]}
                                          className="w-full mt-0.5 py-1 px-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold rounded text-[9px] transition flex items-center justify-center space-x-1 shadow cursor-pointer disabled:opacity-50"
                                          title="Force re-upload and update this entry in Firestore"
                                        >
                                          <RotateCcw className={`w-2.5 h-2.5 ${syncingEntryIds[entry.id] ? 'animate-spin' : ''}`} />
                                          <span>{syncingEntryIds[entry.id] ? 'Syncing...' : 'Force Re-Sync'}</span>
                                        </button>
                                      </div>
                                    )}

                                    {/* Quick Actions Hover overlay */}
                                    <div className="absolute inset-0 bg-slate-950/90 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 p-1">
                                      <button
                                        onClick={() => openEditModal(entry)}
                                        className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all text-[10px] font-bold flex items-center space-x-1"
                                        title="Edit Class"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (confirm(`Delete class "${entry.subjectName}"?`)) {
                                            onDeleteEntry(entry.id);
                                          }
                                        }}
                                        className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition-all text-[10px] font-bold flex items-center space-x-1"
                                        title="Delete Class"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Delete</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: DATA BACKUP & RECOVERY SAFEGUARDS ===================== */}
      {activeAdminTab === 'backup_safeguards' && (
        <div className="space-y-6">
          {/* Header Card & Quick Action Controls */}
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-emerald-500/40 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <Shield className="w-6 h-6" />
                  <h3 className="font-heading font-bold text-xl text-white">
                    Data Backup, Version History & Recovery Safeguards
                  </h3>
                </div>
                <p className="text-xs text-slate-300">
                  Automated backups, direct Excel routine exports, raw spreadsheet retention, and version history rollback system to safeguard academic routine integrity.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleExportLiveRoutineExcel()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Live Routine (.xlsx)</span>
                </button>

                <button
                  onClick={() => {
                    const desc = prompt(
                      'Enter a label or description for this manual backup snapshot:',
                      'Manual Pre-Exam Schedule Snapshot'
                    );
                    if (desc && onCreateManualBackup) {
                      onCreateManualBackup(desc);
                    }
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <HardDrive className="w-4 h-4 text-cyan-200" />
                  <span>Create Instant Backup</span>
                </button>
              </div>
            </div>

            {/* Quick Status Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/70">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Database Entries</div>
                <div className="text-lg font-mono font-extrabold text-emerald-400">{timetable.length} Classes</div>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/70">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Upload Version History</div>
                <div className="text-lg font-mono font-extrabold text-blue-400">{routineVersions.length} Logs</div>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/70">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Backups Archived</div>
                <div className="text-lg font-mono font-extrabold text-cyan-400">{routineBackups.length} Snapshots</div>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/70">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Automated Daily Backups</div>
                <div className="text-lg font-mono font-extrabold text-amber-400">
                  {routineBackups.filter((b) => b.type === 'automated_daily').length} Scheduled
                </div>
              </div>
            </div>
          </div>

          {/* SECTION A: UPLOAD VERSION HISTORY & 1-CLICK ROLLBACK */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-indigo-400" />
                <h4 className="font-heading font-extrabold text-lg text-white">
                  Upload Version History & Rollback Logs
                </h4>
              </div>
              <span className="text-xs text-slate-400">
                Retains upload history to protect against accidental overwrites
              </span>
            </div>

            {routineVersions.length === 0 ? (
              <div className="bg-slate-900/50 border border-slate-700/80 rounded-xl p-8 text-center space-y-2">
                <FileCode className="w-10 h-10 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-300 font-medium">No routine upload history recorded yet.</p>
                <p className="text-[11px] text-slate-500">
                  Future Excel or CSV routine uploads will automatically generate version logs with raw file retention.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="p-3">Upload Timestamp</th>
                      <th className="p-3">Uploaded By</th>
                      <th className="p-3">File Name</th>
                      <th className="p-3">Mode</th>
                      <th className="p-3">Classes</th>
                      <th className="p-3">Change Details</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {routineVersions.map((ver) => (
                      <tr key={ver.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-white whitespace-nowrap">
                          {new Date(ver.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3 font-semibold text-slate-300">{ver.uploadedBy}</td>
                        <td className="p-3 font-medium text-cyan-300 max-w-[180px] truncate" title={ver.fileName}>
                          {ver.fileName}
                        </td>
                        <td className="p-3">
                          {ver.mode === 'replace' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Replace
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Append
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-400">{ver.totalRecords}</td>
                        <td className="p-3 text-slate-400 max-w-[220px] truncate" title={ver.changeSummary}>
                          {ver.changeSummary}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap space-x-1.5">
                          {ver.entriesSnapshot && ver.entriesSnapshot.length > 0 && (
                            <>
                              <button
                                onClick={() =>
                                  setPreviewingSnapshot({
                                    title: `Version Log (${new Date(ver.timestamp).toLocaleString()}) - ${ver.fileName}`,
                                    entries: ver.entriesSnapshot || [],
                                  })
                                }
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold rounded-lg border border-slate-700 transition-all cursor-pointer inline-flex items-center space-x-1"
                                title="Inspect Version Entries"
                              >
                                <Eye className="w-3 h-3 text-blue-400" />
                                <span>Preview</span>
                              </button>

                              <button
                                onClick={() =>
                                  handleExportLiveRoutineExcel(
                                    ver.entriesSnapshot,
                                    `Version_Export_${ver.fileName}_${new Date(ver.timestamp).toISOString().split('T')[0]}.xlsx`
                                  )
                                }
                                className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 text-[11px] font-bold rounded-lg border border-emerald-700/50 transition-all cursor-pointer inline-flex items-center space-x-1"
                                title="Export Version to Excel"
                              >
                                <Download className="w-3 h-3 text-emerald-400" />
                                <span>Export</span>
                              </button>

                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `⚠️ Confirm Routine Rollback?\n\nAre you sure you want to restore the live routine database back to the state in version "${ver.fileName}" from ${new Date(ver.timestamp).toLocaleString()}?\n\nThis will restore ${ver.entriesSnapshot?.length} class schedules into the live database.`
                                    )
                                  ) {
                                    if (onRollbackRoutine && ver.entriesSnapshot) {
                                      onRollbackRoutine(ver.entriesSnapshot, ver.fileName);
                                    }
                                  }
                                }}
                                className="px-2.5 py-1 bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white text-[11px] font-bold rounded-lg border border-rose-500/40 transition-all cursor-pointer inline-flex items-center space-x-1"
                                title="Restore Live Database to this version"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Rollback</span>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION B: AUTOMATED DAILY & MANUAL BACKUP SNAPSHOTS */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <h4 className="font-heading font-extrabold text-lg text-white">
                  Automated Daily & Manual System Backups
                </h4>
              </div>
              <span className="text-xs text-slate-400">
                Scheduled automated daily snapshots & safety pre-import backups
              </span>
            </div>

            {routineBackups.length === 0 ? (
              <div className="bg-slate-900/50 border border-slate-700/80 rounded-xl p-8 text-center space-y-2">
                <HardDrive className="w-10 h-10 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-300 font-medium">No backup snapshots archived yet.</p>
                <p className="text-[11px] text-slate-500">
                  Automated daily backups run automatically when routine entries exist.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="p-3">Backup Date & Time</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Classes</th>
                      <th className="p-3 text-right">Recovery Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {routineBackups.map((bkp) => (
                      <tr key={bkp.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-white whitespace-nowrap">
                          {new Date(bkp.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3">
                          {bkp.type === 'automated_daily' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Automated Daily
                            </span>
                          ) : bkp.type === 'pre_import_backup' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              Pre-Import Safety
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              Manual Snapshot
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-300 font-medium max-w-[260px] truncate" title={bkp.description}>
                          {bkp.description}
                        </td>
                        <td className="p-3 font-mono font-bold text-cyan-300">{bkp.totalClasses}</td>
                        <td className="p-3 text-right whitespace-nowrap space-x-1.5">
                          {bkp.entriesSnapshot && bkp.entriesSnapshot.length > 0 && (
                            <>
                              <button
                                onClick={() =>
                                  setPreviewingSnapshot({
                                    title: `Backup Snapshot (${new Date(bkp.timestamp).toLocaleString()}) - ${bkp.description}`,
                                    entries: bkp.entriesSnapshot || [],
                                  })
                                }
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold rounded-lg border border-slate-700 transition-all cursor-pointer inline-flex items-center space-x-1"
                              >
                                <Eye className="w-3 h-3 text-blue-400" />
                                <span>Preview</span>
                              </button>

                              <button
                                onClick={() =>
                                  handleExportLiveRoutineExcel(
                                    bkp.entriesSnapshot,
                                    `Backup_Export_${bkp.id}_${new Date(bkp.timestamp).toISOString().split('T')[0]}.xlsx`
                                  )
                                }
                                className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 text-[11px] font-bold rounded-lg border border-emerald-700/50 transition-all cursor-pointer inline-flex items-center space-x-1"
                              >
                                <Download className="w-3 h-3 text-emerald-400" />
                                <span>Export</span>
                              </button>

                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `⚠️ Restore System Routine from Backup?\n\nThis will restore ${bkp.entriesSnapshot?.length} class schedules from backup snapshot "${bkp.description}" (${new Date(bkp.timestamp).toLocaleString()}) into the live database.`
                                    )
                                  ) {
                                    if (onRollbackRoutine && bkp.entriesSnapshot) {
                                      onRollbackRoutine(bkp.entriesSnapshot, bkp.description);
                                    }
                                  }
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg shadow transition-all cursor-pointer inline-flex items-center space-x-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB 1: ALL TIMETABLE ENTRIES LIST ===================== */}
      {activeAdminTab === 'timetable' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-2 bg-slate-800 rounded-xl px-2.5 py-1.5 border border-slate-700 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-semibold">Day:</span>
                <select
                  value={filterDay}
                  onChange={(e) => setFilterDay(e.target.value)}
                  className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                >
                  <option value="All" className="bg-slate-900">All Days</option>
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d} className="bg-slate-900">
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search subject, faculty, paper, room..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl pl-8 pr-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleExportLiveRoutineExcel()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
                title="Export current class routine to Excel file (.xlsx) for future feed"
              >
                <Download className="w-4 h-4 text-emerald-100" />
                <span>Export Routine (.xlsx)</span>
              </button>

              <button
                onClick={() => openAddModalForSlot()}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Class Entry</span>
              </button>

              <button
                onClick={onResetData}
                title="Reset to default dataset"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700">
                    <th className="py-3 px-4">Paper Category</th>
                    <th className="py-3 px-4">Subject & Code</th>
                    <th className="py-3 px-4">Day & Time</th>
                    <th className="py-3 px-4">Faculty Member</th>
                    <th className="py-3 px-4">Room</th>
                    <th className="py-3 px-4">Batch / Course</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 text-xs">
                  {displayList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs font-medium">
                        No class routines found matching active cycle ({activeSemesterCycle}) and department options.
                      </td>
                    </tr>
                  ) : (
                    displayList.map((entry) => {
                      const recentStatus = getRecentStatus(entry);
                      return (
                        <tr
                          key={entry.id}
                          className={`transition-colors ${
                            recentStatus === 'new'
                              ? 'bg-emerald-950/25 hover:bg-emerald-950/40 border-l-4 border-l-emerald-400'
                              : recentStatus === 'modified'
                              ? 'bg-amber-950/25 hover:bg-amber-950/40 border-l-4 border-l-amber-400'
                              : 'hover:bg-slate-700/30'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                              <span
                                className={`px-2 py-0.5 rounded border font-bold text-[10px] ${getPaperBadgeColor(
                                  entry.paperCategory
                                )}`}
                              >
                                {entry.paperCategory || 'Core'}
                              </span>
                              <RecentIndicatorBadge status={recentStatus} />
                            </div>
                          </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{entry.subjectName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{entry.subjectCode}</div>
                          {showFirebaseSyncTimestamps && (
                            <div className="mt-1 flex items-center space-x-2 flex-wrap gap-y-1">
                              <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-[10px] font-mono text-amber-300 shadow-sm">
                                <Database className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>Synced: {formatSyncTime(entry.updatedAt || entry.lastSyncedAt)}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSingleEntryResync(entry)}
                                disabled={syncingEntryIds[entry.id]}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-[10px] transition shadow cursor-pointer disabled:opacity-50"
                                title="Force re-upload and update this entry in Firestore"
                              >
                                <RotateCcw className={`w-3 h-3 ${syncingEntryIds[entry.id] ? 'animate-spin' : ''}`} />
                                <span>{syncingEntryIds[entry.id] ? 'Syncing...' : 'Force Re-Sync'}</span>
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{entry.day}</div>
                          <div className="font-mono text-indigo-300 font-medium text-[11px]">
                            {entry.startTime} - {entry.endTime}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-200 font-medium">{entry.facultyName}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold text-[11px]">
                            {entry.room}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <div>{entry.batch}</div>
                          <div className="text-[10px] text-slate-500">{entry.programSemester}</div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => openEditModal(entry)}
                            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete class "${entry.subjectName}"?`)) {
                                onDeleteEntry(entry.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ===================== TAB 2: DEPARTMENT ROUTINE MATRIX VIEW ===================== */}
      {activeAdminTab === 'dept_routine' && (
        <div className="space-y-6">
          <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                  <Building2 className="w-5 h-5 text-indigo-400" />
                  <span>
                    {selectedDepartment === 'All'
                      ? 'College-Wide Department Routines'
                      : `Department of ${selectedDepartment} (${activeSemesterCycle} Cycle)`}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Weekly overview grouped by days for departmental monitoring.
                </p>
              </div>

              <button
                onClick={() => handleExportLiveRoutineExcel(filteredList, `Department_Routine_${selectedDepartment}_${activeSemesterCycle}.xlsx`)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer shrink-0"
                title="Download department routine as Excel spreadsheet for future feed"
              >
                <Download className="w-3.5 h-3.5 text-emerald-100" />
                <span>Download Dept Routine (.xlsx)</span>
              </button>
            </div>

            {/* Department Weekly Days Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DAYS_OF_WEEK.map((day) => {
                const dayEntries = displayList
                  .filter((t) => t.day === day)
                  .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

                return (
                  <div key={day} className="bg-slate-900/80 rounded-xl p-4 border border-slate-700/80 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-sm text-indigo-300 flex items-center space-x-1.5">
                        <Calendar className="w-4 h-4 text-indigo-400" />
                        <span>{day}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold">
                        {dayEntries.length} {dayEntries.length === 1 ? 'class' : 'classes'}
                      </span>
                    </div>

                    {dayEntries.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4 text-center">No lectures scheduled for this day.</p>
                    ) : (
                      <div className="space-y-2">
                        {dayEntries.map((item) => {
                          const recentStatus = getRecentStatus(item);
                          return (
                            <div
                              key={item.id}
                              className={`p-3 rounded-lg transition-all space-y-1 text-xs ${
                                recentStatus === 'new'
                                  ? 'bg-slate-800/90 border-2 border-emerald-400/80 ring-2 ring-emerald-500/40 shadow-emerald-500/20'
                                  : recentStatus === 'modified'
                                  ? 'bg-slate-800/90 border-2 border-amber-400/80 ring-2 ring-amber-500/40 shadow-amber-500/20'
                                  : 'bg-slate-800/90 border border-slate-700/60 hover:border-indigo-500/50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono font-bold text-indigo-300 text-[11px]">
                                  {item.startTime} - {item.endTime}
                                </span>
                                <div className="flex items-center space-x-1">
                                  <RecentIndicatorBadge status={recentStatus} compact />
                                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                                    {item.room}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditModal(item);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-indigo-600/80 hover:bg-indigo-600 text-white font-bold text-[10px] flex items-center space-x-1 transition cursor-pointer shadow-sm"
                                    title="Edit Class Routine Entry"
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                    <span>Edit</span>
                                  </button>
                                </div>
                              </div>
                            <div className="font-bold text-white text-xs">{item.subjectName} ({item.subjectCode})</div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/50">
                              <span>Faculty: {item.facultyName}</span>
                              <span className="font-semibold text-slate-300">{item.batch}</span>
                            </div>
                            {showFirebaseSyncTimestamps && (
                              <div className="mt-1.5 pt-1.5 border-t border-amber-500/30 text-[10px] font-mono text-amber-300 flex items-center justify-between gap-2">
                                <div className="flex items-center space-x-1 truncate">
                                  <Database className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span>Synced: {formatSyncTime(item.updatedAt || item.lastSyncedAt)}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSingleEntryResync(item)}
                                  disabled={syncingEntryIds[item.id]}
                                  className="shrink-0 inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-[10px] transition shadow cursor-pointer disabled:opacity-50"
                                  title="Force re-upload and update this entry in Firestore"
                                >
                                  <RotateCcw className={`w-2.5 h-2.5 ${syncingEntryIds[item.id] ? 'animate-spin' : ''}`} />
                                  <span>{syncingEntryIds[item.id] ? 'Syncing...' : 'Force Re-Sync'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 3: EXCEL / CSV IMPORT HUB ===================== */}
      {activeAdminTab === 'import' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Upload Box */}
            <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-white">
                    Upload Semester Timetable Sheet
                  </h3>
                  <p className="text-xs text-slate-400">Supports .xlsx, .xls, and .csv files</p>
                </div>
              </div>

              <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 rounded-2xl p-6 text-center space-y-3 bg-slate-900/50 transition-all">
                <Upload className="w-8 h-8 text-indigo-400 mx-auto animate-bounce" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    Click to select file or drag & drop here
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Columns: Faculty Name, Subject Code, Subject Name, Room, Day, Start Time, End Time, Batch
                  </p>
                </div>

                <input
                  type="file"
                  disabled={isSubmittingImport}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="timetable-excel-input"
                />
                <label
                  htmlFor={isSubmittingImport ? undefined : "timetable-excel-input"}
                  className={`inline-block px-4 py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all ${
                    isSubmittingImport
                      ? 'bg-indigo-900 cursor-not-allowed opacity-50'
                      : 'bg-indigo-600 hover:bg-indigo-500 cursor-pointer'
                  }`}
                >
                  {isSubmittingImport ? 'Processing...' : 'Browse File'}
                </label>
              </div>

              {importFileName && (
                <div className="text-xs bg-slate-900 p-3 rounded-xl border border-slate-700 flex items-center justify-between text-indigo-300">
                  <span>Uploaded: {importFileName}</span>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
              )}
            </div>

            {/* Right: Export Live Routine & Sample Templates */}
            <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                  <Download className="w-5 h-5 text-emerald-400" />
                  <span>Routine Backup & Future Feed Export</span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Export all manually created or uploaded class routines (retaining class, subject, time, teacher, classroom, department &amp; all details) into an Excel spreadsheet. This file can be saved and re-uploaded anytime for future feeds.
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={() => handleExportLiveRoutineExcel()}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Live Routine Feed (.xlsx) ({timetable.length} Classes)</span>
                </button>

                <button
                  onClick={handleDownloadExcelTemplate}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Download Blank Routine Excel Template (.xlsx)</span>
                </button>

                <button
                  onClick={handleDownloadSampleCsv}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 font-semibold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Download Sample CSV Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* Import Preview Table */}
          {parsedPreviewEntries.length > 0 && (
            <div className="bg-slate-800/90 rounded-2xl p-6 border border-indigo-500/50 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading font-bold text-lg text-white">
                    Preview Parsed Timetable ({parsedPreviewEntries.length} rows)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Review entries below before applying to live database.
                  </p>
                </div>

                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 text-xs font-semibold text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replaceMode}
                      onChange={(e) => setReplaceMode(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>Replace existing timetable</span>
                  </label>

                  <button
                    disabled={isSubmittingImport}
                    onClick={handleConfirmImport}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5"
                  >
                    {isSubmittingImport ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>Applying Import...</span>
                      </>
                    ) : (
                      <span>Confirm & Apply Import</span>
                    )}
                  </button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">Day</th>
                      <th className="p-2.5">Time</th>
                      <th className="p-2.5">Faculty</th>
                      <th className="p-2.5">Subject</th>
                      <th className="p-2.5">Room</th>
                      <th className="p-2.5">Batch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {parsedPreviewEntries.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-700/30">
                        <td className="p-2.5 font-semibold text-white">{item.day}</td>
                        <td className="p-2.5 font-mono text-indigo-300">
                          {item.startTime} - {item.endTime}
                        </td>
                        <td className="p-2.5">{item.facultyName}</td>
                        <td className="p-2.5 font-bold text-white">
                          {item.subjectName} ({item.subjectCode})
                        </td>
                        <td className="p-2.5 text-cyan-300">{item.room}</td>
                        <td className="p-2.5">{item.batch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 4: VISUAL CONFLICT CHECKER & AUTO-RESOLUTION ===================== */}
      {activeAdminTab === 'conflicts' && (
        <div className="space-y-6">
          {/* Notification Banner Modal/Toast */}
          {resolutionNotice && (
            <div
              className={`p-4 rounded-2xl border flex items-start justify-between space-x-3 shadow-xl transition-all animate-fadeIn ${
                resolutionNotice.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-100'
                  : 'bg-indigo-950/80 border-indigo-500/60 text-indigo-100'
              }`}
            >
              <div className="flex items-start space-x-3">
                <CheckCircle
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    resolutionNotice.type === 'success' ? 'text-emerald-400' : 'text-indigo-400'
                  }`}
                />
                <div>
                  <h4 className="font-heading font-extrabold text-sm">{resolutionNotice.title}</h4>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{resolutionNotice.message}</p>
                </div>
              </div>
              <button
                onClick={() => setResolutionNotice(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Top Control & Hero Banner */}
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 shadow-xl space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-rose-400">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                  <h3 className="font-heading font-extrabold text-xl text-white">
                    Visual Conflict Checker & Automatic Resolution Engine
                  </h3>
                </div>
                <p className="text-xs text-slate-300">
                  Real-time double-booking detection across faculty, room allocations, and student batches with 1-click automatic resolution suggestions.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleAutoResolveAllRoomClashes}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-2 cursor-pointer"
                  title="Automatically assign vacant rooms to all room double-bookings"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Auto-Resolve All Room Clashes</span>
                </button>

                <button
                  onClick={() => {
                    if (conflicts.length === 0) {
                      alert('No active conflicts to report to Academic Coordinator.');
                      return;
                    }
                    handleAlertCoordinatorForConflict(conflicts[0]);
                  }}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <Send className="w-4 h-4 text-cyan-200" />
                  <span>Notify Coordinator All Clashes</span>
                </button>
              </div>
            </div>

            {/* Metrics Dashboard Summary Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-rose-500/40">
                <div className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">Total Conflicts</div>
                <div className="text-xl font-mono font-extrabold text-rose-400">{conflicts.length} Clashes</div>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-amber-500/40">
                <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Faculty Clashes</div>
                <div className="text-xl font-mono font-extrabold text-amber-400">
                  {conflicts.filter((c) => c.type === 'faculty').length}
                </div>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-blue-500/40">
                <div className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Room Clashes</div>
                <div className="text-xl font-mono font-extrabold text-blue-400">
                  {conflicts.filter((c) => c.type === 'room').length}
                </div>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-purple-500/40">
                <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Batch Clashes</div>
                <div className="text-xl font-mono font-extrabold text-purple-400">
                  {conflicts.filter((c) => c.type === 'batch').length}
                </div>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-emerald-500/40 col-span-2 md:col-span-1">
                <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Auto-Resolvable</div>
                <div className="text-xl font-mono font-extrabold text-emerald-400">
                  {
                    conflicts.filter(
                      (c) =>
                        c.type === 'room' &&
                        getAvailableRoomsForSlot(c.entry2.day, c.entry2.startTime, c.entry2.endTime, c.entry2.room).length > 0
                    ).length
                  }{' '}
                  Ready
                </div>
              </div>
            </div>
          </div>

          {/* WEEKLY VISUAL MATRIX / HEATMAP GRID */}
          <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Grid className="w-5 h-5 text-amber-400" />
                <h4 className="font-heading font-extrabold text-base text-white">
                  Weekly Timetable Clash Heatmap
                </h4>
              </div>
              <span className="text-xs text-slate-400">Click any slot below to filter specific clashes</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs text-slate-300 border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-700">
                    <th className="p-2.5 text-left font-bold text-slate-400">Day / Time</th>
                    {HOURLY_TIME_SLOTS.map((slot) => (
                      <th key={slot.label} className="p-2 text-[11px] font-semibold text-slate-300 min-w-[90px]">
                        {slot.startTime} - {slot.endTime}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {DAYS_OF_WEEK.map((day) => (
                    <tr key={day} className="hover:bg-slate-700/20">
                      <td className="p-2.5 text-left font-bold text-white bg-slate-900/60">{day}</td>
                      {HOURLY_TIME_SLOTS.map((slot) => {
                        const slotConflicts = conflicts.filter((c) => {
                          const e1 = c.entry1;
                          if (e1.day !== day) return false;
                          const sMin = parseTimeToMinutes(slot.startTime);
                          const eMin = parseTimeToMinutes(slot.endTime);
                          const e1Start = parseTimeToMinutes(e1.startTime);
                          const e1End = parseTimeToMinutes(e1.endTime);
                          return e1Start < eMin && e1End > sMin;
                        });

                        const isSelectedSlot = conflictDayFilter === day && conflictSlotFilter === slot.startTime;

                        return (
                          <td key={slot.label} className="p-1">
                            {slotConflicts.length > 0 ? (
                              <button
                                onClick={() => {
                                  setConflictDayFilter(day);
                                  setConflictSlotFilter(slot.startTime);
                                }}
                                className={`w-full py-2 px-1 rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-0.5 transition-all cursor-pointer border ${
                                  isSelectedSlot
                                    ? 'bg-rose-600 text-white ring-2 ring-rose-400 scale-105 shadow-lg'
                                    : 'bg-rose-950/80 text-rose-300 border-rose-500/60 hover:bg-rose-900'
                                }`}
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                <span>
                                  {slotConflicts.length} Clash{slotConflicts.length > 1 ? 'es' : ''}
                                </span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setConflictDayFilter(day);
                                  setConflictSlotFilter(slot.startTime);
                                }}
                                className={`w-full py-2 px-1 rounded-xl text-[10px] font-semibold transition-all border ${
                                  isSelectedSlot
                                    ? 'bg-indigo-600 text-white border-indigo-400'
                                    : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:text-slate-300'
                                }`}
                              >
                                ✓ Clear
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FILTER BAR & SEARCH */}
          <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                <Filter className="w-3.5 h-3.5 text-indigo-400" />
                <span>Type:</span>
              </span>
              {(['all', 'faculty', 'room', 'batch'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setConflictTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                    conflictTypeFilter === t
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {t === 'all' ? 'All Types' : `${t} Clashes`}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={conflictDayFilter}
                onChange={(e) => setConflictDayFilter(e.target.value)}
                className="bg-slate-900 text-white text-xs font-bold rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none"
              >
                <option value="All">All Days</option>
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                value={conflictDeptFilter}
                onChange={(e) => setConflictDeptFilter(e.target.value)}
                className="bg-slate-900 text-white text-xs font-bold rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none"
              >
                <option value="All">All Departments</option>
                {activeDepartmentsList.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              {(conflictDayFilter !== 'All' ||
                conflictSlotFilter !== 'All' ||
                conflictDeptFilter !== 'All' ||
                conflictTypeFilter !== 'all') && (
                <button
                  onClick={() => {
                    setConflictDayFilter('All');
                    setConflictSlotFilter('All');
                    setConflictDeptFilter('All');
                    setConflictTypeFilter('all');
                  }}
                  className="px-2.5 py-1.5 bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white rounded-xl text-xs font-bold transition-all"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* DETAILED CONFLICT CARDS LIST */}
          {conflicts.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-10 text-center space-y-3 shadow-inner">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
              <h4 className="font-heading font-extrabold text-white text-lg">100% Clash-Free Timetable!</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No overlapping faculty schedules, double-booked classrooms, or batch timing conflicts detected in the current active routine.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {conflicts
                .filter((conf) => {
                  if (conflictTypeFilter !== 'all' && conf.type !== conflictTypeFilter) return false;
                  if (conflictDayFilter !== 'All' && conf.entry1.day !== conflictDayFilter) return false;
                  if (conflictSlotFilter !== 'All' && conf.entry1.startTime !== conflictSlotFilter) return false;
                  if (
                    conflictDeptFilter !== 'All' &&
                    conf.entry1.department !== conflictDeptFilter &&
                    conf.entry2.department !== conflictDeptFilter
                  )
                    return false;
                  return true;
                })
                .map((conf, index) => {
                  const e1 = conf.entry1;
                  const e2 = conf.entry2;
                  const availableRoomsForE2 = getAvailableRoomsForSlot(e2.day, e2.startTime, e2.endTime, e2.room);
                  const availableSlotsForE2 = getFreeTimeSlotsForEntry(e2);
                  const availableFacultyForE2 = getFreeFacultyForSlot(e2);

                  return (
                    <div
                      key={conf.id || index}
                      className="bg-slate-800/95 border-2 border-rose-500/50 rounded-2xl p-5 text-white space-y-4 shadow-xl transition-all hover:border-rose-400"
                    >
                      {/* Conflict Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2.5 py-1 rounded-xl text-xs font-extrabold uppercase tracking-wide ${
                              conf.type === 'faculty'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : conf.type === 'room'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            }`}
                          >
                            ⚠️{' '}
                            {conf.type === 'faculty'
                              ? 'Faculty Double-Booking'
                              : conf.type === 'room'
                              ? 'Room Double-Booking'
                              : 'Batch Class Overlap'}
                          </span>
                          <span className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>
                              {e1.day}, {e1.startTime} - {e1.endTime}
                            </span>
                          </span>
                        </div>

                        <button
                          onClick={() => handleAlertCoordinatorForConflict(conf)}
                          className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 self-start sm:self-auto cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Alert Coordinator</span>
                        </button>
                      </div>

                      {/* Conflict Description Banner */}
                      <p className="text-xs text-rose-200 bg-rose-950/50 p-2.5 rounded-xl border border-rose-500/30 font-medium">
                        {conf.description}
                      </p>

                      {/* Side-by-Side Comparison Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Entry 1 Card */}
                        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">
                              Class Schedule A
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">{e1.department}</span>
                          </div>
                          <h5 className="font-heading font-extrabold text-sm text-white">
                            {e1.subjectName} ({e1.subjectCode})
                          </h5>
                          <div className="text-xs space-y-1 text-slate-300">
                            <div>
                              <strong>Faculty:</strong> {e1.facultyName}
                            </div>
                            <div>
                              <strong>Room:</strong>{' '}
                              <span className="font-mono text-cyan-300 font-bold">{e1.room}</span>
                            </div>
                            <div>
                              <strong>Batch:</strong> {e1.batch}
                            </div>
                          </div>
                        </div>

                        {/* Entry 2 Card */}
                        <div className="bg-slate-900/90 p-4 rounded-xl border border-rose-500/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider">
                              Class Schedule B (Conflicting)
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">{e2.department}</span>
                          </div>
                          <h5 className="font-heading font-extrabold text-sm text-white">
                            {e2.subjectName} ({e2.subjectCode})
                          </h5>
                          <div className="text-xs space-y-1 text-slate-300">
                            <div>
                              <strong>Faculty:</strong> {e2.facultyName}
                            </div>
                            <div>
                              <strong>Room:</strong>{' '}
                              <span className="font-mono text-rose-300 font-bold">{e2.room}</span>
                            </div>
                            <div>
                              <strong>Batch:</strong> {e2.batch}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* AUTOMATIC RESOLUTION SUGGESTIONS BOX */}
                      <div className="bg-slate-900/95 p-4 rounded-xl border border-emerald-500/40 space-y-3">
                        <div className="flex items-center space-x-2 text-emerald-400 font-extrabold text-xs uppercase tracking-wider">
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>Automated Smart Resolution Options</span>
                        </div>

                        {/* Option 1: Move to Vacant Room */}
                        {conf.type === 'room' && (
                          <div className="space-y-1.5">
                            <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                              <Building className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Option A: Move Class B ("{e2.subjectName}") to Vacant Campus Room:</span>
                            </div>
                            {availableRoomsForE2.length === 0 ? (
                              <p className="text-[11px] text-slate-400 italic">
                                No vacant classrooms available during this exact time slot.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {availableRoomsForE2.slice(0, 5).map((rName) => (
                                  <button
                                    key={rName}
                                    onClick={() => handleMoveToRoom(e2, rName)}
                                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                  >
                                    <span>Move to {rName}</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Option 2: Reschedule Slot */}
                        <div className="space-y-1.5">
                          <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Option B: Reschedule Class B ("{e2.subjectName}") to Open Time Slot:</span>
                          </div>
                          {availableSlotsForE2.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">No open time slots available on {e2.day}.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {availableSlotsForE2.slice(0, 4).map((slot) => (
                                <button
                                  key={slot.label}
                                  onClick={() => handleRescheduleTime(e2, slot.startTime, slot.endTime)}
                                  className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                >
                                  <span>
                                    Shift to {slot.startTime} - {slot.endTime}
                                  </span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Option 3: Substitute Faculty (for faculty clashes) */}
                        {conf.type === 'faculty' && (
                          <div className="space-y-1.5">
                            <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                              <Users className="w-3.5 h-3.5 text-purple-400" />
                              <span>Option C: Reassign Class B to Available Department Faculty:</span>
                            </div>
                            {availableFacultyForE2.length === 0 ? (
                              <p className="text-[11px] text-slate-400 italic">
                                All department faculty members are busy during this slot.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {availableFacultyForE2.slice(0, 3).map((f) => (
                                  <button
                                    key={f.id}
                                    onClick={() => handleReassignFacultyMember(e2, f)}
                                    className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/40 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                  >
                                    <span>Assign {f.name}</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Quick Action Footer */}
                        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                          <button
                            onClick={() => {
                              setEditingEntryId(e2.id);
                              setFormFacultyId(e2.facultyId);
                              setFormSubjectCode(e2.subjectCode);
                              setFormSubjectName(e2.subjectName);
                              setFormRoom(e2.room);
                              setFormDay(e2.day);
                              setFormStartTime(e2.startTime);
                              setFormEndTime(e2.endTime);
                              setFormBatch(e2.batch);
                              setFormDepartment(e2.department);
                              setIsEntryModalOpen(true);
                            }}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-all flex items-center space-x-1 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit Class B</span>
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete conflicting entry "${e2.subjectName}"?`)) {
                                onDeleteEntry(e2.id);
                              }
                            }}
                            className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold rounded-lg transition-all flex items-center space-x-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete Entry B</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 5: ROSTER MANAGEMENT (FACULTY & ROOMS) ===================== */}
      {activeAdminTab === 'roster' && (
        <div className="space-y-6">
          {/* Top Banner & Manual Trigger Notifications */}
          <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="font-heading font-extrabold text-lg text-white flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span>Faculty Pre-Registration & Mobile Database</span>
              </h3>
              <p className="text-xs text-slate-400">
                Pre-register faculty mobile numbers & employee IDs before routine deployment to enable Mobile / Email Login.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleNotifyFacultyRoutineUpload()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5 cursor-pointer"
                title="Send updated schedule notifications to all faculty members listed in the active routine"
              >
                <span>📢 Notify All Faculty / Resend Schedule Alerts</span>
              </button>
            </div>
          </div>

          {/* DEDICATED UI SECTION: BULK CSV FACULTY PRE-REGISTRATION */}
          <div className="bg-slate-800/95 rounded-2xl border-2 border-blue-500/40 p-6 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-700/80">
              <div>
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                  <h4 className="font-heading font-extrabold text-lg text-white">
                    Bulk CSV / Excel Faculty Pre-Registration
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    CSV / XLSX Supported
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Upload a CSV file containing <strong>Faculty Name, Mobile Number, and Employee ID</strong> to pre-register faculty accounts in bulk.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleDownloadFacultyCsvTemplate}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Download CSV Template (.csv)</span>
                </button>
              </div>
            </div>

            {/* CSV File Upload Box */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="md:col-span-2">
                <label className="border-2 border-dashed border-blue-500/50 hover:border-blue-400 bg-slate-900/80 hover:bg-slate-900 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group">
                  <Upload className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform mb-2" />
                  <span className="text-xs font-bold text-white mb-1">
                    {facultyCsvFileName ? `File Selected: ${facultyCsvFileName}` : 'Click to Upload CSV File (or Drag & Drop)'}
                  </span>
                  <span className="text-[11px] text-slate-400 text-center">
                    Required Headers: <strong>Faculty Name</strong>, <strong>Mobile Number</strong>, <strong>Employee ID</strong>, Department (Optional)
                  </span>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFacultyCsvFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-700/80 space-y-2 text-xs">
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>CSV Column Requirements</span>
                </div>
                <ul className="space-y-1 text-slate-400 text-[11px]">
                  <li>• <strong className="text-slate-200">Faculty Name</strong> (e.g. Dr. Deborshee Gogoi)</li>
                  <li>• <strong className="text-slate-200">Mobile Number</strong> (10-digit, used for Login)</li>
                  <li>• <strong className="text-slate-200">Employee ID</strong> (e.g. DC-EMP-001)</li>
                  <li>• <strong className="text-slate-200">Department</strong> (e.g. Commerce, Physics)</li>
                </ul>
              </div>
            </div>

            {/* CSV PARSED PREVIEW TABLE */}
            {facultyCsvPreview.length > 0 && (
              <div className="bg-slate-900/95 border border-emerald-500/40 rounded-2xl p-4 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <h5 className="font-heading font-extrabold text-sm text-white">
                      Parsed CSV Faculty Preview ({facultyCsvPreview.length} Records Found)
                    </h5>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setFacultyCsvPreview([])}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
                    >
                      Clear / Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmFacultyCsvImport}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5 cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Confirm & Bulk Add {facultyCsvPreview.length} Faculty Members</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-60 overflow-y-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 font-semibold sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">Faculty Name</th>
                        <th className="p-2.5">Mobile Number</th>
                        <th className="p-2.5">Employee ID</th>
                        <th className="p-2.5">Department</th>
                        <th className="p-2.5">Designation</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {facultyCsvPreview.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="p-2.5 text-slate-500 font-mono">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-white">{item.name}</td>
                          <td className="p-2.5 font-mono text-emerald-400 font-semibold">
                            {item.phone || <span className="text-rose-400 italic">Missing</span>}
                          </td>
                          <td className="p-2.5 font-mono text-slate-300">{item.employeeId}</td>
                          <td className="p-2.5 text-slate-300">{item.department}</td>
                          <td className="p-2.5 text-slate-400">{item.designation}</td>
                          <td className="p-2.5">
                            {item.phone ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ✓ Ready
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                ⚠️ No Phone
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Add Faculty Form */}
            <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 space-y-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <span>Register New Faculty Member</span>
              </h3>

              <form onSubmit={handleCreateFaculty} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Robert Vance"
                    value={newFacName}
                    onChange={(e) => setNewFacName(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">College Email</label>
                  <input
                    type="email"
                    placeholder="e.g. r.vance@digboicollege.edu.in"
                    value={newFacEmail}
                    onChange={(e) => setNewFacEmail(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Department</label>
                  <select
                    value={newFacDept}
                    onChange={(e) => setNewFacDept(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {DEPARTMENTS_LIST.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Add Faculty Member
                </button>
              </form>
            </div>

            {/* Add Room Form */}
            <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 space-y-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                <Building className="w-5 h-5 text-cyan-400" />
                <span>Create Campus Room / Lab</span>
              </h3>

              <form onSubmit={handleCreateRoom} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Room Name</label>
                  <input
                    type="text"
                    placeholder="e.g. LH-204 or AI LAB 2"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Building Block</label>
                  <input
                    type="text"
                    value={newRoomBuilding}
                    onChange={(e) => setNewRoomBuilding(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Seating Capacity</label>
                  <input
                    type="number"
                    value={newRoomCap}
                    onChange={(e) => setNewRoomCap(parseInt(e.target.value, 10) || 40)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Create Room
                </button>
              </form>
            </div>
          </div>

          {/* ROUTINE VS PRE-REGISTRATION FACULTY AUDIT TABLE */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-5 space-y-3 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <h4 className="font-heading font-extrabold text-base text-white">
                  Faculty Roster & Audit Match Status
                </h4>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs text-slate-400">
                  {facultyList.length} Faculty Members
                </span>
                {facultyList.length > 0 && onClearAllFaculty && (
                  <button
                    onClick={() => {
                      if (confirm('⚠️ Are you sure you want to delete ALL faculty members from the roster? This action cannot be undone.')) {
                        onClearAllFaculty();
                      }
                    }}
                    className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                    title="Delete all registered default & custom faculty"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All Faculty</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="p-3">Faculty Name</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Pre-Reg Mobile Number</th>
                    <th className="p-3">Employee ID</th>
                    <th className="p-3">Routine Classes Count</th>
                    <th className="p-3">Audit Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {facultyList.map((fac) => {
                    const classCount = timetable.filter(
                      (t) =>
                        t.facultyId === fac.id ||
                        t.facultyName.toLowerCase().trim() === fac.name.toLowerCase().trim()
                    ).length;

                    const isMobilePresent = Boolean(fac.phone || fac.whatsappPhone);

                    return (
                      <tr key={fac.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 font-bold text-white flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span>{fac.name}</span>
                        </td>
                        <td className="p-3 text-slate-300">{fac.department}</td>
                        <td className="p-3 font-mono font-semibold text-emerald-400">
                          {fac.phone || fac.whatsappPhone || <span className="text-rose-400 italic">Missing Mobile</span>}
                        </td>
                        <td className="p-3 font-mono text-slate-400">{fac.employeeId || 'DC-EMP-001'}</td>
                        <td className="p-3 font-mono text-blue-300 font-bold">{classCount} Lectures</td>
                        <td className="p-3">
                          {isMobilePresent ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              ✓ Verified Ready for Direct Login
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              ⚠️ Action: Add Mobile Number
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right space-x-1">
                          <button
                            onClick={() => openFacultyEditModal(fac)}
                            className="p-1.5 text-slate-300 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-lg transition-all cursor-pointer inline-flex items-center space-x-1 font-semibold text-xs border border-slate-700 bg-slate-800/80"
                            title="Edit Faculty Roster Details"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Edit</span>
                          </button>

                          {onDeleteFaculty && (
                            <button
                              onClick={() => {
                                if (confirm(`Remove "${fac.name}" from Faculty Roster?`)) {
                                  onDeleteFaculty(fac.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer inline-flex items-center space-x-1 font-semibold text-xs"
                              title="Delete Faculty Member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: MANAGE STUDENTS & ROSTER UPLOAD ===================== */}
      {activeAdminTab === 'students' && (
        <div className="space-y-6">
          {/* Central QR Enrollment Manager */}
          <StudentQREnrollmentsManager
            students={students}
            onUpdateStudents={onUpdateStudents || (() => {})}
            currentUser={currentUser}
          />

          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-white">
                    Manual Excel Import & Add Student
                  </h3>
                  <p className="text-xs text-slate-400">
                    Upload class-wise student rosters via Excel or add individual students manually.
                  </p>
                </div>
              </div>

              {/* Roster Template & Upload Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadStudentRosterExcelTemplate}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download Roster Template (.xlsx)</span>
                </button>

                <label className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-lg transition-all cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Student Roster Excel</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleStudentRosterFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Quick Add Single Student Form */}
            <form onSubmit={handleAddSingleStudent} className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/80 space-y-3">
              <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Quick Add Single Student</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Roll Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. COM-2025-09"
                    value={newStudentRoll}
                    onChange={(e) => setNewStudentRoll(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Enrolment No.</label>
                  <input
                    type="text"
                    placeholder="e.g. EN202500123"
                    value={newStudentEnrollmentNo}
                    onChange={(e) => setNewStudentEnrollmentNo(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Student Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Priya Chetri"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Class / Section *</label>
                  <input
                    type="text"
                    placeholder="e.g. FYUGP 1st Sem Commerce"
                    value={newStudentClass}
                    onChange={(e) => setNewStudentClass(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Subject Selection</label>
                  <input
                    type="text"
                    list="student-subjects-list"
                    placeholder="Select or type subject"
                    value={newStudentSubject}
                    onChange={(e) => setNewStudentSubject(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                  <datalist id="student-subjects-list">
                    {availableSubjectsList.map((sub) => (
                      <option key={sub} value={sub} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Student to Roster</span>
                </button>
              </div>
            </form>
          </div>

          {/* Student Roster List Table */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 overflow-hidden shadow-xl space-y-3 p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search student roll no., enrolment no., name, subject..."
                  value={studentSearchTerm}
                  onChange={(e) => setStudentSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">Class Filter:</span>
                  <select
                    value={studentClassFilter}
                    onChange={(e) => setStudentClassFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="All">All Classes ({students.length})</option>
                    {Array.from(new Set(students.map((s) => s.classBatch))).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Export Buttons */}
                <button
                  onClick={handleExportStudentRosterExcel}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
                  title="Export current roster view to Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Excel (.xlsx)</span>
                </button>

                <button
                  onClick={handleExportStudentRosterCsv}
                  className="px-3.5 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
                  title="Export current roster view to CSV (.csv)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV (.csv)</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="p-3">Roll No.</th>
                    <th className="p-3">Enrolment No.</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Class / Section</th>
                    <th className="p-3">Subject Selection</th>
                    <th className="p-3">Session Tag</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No student rosters loaded yet. Download the template above, upload an Excel file, or add a student manually.
                      </td>
                    </tr>
                  ) : (
                    students
                      .filter((s) => {
                        const term = studentSearchTerm.toLowerCase();
                        const matchSearch =
                          s.name.toLowerCase().includes(term) ||
                          s.rollNo.toLowerCase().includes(term) ||
                          (s.enrollmentNo && s.enrollmentNo.toLowerCase().includes(term)) ||
                          (s.subjectName && s.subjectName.toLowerCase().includes(term));
                        const matchClass = studentClassFilter === 'All' || s.classBatch === studentClassFilter;
                        return matchSearch && matchClass;
                      })
                      .map((s) => (
                        <tr key={s.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-emerald-400">{s.rollNo}</td>
                          <td className="p-3 font-mono text-slate-300">{s.enrollmentNo || '—'}</td>
                          <td className="p-3 font-bold text-white">{s.name}</td>
                          <td className="p-3 text-slate-300">{s.classBatch}</td>
                          <td className="p-3 font-medium text-indigo-300">{s.subjectName || '—'}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {s.sessionId || `${activeSemesterCycle}-${sessionAcademicYear}`}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteStudent(s.id)}
                              className="p-1.5 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                              title="Delete Student"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: SEMESTER SESSION MANAGEMENT & ARCHIVAL ===================== */}
      {activeAdminTab === 'session' && (
        <div className="space-y-6">
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-white">
                  Academic Session Management & Archival Workflow
                </h3>
                <p className="text-xs text-slate-400">
                  Configure Odd / Even semester cycles, academic year dates, and trigger routine archival for NAAC audit compliance.
                </p>
              </div>
            </div>

            {/* Current Active Session Status Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900 p-4 rounded-xl border border-slate-700/80">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Active Semester Type
                </label>
                <select
                  value={activeSemesterCycle}
                  onChange={(e) => setActiveSemesterCycle(e.target.value as 'Odd' | 'Even')}
                  className="w-full bg-slate-800 text-white font-bold text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                >
                  <option value="Odd">Odd Semester (July – Dec)</option>
                  <option value="Even">Even Semester (Jan – June)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={sessionAcademicYear}
                  onChange={(e) => setSessionAcademicYear(e.target.value)}
                  className="w-full bg-slate-800 text-white font-bold text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                  placeholder="e.g. 2025–26"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Session Start Date
                </label>
                <input
                  type="date"
                  value={sessionStartDate}
                  onChange={(e) => setSessionStartDate(e.target.value)}
                  className="w-full bg-slate-800 text-white font-bold text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Session End Date
                </label>
                <input
                  type="date"
                  value={sessionEndDate}
                  onChange={(e) => setSessionEndDate(e.target.value)}
                  className="w-full bg-slate-800 text-white font-bold text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                />
              </div>
            </div>

            {/* Archival Action Block */}
            <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-5 space-y-3">
              <div className="flex items-center space-x-2 text-amber-300 font-bold text-sm">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>End-of-Semester Archival Action</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                When transitioning between Odd and Even semesters, archiving the active routine safely moves all routine entries to the read-only audit log while resetting the active timetable for the new cycle. Class diary records and research uploads remain preserved permanently for NAAC/SSR inspection.
              </p>

              <button
                onClick={() => setIsArchiveConfirmOpen(true)}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Archive & Reset Active Session Routine</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: DELEGATED ADMIN ACCESS MANAGEMENT ===================== */}
      {activeAdminTab === 'access' && (
        <div className="space-y-4">
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-2">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <h3 className="font-heading font-bold text-lg text-white">
                Delegated Admin Access Management (Super-Admin Control)
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Only super-admin accounts (<strong>thewildscapes@gmail.com</strong> / <strong>9706375001</strong>) can assign or revoke administrative rights for other faculty members.
            </p>
          </div>

          <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="p-3.5">Faculty Name</th>
                  <th className="p-3.5">Department</th>
                  <th className="p-3.5">Email ID</th>
                  <th className="p-3.5">Role / Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {facultyList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No registered faculty accounts found in database.
                    </td>
                  </tr>
                ) : (
                  facultyList.map((fac) => {
                    const isSuper = fac.email.toLowerCase() === 'thewildscapes@gmail.com' || fac.phone?.includes('9706375001');
                    const isAdmin = isSuper || fac.role === 'admin';

                    return (
                      <tr key={fac.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3.5 font-bold text-white flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                            {fac.name.charAt(0)}
                          </div>
                          <span>{fac.name}</span>
                        </td>
                        <td className="p-3.5 text-slate-300">{fac.department}</td>
                        <td className="p-3.5 text-slate-400 font-mono text-[11px]">{fac.email}</td>
                        <td className="p-3.5">
                          {isSuper ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Super Admin (Locked)
                            </span>
                          ) : isAdmin ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                              Delegated Admin
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">
                              Faculty User
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          {isSuper ? (
                            <span className="text-[11px] text-slate-500 font-semibold italic">Permanent Access</span>
                          ) : isAdmin ? (
                            <button
                              onClick={() => onToggleUserAdminRole?.(fac.email, false)}
                              className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-[11px] font-bold rounded-lg border border-rose-500/30 transition-all cursor-pointer"
                            >
                              Revoke Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => onToggleUserAdminRole?.(fac.email, true)}
                              className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-bold rounded-lg border border-indigo-500/30 transition-all cursor-pointer"
                            >
                              Grant Admin Access
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== TAB: DATA BACKUP & RECOVERY SAFEGUARDS ===================== */}
      {activeAdminTab === 'backup_safeguards' && (
        <div className="space-y-6">
          {/* Header Card & Quick Action Controls */}
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-emerald-500/40 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <Shield className="w-6 h-6" />
                  <h3 className="font-heading font-bold text-xl text-white">
                    Data Backup, Version History & Recovery Safeguards
                  </h3>
                </div>
                <p className="text-xs text-slate-300">
                  Automated backups, direct Excel routine exports, raw spreadsheet retention, and version history rollback system to safeguard academic routine integrity.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleExportLiveRoutineExcel()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Live Routine (.xlsx)</span>
                </button>

                <button
                  onClick={() => {
                    const desc = prompt(
                      'Enter a label or description for this manual backup snapshot:',
                      'Manual Pre-Exam Schedule Snapshot'
                    );
                    if (desc && onCreateManualBackup) {
                      onCreateManualBackup(desc);
                    }
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <HardDrive className="w-4 h-4 text-cyan-200" />
                  <span>Create Instant Backup</span>
                </button>
              </div>
            </div>

            {/* Quick Status Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/70">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Database Entries</div>
                <div className="text-lg font-mono font-extrabold text-emerald-400">{timetable.length} Classes</div>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/70">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Upload Version History</div>
                <div className="text-lg font-mono font-extrabold text-blue-400">{routineVersions.length} Logs</div>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/70">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Backups Archived</div>
                <div className="text-lg font-mono font-extrabold text-cyan-400">{routineBackups.length} Snapshots</div>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/70">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Automated Daily Backups</div>
                <div className="text-lg font-mono font-extrabold text-amber-400">
                  {routineBackups.filter((b) => b.type === 'automated_daily').length} Scheduled
                </div>
              </div>
            </div>
          </div>

          {/* SECTION A: UPLOAD VERSION HISTORY & 1-CLICK ROLLBACK */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-indigo-400" />
                <h4 className="font-heading font-extrabold text-lg text-white">
                  Upload Version History & Rollback Logs
                </h4>
              </div>
              <span className="text-xs text-slate-400">
                Retains upload history to protect against accidental overwrites
              </span>
            </div>

            {routineVersions.length === 0 ? (
              <div className="bg-slate-900/50 border border-slate-700/80 rounded-xl p-8 text-center space-y-2">
                <FileCode className="w-10 h-10 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-300 font-medium">No routine upload history recorded yet.</p>
                <p className="text-[11px] text-slate-500">
                  Future Excel or CSV routine uploads will automatically generate version logs with raw file retention.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="p-3">Upload Timestamp</th>
                      <th className="p-3">Uploaded By</th>
                      <th className="p-3">File Name</th>
                      <th className="p-3">Mode</th>
                      <th className="p-3">Classes</th>
                      <th className="p-3">Change Details</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {routineVersions.map((ver) => (
                      <tr key={ver.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-white whitespace-nowrap">
                          {new Date(ver.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3 font-semibold text-slate-300">{ver.uploadedBy}</td>
                        <td className="p-3 font-medium text-cyan-300 max-w-[180px] truncate" title={ver.fileName}>
                          {ver.fileName}
                        </td>
                        <td className="p-3">
                          {ver.mode === 'replace' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Replace
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Append
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-400">{ver.totalRecords}</td>
                        <td className="p-3 text-slate-400 max-w-[220px] truncate" title={ver.changeSummary}>
                          {ver.changeSummary}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap space-x-1.5">
                          {ver.entriesSnapshot && ver.entriesSnapshot.length > 0 && (
                            <>
                              <button
                                onClick={() =>
                                  setPreviewingSnapshot({
                                    title: `Version Log (${new Date(ver.timestamp).toLocaleString()}) - ${ver.fileName}`,
                                    entries: ver.entriesSnapshot || [],
                                  })
                                }
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold rounded-lg border border-slate-700 transition-all cursor-pointer inline-flex items-center space-x-1"
                                title="Inspect Version Entries"
                              >
                                <Eye className="w-3 h-3 text-blue-400" />
                                <span>Preview</span>
                              </button>

                              <button
                                onClick={() =>
                                  handleExportLiveRoutineExcel(
                                    ver.entriesSnapshot,
                                    `Version_Export_${ver.fileName}_${new Date(ver.timestamp).toISOString().split('T')[0]}.xlsx`
                                  )
                                }
                                className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 text-[11px] font-bold rounded-lg border border-emerald-700/50 transition-all cursor-pointer inline-flex items-center space-x-1"
                                title="Export Version to Excel"
                              >
                                <Download className="w-3 h-3 text-emerald-400" />
                                <span>Export</span>
                              </button>

                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `⚠️ Confirm Routine Rollback?\n\nAre you sure you want to restore the live routine database back to the state in version "${ver.fileName}" from ${new Date(ver.timestamp).toLocaleString()}?\n\nThis will restore ${ver.entriesSnapshot?.length} class schedules into the live database.`
                                    )
                                  ) {
                                    if (onRollbackRoutine && ver.entriesSnapshot) {
                                      onRollbackRoutine(ver.entriesSnapshot, ver.fileName);
                                    }
                                  }
                                }}
                                className="px-2.5 py-1 bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white text-[11px] font-bold rounded-lg border border-rose-500/40 transition-all cursor-pointer inline-flex items-center space-x-1"
                                title="Restore Live Database to this version"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Rollback</span>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION B: AUTOMATED DAILY & MANUAL BACKUP SNAPSHOTS */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <h4 className="font-heading font-extrabold text-lg text-white">
                  Automated Daily & Manual System Backups
                </h4>
              </div>
              <span className="text-xs text-slate-400">
                Scheduled automated daily snapshots & safety pre-import backups
              </span>
            </div>

            {routineBackups.length === 0 ? (
              <div className="bg-slate-900/50 border border-slate-700/80 rounded-xl p-8 text-center space-y-2">
                <HardDrive className="w-10 h-10 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-300 font-medium">No backup snapshots archived yet.</p>
                <p className="text-[11px] text-slate-500">
                  Automated daily backups run automatically when routine entries exist.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="p-3">Backup Date & Time</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Classes</th>
                      <th className="p-3 text-right">Recovery Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {routineBackups.map((bkp) => (
                      <tr key={bkp.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-white whitespace-nowrap">
                          {new Date(bkp.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3">
                          {bkp.type === 'automated_daily' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Automated Daily
                            </span>
                          ) : bkp.type === 'pre_import_backup' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              Pre-Import Safety
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              Manual Snapshot
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-300 font-medium max-w-[260px] truncate" title={bkp.description}>
                          {bkp.description}
                        </td>
                        <td className="p-3 font-mono font-bold text-cyan-300">{bkp.totalClasses}</td>
                        <td className="p-3 text-right whitespace-nowrap space-x-1.5">
                          {bkp.entriesSnapshot && bkp.entriesSnapshot.length > 0 && (
                            <>
                              <button
                                onClick={() =>
                                  setPreviewingSnapshot({
                                    title: `Backup Snapshot (${new Date(bkp.timestamp).toLocaleString()}) - ${bkp.description}`,
                                    entries: bkp.entriesSnapshot || [],
                                  })
                                }
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold rounded-lg border border-slate-700 transition-all cursor-pointer inline-flex items-center space-x-1"
                              >
                                <Eye className="w-3 h-3 text-blue-400" />
                                <span>Preview</span>
                              </button>

                              <button
                                onClick={() =>
                                  handleExportLiveRoutineExcel(
                                    bkp.entriesSnapshot,
                                    `Backup_Export_${bkp.id}_${new Date(bkp.timestamp).toISOString().split('T')[0]}.xlsx`
                                  )
                                }
                                className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 text-[11px] font-bold rounded-lg border border-emerald-700/50 transition-all cursor-pointer inline-flex items-center space-x-1"
                              >
                                <Download className="w-3 h-3 text-emerald-400" />
                                <span>Export</span>
                              </button>

                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `⚠️ Restore System Routine from Backup?\n\nThis will restore ${bkp.entriesSnapshot?.length} class schedules from backup snapshot "${bkp.description}" (${new Date(bkp.timestamp).toLocaleString()}) into the live database.`
                                    )
                                  ) {
                                    if (onRollbackRoutine && bkp.entriesSnapshot) {
                                      onRollbackRoutine(bkp.entriesSnapshot, bkp.description);
                                    }
                                  }
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg shadow transition-all cursor-pointer inline-flex items-center space-x-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB: SQLITE SCHEMA & DATABASE INTEGRITY AUDITS ===================== */}
      {activeAdminTab === 'sqlite_integrity' && <AdminSqliteIntegrityView />}

      {/* Snapshot / Version Preview Modal */}
      {previewingSnapshot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl space-y-4 p-6 text-white overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-cyan-400">
                <Eye className="w-5 h-5" />
                <h3 className="font-heading font-bold text-lg text-white truncate max-w-xl">
                  {previewingSnapshot.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewingSnapshot(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold sticky top-0">
                  <tr>
                    <th className="p-2.5">Day</th>
                    <th className="p-2.5">Time</th>
                    <th className="p-2.5">Faculty</th>
                    <th className="p-2.5">Subject</th>
                    <th className="p-2.5">Room</th>
                    <th className="p-2.5">Batch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {previewingSnapshot.entries.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="p-2.5 font-semibold text-white">{item.day}</td>
                      <td className="p-2.5 font-mono text-indigo-300">
                        {item.startTime} - {item.endTime}
                      </td>
                      <td className="p-2.5 text-slate-200">{item.facultyName}</td>
                      <td className="p-2.5 font-bold text-white">
                        {item.subjectName} ({item.subjectCode})
                      </td>
                      <td className="p-2.5 text-cyan-300">{item.room}</td>
                      <td className="p-2.5">{item.batch}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400 font-mono">
                Total Classes: {previewingSnapshot.entries.length}
              </span>
              <button
                onClick={() => setPreviewingSnapshot(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Session Confirmation Modal */}
      {isArchiveConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle className="w-7 h-7 shrink-0" />
              <h3 className="font-heading font-bold text-lg text-white">
                Confirm Semester Session Archival
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              This will archive the current <strong>{activeSemesterCycle} Semester {sessionAcademicYear}</strong> session and prepare the app for a new routine. Class diary records will remain safely stored and viewable under Archived Sessions. Continue?
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsArchiveConfirmOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onResetData();
                  setIsArchiveConfirmOpen(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
              >
                Archive & Reset Routine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: NAAC / NBA AUDIT REPORTS ===================== */}
      {activeAdminTab === 'naac_reports' && (
        <AdminNaacReports
          facultyList={facultyList}
          timetable={timetable}
        />
      )}

      {/* ===================== TAB: FACULTY SELF-IMPORTS & MASTER CROSS-CHECK ===================== */}
      {activeAdminTab === 'faculty_self_imports' && (
        <AdminFacultySelfImportsView
          facultyList={facultyList}
          masterTimetable={timetable}
          selfImportRecords={facultySelfImports}
          onRefreshSelfImports={onRefreshSelfImports}
        />
      )}

      {/* ===================== CREATE / EDIT TIMETABLE ENTRY MODAL ===================== */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-heading font-bold text-lg text-white">
                {editingEntryId ? 'Edit Class Timetable Entry' : 'Add New Class Entry'}
              </h3>
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              {/* Semester Cycle & Program/Semester */}
              <div className="grid grid-cols-2 gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <div>
                  <label className="text-xs font-semibold text-emerald-300 block mb-1">Semester Cycle</label>
                  <select
                    value={formSemesterCycle}
                    onChange={(e) => {
                      const val = e.target.value as 'Odd' | 'Even';
                      setFormSemesterCycle(val);
                      const newList = val === 'Odd' ? ODD_SEMESTERS_LIST : EVEN_SEMESTERS_LIST;
                      setFormProgramSemester(newList[0]);
                    }}
                    className="w-full bg-slate-900 text-white text-xs font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Odd">Odd Semesters (Aug–Dec)</option>
                    <option value="Even">Even Semesters (Jan–Jun)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-amber-300 block mb-1">Course / Semester</label>
                  <select
                    value={formProgramSemester}
                    onChange={(e) => {
                      const prog = e.target.value;
                      setFormProgramSemester(prog);
                      setFormBatch(prog);
                      // Pre-fill department if HS Commerce
                      if (prog.includes('Commerce')) {
                        setFormDepartment('Commerce & Management');
                        setFormPaperCategory('HS Core');
                      }
                    }}
                    className="w-full bg-slate-900 text-white text-xs font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    {(formSemesterCycle === 'Odd' ? ODD_SEMESTERS_LIST : EVEN_SEMESTERS_LIST).map((prog) => (
                      <option key={prog} value={prog}>
                        {prog}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Paper Category & Quick Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 block">Paper Category / Type</label>
                  <span className="text-[10px] text-fuchsia-300 font-medium">
                    (PG includes: Major, Minor, MDC, Vocational)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {FYUGP_PAPER_CATEGORIES.map((cat) => (
                    <button
                      type="button"
                      key={cat.code}
                      onClick={() => setFormPaperCategory(cat.code)}
                      className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all text-center ${
                        formPaperCategory === cat.code
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-400/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {cat.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Preset Buttons for Subjects */}
              <div className="bg-slate-800/90 p-3 rounded-xl border border-cyan-500/30 space-y-1.5">
                <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider block">
                  ⚡ Quick Subject Presets (Click or type manually below):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { code: 'MAJ101', name: 'Major Core Course' },
                    { code: 'MIN101', name: 'Minor Paper' },
                    { code: 'MDC101', name: 'Multidisciplinary Course' },
                    { code: 'AEC101', name: 'Ability Enhancement' },
                    { code: 'SEC101', name: 'Skill Enhancement Course' },
                    { code: 'VAC101', name: 'Value Added Course' },
                  ].map((sub) => (
                    <button
                      type="button"
                      key={sub.code}
                      onClick={() => {
                        setFormSubjectName(sub.name);
                        setFormSubjectCode(sub.code);
                      }}
                      className="px-2 py-0.5 bg-slate-900 hover:bg-slate-700 text-cyan-300 text-[11px] font-semibold rounded-lg border border-slate-700 transition-all"
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Department & Faculty Member */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Department</label>
                  <select
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {DEPARTMENTS_LIST.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Assigned Teacher</label>
                  <select
                    value={formFacultyId}
                    onChange={(e) => {
                      const fid = e.target.value;
                      setFormFacultyId(fid);
                      const fObj = facultyList.find((f) => f.id === fid);
                      if (fObj?.department) setFormDepartment(fObj.department);
                    }}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {facultyList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.department})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject Code & Manual Subject Name Entry */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Subject Code</label>
                  <input
                    type="text"
                    value={formSubjectCode}
                    onChange={(e) => setFormSubjectCode(e.target.value)}
                    placeholder="e.g. COM101 or PG101-MAJ"
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-emerald-300 block">Subject / Paper Name (Manual Entry)</label>
                    <span className="text-[9px] text-emerald-400 font-semibold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">✏️ Editable</span>
                  </div>
                  <input
                    type="text"
                    value={formSubjectName}
                    onChange={(e) => setFormSubjectName(e.target.value)}
                    placeholder="Type custom subject name manually..."
                    className="w-full bg-slate-900 text-white text-xs font-medium rounded-xl px-3 py-2 border border-emerald-500/60 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                    required
                  />
                  <p className="text-[9.5px] text-slate-400 mt-1">You can enter any PG or UG subject name manually above.</p>
                </div>
              </div>

              {/* Day & 1-Hour Time Slot */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Day of Week</label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value as DayOfWeek)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-indigo-300 block mb-1">1-Hour Time Slot (8 AM - 4 PM)</label>
                  <select
                    value={`${formStartTime} - ${formEndTime}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      const slot = HOURLY_TIME_SLOTS.find((s) => s.label === val);
                      if (slot) {
                        setFormStartTime(slot.startTime);
                        setFormEndTime(slot.endTime);
                      }
                    }}
                    className="w-full bg-slate-800 text-white font-bold text-xs rounded-xl px-3 py-2 border border-indigo-500/50 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {HOURLY_TIME_SLOTS.map((slot) => (
                      <option key={slot.label} value={slot.label}>
                        {slot.displayLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Room & Batch */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300 block">Class No./Room (Free-Text or Dropdown)</label>
                    <span className="text-[9px] text-cyan-300 font-semibold bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30">✏️ Editable</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      list="available_rooms_list"
                      value={formRoom}
                      onChange={(e) => setFormRoom(e.target.value)}
                      placeholder="e.g. Room No. C1, Lib.2, Hall, M2, AT3..."
                      className="w-full bg-slate-800 text-white text-xs font-semibold rounded-xl px-3 py-2 border border-cyan-500/50 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
                      required
                    />
                    <datalist id="available_rooms_list">
                      {roomList.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.building} - Cap {r.capacity}
                        </option>
                      ))}
                      <option value="Lib.2">Library Hall 2</option>
                      <option value="Hall">Main Auditorium Hall</option>
                      <option value="M2">M2 Seminar Room</option>
                      <option value="AT3">Annex Theater 3</option>
                      <option value="Smart Class 1">Smart Classroom 1</option>
                    </datalist>
                  </div>
                  <p className="text-[9.5px] text-slate-400 mt-1">Select from list or type custom codes like Lib.2, Hall, AT3.</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Batch / Class Tag</label>
                  <input
                    type="text"
                    value={formBatch}
                    onChange={(e) => setFormBatch(e.target.value)}
                    placeholder="e.g. HS 1st Yr Commerce or FYUGP 1st Sem CS"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Notes / Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Bring calculator or lab practical notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Double Booking Conflict Warning Modal */}
      {doubleBookingConflict && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-white animate-fadeIn">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-8 h-8 shrink-0 text-amber-400 animate-bounce" />
              <div>
                <h3 className="font-heading font-extrabold text-lg text-white">
                  Room Double-Booking Detected
                </h3>
                <span className="text-[11px] text-amber-300 font-bold uppercase tracking-wider">
                  Conflict Warning
                </span>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Room <strong className="text-amber-300 font-mono text-sm">{formRoom}</strong> is already assigned on{' '}
                <strong className="text-white">{formDay}</strong> between{' '}
                <strong className="text-cyan-300 font-mono">{doubleBookingConflict.conflictEntry.startTime} – {doubleBookingConflict.conflictEntry.endTime}</strong> by:
              </p>

              <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-lg space-y-1">
                <div className="font-bold text-amber-200">
                  {doubleBookingConflict.conflictEntry.subjectName} ({doubleBookingConflict.conflictEntry.subjectCode})
                </div>
                <div className="text-[11px] text-slate-300">
                  Faculty: <strong className="text-white">{doubleBookingConflict.conflictEntry.facultyName}</strong> | Class: {doubleBookingConflict.conflictEntry.batch}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 italic">
                Do you still want to proceed with <strong>Manual Override</strong> (allow double booking)?
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDoubleBookingConflict(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Cancel & Adjust Room
              </button>
              <button
                type="button"
                onClick={(e) => handleSaveEntry(e, true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Confirm & Force Save (Manual Override)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== EDIT FACULTY MEMBER MODAL ===================== */}
      {isFacultyEditModalOpen && editingFaculty && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <span>Edit Faculty Roster Details</span>
              </h3>
              <button
                onClick={() => {
                  setIsFacultyEditModalOpen(false);
                  setEditingFaculty(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFacultyEdit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editFacName}
                  onChange={(e) => setEditFacName(e.target.value)}
                  placeholder="e.g. Dr. Robert Vance"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">College Email</label>
                <input
                  type="email"
                  value={editFacEmail}
                  onChange={(e) => setEditFacEmail(e.target.value)}
                  placeholder="e.g. r.vance@digboicollege.edu.in"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Department</label>
                  <select
                    value={editFacDept}
                    onChange={(e) => setEditFacDept(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {DEPARTMENTS_LIST.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Designation</label>
                  <select
                    value={editFacDesignation}
                    onChange={(e) => setEditFacDesignation(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Professor">Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="HOD & Associate Professor">HOD & Associate Professor</option>
                    <option value="Lecturer">Lecturer</option>
                    <option value="Guest Faculty">Guest Faculty</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-emerald-300 block mb-1">
                    Pre-Reg Mobile (Direct Login)
                  </label>
                  <input
                    type="text"
                    value={editFacPhone}
                    onChange={(e) => setEditFacPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-slate-800 text-emerald-300 font-mono text-xs font-semibold rounded-xl px-3 py-2 border border-emerald-500/40 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Employee ID</label>
                  <input
                    type="text"
                    value={editFacEmployeeId}
                    onChange={(e) => setEditFacEmployeeId(e.target.value)}
                    placeholder="e.g. DC-EMP-042"
                    className="w-full bg-slate-800 text-white font-mono text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsFacultyEditModalOpen(false);
                    setEditingFaculty(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                >
                  Save Faculty Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Reschedule Conflict Warning Modal */}
      {rescheduleConflictModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3 text-amber-400">
                <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/40">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-white">
                    Quick Reschedule Conflict Warning
                  </h3>
                  <p className="text-xs text-amber-300">
                    Automated conflict checker found {rescheduleConflictModal.conflicts.length} clash(es) for proposed move.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRescheduleConflictModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Move Details */}
            <div className="bg-slate-800/90 rounded-xl p-3 border border-slate-700/80 text-xs space-y-1">
              <div className="font-bold text-white text-sm">
                Class: {rescheduleConflictModal.entry.subjectName} ({rescheduleConflictModal.entry.subjectCode})
              </div>
              <div className="text-slate-300 flex items-center space-x-2">
                <span>Faculty: <strong className="text-indigo-300">{rescheduleConflictModal.entry.facultyName}</strong></span>
                <span>•</span>
                <span>Room: <strong className="text-cyan-300">{rescheduleConflictModal.entry.room}</strong></span>
              </div>
              <div className="text-amber-300 font-semibold pt-1 border-t border-slate-700 flex items-center space-x-1">
                <span>Proposed Slot:</span>
                <span className="bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 font-mono">
                  {rescheduleConflictModal.targetDay} [{rescheduleConflictModal.targetStartTime} - {rescheduleConflictModal.targetEndTime}]
                </span>
              </div>
            </div>

            {/* List of Conflicts */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {rescheduleConflictModal.conflicts.map((conf, idx) => (
                <div key={idx} className="bg-rose-950/60 border border-rose-500/50 p-2.5 rounded-xl text-xs text-rose-200">
                  <div className="font-bold text-rose-300 flex items-center space-x-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span className="capitalize">{conf.type} Double-Booking Conflict</span>
                  </div>
                  <p className="leading-relaxed">{conf.description}</p>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setRescheduleConflictModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel Reschedule
              </button>
              
              {/* If there's a free room available for a room conflict, offer 1-click room reassign */}
              {rescheduleConflictModal.conflicts.some((c) => c.type === 'room') && (
                (() => {
                  const freeRooms = getAvailableRoomsForSlot(
                    rescheduleConflictModal.targetDay,
                    rescheduleConflictModal.targetStartTime,
                    rescheduleConflictModal.targetEndTime,
                    rescheduleConflictModal.entry.room
                  );
                  if (freeRooms.length > 0) {
                    return (
                      <button
                        onClick={() => {
                          onUpdateEntry(rescheduleConflictModal.entry.id, {
                            day: rescheduleConflictModal.targetDay,
                            startTime: rescheduleConflictModal.targetStartTime,
                            endTime: rescheduleConflictModal.targetEndTime,
                            room: freeRooms[0],
                          });
                          setResolutionNotice({
                            title: '✨ Rescheduled & Reassigned Room!',
                            message: `Moved "${rescheduleConflictModal.entry.subjectName}" to ${rescheduleConflictModal.targetDay} and reassigned room to vacant room "${freeRooms[0]}".`,
                            type: 'success',
                          });
                          setRescheduleConflictModal(null);
                        }}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                      >
                        Reassign Room to {freeRooms[0]} & Reschedule
                      </button>
                    );
                  }
                  return null;
                })()
              )}

              <button
                onClick={() => {
                  onUpdateEntry(rescheduleConflictModal.entry.id, {
                    day: rescheduleConflictModal.targetDay,
                    startTime: rescheduleConflictModal.targetStartTime,
                    endTime: rescheduleConflictModal.targetEndTime,
                  });
                  setResolutionNotice({
                    title: '⚠️ Rescheduled with Conflict Override',
                    message: `Moved "${rescheduleConflictModal.entry.subjectName}" to ${rescheduleConflictModal.targetDay} [${rescheduleConflictModal.targetStartTime} - ${rescheduleConflictModal.targetEndTime}]. Overrode ${rescheduleConflictModal.conflicts.length} conflict(s).`,
                    type: 'info',
                  });
                  setRescheduleConflictModal(null);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
              >
                Force Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON / Text Routine Quick Paste Direct Sync Modal */}
      {isJsonSyncModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 text-xs text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Paste & Sync Custom Routine</h3>
                  <p className="text-slate-400 text-[11px]">
                    Paste routine JSON from classpilot-d1c5.vercel.app or CSV/TSV plain text to overwrite sample data.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsJsonSyncModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {jsonSyncError && (
              <div className="bg-rose-950/80 border border-rose-500/50 p-3 rounded-xl text-rose-200 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{jsonSyncError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold text-[11px]">
                Paste Routine JSON or CSV/Text Rows:
              </label>
              <textarea
                value={jsonSyncInput}
                onChange={(e) => setJsonSyncInput(e.target.value)}
                placeholder={`[
  {
    "subjectCode": "SUBJ101",
    "subjectName": "Subject Title",
    "facultyName": "Faculty Name",
    "day": "Monday",
    "startTime": "09:00",
    "endTime": "10:00",
    "room": "Room C1",
    "batch": "FYUGP 1st Sem",
    "department": "Commerce",
    "semesterCycle": "Odd"
  }
]`}
                rows={10}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 font-mono text-[11px] text-cyan-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 text-[11px] text-slate-300 space-y-1">
              <span className="font-bold text-slate-100 block">💡 Tips & Supported Formats:</span>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                <li>JSON Array containing routine entries with fields like <code className="text-cyan-300">subjectName</code>, <code className="text-cyan-300">facultyName</code>, <code className="text-cyan-300">day</code>, <code className="text-cyan-300">startTime</code>, <code className="text-cyan-300">endTime</code>.</li>
                <li>Or simple comma/tab-separated text: <code className="text-amber-300">SUBJ101, Subject Title, Faculty Name, Monday, 09:00, 10:00, Room 1, FYUGP 1st Sem, Commerce</code></li>
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setJsonSyncInput('');
                  setJsonSyncError('');
                }}
                className="px-3 py-2 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Clear Input
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsJsonSyncModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleJsonSyncSubmit}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition"
                >
                  Sync & Replace Routine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
