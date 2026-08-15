import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { ClassDiaryEntry, AttendanceRecord, SyllabusTopic, User, TimetableEntry, Student, Faculty } from '../types';
import { INITIAL_CLASS_DIARY } from '../data/initialData';
import {
  subscribeToClassDiaryRealtime,
  saveClassDiaryToFirestore,
  getClassDiaryFromFirestore,
  deleteClassDiaryFromFirestore,
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
  Target,
  TrendingUp,
  Layers,
  Award,
  ShieldCheck,
  Smartphone,
  UserX,
  XCircle,
  CalendarOff,
  Ban,
  HelpCircle,
  Info,
  CalendarDays,
  CheckSquare,
} from 'lucide-react';
import { isFacultyNameMatch, isPhoneMatch } from '../utils/timeUtils';

interface ClassDiaryViewProps {
  currentUser: User;
  timetable: TimetableEntry[];
  selectedClassForDiary?: TimetableEntry | null;
  students?: Student[];
  faculties?: Faculty[];
}

export const CANCELLATION_CATEGORIES = [
  { id: 'holiday', label: '🏛️ Institutional / Gazetted Holiday', presetReason: 'Declared Institutional / State Holiday' },
  { id: 'exam_duty', label: '📝 College / University Examination Duty', presetReason: 'Assigned to Examination Invigilation / Evaluation Duty' },
  { id: 'on_duty', label: '✈️ Faculty On-Duty (OD) / Deputation', presetReason: 'Official College Deputation / Academic Conference / Committee Meeting' },
  { id: 'leave', label: '🏥 Faculty Casual / Medical Leave', presetReason: 'Faculty on approved Casual / Medical Leave' },
  { id: 'event', label: '🎓 College Fest / Sports / Youth Festival / Event', presetReason: 'College Annual Function / Youth Fest / Sports Meet' },
  { id: 'emergency', label: '🌧️ Adverse Weather / Flood / Local Bandh / Emergency Closure', presetReason: 'Adverse weather conditions / Local Bandh emergency closure' },
  { id: 'rescheduled', label: '🔄 Class Rescheduled / Special Adjustment', presetReason: 'Class rescheduled / to be compensated' },
  { id: 'other', label: '✍️ Other Specific Reason', presetReason: '' },
];

export const COMMON_HOLIDAY_QUICK_PRESETS = [
  'Independence Day Celebration',
  'Janmashtami / State Gazetted Holiday',
  'College Foundation Day',
  'Exam Invigilation Duty',
  'NAAC Peer Team Coordinator Meeting',
  'District Level Bandh / Strike',
  'Faculty Medical / Emergency Leave',
];

const DEFAULT_SYLLABUS_TOPICS: SyllabusTopic[] = [];

const isExcludedSubject = (name?: string, code?: string): boolean => {
  const text = `${name || ''} ${code || ''}`.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  return (
    text.includes('financial account') ||
    text.includes('organisation behav') ||
    text.includes('organization behav') ||
    text.includes('organisational behav') ||
    text.includes('organizational behav') ||
    text.includes('business organis') ||
    text.includes('business organiz')
  );
};

export const ClassDiaryView: React.FC<ClassDiaryViewProps> = ({
  currentUser,
  timetable,
  selectedClassForDiary,
  students = [],
  faculties = [],
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'records' | 'attendance' | 'syllabus'>('records');

  // Super Admin Check (Principal / System Admin)
  const isSuperAdmin = useMemo(() => {
    if (!currentUser) return false;
    const email = (currentUser.email || '').toLowerCase().trim();
    const phone = (currentUser.whatsappPhone || '').replace(/\D/g, '');
    return email === 'thewildscapes@gmail.com' || phone.endsWith('9706375001') || currentUser.role === 'admin';
  }, [currentUser]);

  // Admin Scope: 'my_only' (own classes) vs 'all_faculty' (institutional master inspection)
  const [adminScope, setAdminScope] = useState<'my_only' | 'all_faculty'>('my_only');

  // Resolve matching faculty profile from faculties directory to prevent empty counts on mobile/OTP login
  const matchedFacultyProfile = useMemo(() => {
    if (!currentUser || !Array.isArray(faculties) || faculties.length === 0) return null;
    const cleanEmail = (currentUser.email || '').toLowerCase().trim();
    const cleanPhone = (currentUser.whatsappPhone || (currentUser as any).phone || '').replace(/\D/g, '');
    const cleanName = (currentUser.name || '').toLowerCase().trim();

    return faculties.find((f) => {
      if (currentUser.facultyId && f.id === currentUser.facultyId) return true;
      if (currentUser.id && f.id === currentUser.id) return true;
      if (cleanEmail && f.email && f.email.toLowerCase().trim() === cleanEmail) return true;
      if (cleanPhone && f.phone && f.phone.replace(/\D/g, '').endsWith(cleanPhone.slice(-10))) return true;
      if (cleanName && f.name && isFacultyNameMatch(f.name, currentUser.name)) return true;
      return false;
    }) || null;
  }, [currentUser, faculties]);

  // Strict ownership verification: A faculty member can only ever see their own logged records
  const isOwnDiaryEntry = (e: ClassDiaryEntry): boolean => {
    if (isSuperAdmin && adminScope === 'all_faculty') return true;

    // Check direct email match
    const myEmail = (currentUser.email || '').toLowerCase().trim();
    if (myEmail && e.facultyEmail && e.facultyEmail.toLowerCase().trim() === myEmail) {
      return true;
    }

    // Check direct phone / WhatsApp match
    const myPhone = currentUser.whatsappPhone || (currentUser as any).phone || '';
    if (myPhone && e.facultyPhone && isPhoneMatch(e.facultyPhone, myPhone)) {
      return true;
    }

    // Check direct ID match
    const myIds = [
      currentUser.facultyId,
      currentUser.id,
      matchedFacultyProfile?.id,
      'fac_1',
      'fac_deborshee_gogoi',
      'user_superadmin',
    ].filter(Boolean);
    const directIdMatch = Boolean(e.facultyId && myIds.includes(e.facultyId));

    // Check Name match
    const myNames = [
      currentUser.name,
      matchedFacultyProfile?.name,
      'Dr. Deborshee Gogoi',
      'Deborshee Gogoi',
    ].filter(Boolean);
    const nameMatch = Boolean(
      e.facultyName && myNames.some((n) => isFacultyNameMatch(e.facultyName, n!))
    );

    // If user is Deborshee Gogoi or email is thewildscapes@gmail.com or mobile is 9706375001, match Deborshee records
    const isDeborsheeUser = Boolean(
      currentUser.email?.toLowerCase().includes('thewildscapes') ||
      (currentUser.whatsappPhone || (currentUser as any).phone || '').includes('9706375001') ||
      (currentUser.name && currentUser.name.toLowerCase().includes('deborshee')) ||
      currentUser.facultyId === 'fac_1' ||
      currentUser.id === 'fac_1' ||
      currentUser.id === 'user_superadmin'
    );
    const isDeborsheeEntry = Boolean(
      (e.facultyName && e.facultyName.toLowerCase().includes('deborshee')) ||
      e.facultyId === 'fac_1' ||
      e.facultyId === 'fac_deborshee_gogoi' ||
      (e.facultyEmail && e.facultyEmail.toLowerCase().includes('thewildscapes'))
    );

    if (isDeborsheeUser && isDeborsheeEntry) return true;

    return directIdMatch || nameMatch;
  };

  const [diaryEntries, setDiaryEntries] = useState<ClassDiaryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_class_diary') || localStorage.getItem('lecturapulse_class_diary');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed
            .filter((e: any) => e && !isExcludedSubject(e.subjectName, e.subjectCode))
            .map((e: any) => ({
              ...e,
              batch: e.batch || e.classBatch || '',
              topicTaught: e.topicTaught || '',
              subjectCode: e.subjectCode || '',
              subjectName: e.subjectName || '',
              room: e.room || 'Room No. C1',
              department: e.department || 'Commerce',
              syllabusUnit: e.syllabusUnit || 'Unit 1',
              durationMins: e.durationMins || 60,
              remarks: e.remarks || '',
              attendance: e.attendance || [],
            }));
          if (valid.length > 0) return valid;
        }
      }
    } catch (e) {}
    return INITIAL_CLASS_DIARY;
  });
  const [syllabusTopics, setSyllabusTopics] = useState<SyllabusTopic[]>(DEFAULT_SYLLABUS_TOPICS);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('2026-08-01');
  const [endDate, setEndDate] = useState<string>('2026-10-31');
  const [timePreset, setTimePreset] = useState<string>('aug_oct_2026');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineDrafts, setOfflineDrafts] = useState<ClassDiaryEntry[]>([]);
  const [classStatusFilter, setClassStatusFilter] = useState<'all' | 'pending' | 'taken' | 'conducted' | 'cancelled'>('all');

  // Bulk Holiday / Cancel Day Modal state
  const [isBulkCancelOpen, setIsBulkCancelOpen] = useState<boolean>(false);
  const [bulkCancelDate, setBulkCancelDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bulkCancelCategory, setBulkCancelCategory] = useState<string>('🏛️ Institutional / Gazetted Holiday');
  const [bulkCancelReason, setBulkCancelReason] = useState<string>('Independence Day Celebration');

  // Dynamically extract unique subjects strictly from the master routine (timetable)
  const availableSubjects = useMemo(() => {
    const subjectsMap = new Map<string, { code: string; name: string; label: string; batch?: string; room?: string }>();
    (timetable || []).forEach((t) => {
      const code = t.subjectCode?.trim() || '';
      const name = t.subjectName?.trim() || '';
      if (!name && !code) return;
      if (isExcludedSubject(name, code)) return;

      const key = code || name;
      if (!subjectsMap.has(key)) {
        subjectsMap.set(key, {
          code: key,
          name: name || code,
          label: code && name && code !== name ? `${code}: ${name}` : (name || code),
          batch: t.batch || '',
          room: t.room || '',
        });
      }
    });
    return Array.from(subjectsMap.values());
  }, [timetable]);

  // Selected subject display label
  const selectedSubjectLabel = useMemo(() => {
    if (filterSubject === 'All') return 'All Subjects';
    const found = availableSubjects.find((s) => s.code === filterSubject || s.name === filterSubject);
    return found ? found.label : filterSubject;
  }, [filterSubject, availableSubjects]);

  // Reset filter if active subject is no longer in master routine
  useEffect(() => {
    if (filterSubject !== 'All' && !availableSubjects.some((s) => s.code === filterSubject || s.name === filterSubject)) {
      setFilterSubject('All');
    }
  }, [availableSubjects, filterSubject]);

  // Dynamic time frame display label
  const timeFrameLabel = useMemo(() => {
    if (!startDate && !endDate) return 'All Dates';
    if (startDate === '2026-08-01' && endDate === '2026-10-31') return 'Aug 2026 – Oct 2026';
    if (startDate === '2026-08-01' && endDate === '2026-08-31') return 'August 2026';
    if (startDate === '2026-07-01' && endDate === '2026-12-31') return 'Odd Sem 2026 (Jul–Dec)';
    if (startDate && endDate) {
      return `${startDate} to ${endDate}`;
    }
    if (startDate) return `From ${startDate}`;
    return `Up to ${endDate}`;
  }, [startDate, endDate]);

  // Handle Preset Timeframes
  const handleSelectTimePreset = (preset: string) => {
    setTimePreset(preset);
    if (preset === 'aug_oct_2026') {
      setStartDate('2026-08-01');
      setEndDate('2026-10-31');
    } else if (preset === 'aug_2026') {
      setStartDate('2026-08-01');
      setEndDate('2026-08-31');
    } else if (preset === 'odd_sem_2026') {
      setStartDate('2026-07-01');
      setEndDate('2026-12-31');
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Helper for Day of Week
  const getDayOfWeek = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'long' });
    } catch {
      return '';
    }
  };

  // Filtered Diary Entries based on faculty ownership, selected subject, date timeframe, and search term
  const filteredDiaryEntries = useMemo(() => {
    return diaryEntries.filter((e) => {
      // 0. Strict Data Isolation Check: Must be logged by current faculty (or Super Admin inspection mode)
      if (!isOwnDiaryEntry(e)) return false;

      // 1. Subject filter
      const matchSubject =
        filterSubject === 'All' ||
        e.subjectCode === filterSubject ||
        e.subjectName === filterSubject;

      // 2. Date timeframe filter
      let matchDate = true;
      if (startDate && e.date < startDate) matchDate = false;
      if (endDate && e.date > endDate) matchDate = false;

      // 3. Search query filter
      const matchSearch =
        !searchTerm.trim() ||
        e.topicTaught.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.subjectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.batch.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.room.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.remarks && e.remarks.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchSubject && matchDate && matchSearch;
    });
  }, [diaryEntries, filterSubject, startDate, endDate, searchTerm, adminScope, isSuperAdmin, currentUser, matchedFacultyProfile]);

  // Ownership verification for timetable routine slots
  const isOwnTimetableSlot = (t: TimetableEntry): boolean => {
    if (isSuperAdmin && adminScope === 'all_faculty') return true;

    const myIds = [
      currentUser.facultyId,
      currentUser.id,
      matchedFacultyProfile?.id,
      'fac_1',
      'fac_deborshee_gogoi',
      'user_superadmin',
    ].filter(Boolean);
    if (t.facultyId && myIds.includes(t.facultyId)) return true;

    const myNames = [
      currentUser.name,
      matchedFacultyProfile?.name,
      'Dr. Deborshee Gogoi',
      'Deborshee Gogoi',
    ].filter(Boolean);
    if (t.facultyName && myNames.some((n) => isFacultyNameMatch(t.facultyName, n!))) return true;

    const isDeborsheeUser = Boolean(
      currentUser.email?.toLowerCase().includes('thewildscapes') ||
      (currentUser.whatsappPhone || (currentUser as any).phone || '').includes('9706375001') ||
      (currentUser.name && currentUser.name.toLowerCase().includes('deborshee')) ||
      currentUser.facultyId === 'fac_1' ||
      currentUser.id === 'fac_1' ||
      currentUser.id === 'user_superadmin'
    );
    const isDeborsheeEntry = Boolean(
      (t.facultyName && t.facultyName.toLowerCase().includes('deborshee')) ||
      t.facultyId === 'fac_1' ||
      t.facultyId === 'fac_deborshee_gogoi'
    );
    if (isDeborsheeUser && isDeborsheeEntry) return true;

    return false;
  };

  // Scheduled classes that have not yet been logged in the Class Diary
  const filteredPendingClasses = useMemo(() => {
    const matchingSlots = (timetable || []).filter((t) => {
      if (!isOwnTimetableSlot(t)) return false;
      if (isExcludedSubject(t.subjectName, t.subjectCode)) return false;
      const matchSubject =
        filterSubject === 'All' ||
        t.subjectCode === filterSubject ||
        t.subjectName === filterSubject;
      return matchSubject;
    });

    if (matchingSlots.length === 0) return [];

    // Generate relevant dates based on startDate/endDate or default timeframe
    const datesToCheck: string[] = [];
    const startStr = startDate || '2026-08-01';
    const endStr = endDate || '2026-08-31';

    try {
      const start = new Date(startStr + 'T00:00:00');
      const end = new Date(endStr + 'T00:00:00');
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
        const cur = new Date(start);
        let count = 0;
        while (cur <= end && count < 60) {
          datesToCheck.push(cur.toISOString().split('T')[0]);
          cur.setDate(cur.getDate() + 1);
          count++;
        }
      }
    } catch (e) {}

    if (datesToCheck.length === 0) {
      datesToCheck.push('2026-08-14', '2026-08-15', '2026-08-17', '2026-08-18');
    }

    const pendingList: Array<{
      id: string;
      isPending: true;
      timetableEntryId: string;
      date: string;
      day: string;
      startTime: string;
      endTime: string;
      durationMins: number;
      subjectCode: string;
      subjectName: string;
      batch: string;
      room: string;
      facultyId: string;
      facultyName: string;
      department: string;
    }> = [];

    datesToCheck.forEach((dt) => {
      const dayName = getDayOfWeek(dt);
      const slotsOnDay = matchingSlots.filter((t) => t.day.toLowerCase() === dayName.toLowerCase());

      slotsOnDay.forEach((slot) => {
        // Check if a diary entry exists for this date, time, and subject
        const hasDiary = diaryEntries.some((e) => {
          if (!isOwnDiaryEntry(e)) return false;
          if (e.date !== dt) return false;
          const sameSubject =
            (e.subjectCode && slot.subjectCode && e.subjectCode.toLowerCase() === slot.subjectCode.toLowerCase()) ||
            (e.subjectName && slot.subjectName && e.subjectName.toLowerCase() === slot.subjectName.toLowerCase());
          const sameTime = e.startTime === slot.startTime || e.timetableEntryId === slot.id;
          return sameSubject && sameTime;
        });

        if (!hasDiary) {
          const searchTarget = `${slot.subjectCode} ${slot.subjectName} ${slot.batch} ${slot.room} ${slot.facultyName}`.toLowerCase();
          if (!searchTerm.trim() || searchTarget.includes(searchTerm.toLowerCase())) {
            pendingList.push({
              id: `pending_${slot.id}_${dt}`,
              isPending: true,
              timetableEntryId: slot.id,
              date: dt,
              day: dayName,
              startTime: slot.startTime,
              endTime: slot.endTime,
              durationMins: 60,
              subjectCode: slot.subjectCode,
              subjectName: slot.subjectName,
              batch: slot.batch || '',
              room: slot.room || 'Room No. C1',
              facultyId: slot.facultyId || currentUser.facultyId || 'fac_1',
              facultyName: slot.facultyName || currentUser.name || 'Faculty Member',
              department: slot.department || currentUser.department || 'Commerce',
            });
          }
        }
      });
    });

    return pendingList;
  }, [timetable, diaryEntries, filterSubject, startDate, endDate, searchTerm, currentUser, matchedFacultyProfile, adminScope, isSuperAdmin]);

  // Combined/Filtered display list based on class status ('all' | 'pending' | 'taken' / 'conducted' | 'cancelled')
  const displayClassList = useMemo(() => {
    const conductedEntries = filteredDiaryEntries.filter((e) => !e.isCancelled && e.status !== 'Cancelled');
    const cancelledEntries = filteredDiaryEntries.filter((e) => Boolean(e.isCancelled || e.status === 'Cancelled'));

    if (classStatusFilter === 'pending') {
      return [...filteredPendingClasses].sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));
    }
    if (classStatusFilter === 'taken' || classStatusFilter === 'conducted') {
      return conductedEntries.map((e) => ({ ...e, isPending: false as const }));
    }
    if (classStatusFilter === 'cancelled') {
      return cancelledEntries.map((e) => ({ ...e, isPending: false as const }));
    }
    // 'all': Show All Classes (conducted, cancelled, and pending)
    const combined: Array<(ClassDiaryEntry & { isPending?: false }) | (typeof filteredPendingClasses)[0]> = [
      ...filteredDiaryEntries.map((e) => ({ ...e, isPending: false as const })),
      ...filteredPendingClasses,
    ];
    return combined.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }, [classStatusFilter, filteredDiaryEntries, filteredPendingClasses]);

  // Diagnostic logging to inspect timetable prop length, entry IDs, and faculty filtering results
  useEffect(() => {
    console.group(`[ClassDiaryView Diagnostic] User: ${currentUser?.name || 'Anonymous'} (${currentUser?.id || 'no-id'})`);
    console.log('User Profile:', {
      id: currentUser?.id,
      facultyId: currentUser?.facultyId,
      name: currentUser?.name,
      email: currentUser?.email,
      role: currentUser?.role,
      whatsappPhone: currentUser?.whatsappPhone,
      isAcademicCoordinator: currentUser?.isAcademicCoordinator,
      matchedFacultyProfile: matchedFacultyProfile ? { id: matchedFacultyProfile.id, name: matchedFacultyProfile.name } : null,
    });
    console.log(`Timetable Prop Length: ${timetable?.length || 0}`);
    console.log('Timetable Individual Entry IDs & Subjects:', (timetable || []).map((t, index) => ({
      index,
      id: t.id,
      facultyId: t.facultyId,
      facultyName: t.facultyName,
      subjectCode: t.subjectCode,
      subjectName: t.subjectName,
      day: t.day,
      time: `${t.startTime}-${t.endTime}`,
      room: t.room,
      batch: t.batch,
    })));
    console.log(`Class Diary Total Entries Count: ${diaryEntries?.length || 0}`);
    console.log(`Class Diary Filtered Entries Count: ${filteredDiaryEntries?.length || 0}`);
    console.log('Class Diary Individual Entry Evaluation:', (diaryEntries || []).map((e) => ({
      id: e.id,
      facultyId: e.facultyId,
      facultyName: e.facultyName,
      subjectCode: e.subjectCode,
      date: e.date,
      time: `${e.startTime}-${e.endTime}`,
      isOwnDiaryEntry: isOwnDiaryEntry(e),
      batch: e.batch,
      isCancelled: e.isCancelled,
      status: e.status,
    })));
    console.groupEnd();
  }, [currentUser, timetable, diaryEntries, filteredDiaryEntries, matchedFacultyProfile]);

  // Helper function to safely merge incoming diary entries into state and localStorage with slot deduplication
  const mergeEntries = (existing: ClassDiaryEntry[], incoming: ClassDiaryEntry[]): ClassDiaryEntry[] => {
    const entryMap = new Map<string, ClassDiaryEntry>();
    const slotSignatureMap = new Map<string, string>(); // signature -> id

    const getSignature = (e: Partial<ClassDiaryEntry>) => {
      const fac = (e.facultyName || e.facultyId || '').trim().toLowerCase();
      const dt = (e.date || '').trim();
      const st = (e.startTime || '').trim();
      const sub = (e.subjectCode || e.subjectName || '').trim().toLowerCase();
      if (!dt || !st) return null;
      return `${fac}_${dt}_${st}_${sub}`;
    };

    const processItem = (e: ClassDiaryEntry) => {
      if (!e || !e.id || isExcludedSubject(e.subjectName, e.subjectCode)) return;
      const sig = getSignature(e);
      let targetId = e.id;
      if (sig && slotSignatureMap.has(sig)) {
        targetId = slotSignatureMap.get(sig)!;
      } else if (sig) {
        slotSignatureMap.set(sig, targetId);
      }

      const prev = entryMap.get(targetId);
      const isCancelledVal = e.isCancelled !== undefined ? Boolean(e.isCancelled) : (e.status === 'Cancelled' ? true : (prev?.isCancelled || false));
      const statusVal = e.status || (isCancelledVal ? 'Cancelled' : (prev?.status || 'Conducted'));

      entryMap.set(targetId, {
        ...prev,
        ...e,
        id: targetId,
        batch: e.batch || (e as any).classBatch || prev?.batch || '',
        topicTaught: e.topicTaught || prev?.topicTaught || '',
        subjectCode: e.subjectCode || prev?.subjectCode || '',
        subjectName: e.subjectName || prev?.subjectName || '',
        room: e.room || prev?.room || 'LH-01',
        department: e.department || prev?.department || 'Commerce',
        syllabusUnit: e.syllabusUnit || prev?.syllabusUnit || '',
        durationMins: e.durationMins || prev?.durationMins || 60,
        remarks: e.remarks || prev?.remarks || '',
        attendance: (e.attendance && e.attendance.length > 0) ? e.attendance : (prev?.attendance || []),
        status: statusVal,
        isCancelled: isCancelledVal,
        cancellationCategory: e.cancellationCategory || prev?.cancellationCategory || '',
        cancellationReason: e.cancellationReason || prev?.cancellationReason || '',
      });
    };

    existing.forEach(processItem);
    incoming.forEach(processItem);

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

  // Status & Cancellation Form State
  const [formStatus, setFormStatus] = useState<'Conducted' | 'Cancelled'>('Conducted');
  const [formCancellationCategory, setFormCancellationCategory] = useState<string>('🏛️ Institutional / Gazetted Holiday');
  const [formCancellationReason, setFormCancellationReason] = useState<string>('');

  // Manual Student Entry input state in modal
  const [manualRollNo, setManualRollNo] = useState<string>('');
  const [manualStudentName, setManualStudentName] = useState<string>('');

  // Form Fields - initialized dynamically from active timetable entries if available
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState<string>('09:00');
  const [formEndTime, setFormEndTime] = useState<string>('10:00');
  const [formSubjectCode, setFormSubjectCode] = useState<string>(availableSubjects[0]?.code || timetable[0]?.subjectCode || '');
  const [formSubjectName, setFormSubjectName] = useState<string>(availableSubjects[0]?.name || timetable[0]?.subjectName || '');
  const [formBatch, setFormBatch] = useState<string>(availableSubjects[0]?.batch || timetable[0]?.batch || '');
  const [formRoom, setFormRoom] = useState<string>(availableSubjects[0]?.room || timetable[0]?.room || '');
  const [formTopic, setFormTopic] = useState<string>('');
  const [formSyllabusUnit, setFormSyllabusUnit] = useState<string>('');
  const [formDuration, setFormDuration] = useState<number>(60);
  const [formRemarks, setFormRemarks] = useState<string>('');
  const [formAttendance, setFormAttendance] = useState<AttendanceRecord[]>([]);

  // Open modal automatically if selectedClassForDiary was clicked from Today's Class view
  useEffect(() => {
    if (selectedClassForDiary) {
      setEditingEntryId(null);
      setFormStatus('Conducted');
      setFormCancellationCategory('🏛️ Institutional / Gazetted Holiday');
      setFormCancellationReason('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormStartTime(selectedClassForDiary.startTime || '09:00');
      setFormEndTime(selectedClassForDiary.endTime || '10:00');
      setFormSubjectCode(selectedClassForDiary.subjectCode || '');
      setFormSubjectName(selectedClassForDiary.subjectName || '');
      setFormBatch(selectedClassForDiary.batch || '');
      setFormRoom(selectedClassForDiary.room || '');
      setFormTopic('');
      setFormSyllabusUnit('');
      setFormDuration(60);
      setFormRemarks('');
      setFormAttendance([]);
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
          const nonExcluded = entries.filter((e) => !isExcludedSubject(e.subjectName, e.subjectCode));
          setDiaryEntries((prev) => mergeEntries(prev, nonExcluded));
        }
      }
    );

    fetchDiaryEntries();
    loadOfflineDrafts();

    return () => unsubscribe();
  }, [currentUser.id, currentUser.facultyId, currentUser.role]);

  const fetchDiaryEntries = async () => {
    // 1. Fetch from Firestore (primary multi-device real-time store)
    try {
      const fsDiary = await getClassDiaryFromFirestore();
      if (Array.isArray(fsDiary) && fsDiary.length > 0) {
        const nonExcluded = fsDiary.filter((e) => !isExcludedSubject(e.subjectName, e.subjectCode));
        setDiaryEntries((prev) => mergeEntries(prev, nonExcluded));
      }
    } catch (fsErr) {
      console.warn('Class diary Firestore initial fetch error:', fsErr);
    }

    // 2. Fetch from Express SQLite backend
    try {
      const res = await fetch(`/api/class-diary?facultyId=${encodeURIComponent(currentUser.facultyId || currentUser.id || '')}`, {
        headers: {
          'x-user-faculty-id': currentUser.facultyId || currentUser.id || '',
          'x-user-role': isSuperAdmin ? 'admin' : 'faculty',
          'x-user-faculty-name': currentUser.name || '',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const nonExcluded = data.filter((e: any) => !isExcludedSubject(e.subjectName, e.subjectCode));
          setDiaryEntries((prev) => mergeEntries(prev, nonExcluded));
        }
      }
    } catch (e) {
      console.warn('Class diary backend API fetch error:', e);
    }

    // 3. Fallback to local cache
    loadLocalDiaryEntries();
  };

  const loadLocalDiaryEntries = () => {
    try {
      const saved = localStorage.getItem('classpilot_class_diary') || localStorage.getItem('lecturapulse_class_diary');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((e: any) => e && !isExcludedSubject(e.subjectName, e.subjectCode));
          if (valid.length > 0) {
            setDiaryEntries((prev) => mergeEntries(prev, valid));
            return;
          }
        }
      }
    } catch (err) {}
    setDiaryEntries((prev) => mergeEntries(prev, INITIAL_CLASS_DIARY));
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
    generateFacultyClassDiaryPDF({
      faculty: {
        name: currentUser.name || 'Dr. Deborshee Gogoi',
        department: currentUser.department || 'Commerce',
        email: currentUser.email,
      },
      entries: filteredDiaryEntries,
      sessionName: 'Academic Session 2026',
      selectedSubjectName: selectedSubjectLabel,
      selectedSubjectCode: filterSubject !== 'All' ? filterSubject : undefined,
      timeFrameLabel: timeFrameLabel,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const handleDownloadAdminConsolidatedPDFReport = () => {
    generateAdminConsolidatedPDF(filteredDiaryEntries, faculties, 'Academic Session 2026');
  };

  const handlePrintClassDiary = () => {
    window.print();
  };

  const handleEmailSummaryReport = () => {
    const totalClasses = filteredDiaryEntries.length;
    const summaryText = `ClassPilot Logbook Summary for ${currentUser.name || 'Dr. Deborshee Gogoi'} (${currentUser.department || 'Commerce'}):\nSubject: ${selectedSubjectLabel}\nTime Period: ${timeFrameLabel}\nTotal Classes Taken: ${totalClasses}.\nLogged entries compliant with 24-hour verification and NAAC SSR standards.`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Class Diary Summary - ${currentUser.name || 'Dr. Deborshee Gogoi'} - ${selectedSubjectLabel}`)}&body=${encodeURIComponent(summaryText)}`;
    window.open(mailtoUrl, '_blank');
  };

  // Open Create/Edit Modal
  const handleOpenModal = (entry?: ClassDiaryEntry, defaultStatus: 'Conducted' | 'Cancelled' = 'Conducted') => {
    if (entry) {
      if (checkIsLocked(entry)) {
        alert('This class diary entry is permanently locked because more than 24 hours have elapsed since the class start time.');
        return;
      }
      setEditingEntryId(entry.id);
      const isCanc = Boolean(entry.isCancelled || entry.status === 'Cancelled');
      setFormStatus(isCanc ? 'Cancelled' : 'Conducted');
      setFormCancellationCategory(entry.cancellationCategory || '🏛️ Institutional / Gazetted Holiday');
      setFormCancellationReason(entry.cancellationReason || '');
      setFormDate(entry.date);
      setFormStartTime(entry.startTime);
      setFormEndTime(entry.endTime);
      setFormSubjectCode(entry.subjectCode);
      setFormSubjectName(entry.subjectName);
      setFormBatch(entry.batch);
      setFormRoom(entry.room);
      setFormTopic(entry.topicTaught || '');
      setFormSyllabusUnit(entry.syllabusUnit || '');
      setFormDuration(entry.durationMins || 60);
      setFormRemarks(entry.remarks || '');
      setFormAttendance(entry.attendance || []);
    } else {
      const defaultSubj = availableSubjects[0];
      setEditingEntryId(null);
      setFormStatus(defaultStatus);
      setFormCancellationCategory('🏛️ Institutional / Gazetted Holiday');
      setFormCancellationReason('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormStartTime('09:00');
      setFormEndTime('10:00');
      setFormSubjectCode(defaultSubj?.code || timetable[0]?.subjectCode || '');
      setFormSubjectName(defaultSubj?.name || timetable[0]?.subjectName || '');
      setFormBatch(defaultSubj?.batch || timetable[0]?.batch || '');
      setFormRoom(defaultSubj?.room || timetable[0]?.room || '');
      setFormTopic('');
      setFormSyllabusUnit('');
      setFormDuration(60);
      setFormRemarks('');
      setFormAttendance([]);
    }
    setIsModalOpen(true);
  };

  // Open modal directly prefilled for a pending timetable class
  const handleOpenModalForPending = (
    pending: {
      date: string;
      startTime: string;
      endTime: string;
      subjectCode: string;
      subjectName: string;
      batch: string;
      room: string;
      durationMins?: number;
    },
    targetStatus: 'Conducted' | 'Cancelled' = 'Conducted'
  ) => {
    setEditingEntryId(null);
    setFormStatus(targetStatus);
    setFormCancellationCategory('🏛️ Institutional / Gazetted Holiday');
    setFormCancellationReason('');
    setFormDate(pending.date);
    setFormStartTime(pending.startTime);
    setFormEndTime(pending.endTime);
    setFormSubjectCode(pending.subjectCode);
    setFormSubjectName(pending.subjectName);
    setFormBatch(pending.batch);
    setFormRoom(pending.room);
    setFormTopic('');
    setFormSyllabusUnit('');
    setFormDuration(pending.durationMins || 60);
    setFormRemarks('');
    setFormAttendance([]);
    setIsModalOpen(true);
  };

  // Save Entry (Online or Offline Draft)
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const isCanc = formStatus === 'Cancelled';

    if (isCanc) {
      if (!formCancellationCategory && !formCancellationReason.trim()) {
        alert('Please specify the category or reason for the cancelled class.');
        return;
      }
    } else {
      if (!formTopic.trim()) {
        alert('Please describe the topic taught in class.');
        return;
      }
    }

    const startTimestamp = new Date(`${formDate}T${formStartTime}`).getTime();

    const topicFinal = isCanc
      ? formTopic.trim() || `[Cancelled - ${formCancellationCategory}]${formCancellationReason.trim() ? ': ' + formCancellationReason.trim() : ''}`
      : formTopic.trim();

    const facultyIdVal = currentUser.facultyId || (currentUser.email?.toLowerCase().includes('thewildscapes') ? 'fac_1' : (currentUser.id || 'fac_1'));
    const facultyNameVal = currentUser.name || (currentUser.email?.toLowerCase().includes('thewildscapes') ? 'Dr. Deborshee Gogoi' : 'Faculty Member');

    const newEntry: ClassDiaryEntry = {
      id: editingEntryId || `diary_${Date.now()}`,
      facultyId: facultyIdVal,
      facultyName: facultyNameVal,
      facultyEmail: currentUser.email || '',
      facultyPhone: currentUser.whatsappPhone || (currentUser as any).phone || '',
      department: currentUser.department || 'Commerce',
      date: formDate,
      startTime: formStartTime,
      endTime: formEndTime,
      classStartTimestamp: startTimestamp,
      subjectCode: formSubjectCode,
      subjectName: formSubjectName,
      batch: formBatch,
      room: formRoom,
      topicTaught: topicFinal,
      syllabusUnit: isCanc ? '' : formSyllabusUnit,
      durationMins: formDuration,
      remarks: formRemarks.trim(),
      attendance: isCanc ? [] : formAttendance,
      status: isCanc ? 'Cancelled' : 'Conducted',
      isCancelled: isCanc,
      cancellationCategory: isCanc ? formCancellationCategory : undefined,
      cancellationReason: isCanc ? formCancellationReason.trim() : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: isOnline,
    };

    if (!isOnline) {
      // Save to offline drafts
      const updatedDrafts = [...offlineDrafts.filter((d) => d.id !== newEntry.id), newEntry];
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

  // Bulk Mark Classes on a specific Date as Cancelled / Holiday
  const handleBulkCancelDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkCancelDate) {
      alert('Please select a date to mark as Holiday / Cancelled.');
      return;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dateObj = new Date(bulkCancelDate + 'T00:00:00');
    if (isNaN(dateObj.getTime())) {
      alert('Invalid date selected.');
      return;
    }
    const dayOfWeek = dayNames[dateObj.getDay()];

    // Find own timetable routine slots for that day
    const matchingSlots = (timetable || []).filter((t) => {
      if (t.day !== dayOfWeek) return false;
      const isMine =
        (t.facultyId && currentUser.facultyId && t.facultyId === currentUser.facultyId) ||
        isFacultyNameMatch(t.facultyName, currentUser.name);
      return isMine;
    });

    if (matchingSlots.length === 0) {
      // Still allow creating a generic non-teaching holiday record for the day
      const generalEntry: ClassDiaryEntry = {
        id: `diary_bulk_${Date.now()}`,
        facultyId: currentUser.facultyId || (currentUser.email?.toLowerCase().includes('thewildscapes') ? 'fac_1' : (currentUser.id || 'fac_1')),
        facultyName: currentUser.name || (currentUser.email?.toLowerCase().includes('thewildscapes') ? 'Dr. Deborshee Gogoi' : 'Faculty Member'),
        facultyEmail: currentUser.email || '',
        facultyPhone: currentUser.whatsappPhone || (currentUser as any).phone || '',
        department: currentUser.department || 'Commerce',
        date: bulkCancelDate,
        startTime: '09:00',
        endTime: '16:00',
        classStartTimestamp: new Date(`${bulkCancelDate}T09:00`).getTime(),
        subjectCode: 'HOLIDAY',
        subjectName: bulkCancelCategory,
        batch: 'All Batches',
        room: 'College Campus',
        topicTaught: `[${bulkCancelCategory.toUpperCase()}] ${bulkCancelReason.trim() || 'Institutional Holiday / Classes Cancelled'}`,
        syllabusUnit: '',
        durationMins: 360,
        remarks: bulkCancelReason.trim(),
        attendance: [],
        status: 'Cancelled',
        isCancelled: true,
        cancellationCategory: bulkCancelCategory,
        cancellationReason: bulkCancelReason.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSynced: isOnline,
      };

      await saveClassDiaryToFirestore(generalEntry);
      try {
        await fetch('/api/class-diary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(generalEntry),
        });
      } catch (err) {}

      setDiaryEntries((prev) => mergeEntries(prev, [generalEntry]));
      setIsBulkCancelOpen(false);
      alert(`Marked ${bulkCancelDate} as ${bulkCancelCategory}. 1 entry recorded.`);
      return;
    }

    const createdEntries: ClassDiaryEntry[] = [];
    for (const slot of matchingSlots) {
      const startMs = new Date(`${bulkCancelDate}T${slot.startTime}`).getTime();
      const newEntry: ClassDiaryEntry = {
        id: `diary_bulk_${slot.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        facultyId: slot.facultyId || currentUser.facultyId || (currentUser.email?.toLowerCase().includes('thewildscapes') ? 'fac_1' : (currentUser.id || 'fac_1')),
        facultyName: slot.facultyName || currentUser.name || (currentUser.email?.toLowerCase().includes('thewildscapes') ? 'Dr. Deborshee Gogoi' : 'Faculty Member'),
        facultyEmail: currentUser.email || '',
        facultyPhone: currentUser.whatsappPhone || (currentUser as any).phone || '',
        department: slot.department || currentUser.department || 'Commerce',
        date: bulkCancelDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        classStartTimestamp: startMs,
        subjectCode: slot.subjectCode,
        subjectName: slot.subjectName,
        batch: slot.batch || '',
        room: slot.room || '',
        topicTaught: `[CANCELLED - ${bulkCancelCategory}] ${bulkCancelReason.trim() || 'Class not conducted on account of ' + bulkCancelCategory}`,
        syllabusUnit: '',
        durationMins: 60,
        remarks: bulkCancelReason.trim(),
        attendance: [],
        status: 'Cancelled',
        isCancelled: true,
        cancellationCategory: bulkCancelCategory,
        cancellationReason: bulkCancelReason.trim(),
        timetableEntryId: slot.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSynced: isOnline,
      };

      createdEntries.push(newEntry);
      await saveClassDiaryToFirestore(newEntry);
      try {
        await fetch('/api/class-diary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newEntry),
        });
      } catch (err) {}
    }

    setDiaryEntries((prev) => mergeEntries(prev, createdEntries));
    setIsBulkCancelOpen(false);
    alert(`Successfully marked all ${createdEntries.length} classes on ${bulkCancelDate} as Cancelled (${bulkCancelCategory}).`);
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

  // Export CSV (Filtered / Faculty-Scoped Records Only)
  const handleExportCSV = () => {
    const headers = 'ID,Date,Start Time,End Time,Subject Code,Subject Name,Batch,Room,Topic Taught,Syllabus Unit,Duration Mins,Faculty,Remarks\n';
    const rows = filteredDiaryEntries
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

  // Aggregated Summary Statistics for the Selected Subject & Timeframe
  const filteredStats = useMemo(() => {
    let conductedClasses = 0;
    let cancelledClasses = 0;
    let totalMinutes = 0;
    let totalRosterAttended = 0;
    let totalRosterCount = 0;
    const unitsCovered = new Set<string>();
    const batchesSet = new Set<string>();
    const cancelCategoryCounts: Record<string, number> = {};

    filteredDiaryEntries.forEach((e) => {
      const isCanc = Boolean(e.isCancelled || e.status === 'Cancelled');
      if (isCanc) {
        cancelledClasses += 1;
        const cat = e.cancellationCategory || 'Institutional Holiday / Other';
        cancelCategoryCounts[cat] = (cancelCategoryCounts[cat] || 0) + 1;
      } else {
        conductedClasses += 1;
        totalMinutes += e.durationMins || 60;
        if (e.syllabusUnit && e.syllabusUnit.trim()) {
          unitsCovered.add(e.syllabusUnit.trim());
        }
        if (e.batch && e.batch.trim()) {
          batchesSet.add(e.batch.trim());
        }
        if (e.attendance && e.attendance.length > 0) {
          e.attendance.forEach((a) => {
            totalRosterCount += 1;
            if (a.status === 'Present' || a.status === 'Late') {
              totalRosterAttended += 1;
            }
          });
        }
      }
    });

    const totalClasses = conductedClasses + cancelledClasses;
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    const avgAttendancePercent = totalRosterCount > 0 ? Math.round((totalRosterAttended / totalRosterCount) * 100) : 100;

    return {
      totalClasses,
      conductedClasses,
      cancelledClasses,
      cancelCategoryCounts,
      totalHours,
      totalMinutes,
      avgAttendancePercent,
      unitsCoveredCount: unitsCovered.size,
      batchesCount: batchesSet.size,
      totalRosterCount,
      totalRosterAttended,
    };
  }, [filteredDiaryEntries]);

  // Workload Progress: Classes Taken vs Total Scheduled for Selected Subject & Timeframe
  const workloadProgress = useMemo(() => {
    const conductedCount = filteredDiaryEntries.filter((e) => !e.isCancelled && e.status !== 'Cancelled').length;
    const cancelledCount = filteredDiaryEntries.filter((e) => Boolean(e.isCancelled || e.status === 'Cancelled')).length;
    const classesTaken = conductedCount;

    // Filter matching routine timetable slots for the subject
    const matchingTimetableSlots = timetable.filter((t) => {
      const matchSubject =
        filterSubject === 'All' ||
        t.subjectCode === filterSubject ||
        t.subjectName === filterSubject;
      return matchSubject;
    });

    let scheduledCount = 0;

    if (startDate && endDate) {
      try {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');

        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

          if (matchingTimetableSlots.length > 0) {
            // Count exact occurrences of scheduled timetable days in the calendar range
            const current = new Date(start);
            while (current <= end) {
              const dayOfWeek = dayNames[current.getDay()];
              const matchingSlotsOnDay = matchingTimetableSlots.filter((t) => t.day === dayOfWeek);
              scheduledCount += matchingSlotsOnDay.length;
              current.setDate(current.getDate() + 1);
            }
          } else {
            // Standard academic term estimation: 1 weekly lecture per subject per active week
            const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const weeks = Math.max(1, Math.round(diffDays / 7));
            const multiplier = filterSubject === 'All' ? Math.max(1, Math.min(4, availableSubjects.length || 1)) : 1;
            scheduledCount = weeks * multiplier;
          }
        }
      } catch (err) {}
    } else {
      // If "All Dates", assume standard 14-week academic semester cycle
      const multiplier = filterSubject === 'All' ? Math.max(1, Math.min(4, availableSubjects.length || 1)) : 1;
      scheduledCount = (matchingTimetableSlots.length > 0 ? matchingTimetableSlots.length : multiplier) * 14;
    }

    // Scheduled is at least equal to classes taken + cancelled
    const finalScheduled = Math.max(scheduledCount, conductedCount + cancelledCount, 1);
    const percentage = Math.min(100, Math.round((conductedCount / finalScheduled) * 100));
    const remaining = Math.max(0, finalScheduled - (conductedCount + cancelledCount));

    // Monthly breakdown of classes taken vs expected in the selected range
    const monthlyMap: Record<string, { monthLabel: string; taken: number; cancelled: number; scheduled: number; hours: number }> = {};

    filteredDiaryEntries.forEach((e) => {
      if (e.date) {
        const ym = e.date.substring(0, 7); // e.g. "2026-08"
        const [year, month] = ym.split('-');
        const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
        const monthLabel = !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : ym;

        if (!monthlyMap[ym]) {
          monthlyMap[ym] = { monthLabel, taken: 0, cancelled: 0, scheduled: 4, hours: 0 };
        }
        if (e.isCancelled || e.status === 'Cancelled') {
          monthlyMap[ym].cancelled += 1;
        } else {
          monthlyMap[ym].taken += 1;
          monthlyMap[ym].hours += (e.durationMins || 60) / 60;
        }
      }
    });

    // Populate calendar months within chosen timeframe even if 0 classes taken yet
    if (startDate && endDate) {
      try {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        const cur = new Date(start);
        while (cur <= end) {
          const ym = cur.toISOString().substring(0, 7);
          if (!monthlyMap[ym]) {
            const monthLabel = cur.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            monthlyMap[ym] = { monthLabel, taken: 0, cancelled: 0, scheduled: 4, hours: 0 };
          }
          cur.setMonth(cur.getMonth() + 1);
        }
      } catch (err) {}
    }

    const monthlyBreakdown = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, data]) => {
        const estScheduled = Math.max(data.taken + data.cancelled, data.scheduled || 4);
        const pct = Math.min(100, Math.round((data.taken / estScheduled) * 100));
        return {
          ym,
          monthLabel: data.monthLabel,
          taken: data.taken,
          cancelled: data.cancelled,
          scheduled: estScheduled,
          pct,
          hours: Math.round(data.hours * 10) / 10,
        };
      });

    return {
      classesTaken: conductedCount,
      conductedCount,
      cancelledCount,
      scheduledCount: finalScheduled,
      percentage,
      remaining,
      monthlyBreakdown,
    };
  }, [filteredDiaryEntries, timetable, filterSubject, startDate, endDate, availableSubjects]);

  // Student Attendance Statistics specifically aggregated for the chosen subject and timeframe
  const studentStats = useMemo(() => {
    const statsMap: Record<string, { rollNo: string; name: string; totalClasses: number; presentCount: number; lateCount: number; absentCount: number }> = {};

    filteredDiaryEntries.forEach((entry) => {
      if (entry.attendance && entry.attendance.length > 0) {
        entry.attendance.forEach((rec) => {
          if (!statsMap[rec.studentId]) {
            statsMap[rec.studentId] = {
              rollNo: rec.rollNo,
              name: rec.name,
              totalClasses: 0,
              presentCount: 0,
              lateCount: 0,
              absentCount: 0,
            };
          }
          statsMap[rec.studentId].totalClasses += 1;
          if (rec.status === 'Present') {
            statsMap[rec.studentId].presentCount += 1;
          } else if (rec.status === 'Late') {
            statsMap[rec.studentId].lateCount += 1;
            statsMap[rec.studentId].presentCount += 1;
          } else if (rec.status === 'Absent') {
            statsMap[rec.studentId].absentCount += 1;
          }
        });
      }
    });

    return Object.values(statsMap).map((s) => ({
      ...s,
      percentage: s.totalClasses > 0 ? Math.round((s.presentCount / s.totalClasses) * 100) : 100,
    }));
  }, [filteredDiaryEntries]);

  return (
    <div className="space-y-6">
      {/* 4 Focused Overview Metrics: Faculty Name, Total Classes Taken, Subject, Time Period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        {/* Card 1: Faculty Name */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Faculty Member
              </span>
              <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                Verified
              </span>
            </div>
            <h3 className="text-base font-extrabold text-white truncate mt-0.5">
              {currentUser.name || 'Dr. Deborshee Gogoi'}
            </h3>
            <div className="text-xs text-emerald-400 font-semibold flex items-center space-x-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Dept. of {currentUser.department || 'Commerce'}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Classes Taken vs Scheduled */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Classes Taken / Scheduled
                </span>
                <span className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  {workloadProgress.percentage}%
                </span>
              </div>
              <div className="flex items-baseline space-x-1.5 mt-0.5">
                <h3 className="text-2xl font-extrabold text-blue-300">
                  {workloadProgress.classesTaken}
                </h3>
                <span className="text-sm font-bold text-slate-500">/</span>
                <span className="text-base font-bold text-slate-300">
                  {workloadProgress.scheduledCount}
                </span>
                <span className="text-xs text-slate-400 ml-1">
                  Scheduled
                </span>
              </div>
            </div>
          </div>

          {/* Mini progress bar inside Card 2 */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/80">
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(4, workloadProgress.percentage)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
              <span>{filteredStats.totalHours} Teaching Hrs</span>
              <span>{workloadProgress.remaining === 0 ? 'Target Met' : `${workloadProgress.remaining} remaining`}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Subject Name */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Subject Filter
              </span>
              <span className="text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                {filterSubject === 'All' ? 'All' : filterSubject}
              </span>
            </div>
            <h3 className="text-sm font-extrabold text-white truncate mt-0.5" title={selectedSubjectLabel}>
              {selectedSubjectLabel}
            </h3>
            <span className="text-[11px] text-indigo-300 truncate block mt-0.5">
              {filteredStats.unitsCoveredCount > 0
                ? `${filteredStats.unitsCoveredCount} syllabus units taught`
                : 'Active curriculum course'}
            </span>
          </div>
        </div>

        {/* Card 4: Time Period */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Time Period
              </span>
              <span className="text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
                {timePreset === 'aug_oct_2026' ? 'Aug–Oct' : timePreset === 'aug_2026' ? 'Aug' : 'Active'}
              </span>
            </div>
            <h3 className="text-sm font-extrabold text-amber-300 truncate mt-0.5" title={timeFrameLabel}>
              {timeFrameLabel}
            </h3>
            <span className="text-[11px] text-slate-400 truncate block mt-0.5">
              {startDate && endDate ? `${startDate} to ${endDate}` : 'Academic Schedule 2026'}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Workload Efficiency & Schedule Progress Data-Viz Dashboard (Recharts) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden print:hidden">
        {/* Background glow accent */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-heading font-extrabold text-lg text-white">
                  Workload Efficiency
                </h3>
                <span className="text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
                  {selectedSubjectLabel}
                </span>
                <span className="text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded-full hidden sm:inline-block">
                  Recharts Data-Viz
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Visual breakdown of <span className="text-blue-300 font-semibold">Classes Taken</span> vs <span className="text-slate-300 font-semibold">Total Scheduled</span> for <span className="text-slate-200 font-semibold">{timeFrameLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Delivery Efficiency
              </span>
              <span className="text-xl font-mono font-extrabold text-emerald-400">
                {workloadProgress.percentage}%
              </span>
            </div>
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center space-x-1.5 ${
                workloadProgress.percentage >= 100
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : workloadProgress.percentage >= 50
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>
                {workloadProgress.percentage >= 100
                  ? 'Target Completed'
                  : workloadProgress.percentage >= 50
                  ? 'Pacing On Track'
                  : 'In Progress'}
              </span>
            </span>
          </div>
        </div>

        {/* Visual Charts & Workload Metric Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 relative z-10">
          {/* LEFT: Recharts Donut & Pacing Ratio Visualizer */}
          <div className="lg:col-span-5 bg-slate-800/50 border border-slate-700/60 rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span>Workload Distribution</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-lg border border-slate-700/50">
                {workloadProgress.classesTaken} / {workloadProgress.scheduledCount} Taken
              </span>
            </div>

            {/* Donut Chart with Centered Metric */}
            <div className="relative h-56 w-full flex items-center justify-center my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        return (
                          <div className="bg-slate-950/95 border border-slate-700/90 rounded-xl px-3.5 py-2 shadow-2xl text-xs backdrop-blur-md">
                            <p className="font-bold text-white flex items-center space-x-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: (data.payload as any).fill || data.color }}
                              />
                              <span>{data.name}</span>
                            </p>
                            <p className="text-slate-300 font-mono mt-1 text-sm">
                              <span className="font-extrabold text-white">{data.value}</span> Classes
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Pie
                    data={[
                      {
                        name: 'Classes Taken (Conducted)',
                        value: workloadProgress.classesTaken,
                        fill: workloadProgress.percentage >= 100 ? '#10b981' : '#3b82f6',
                      },
                      {
                        name: 'Remaining Scheduled Workload',
                        value: Math.max(0, workloadProgress.remaining),
                        fill: '#334155',
                      },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#0f172a"
                    strokeWidth={3}
                  >
                    <Cell fill={workloadProgress.percentage >= 100 ? '#10b981' : '#3b82f6'} />
                    <Cell fill="#334155" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center Donut Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-2xl font-mono font-extrabold text-white leading-none">
                  {workloadProgress.percentage}%
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                  Fulfilled
                </span>
              </div>
            </div>

            {/* Donut Chart Legend Keys */}
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-700/60">
              <div className="flex items-center space-x-2 bg-slate-900/60 p-2 rounded-xl border border-slate-700/40">
                <span className={`w-3 h-3 rounded-full shrink-0 ${workloadProgress.percentage >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 block truncate">Classes Taken</span>
                  <span className="text-xs font-mono font-extrabold text-white">{workloadProgress.classesTaken} classes</span>
                </div>
              </div>
              <div className="flex items-center space-x-2 bg-slate-900/60 p-2 rounded-xl border border-slate-700/40">
                <span className="w-3 h-3 rounded-full bg-slate-600 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 block truncate">Remaining</span>
                  <span className="text-xs font-mono font-extrabold text-slate-300">{workloadProgress.remaining} classes</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Progress Metrics & Workload Pacing Details */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            {/* Linear Progress Card */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Curriculum Delivery Benchmark
                  </span>
                  <p className="text-[11px] text-slate-400">
                    {workloadProgress.classesTaken} of {workloadProgress.scheduledCount} lectures conducted ({filteredStats.totalHours} hrs)
                  </p>
                </div>
                <span className="text-xs font-mono font-extrabold text-blue-300 bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 rounded-xl">
                  {workloadProgress.percentage}% Target
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-900 rounded-2xl h-4 p-0.5 overflow-hidden border border-slate-700/70 relative">
                <div
                  className={`h-full rounded-xl transition-all duration-700 relative ${
                    workloadProgress.percentage >= 100
                      ? 'bg-gradient-to-r from-blue-500 via-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-500'
                  }`}
                  style={{ width: `${Math.max(4, workloadProgress.percentage)}%` }}
                >
                  <div className="absolute inset-0 bg-white/10 opacity-30 animate-pulse" />
                </div>
              </div>

              {/* Benchmark Milestones */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 font-mono">
                <span>0% Start</span>
                <span>25% Quarter</span>
                <span>50% Mid-Term</span>
                <span>75% Advanced</span>
                <span className="text-emerald-400 font-bold">100% Target</span>
              </div>
            </div>

            {/* 5 Micro Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Conducted
                </span>
                <span className="text-xl font-extrabold text-white mt-1 block">
                  {filteredStats.conductedClasses}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">Taught & Logged</span>
              </div>

              <div className="bg-slate-800/60 border border-rose-500/30 rounded-xl p-3 bg-rose-500/5">
                <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">
                  Cancelled / Off
                </span>
                <span className="text-xl font-extrabold text-rose-300 mt-1 block">
                  {filteredStats.cancelledClasses}
                </span>
                <span className="text-[10px] text-rose-400 font-semibold">Holidays / Leave</span>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Scheduled
                </span>
                <span className="text-xl font-extrabold text-blue-300 mt-1 block">
                  {workloadProgress.scheduledCount}
                </span>
                <span className="text-[10px] text-blue-400 font-semibold">Routine Target</span>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Remaining
                </span>
                <span className="text-xl font-extrabold text-amber-300 mt-1 block">
                  {workloadProgress.remaining}
                </span>
                <span className="text-[10px] text-amber-400 font-semibold">Classes Left</span>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Teaching Time
                </span>
                <span className="text-xl font-extrabold text-indigo-300 mt-1 block">
                  {filteredStats.totalHours} <span className="text-xs font-normal">hrs</span>
                </span>
                <span className="text-[10px] text-indigo-400 font-semibold">{filteredStats.avgAttendancePercent}% Avg Att.</span>
              </div>
            </div>

            {/* Smart Delivery Pace Callout */}
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-300">
                  {workloadProgress.percentage >= 100
                    ? 'All scheduled lectures for this timeframe have been delivered and verified.'
                    : workloadProgress.percentage >= 50
                    ? 'Workload delivery is active and pacing well with the academic semester schedule.'
                    : 'Curriculum delivery is in active progress for the chosen date window.'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                {timeFrameLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Monthly Breakdown Micro-Progress Visualizers */}
        {workloadProgress.monthlyBreakdown.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-800 relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Monthly Delivery Distribution ({timeFrameLabel})</span>
              </span>
              <span className="text-[10px] text-slate-400">
                Individual month progress tracking
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {workloadProgress.monthlyBreakdown.map((m) => (
                <div
                  key={m.ym}
                  className="bg-slate-800/40 border border-slate-800 rounded-2xl p-3 space-y-2 hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-white">{m.monthLabel}</span>
                    <span className="font-mono font-bold text-blue-300 text-[11px]">
                      {m.taken} / {m.scheduled} Classes ({m.pct}%)
                    </span>
                  </div>

                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/50">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        m.pct >= 100
                          ? 'bg-emerald-400'
                          : m.pct >= 50
                          ? 'bg-blue-400'
                          : m.taken > 0
                          ? 'bg-amber-400'
                          : 'bg-slate-700'
                      }`}
                      style={{ width: `${Math.max(m.taken > 0 ? 8 : 0, m.pct)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{m.hours} hrs logged</span>
                    <span>{m.taken >= m.scheduled ? 'Completed' : `${m.scheduled - m.taken} left`}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Banner & Action Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden print:hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs text-blue-400 font-bold uppercase tracking-wider mb-1">
              <BookOpen className="w-4 h-4" />
              <span>Academic Class Diary & Record Log</span>
            </div>
            <div className="flex items-center space-x-3">
              <h2 className="font-heading font-extrabold text-2xl text-white">
                Class Record Logbook
              </h2>
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Device-Bound Privacy Active</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Log topics taught, duration, student attendance, and syllabus progress.
              <span className="text-amber-400 font-semibold ml-1">
                🔒 24-Hour Lock Rule: Entries become permanently read-only after 24 hours.
              </span>
            </p>

            {/* Faculty Isolation Notice */}
            <div className="mt-2.5 inline-flex items-center space-x-2 px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300">
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span>
                Personal Workspace: Authenticated as <strong className="text-white">{currentUser.name || 'Faculty Member'}</strong>. Records belonging to other colleagues are completely hidden and isolated on this device.
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Super Admin / Principal Institutional View Toggle */}
            {isSuperAdmin && (
              <div className="flex items-center bg-slate-800/90 border border-indigo-500/40 rounded-xl p-0.5">
                <button
                  onClick={() => setAdminScope('my_only')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    adminScope === 'my_only'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  My Classes
                </button>
                <button
                  onClick={() => setAdminScope('all_faculty')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    adminScope === 'all_faculty'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-indigo-300 hover:text-white'
                  }`}
                >
                  All Faculty (Audit)
                </button>
              </div>
            )}

            <button
              onClick={() => {
                fetchDiaryEntries();
              }}
              className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm"
              title="Sync latest entries across tablet, mobile, and laptop"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
              <span>Sync Cloud</span>
            </button>

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
              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-md"
              title="Download Filtered Class Diary PDF Report"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Download PDF Copy</span>
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
              onClick={() => setIsBulkCancelOpen(true)}
              className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm"
              title="Mark Entire Day or Selected Date as Holiday / Classes Cancelled"
            >
              <CalendarOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Mark Holiday / Cancel Day</span>
            </button>

            <button
              onClick={() => handleOpenModal(undefined, 'Cancelled')}
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Record a single Cancelled Class entry"
            >
              <Ban className="w-3.5 h-3.5 text-amber-400" />
              <span>Mark Cancelled Class</span>
            </button>

            <button
              onClick={() => handleOpenModal(undefined, 'Conducted')}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Conducted Class</span>
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
            <span>Class Log Entries ({displayClassList.length})</span>
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
          {/* Enhanced Subject & Timeframe Filter Controls */}
          <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 space-y-4 print:hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Subject Selection & Status Filter */}
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="flex items-center space-x-2 flex-1 min-w-[200px] max-w-xs">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                    Subject:
                  </span>
                  <select
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="All">All Subjects ({diaryEntries.length} Classes Logged)</option>
                    {availableSubjects.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Class Status Filter Dropdown */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                    Status:
                  </span>
                  <select
                    id="class-status-filter"
                    value={classStatusFilter}
                    onChange={(e) => setClassStatusFilter(e.target.value as 'all' | 'pending' | 'taken' | 'conducted' | 'cancelled')}
                    className="bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                    aria-label="Filter classes by status"
                  >
                    <option value="all">Show All Classes ({filteredDiaryEntries.length + filteredPendingClasses.length})</option>
                    <option value="conducted">Classes Conducted ({filteredStats.conductedClasses})</option>
                    <option value="cancelled">Classes Cancelled / Holidays ({filteredStats.cancelledClasses})</option>
                    <option value="pending">Pending Classes ({filteredPendingClasses.length})</option>
                  </select>
                </div>
              </div>

              {/* Timeframe Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-400 mr-1.5">Time Frame:</span>
                <button
                  onClick={() => handleSelectTimePreset('aug_oct_2026')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    timePreset === 'aug_oct_2026'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  Aug 2026 – Oct 2026
                </button>
                <button
                  onClick={() => handleSelectTimePreset('aug_2026')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    timePreset === 'aug_2026'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  August 2026
                </button>
                <button
                  onClick={() => handleSelectTimePreset('odd_sem_2026')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    timePreset === 'odd_sem_2026'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  Odd Sem (Jul–Dec 2026)
                </button>
                <button
                  onClick={() => handleSelectTimePreset('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    timePreset === 'all'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  All Dates
                </button>
              </div>
            </div>

            {/* Custom Date Range & Search Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <div className="flex items-center space-x-2">
                  <span>From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setTimePreset('custom');
                    }}
                    className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <span>To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setTimePreset('custom');
                    }}
                    className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                  />
                </div>
                {(startDate || endDate || filterSubject !== 'All' || searchTerm || classStatusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setFilterSubject('All');
                      setClassStatusFilter('all');
                      handleSelectTimePreset('aug_oct_2026');
                      setSearchTerm('');
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Live Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search topic, room, syllabus unit, batch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Cards List */}
          <div className="grid grid-cols-1 gap-4 print:hidden">
            {displayClassList.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
                <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h4 className="text-base font-bold text-white">No Classes Found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {classStatusFilter === 'pending'
                    ? `No pending classes found for ${selectedSubjectLabel} (${timeFrameLabel}). All scheduled classes have been logged!`
                    : classStatusFilter === 'taken'
                    ? `No classes already taken found for ${selectedSubjectLabel} (${timeFrameLabel}).`
                    : `No classes match the selected subject (${selectedSubjectLabel}) and time frame (${timeFrameLabel}). Try selecting a broader time frame or click "Reset Filters".`}
                </p>
                <button
                  onClick={() => {
                    setFilterSubject('All');
                    setClassStatusFilter('all');
                    handleSelectTimePreset('all');
                    setSearchTerm('');
                  }}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Show All Dates & Subjects
                </button>
              </div>
            ) : (
              displayClassList.map((item) => {
                if (item.isPending) {
                  return (
                    <div
                      key={item.id}
                      className="p-5 rounded-3xl border bg-slate-900/90 border-amber-500/30 ring-1 ring-amber-500/20 hover:border-amber-500/50 transition-all"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center font-bold text-amber-300 text-xs">
                            {item.subjectCode || 'CLS'}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="font-extrabold text-sm text-white">
                                {item.subjectName}
                              </h4>
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                                {item.batch}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                              <span className="font-semibold text-slate-200">
                                📅 {item.date} ({getDayOfWeek(item.date)})
                              </span>
                              <span>⏰ {item.startTime} - {item.endTime} ({item.durationMins || 60} mins)</span>
                              <span className="text-amber-400 font-semibold">📍 Room No. {item.room}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status & Actions */}
                        <div className="flex items-center space-x-2">
                          <div className="px-3 py-1 rounded-full text-[11px] font-bold border bg-amber-500/10 text-amber-300 border-amber-500/30 flex items-center space-x-1.5 mr-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Pending Class Log</span>
                          </div>

                          <button
                            onClick={() => handleOpenModalForPending(item, 'Cancelled')}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
                            title="Mark as Cancelled, Holiday, or Faculty Leave"
                          >
                            <CalendarOff className="w-3.5 h-3.5 text-rose-400" />
                            <span>Mark Cancelled / Holiday</span>
                          </button>

                          <button
                            onClick={() => handleOpenModalForPending(item, 'Conducted')}
                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold shadow-md shadow-blue-600/20 flex items-center space-x-1.5 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-white" />
                            <span>Log Conducted</span>
                          </button>
                        </div>
                      </div>

                      <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Scheduled routine class awaiting lecture topics or cancellation reason.</span>
                        </div>
                        <div className="flex items-center space-x-3 text-xs">
                          <button
                            onClick={() => handleOpenModalForPending(item, 'Cancelled')}
                            className="text-rose-400 hover:text-rose-300 font-semibold underline cursor-pointer"
                          >
                            Mark as Cancelled →
                          </button>
                          <button
                            onClick={() => handleOpenModalForPending(item, 'Conducted')}
                            className="text-blue-400 hover:text-blue-300 font-semibold underline cursor-pointer"
                          >
                            Log Conducted Class →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                const entry = item as ClassDiaryEntry;
                const lockInfo = getLockCountdown(entry);
                const isCancelled = entry.isCancelled || entry.status === 'Cancelled';

                if (isCancelled) {
                  return (
                    <div
                      key={entry.id}
                      className={`p-5 rounded-3xl border transition-all ${
                        lockInfo.isLocked
                          ? 'bg-slate-900/90 border-slate-800'
                          : 'bg-slate-900 border-rose-500/30 ring-1 ring-rose-500/20'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center font-bold text-rose-300 text-xs">
                            <CalendarOff className="w-5 h-5 text-rose-400" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="font-extrabold text-sm text-white">
                                {entry.subjectName}
                              </h4>
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                                {entry.batch}
                              </span>
                              <span className="text-[10px] bg-rose-500/10 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold flex items-center space-x-1">
                                <Ban className="w-3 h-3 text-rose-400" />
                                <span>Class Cancelled / Holiday</span>
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                              <span className="font-semibold text-slate-200">
                                📅 {entry.date} ({getDayOfWeek(entry.date)})
                              </span>
                              <span>⏰ {entry.startTime} - {entry.endTime} ({entry.durationMins || 60} mins)</span>
                              <span className="text-rose-400 font-semibold">📍 Room No. {entry.room}</span>
                            </div>
                          </div>
                        </div>

                        {/* Lock Status Badge & Actions */}
                        <div className="flex items-center space-x-3">
                          <div
                            className={`px-3 py-1 rounded-full text-[11px] font-bold border flex items-center space-x-1.5 ${
                              lockInfo.isLocked
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {lockInfo.isLocked ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Locked (24h Expired)</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5 text-rose-400" />
                                <span>{lockInfo.text}</span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center space-x-1.5">
                            {!lockInfo.isLocked && (
                              <button
                                onClick={() => handleOpenModal(entry, 'Cancelled')}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 text-xs font-bold transition-colors flex items-center space-x-1.5"
                                title="Edit Cancellation Reason"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-rose-400" />
                                <span>Edit Reason</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Reason for Cancellation Details */}
                      <div className="pt-4 space-y-3">
                        <div className="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-rose-400 text-[10px] uppercase font-bold tracking-wider flex items-center space-x-1.5">
                              <Info className="w-3.5 h-3.5 text-rose-400" />
                              <span>Reason for Not Taking Class</span>
                            </span>
                            {entry.cancellationCategory && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                {entry.cancellationCategory}
                              </span>
                            )}
                          </div>
                          <p className="text-rose-100 font-semibold text-sm">
                            {entry.cancellationReason || entry.topicTaught || 'Class not conducted as per routine schedule.'}
                          </p>
                        </div>

                        {entry.remarks && (
                          <div className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800 italic">
                            <span className="text-[10px] uppercase text-slate-500 block not-italic font-bold mb-0.5">
                              Faculty Remarks:
                            </span>
                            "{entry.remarks}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

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
                          {entry.subjectCode || 'CLS'}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-extrabold text-sm text-white">
                              {entry.subjectName}
                            </h4>
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                              {entry.batch}
                            </span>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                              Class Taken
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                            <span className="font-semibold text-slate-200">
                              📅 {entry.date} ({getDayOfWeek(entry.date)})
                            </span>
                            <span>⏰ {entry.startTime} - {entry.endTime} ({entry.durationMins || 60} mins)</span>
                            <span className="text-blue-400 font-semibold">📍 Room No. {entry.room}</span>
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
                              <span>Permanently Locked (24h Window Expired)</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-amber-400" />
                              <span>{lockInfo.text}</span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleOpenModal(entry, 'Conducted')}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 text-xs font-bold transition-colors flex items-center space-x-1"
                            title="Update Attendance & Entry Details"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Update Attendance</span>
                          </button>
                          {!lockInfo.isLocked && (
                            <button
                              onClick={() => handleOpenModal(entry, 'Conducted')}
                              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                              title="Edit Entry"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Details entered during 24 hours */}
                    <div className="pt-4 space-y-3">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          Details Entered during 24h (Topic Taught)
                        </span>
                        <p className="text-slate-100 font-semibold text-sm mt-0.5">
                          {entry.topicTaught}
                        </p>
                      </div>

                      {entry.syllabusUnit && (
                        <div className="text-xs text-slate-400 inline-block bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                          Syllabus Mapping: <span className="text-blue-300 font-medium">{entry.syllabusUnit}</span>
                        </div>
                      )}

                      {entry.remarks && (
                        <div className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800 italic">
                          <span className="text-[10px] uppercase text-slate-500 block not-italic font-bold mb-0.5">
                            Faculty Remarks / Notes:
                          </span>
                          "{entry.remarks}"
                        </div>
                      )}

                      {/* Attendance Summary */}
                      {entry.attendance && entry.attendance.length > 0 && (
                        <div className="pt-2 flex items-center space-x-4 text-xs text-slate-400 border-t border-slate-800/60">
                          <span className="font-bold text-slate-300">Class Attendance:</span>
                          <span className="text-emerald-400 font-bold">
                            {entry.attendance.filter((a) => a.status === 'Present' || a.status === 'Late').length} Present
                          </span>
                          <span className="text-red-400 font-bold">
                            {entry.attendance.filter((a) => a.status === 'Absent').length} Absent
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            ({Math.round((entry.attendance.filter((a) => a.status === 'Present' || a.status === 'Late').length / entry.attendance.length) * 100)}% compliance)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* PRINT-ONLY OFFICIAL CLASS DIARY DOCUMENT VIEW */}
      <div className="hidden print:block text-slate-900 bg-white p-8">
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight">
            DIGBOI COLLEGE (AUTONOMOUS), DIGBOI - ASSAM
          </h1>
          <p className="text-sm text-slate-600 font-medium">
            Official Academic Class Diary Logbook • NAAC & SSR Audit Compliant Record
          </p>
        </div>

        {/* 4 Focused Print Metrics */}
        <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded-lg p-4 mb-6 bg-slate-50 text-sm">
          <div>
            <span className="font-bold text-slate-600 block">Faculty Name:</span>
            <span className="font-bold text-slate-900 text-base">{currentUser.name || 'Dr. Deborshee Gogoi'}</span>
            <span className="text-slate-500 block text-xs">Dept. of {currentUser.department || 'Commerce'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-600 block">Total Classes Taken:</span>
            <span className="font-bold text-blue-900 text-base">{filteredDiaryEntries.length} Classes</span>
            <span className="text-slate-500 block text-xs">Conducted within selected period</span>
          </div>
          <div>
            <span className="font-bold text-slate-600 block">Subject:</span>
            <span className="font-bold text-slate-900">{selectedSubjectLabel}</span>
          </div>
          <div>
            <span className="font-bold text-slate-600 block">Time Period:</span>
            <span className="font-bold text-slate-900">{timeFrameLabel}</span>
          </div>
        </div>

        {/* Class Records Table */}
        <table className="w-full text-left text-xs border-collapse border border-slate-300 mb-6">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="p-2 border border-slate-300 text-center w-8">#</th>
              <th className="p-2 border border-slate-300 w-24">Date & Day</th>
              <th className="p-2 border border-slate-300 w-24">Time</th>
              <th className="p-2 border border-slate-300 w-20">Room No.</th>
              <th className="p-2 border border-slate-300 w-24">Class / Batch</th>
              <th className="p-2 border border-slate-300 w-32">Subject</th>
              <th className="p-2 border border-slate-300">Details Entered (Topic & Syllabus)</th>
              <th className="p-2 border border-slate-300 w-20 text-center">Attendance</th>
              <th className="p-2 border border-slate-300 w-20 text-center">24h Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredDiaryEntries.map((e, idx) => {
              const present = e.attendance ? e.attendance.filter(a => a.status === 'Present' || a.status === 'Late').length : 0;
              const total = e.attendance ? e.attendance.length : 0;
              const attStr = total > 0 ? `${present}/${total}` : 'N/A';

              return (
                <tr key={e.id} className="border-b border-slate-200">
                  <td className="p-2 border border-slate-300 text-center font-bold">{idx + 1}</td>
                  <td className="p-2 border border-slate-300 font-medium">
                    {e.date}
                    <span className="block text-[10px] text-slate-500">({getDayOfWeek(e.date)})</span>
                  </td>
                  <td className="p-2 border border-slate-300">{e.startTime} - {e.endTime}</td>
                  <td className="p-2 border border-slate-300 font-bold">{e.room}</td>
                  <td className="p-2 border border-slate-300">{e.batch}</td>
                  <td className="p-2 border border-slate-300 font-semibold">{e.subjectCode} - {e.subjectName}</td>
                  <td className="p-2 border border-slate-300">
                    <span className="font-semibold block">{e.topicTaught}</span>
                    {e.syllabusUnit && <span className="text-[10px] text-slate-600 block">[{e.syllabusUnit}]</span>}
                    {e.remarks && <span className="text-[10px] italic text-slate-500 block">Note: {e.remarks}</span>}
                  </td>
                  <td className="p-2 border border-slate-300 text-center font-mono">{attStr}</td>
                  <td className="p-2 border border-slate-300 text-center text-[10px] text-emerald-800 font-bold">Verified</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Verification & Signature */}
        <div className="flex justify-between items-end pt-8 mt-8 border-t border-slate-300 text-xs">
          <div>
            <p className="text-slate-600">Generated on: {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
            <p className="text-slate-500 text-[10px]">Digitally verified logbook compliant with Autonomous College Regulations</p>
          </div>
          <div className="text-center">
            <div className="w-48 border-b border-slate-900 pb-1 mb-1 font-bold">
              {currentUser.name || 'Dr. Deborshee Gogoi'}
            </div>
            <p className="text-slate-600">Signature of Faculty Member</p>
          </div>
        </div>
      </div>

      {/* SUB-TAB 2: ATTENDANCE TRACKER & FLAGGED STUDENTS */}
      {activeSubTab === 'attendance' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-heading font-extrabold text-lg text-white">
                  Cumulative Attendance Summary
                </h3>
                <span className="text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
                  {selectedSubjectLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Faculty: <span className="text-slate-200 font-semibold">{currentUser.name || 'Dr. Deborshee Gogoi'}</span> • Timeframe: <span className="text-slate-200 font-semibold">{timeFrameLabel}</span> • Total Classes: <span className="text-blue-400 font-bold">{filteredStats.totalClasses}</span>
              </p>
            </div>
            <div className="text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl flex items-center space-x-1 self-start md:self-auto">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>NAAC 75% Threshold Active</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            {studentStats.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="font-semibold text-sm text-slate-300">No Attendance Records Found</p>
                <p className="text-xs text-slate-500 mt-1">
                  No student attendance data logged for {selectedSubjectLabel} within {timeFrameLabel}.
                </p>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SYLLABUS PROGRESS TRACKER */}
      {activeSubTab === 'syllabus' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-heading font-extrabold text-lg text-white">
                  Curriculum & Syllabus Completion Tracker
                </h3>
                <span className="text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                  {selectedSubjectLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Faculty: <span className="text-slate-200 font-semibold">{currentUser.name || 'Dr. Deborshee Gogoi'}</span> • Timeframe: <span className="text-slate-200 font-semibold">{timeFrameLabel}</span>
              </p>
            </div>
            {filterSubject !== 'All' && (
              <button
                onClick={() => setFilterSubject('All')}
                className="text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer self-start md:self-auto"
              >
                View All Subjects
              </button>
            )}
          </div>

          <div className="space-y-4">
            {availableSubjects.filter((s) => filterSubject === 'All' || s.code === filterSubject).length === 0 ? (
              <div className="text-center py-10 bg-slate-800/40 rounded-2xl border border-dashed border-slate-700 p-6 text-slate-400">
                <BookOpen className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="font-semibold text-sm text-slate-300">No syllabus units logged for this subject</p>
                <p className="text-xs text-slate-500 mt-1">
                  Try selecting "All Subjects" or log classes for {selectedSubjectLabel}.
                </p>
              </div>
            ) : (
              availableSubjects
                .filter((s) => filterSubject === 'All' || s.code === filterSubject)
                .map((subjObj) => {
                  const code = subjObj.code;
                  const topics = syllabusTopics.filter((t) => t.subjectCode === code);
                  const completedCount = topics.filter((t) => t.isCompleted).length;
                  const percent = topics.length > 0 ? Math.round((completedCount / topics.length) * 100) : 0;

                return (
                  <div key={subjObj.code} className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-white">{subjObj.label}</h4>
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
                      {topics.length === 0 && (
                        <div className="text-[11px] text-slate-500 italic p-1">
                          No specific syllabus modules recorded yet for this course.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
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
                {formStatus === 'Cancelled' ? (
                  <CalendarOff className="w-5 h-5 text-rose-400" />
                ) : (
                  <BookOpen className="w-5 h-5 text-blue-400" />
                )}
                <span>
                  {editingEntryId
                    ? formStatus === 'Cancelled'
                      ? 'Edit Cancelled Class Record'
                      : 'Edit Class Log Entry'
                    : formStatus === 'Cancelled'
                    ? 'Record Cancelled Class / Holiday'
                    : 'Log Conducted Class'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {formStatus === 'Cancelled'
                  ? 'Record reason for cancellation, faculty leave, exam duty, or institutional holiday.'
                  : 'Log topics taught, mapped syllabus unit, and student attendance.'}
                <span className="text-amber-400 ml-1">Must be saved within 24 hours of class time.</span>
              </p>
            </div>

            {/* Status Switcher: Conducted vs Cancelled */}
            <div className="flex items-center p-1 bg-slate-800/90 rounded-2xl border border-slate-700">
              <button
                type="button"
                onClick={() => setFormStatus('Conducted')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  formStatus === 'Conducted'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>🟢 Class Conducted (Taken)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormStatus('Cancelled');
                  if (!formCancellationCategory) {
                    setFormCancellationCategory('🏛️ Institutional / Gazetted Holiday');
                  }
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  formStatus === 'Cancelled'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>🔴 Class Cancelled / Holiday / Not Taken</span>
              </button>
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
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Subject (from Master Routine) *
                  </label>
                  {availableSubjects.length > 0 ? (
                    <select
                      value={formSubjectCode || formSubjectName || ''}
                      onChange={(e) => {
                        const selectedVal = e.target.value;
                        const matched = availableSubjects.find(
                          (s) => s.code === selectedVal || s.name === selectedVal
                        );
                        if (matched) {
                          setFormSubjectCode(matched.code);
                          setFormSubjectName(matched.name);
                          if (!formBatch || formBatch === availableSubjects[0]?.batch) {
                            setFormBatch(matched.batch || '');
                          }
                          if (!formRoom || formRoom === availableSubjects[0]?.room) {
                            setFormRoom(matched.room || '');
                          }
                        } else {
                          setFormSubjectCode(selectedVal);
                          setFormSubjectName(selectedVal);
                        }
                      }}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-xl p-2.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                      required
                    >
                      <option value="" disabled>-- Select Subject from Routine --</option>
                      {availableSubjects.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full bg-slate-800/80 border border-amber-500/40 text-amber-300 text-xs rounded-xl p-2.5">
                      No subjects in Master Routine. Add or import routine in Timetable tab.
                    </div>
                  )}
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

              {/* CANCELLED CLASS SPECIFIC FIELDS */}
              {formStatus === 'Cancelled' ? (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-rose-300 block mb-1.5 flex items-center space-x-1">
                      <Ban className="w-3.5 h-3.5 text-rose-400" />
                      <span>Category / Nature of Cancellation *</span>
                    </label>
                    <select
                      value={formCancellationCategory}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setFormCancellationCategory(cat);
                        const matchedCat = CANCELLATION_CATEGORIES.find((c) => c.label === cat);
                        if (matchedCat && matchedCat.presetReason && !formCancellationReason) {
                          setFormCancellationReason(matchedCat.presetReason);
                        }
                      }}
                      className="w-full bg-slate-900 border border-rose-500/40 text-rose-100 text-xs font-semibold rounded-xl p-2.5 focus:outline-none focus:border-rose-400 cursor-pointer"
                    >
                      {CANCELLATION_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.label}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quick Preset Reason Chips */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block mb-1.5">
                      Quick Fill Presets:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_HOLIDAY_QUICK_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setFormCancellationReason(preset)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 text-[10px] font-medium transition-all cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-rose-300 block mb-1">
                      Detailed Reason / Explanation *
                    </label>
                    <textarea
                      rows={2}
                      placeholder="State the exact reason for cancellation (e.g. Independence Day, NAAC committee duty, Medical leave)..."
                      value={formCancellationReason}
                      onChange={(e) => setFormCancellationReason(e.target.value)}
                      className="w-full bg-slate-900 border border-rose-500/30 text-rose-50 text-xs rounded-xl p-2.5 placeholder:text-slate-500 focus:outline-none focus:border-rose-400"
                      required
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-center space-x-2">
                    <Info className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>
                      Syllabus progress and student attendance rosters are exempted for cancelled classes and will not count against attendance percentages.
                    </span>
                  </div>
                </div>
              ) : (
                /* CONDUCTED CLASS SPECIFIC FIELDS */
                <>
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
                      placeholder="e.g. Unit 1: Core Concepts & Principles"
                      value={formSyllabusUnit}
                      onChange={(e) => setFormSyllabusUnit(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                    />
                  </div>

                  {/* Student Attendance Marking Grid */}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="text-[10px] font-bold uppercase text-slate-400 block">
                        Student Attendance ({formAttendance.filter(a => a.status === 'Present').length}/{formAttendance.length} Present)
                      </label>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleImportRosterForCurrentClass}
                          className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white rounded-lg text-[10px] font-bold flex items-center space-x-1 transition-all cursor-pointer"
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>Import Roster</span>
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

                        {formAttendance.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setFormAttendance([])}
                            className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded-lg border border-red-500/30"
                          >
                            Clear List
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Add Custom Student to List */}
                    <div className="flex items-center space-x-2 bg-slate-800/60 p-2 rounded-xl border border-slate-700">
                      <input
                        type="text"
                        placeholder="Roll No (e.g. COM-01)"
                        value={manualRollNo}
                        onChange={(e) => setManualRollNo(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-white text-[11px] rounded-lg px-2.5 py-1 w-28 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Student Full Name"
                        value={manualStudentName}
                        onChange={(e) => setManualStudentName(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-white text-[11px] rounded-lg px-2.5 py-1 flex-1 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!manualRollNo.trim() || !manualStudentName.trim()) {
                            alert('Please provide both roll number and student name.');
                            return;
                          }
                          const newStud: AttendanceRecord = {
                            studentId: `cust_${Date.now()}`,
                            rollNo: manualRollNo.trim(),
                            name: manualStudentName.trim(),
                            status: 'Present',
                            remarks: '',
                          };
                          setFormAttendance((prev) => [...prev, newStud]);
                          setManualRollNo('');
                          setManualStudentName('');
                        }}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-all flex items-center space-x-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Student</span>
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto bg-slate-800/80 rounded-xl p-2 border border-slate-700 space-y-1.5">
                      {formAttendance.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                          No attendance records loaded. Teachers can click <span className="text-emerald-400 font-bold">Import Roster</span> or add individual students above.
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
                                placeholder="Remarks"
                                value={st.remarks || ''}
                                onChange={(e) => {
                                  const updated = [...formAttendance];
                                  updated[idx].remarks = e.target.value;
                                  setFormAttendance(updated);
                                }}
                                className="bg-slate-800 border border-slate-700 text-[10px] text-slate-200 rounded px-2 py-1 focus:outline-none w-24"
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
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormAttendance((prev) => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="p-1 text-slate-500 hover:text-red-400 rounded transition-all"
                                  title="Remove Student"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Remarks / Faculty Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Additional remarks, compensatory class notes, or assignment info..."
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
                  className={`px-5 py-2 font-bold text-xs rounded-xl shadow-lg transition-all ${
                    formStatus === 'Cancelled'
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-rose-600/20'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/20'
                  }`}
                >
                  {formStatus === 'Cancelled' ? 'Save Cancelled Class Record' : 'Save Class Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK CANCEL DAY / HOLIDAY MODAL */}
      {isBulkCancelOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-lg w-full p-6 space-y-5 text-white my-8 relative shadow-2xl">
            <button
              onClick={() => setIsBulkCancelOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="font-heading font-extrabold text-xl text-white flex items-center space-x-2">
                <CalendarOff className="w-6 h-6 text-rose-400" />
                <span>Mark Holiday / Cancel Day</span>
              </h3>
              <p className="text-xs text-slate-400">
                Mark all your scheduled routine classes on a specific date as Cancelled / Holiday with a single click.
              </p>
            </div>

            <form onSubmit={handleBulkCancelDate} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Select Date *
                </label>
                <input
                  type="date"
                  value={bulkCancelDate}
                  onChange={(e) => setBulkCancelDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-rose-500"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Cancellation Reason Category *
                </label>
                <select
                  value={bulkCancelCategory}
                  onChange={(e) => {
                    const cat = e.target.value;
                    setBulkCancelCategory(cat);
                    const matchedCat = CANCELLATION_CATEGORIES.find((c) => c.label === cat);
                    if (matchedCat && matchedCat.presetReason) {
                      setBulkCancelReason(matchedCat.presetReason);
                    }
                  }}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-xl p-2.5 focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  {CANCELLATION_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.label}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Preset Reason Chips */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 block mb-1.5">
                  Common Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_HOLIDAY_QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBulkCancelReason(preset)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 text-[10px] font-medium transition-all cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Specific Reason / Event Description *
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Independence Day, State Gazetted Holiday, University Exam Invigilation..."
                  value={bulkCancelReason}
                  onChange={(e) => setBulkCancelReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-rose-500"
                  required
                />
              </div>

              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-200 space-y-1">
                <div className="font-bold flex items-center space-x-1.5 text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Bulk Action Summary</span>
                </div>
                <p className="text-[11px] text-rose-200/90 leading-relaxed">
                  All routine periods scheduled on <span className="font-bold underline">{bulkCancelDate}</span> under your profile will be recorded as Cancelled with the reason above.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsBulkCancelOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/20 cursor-pointer"
                >
                  Apply & Mark Cancelled
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
