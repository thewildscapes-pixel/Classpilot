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
  Target,
  TrendingUp,
  Layers,
  Award,
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
          return parsed
            .filter((e: any) => e && e.subjectName !== 'Financial Accounting' && e.subjectName !== 'Business Organisation')
            .map((e: any) => ({
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
  const [startDate, setStartDate] = useState<string>('2026-08-01');
  const [endDate, setEndDate] = useState<string>('2026-10-31');
  const [timePreset, setTimePreset] = useState<string>('aug_oct_2026');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineDrafts, setOfflineDrafts] = useState<ClassDiaryEntry[]>([]);

  // Dynamically extract available unique subjects from timetable and active diary entries
  const availableSubjects = useMemo(() => {
    const subjectsMap = new Map<string, string>();
    timetable.forEach((t) => {
      if (t.subjectCode && t.subjectName) {
        subjectsMap.set(t.subjectCode, `${t.subjectCode}: ${t.subjectName}`);
      } else if (t.subjectName) {
        subjectsMap.set(t.subjectName, t.subjectName);
      }
    });
    diaryEntries.forEach((d) => {
      if (d.subjectCode && d.subjectName) {
        subjectsMap.set(d.subjectCode, `${d.subjectCode}: ${d.subjectName}`);
      } else if (d.subjectName) {
        subjectsMap.set(d.subjectName, d.subjectName);
      }
    });
    return Array.from(subjectsMap.entries()).map(([code, label]) => ({ code, label }));
  }, [timetable, diaryEntries]);

  // Selected subject display label
  const selectedSubjectLabel = useMemo(() => {
    if (filterSubject === 'All') return 'All Subjects';
    const found = availableSubjects.find((s) => s.code === filterSubject);
    return found ? found.label : filterSubject;
  }, [filterSubject, availableSubjects]);

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

  // Filtered Diary Entries based on faculty, selected subject, date timeframe, and search term
  const filteredDiaryEntries = useMemo(() => {
    return diaryEntries.filter((e) => {
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
  }, [diaryEntries, filterSubject, startDate, endDate, searchTerm]);

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
  const [formSyllabusUnit, setFormSyllabusUnit] = useState<string>('');
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
      setFormSubjectCode(selectedClassForDiary.subjectCode || '');
      setFormSubjectName(selectedClassForDiary.subjectName || '');
      setFormBatch(selectedClassForDiary.batch || '');
      setFormRoom(selectedClassForDiary.room || '');
      setFormTopic('');
      setFormSyllabusUnit('');
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
          const valid = parsed.filter((e: any) => e && e.subjectName !== 'Financial Accounting' && e.subjectName !== 'Business Organisation');
          if (valid.length > 0) {
            setDiaryEntries((prev) => mergeEntries(prev, valid));
            return;
          }
        }
      }
    } catch (err) {}

    // Seed realistic class entries across August, September, and October 2026 matching faculty timetable
    const sampleEntries: ClassDiaryEntry[] = [
      {
        id: 'diary_2026_08_14',
        facultyId: currentUser.facultyId || currentUser.id || 'fac_1',
        facultyName: currentUser.name || 'Dr. Deborshee Gogoi',
        department: currentUser.department || 'Commerce',
        date: '2026-08-14',
        startTime: '13:00',
        endTime: '14:00',
        classStartTimestamp: new Date('2026-08-14T13:00:00').getTime(),
        subjectCode: 'POM',
        subjectName: 'Principles of Marketing',
        batch: 'FYUGP 5th Semester 2026',
        room: 'Room C9',
        topicTaught: 'Characteristics of Marketing & Core Marketing Concepts',
        syllabusUnit: 'Unit 1: Fundamentals of Marketing',
        durationMins: 60,
        remarks: 'Analyzed modern holistic marketing orientation and customer value creation.',
        attendance: [
          { studentId: 's1', rollNo: 'COM-001', name: 'Aakash Sharma', status: 'Present' },
          { studentId: 's2', rollNo: 'COM-002', name: 'Bhavna Baruah', status: 'Present' },
          { studentId: 's3', rollNo: 'COM-003', name: 'Chiranjit Das', status: 'Present' },
          { studentId: 's4', rollNo: 'COM-004', name: 'Deepika Saikia', status: 'Present' },
          { studentId: 's5', rollNo: 'COM-005', name: 'Farhan Ali', status: 'Absent' },
        ],
        createdAt: '2026-08-14T14:15:00Z',
        updatedAt: '2026-08-14T14:15:00Z',
        isSynced: true,
      },
      {
        id: 'diary_2026_08_21',
        facultyId: currentUser.facultyId || currentUser.id || 'fac_1',
        facultyName: currentUser.name || 'Dr. Deborshee Gogoi',
        department: currentUser.department || 'Commerce',
        date: '2026-08-21',
        startTime: '13:00',
        endTime: '14:00',
        classStartTimestamp: new Date('2026-08-21T13:00:00').getTime(),
        subjectCode: 'POM',
        subjectName: 'Principles of Marketing',
        batch: 'FYUGP 5th Semester 2026',
        room: 'Room C9',
        topicTaught: 'Consumer Behaviour, Perception & Market Segmentation Strategies',
        syllabusUnit: 'Unit 1: Market Dynamics',
        durationMins: 60,
        remarks: 'Discussed demographic, geographic and psychographic segmentation in NE India.',
        attendance: [
          { studentId: 's1', rollNo: 'COM-001', name: 'Aakash Sharma', status: 'Present' },
          { studentId: 's2', rollNo: 'COM-002', name: 'Bhavna Baruah', status: 'Present' },
          { studentId: 's3', rollNo: 'COM-003', name: 'Chiranjit Das', status: 'Present' },
          { studentId: 's4', rollNo: 'COM-004', name: 'Deepika Saikia', status: 'Present' },
          { studentId: 's5', rollNo: 'COM-005', name: 'Farhan Ali', status: 'Present' },
        ],
        createdAt: '2026-08-21T14:20:00Z',
        updatedAt: '2026-08-21T14:20:00Z',
        isSynced: true,
      },
      {
        id: 'diary_2026_09_04',
        facultyId: currentUser.facultyId || currentUser.id || 'fac_1',
        facultyName: currentUser.name || 'Dr. Deborshee Gogoi',
        department: currentUser.department || 'Commerce',
        date: '2026-09-04',
        startTime: '13:00',
        endTime: '14:00',
        classStartTimestamp: new Date('2026-09-04T13:00:00').getTime(),
        subjectCode: 'POM',
        subjectName: 'Principles of Marketing',
        batch: 'FYUGP 5th Semester 2026',
        room: 'Room C9',
        topicTaught: 'Product Life Cycle (PLC) Stages & Brand Positioning Models',
        syllabusUnit: 'Unit 2: Product & Branding',
        durationMins: 60,
        remarks: 'Case study analysis on maturity and decline stage repositioning.',
        attendance: [
          { studentId: 's1', rollNo: 'COM-001', name: 'Aakash Sharma', status: 'Present' },
          { studentId: 's2', rollNo: 'COM-002', name: 'Bhavna Baruah', status: 'Present' },
          { studentId: 's3', rollNo: 'COM-003', name: 'Chiranjit Das', status: 'Absent' },
          { studentId: 's4', rollNo: 'COM-004', name: 'Deepika Saikia', status: 'Present' },
          { studentId: 's5', rollNo: 'COM-005', name: 'Farhan Ali', status: 'Present' },
        ],
        createdAt: '2026-09-04T14:10:00Z',
        updatedAt: '2026-09-04T14:10:00Z',
        isSynced: true,
      },
      {
        id: 'diary_2026_09_18',
        facultyId: currentUser.facultyId || currentUser.id || 'fac_1',
        facultyName: currentUser.name || 'Dr. Deborshee Gogoi',
        department: currentUser.department || 'Commerce',
        date: '2026-09-18',
        startTime: '13:00',
        endTime: '14:00',
        classStartTimestamp: new Date('2026-09-18T13:00:00').getTime(),
        subjectCode: 'POM',
        subjectName: 'Principles of Marketing',
        batch: 'FYUGP 5th Semester 2026',
        room: 'Room C9',
        topicTaught: 'Pricing Strategies: Cost-Plus, Penetration & Price Skimming',
        syllabusUnit: 'Unit 3: Pricing Policies',
        durationMins: 60,
        remarks: 'Solved numerical problems on break-even points and markup percentages.',
        attendance: [
          { studentId: 's1', rollNo: 'COM-001', name: 'Aakash Sharma', status: 'Present' },
          { studentId: 's2', rollNo: 'COM-002', name: 'Bhavna Baruah', status: 'Present' },
          { studentId: 's3', rollNo: 'COM-003', name: 'Chiranjit Das', status: 'Present' },
          { studentId: 's4', rollNo: 'COM-004', name: 'Deepika Saikia', status: 'Present' },
          { studentId: 's5', rollNo: 'COM-005', name: 'Farhan Ali', status: 'Present' },
        ],
        createdAt: '2026-09-18T14:30:00Z',
        updatedAt: '2026-09-18T14:30:00Z',
        isSynced: true,
      },
      {
        id: 'diary_2026_10_09',
        facultyId: currentUser.facultyId || currentUser.id || 'fac_1',
        facultyName: currentUser.name || 'Dr. Deborshee Gogoi',
        department: currentUser.department || 'Commerce',
        date: '2026-10-09',
        startTime: '13:00',
        endTime: '14:00',
        classStartTimestamp: new Date('2026-10-09T13:00:00').getTime(),
        subjectCode: 'POM',
        subjectName: 'Principles of Marketing',
        batch: 'FYUGP 5th Semester 2026',
        room: 'Room C9',
        topicTaught: 'Integrated Marketing Communication (IMC) & Digital Promotion Mix',
        syllabusUnit: 'Unit 4: Promotion & Digital Channels',
        durationMins: 60,
        remarks: 'Compared social media advertising ROI vs traditional print media.',
        attendance: [
          { studentId: 's1', rollNo: 'COM-001', name: 'Aakash Sharma', status: 'Present' },
          { studentId: 's2', rollNo: 'COM-002', name: 'Bhavna Baruah', status: 'Present' },
          { studentId: 's3', rollNo: 'COM-003', name: 'Chiranjit Das', status: 'Present' },
          { studentId: 's4', rollNo: 'COM-004', name: 'Deepika Saikia', status: 'Present' },
          { studentId: 's5', rollNo: 'COM-005', name: 'Farhan Ali', status: 'Present' },
        ],
        createdAt: '2026-10-09T14:15:00Z',
        updatedAt: '2026-10-09T14:15:00Z',
        isSynced: true,
      },
      {
        id: 'diary_2026_10_23',
        facultyId: currentUser.facultyId || currentUser.id || 'fac_1',
        facultyName: currentUser.name || 'Dr. Deborshee Gogoi',
        department: currentUser.department || 'Commerce',
        date: '2026-10-23',
        startTime: '13:00',
        endTime: '14:00',
        classStartTimestamp: new Date('2026-10-23T13:00:00').getTime(),
        subjectCode: 'POM',
        subjectName: 'Principles of Marketing',
        batch: 'FYUGP 5th Semester 2026',
        room: 'Room C9',
        topicTaught: 'Distribution Channels, Logistics & Retail Supply Chains in India',
        syllabusUnit: 'Unit 4: Distribution Logistics',
        durationMins: 60,
        remarks: 'Case study on Assam Tea and FMCG wholesale distribution.',
        attendance: [
          { studentId: 's1', rollNo: 'COM-001', name: 'Aakash Sharma', status: 'Present' },
          { studentId: 's2', rollNo: 'COM-002', name: 'Bhavna Baruah', status: 'Present' },
          { studentId: 's3', rollNo: 'COM-003', name: 'Chiranjit Das', status: 'Present' },
          { studentId: 's4', rollNo: 'COM-004', name: 'Deepika Saikia', status: 'Present' },
          { studentId: 's5', rollNo: 'COM-005', name: 'Farhan Ali', status: 'Absent' },
        ],
        createdAt: '2026-10-23T14:05:00Z',
        updatedAt: '2026-10-23T14:05:00Z',
        isSynced: true,
      },
    ];

    setDiaryEntries((prev) => mergeEntries(prev, sampleEntries));
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
      setFormSubjectCode(timetable[0]?.subjectCode || '');
      setFormSubjectName(timetable[0]?.subjectName || '');
      setFormBatch(timetable[0]?.batch || '');
      setFormRoom(timetable[0]?.room || '');
      setFormTopic('');
      setFormSyllabusUnit('');
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

  // Aggregated Summary Statistics for the Selected Subject & Timeframe
  const filteredStats = useMemo(() => {
    const totalClasses = filteredDiaryEntries.length;
    let totalMinutes = 0;
    let totalRosterAttended = 0;
    let totalRosterCount = 0;
    const unitsCovered = new Set<string>();
    const batchesSet = new Set<string>();

    filteredDiaryEntries.forEach((e) => {
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
    });

    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    const avgAttendancePercent = totalRosterCount > 0 ? Math.round((totalRosterAttended / totalRosterCount) * 100) : 100;

    return {
      totalClasses,
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
    const classesTaken = filteredDiaryEntries.length;

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

    // Scheduled is at least equal to classes taken
    const finalScheduled = Math.max(scheduledCount, classesTaken, 1);
    const percentage = Math.min(100, Math.round((classesTaken / finalScheduled) * 100));
    const remaining = Math.max(0, finalScheduled - classesTaken);

    // Monthly breakdown of classes taken vs expected in the selected range
    const monthlyMap: Record<string, { monthLabel: string; taken: number; scheduled: number; hours: number }> = {};

    filteredDiaryEntries.forEach((e) => {
      if (e.date) {
        const ym = e.date.substring(0, 7); // e.g. "2026-08"
        const [year, month] = ym.split('-');
        const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
        const monthLabel = !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : ym;

        if (!monthlyMap[ym]) {
          monthlyMap[ym] = { monthLabel, taken: 0, scheduled: 4, hours: 0 };
        }
        monthlyMap[ym].taken += 1;
        monthlyMap[ym].hours += (e.durationMins || 60) / 60;
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
            monthlyMap[ym] = { monthLabel, taken: 0, scheduled: 4, hours: 0 };
          }
          cur.setMonth(cur.getMonth() + 1);
        }
      } catch (err) {}
    }

    const monthlyBreakdown = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, data]) => {
        const estScheduled = Math.max(data.taken, data.scheduled || 4);
        const pct = Math.min(100, Math.round((data.taken / estScheduled) * 100));
        return {
          ym,
          monthLabel: data.monthLabel,
          taken: data.taken,
          scheduled: estScheduled,
          pct,
          hours: Math.round(data.hours * 10) / 10,
        };
      });

    return {
      classesTaken,
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

            {/* 4 Micro Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Conducted
                </span>
                <span className="text-xl font-extrabold text-white mt-1 block">
                  {workloadProgress.classesTaken}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">Verified in Log</span>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Scheduled
                </span>
                <span className="text-xl font-extrabold text-blue-300 mt-1 block">
                  {workloadProgress.scheduledCount}
                </span>
                <span className="text-[10px] text-blue-400 font-semibold">Timetable Target</span>
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
            <span>Class Log Entries ({filteredDiaryEntries.length})</span>
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
              {/* Subject Selection */}
              <div className="flex items-center space-x-3 flex-1">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  Select Subject:
                </span>
                <select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="w-full max-w-xs bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Subjects ({diaryEntries.length} Classes Logged)</option>
                  {availableSubjects.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
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
                {(startDate || endDate || filterSubject !== 'All' || searchTerm) && (
                  <button
                    onClick={() => {
                      setFilterSubject('All');
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
            {filteredDiaryEntries.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
                <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h4 className="text-base font-bold text-white">No Class Entries Found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  No classes match the selected subject ({selectedSubjectLabel}) and time frame ({timeFrameLabel}). Try selecting a broader time frame or click "Reset Filters".
                </p>
                <button
                  onClick={() => {
                    setFilterSubject('All');
                    handleSelectTimePreset('all');
                    setSearchTerm('');
                  }}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Show All Dates & Subjects
                </button>
              </div>
            ) : (
              filteredDiaryEntries.map((entry) => {
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
                    placeholder="e.g. Course Code - Course Title"
                    value={formSubjectCode && formSubjectName ? `${formSubjectCode} - ${formSubjectName}` : (formSubjectName || formSubjectCode || '')}
                    onChange={(e) => {
                      const parts = e.target.value.split('-');
                      if (parts.length > 1) {
                        setFormSubjectCode(parts[0]?.trim() || '');
                        setFormSubjectName(parts.slice(1).join('-').trim() || '');
                      } else {
                        setFormSubjectName(e.target.value);
                      }
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
