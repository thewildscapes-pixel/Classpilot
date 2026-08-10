import React, { useState, useEffect, useRef } from 'react';
import {
  TimetableEntry,
  Faculty,
  Room,
  Student,
  User,
  DayOfWeek,
  AlertNotification,
  ScheduleConflict,
  RoutineVersion,
  RoutineBackup,
  RawRoutineFile,
} from './types';
import {
  INITIAL_FACULTY,
  INITIAL_ROOMS,
  INITIAL_TIMETABLE,
  INITIAL_STUDENTS,
  DEMO_USERS,
} from './data/initialData';
import {
  getCurrentDayName,
  parseTimeToMinutes,
  formatTime24H,
  getEntryStatus,
  isFacultyNameMatch,
  isPhoneMatch,
} from './utils/timeUtils';
import { playAlertChime, playSchoolBellSound, stopSchoolBellSound } from './utils/audioUtils';
import {
  subscribeToTimetableRealtime,
  saveTimetableToFirestore,
  addTimetableEntryToFirestore,
  updateTimetableEntryInFirestore,
  deleteTimetableEntryFromFirestore,
  saveUserProfileInFirestore,
  listenToAuthChanges,
  firebaseSignOut,
  subscribeToRoutineVersionsRealtime,
  subscribeToRoutineBackupsRealtime,
  recordRoutineVersionInFirestore,
  saveRawRoutineFileToFirestore,
  createRoutineBackupInFirestore,
  checkAndTriggerAutomatedDailyBackup,
  rollbackRoutineToSnapshot,
  subscribeToFacultyRealtime,
  saveFacultyToFirestore,
  deleteFacultyFromFirestore,
  clearAllFacultyInFirestore,
  subscribeToRoomsRealtime,
  saveRoomToFirestore,
  deleteRoomFromFirestore,
} from './lib/firebaseService';

// Components
import { Header } from './components/Header';
import { DemoTimeBar } from './components/DemoTimeBar';
import { CountdownWidget } from './components/CountdownWidget';
import { AlertBanner } from './components/AlertBanner';
import { FacultySchedule } from './components/FacultySchedule';
import { RoomFinder } from './components/RoomFinder';
import { AdminTimetable } from './components/AdminTimetable';
import { LoginModal } from './components/LoginModal';
import { PwaInstallModal } from './components/PwaInstallModal';
import { LandingPage } from './components/LandingPage';
import { ClassDiaryView } from './components/ClassDiaryView';
import { GoogleCalendarView } from './components/GoogleCalendarView';
import { ComplianceResearchView } from './components/ComplianceResearchView';
import { DashboardAnalytics } from './components/DashboardAnalytics';
import { AlarmModal } from './components/AlarmModal';
import { FooterSyncStatus } from './components/FooterSyncStatus';
import { ActiveAlarm } from './types';


import { Bell, Clock, Trash2, MapPin, CheckCircle, Volume2, Shield } from 'lucide-react';

export default function App() {
  // --- STATE MANAGEMENT ---
  const [facultyList, setFacultyList] = useState<Faculty[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_faculty_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_FACULTY;
  });

  const [roomList, setRoomList] = useState<Room[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_room_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_ROOMS;
  });
  const [timetable, setTimetable] = useState<TimetableEntry[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_timetable');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_TIMETABLE;
  });
  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_students');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_STUDENTS;
  });

  const handleUpdateStudents = (updated: Student[]) => {
    setStudents(updated);
    try {
      localStorage.setItem('classpilot_students', JSON.stringify(updated));
    } catch (e) {}

    fetch('/api/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: updated, replaceExisting: true }),
    }).catch((e) => console.warn('Sync students with SQLite error:', e));
  };

  // Read persisted user session from localStorage or default to null for Landing Page
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('classpilot_user_session') || localStorage.getItem('lecturapulse_user_session');
      if (saved) {
        return JSON.parse(saved) as User;
      }
    } catch (e) {
      console.warn('Failed to parse saved user session');
    }
    return null;
  });

  const [selectedFacultyId, setSelectedFacultyId] = useState<string>(() => {
    if (currentUser && currentUser.facultyId) return currentUser.facultyId;
    return 'fac_1';
  });

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'schedule' | 'diary' | 'calendar' | 'compliance' | 'rooms' | 'admin' | 'alerts'>('schedule');

  // School Bell Active Alarm modal state
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm>({ isRinging: false });

  const triggerSchoolBellAlarm = (title: string, room: string, startTime: string) => {
    playSchoolBellSound();
    setActiveAlarm({
      isRinging: true,
      title,
      room,
      startTime,
    });
  };

  const handleStopAlarm = () => {
    stopSchoolBellSound();
    setActiveAlarm({ isRinging: false });
  };

  const handleSnoozeAlarm = (minutes: number = 5) => {
    stopSchoolBellSound();
    setActiveAlarm({ isRinging: false });
    setTimeout(() => {
      triggerSchoolBellAlarm(
        activeAlarm.title || 'Snoozed Class Alert',
        activeAlarm.room || 'Room',
        activeAlarm.startTime || 'Now'
      );
    }, minutes * 60 * 1000);
  };


  // Login handler from Landing Page or Modal
  const handleLoginSuccess = (user: User, token?: string) => {
    setCurrentUser(user);
    if (user.facultyId) {
      setSelectedFacultyId(user.facultyId);
    }
    // Sync profile to Firestore
    saveUserProfileInFirestore(user).catch((err) => console.warn('Firestore profile sync error:', err));
    try {
      localStorage.setItem('classpilot_user_session', JSON.stringify(user));
      if (token) localStorage.setItem('classpilot_user_token', token);
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
    setIsLoginModalOpen(false);
  };

  // Explicit Logout handler
  const handleLogout = () => {
    setCurrentUser(null);
    firebaseSignOut().catch((e) => console.warn('Firebase signout:', e));
    try {
      localStorage.removeItem('classpilot_user_session');
      localStorage.removeItem('classpilot_user_token');
      localStorage.removeItem('lecturapulse_user_session');
      localStorage.removeItem('lecturapulse_user_token');
    } catch (e) {
      console.warn('LocalStorage clear failed:', e);
    }
  };

  // Time & Demo Simulation
  const [realTimeOffsetMs, setRealTimeOffsetMs] = useState<number>(0);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(getCurrentDayName(new Date()));

  // Notifications & Alerts
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const triggeredAlertIds = useRef<Set<string>>(new Set());

  // Modals & Navigation
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isPwaModalOpen, setIsPwaModalOpen] = useState<boolean>(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<unknown>(null);
  const [selectedClassForDiary, setSelectedClassForDiary] = useState<TimetableEntry | null>(null);

  // Safeguards: Versioning & Backups State
  const [routineVersions, setRoutineVersions] = useState<RoutineVersion[]>([]);
  const [routineBackups, setRoutineBackups] = useState<RoutineBackup[]>([]);

  // --- FETCH BACKEND DATA ON MOUNT & REALTIME FIRESTORE TIMETABLE ---
  useEffect(() => {
    // Firestore Real-Time Timetable Listener (no manual refresh needed)
    const unsubscribeTimetable = subscribeToTimetableRealtime((entries) => {
      if (entries && entries.length > 0) {
        setTimetable(entries);
        try {
          localStorage.setItem('classpilot_timetable', JSON.stringify(entries));
        } catch (e) {}
        checkAndTriggerAutomatedDailyBackup(entries).catch((err) =>
          console.warn('Auto backup trigger notice:', err)
        );
      }
    });

    // Firestore Real-Time Routine Versions & Backups Listeners
    const unsubscribeVersions = subscribeToRoutineVersionsRealtime((versions) => {
      setRoutineVersions(versions);
    });

    const unsubscribeBackups = subscribeToRoutineBackupsRealtime((backups) => {
      setRoutineBackups(backups);
    });

    // Firestore Real-Time Faculty & Room Listeners
    const unsubscribeFaculty = subscribeToFacultyRealtime(INITIAL_FACULTY, (list) => {
      if (list && list.length > 0) {
        setFacultyList(list);
        try {
          localStorage.setItem('classpilot_faculty_list', JSON.stringify(list));
        } catch (e) {}
      }
    });

    const unsubscribeRooms = subscribeToRoomsRealtime(INITIAL_ROOMS, (list) => {
      if (list && list.length > 0) {
        setRoomList(list);
        try {
          localStorage.setItem('classpilot_room_list', JSON.stringify(list));
        } catch (e) {}
      }
    });

    fetch('/api/timetable')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setTimetable(data);
          try {
            localStorage.setItem('classpilot_timetable', JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch((err) => console.log('Loaded default timetable state'));

    fetch('/api/faculty')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setFacultyList(data);
          try {
            localStorage.setItem('classpilot_faculty_list', JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch((err) => console.log('Loaded default faculty state'));

    fetch('/api/rooms')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setRoomList(data);
          try {
            localStorage.setItem('classpilot_room_list', JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch((err) => console.log('Loaded default room state'));

    fetch('/api/students')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setStudents(data);
          try {
            localStorage.setItem('classpilot_students', JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch((err) => console.log('Loaded default student state'));

    // Listen for PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    });

    // Request Browser Notification permissions check
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  // --- AUTOMATIC FACULTY PROFILE SYNC FOR LOGGED IN USER ---
  useEffect(() => {
    if (!currentUser || !facultyList || facultyList.length === 0) return;

    // 1. Check if currentUser's facultyId directly matches a faculty
    const directFac = facultyList.find((f) => f.id === currentUser.facultyId);
    if (directFac) {
      if (selectedFacultyId !== directFac.id) {
        setSelectedFacultyId(directFac.id);
      }
      return;
    }

    // 2. Otherwise match currentUser by phone, whatsapp, email, or name
    const cPhone = currentUser.phone || currentUser.whatsappPhone || '';
    const cEmail = (currentUser.email || '').toLowerCase().trim();

    const matchedFac = facultyList.find((f) => {
      if (isPhoneMatch(f.phone, cPhone) || isPhoneMatch(f.whatsappPhone, cPhone)) return true;
      if (cEmail && f.email && f.email.toLowerCase().trim() === cEmail) return true;
      if (isFacultyNameMatch(f.name, currentUser.name)) return true;
      return false;
    });

    if (matchedFac) {
      setSelectedFacultyId(matchedFac.id);
      if (currentUser.facultyId !== matchedFac.id) {
        const updatedUser: User = {
          ...currentUser,
          facultyId: matchedFac.id,
          name: matchedFac.name,
          department: matchedFac.department || currentUser.department,
        };
        setCurrentUser(updatedUser);
        try {
          localStorage.setItem('classpilot_user_session', JSON.stringify(updatedUser));
        } catch (e) {}
      }
    }
  }, [currentUser, facultyList]);

  // --- AUTO-RECONCILE ROUTINE TIMETABLE ENTRIES WITH FACULTY LIST ---
  useEffect(() => {
    if (!facultyList || facultyList.length === 0 || !timetable || timetable.length === 0) return;

    let modified = false;
    const reconciled = timetable.map((entry) => {
      // If entry already matches a valid facultyId in facultyList, keep it
      if (facultyList.some((f) => f.id === entry.facultyId)) return entry;

      // Try matching entry.facultyName against facultyList
      const matched = facultyList.find((f) => isFacultyNameMatch(f.name, entry.facultyName));
      if (matched) {
        modified = true;
        return {
          ...entry,
          facultyId: matched.id,
          facultyName: matched.name,
        };
      }
      return entry;
    });

    if (modified) {
      setTimetable(reconciled);
      try {
        localStorage.setItem('classpilot_timetable', JSON.stringify(reconciled));
      } catch (e) {}
    }
  }, [facultyList, timetable]);

  // --- LIVE CLOCK TICK ENGINE ---
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date(Date.now() + realTimeOffsetMs);
      setCurrentDate(now);
    }, 1000);

    return () => clearInterval(interval);
  }, [realTimeOffsetMs]);

  // --- AUTOMATED 10-MINUTE ALERT CHECKER ENGINE ---
  useEffect(() => {
    const currentMin = currentDate.getHours() * 60 + currentDate.getMinutes();
    const currentSec = currentDate.getSeconds();

    // Check all timetable entries for selected day
    timetable.forEach((entry) => {
      if (entry.day !== selectedDay) return;

      const startMin = parseTimeToMinutes(entry.startTime);
      const diffMins = startMin - currentMin;

      // Trigger 10-minute alert if class starts in 10 minutes (diffMins === 10 or <= 10 and >= 0)
      const alertKey = `${entry.id}_10m_${selectedDay}_${currentDate.getFullYear()}_${currentDate.getMonth()}_${currentDate.getDate()}_${startMin}`;

      if (diffMins >= 0 && diffMins <= 10 && !triggeredAlertIds.current.has(alertKey)) {
        triggeredAlertIds.current.add(alertKey);
        trigger10MinAlert(entry, diffMins);
      }
    });
  }, [currentDate, selectedDay, timetable]);

  // Function to fire 10-min alert
  const trigger10MinAlert = (entry: TimetableEntry, minsRemaining: number) => {
    playAlertChime();
    triggerSchoolBellAlarm(entry.subjectName, entry.room, entry.startTime);

    const title = minsRemaining === 0 ? `⏰ Class Starting Now!` : `🔔 Class Alert: ${minsRemaining}m Remaining!`;

    const message = `"${entry.subjectName}" (${entry.subjectCode}) in ${entry.room} for ${entry.batch}`;

    const newNotif: AlertNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title,
      message,
      entryId: entry.id,
      timestamp: currentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: false,
      type: minsRemaining === 0 ? 'class_started' : '10min_warning',
      subjectName: entry.subjectName,
      room: entry.room,
      startTime: entry.startTime,
    };

    setNotifications((prev) => [newNotif, ...prev]);

    // Send Browser System Notification if permission is granted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: '/pwa-192.png',
          tag: entry.id,
        });
      } catch (e) {
        console.warn('System notification blocked:', e);
      }
    }
  };

  // --- DEMO TIME CONTROLS ---
  const handleAdvanceMinutes = (mins: number) => {
    const addedMs = mins * 60 * 1000;
    setRealTimeOffsetMs((prev) => prev + addedMs);
    setIsSimulated(true);
  };

  const handleSetCustomTime = (timeStr: string) => {
    if (!timeStr) return;
    const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));

    const targetDate = new Date(currentDate);
    targetDate.setHours(h, m, 0, 0);

    const newOffset = targetDate.getTime() - Date.now();
    setRealTimeOffsetMs(newOffset);
    setIsSimulated(true);
  };

  const handleResetToRealTime = (day?: DayOfWeek) => {
    setRealTimeOffsetMs(0);
    setIsSimulated(false);
    const now = new Date();
    setCurrentDate(now);
    setSelectedDay(day || getCurrentDayName(now));
  };

  const handleJumpToNextClass10Mins = () => {
    // Find next upcoming class for selected faculty on selected day
    const currentMin = currentDate.getHours() * 60 + currentDate.getMinutes();
    const upcoming = timetable
      .filter((e) => e.facultyId === selectedFacultyId && e.day === selectedDay)
      .map((e) => ({ ...e, startMin: parseTimeToMinutes(e.startTime) }))
      .filter((e) => e.startMin > currentMin)
      .sort((a, b) => a.startMin - b.startMin)[0];

    if (!upcoming) {
      alert(`No upcoming class found for ${selectedDay}. Try selecting a different day or faculty member!`);
      return;
    }

    // Set time to exactly 10 minutes before this class
    const targetMin = upcoming.startMin - 10;
    const targetH = Math.floor(targetMin / 60);
    const targetM = targetMin % 60;

    const targetDate = new Date(currentDate);
    targetDate.setHours(targetH, targetM, 0, 0);

    const newOffset = targetDate.getTime() - Date.now();
    setRealTimeOffsetMs(newOffset);
    setIsSimulated(true);

    // Explicitly fire alert immediately for demo experience
    trigger10MinAlert(upcoming, 10);
  };

  // --- NOTIFICATION TOGGLE ---
  const handleToggleNotifications = () => {
    if (!('Notification' in window)) {
      alert('Browser Notifications are not supported in this environment.');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      alert('Browser Notifications are already enabled!');
    } else {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          setNotificationsEnabled(true);
          playAlertChime();
          new Notification('AcademiaSync Alerts Enabled', {
            body: 'You will now receive 10-minute class warnings on this device!',
          });
        } else {
          setNotificationsEnabled(false);
        }
      });
    }
  };

  // --- CRUD API HANDLERS ---
  const handleAddEntry = async (entryData: Partial<TimetableEntry>) => {
    const newEntry: TimetableEntry = {
      id: entryData.id || `tt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      facultyId: entryData.facultyId || 'fac_1',
      facultyName: entryData.facultyName || 'Faculty Member',
      subjectCode: entryData.subjectCode || 'CS101',
      subjectName: entryData.subjectName || 'Course',
      room: entryData.room || 'Room No. C1',
      day: entryData.day || 'Monday',
      startTime: entryData.startTime || '08:00',
      endTime: entryData.endTime || '09:00',
      batch: entryData.batch || 'FYUGP',
      department: entryData.department || 'Computer Science',
      semesterCycle: entryData.semesterCycle || 'Odd',
      programSemester: entryData.programSemester || 'FYUGP 1st Semester',
      paperCategory: entryData.paperCategory || 'Major',
      notes: entryData.notes || '',
      isSubstitute: entryData.isSubstitute || false,
    };

    setTimetable((prev) => {
      const updated = [...prev, newEntry];
      try {
        localStorage.setItem('classpilot_timetable', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    addTimetableEntryToFirestore(newEntry).catch((err) =>
      console.warn('Firestore add entry background notice:', err)
    );

    try {
      await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      });
    } catch (err) {
      console.error('Failed to add entry via API:', err);
    }
  };

  const handleUpdateEntry = async (id: string, entryData: Partial<TimetableEntry>) => {
    setTimetable((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, ...entryData } : t));
      try {
        localStorage.setItem('classpilot_timetable', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    updateTimetableEntryInFirestore(id, entryData).catch((err) =>
      console.warn('Firestore update entry notice:', err)
    );

    try {
      await fetch(`/api/timetable/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryData),
      });
    } catch (e) {
      console.log('Updated API locally');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    setTimetable((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      try {
        localStorage.setItem('classpilot_timetable', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    await deleteTimetableEntryFromFirestore(id);

    try {
      await fetch(`/api/timetable/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.log('Deleted API locally');
    }
  };

  const handleBulkImport = async (
    entries: Partial<TimetableEntry>[],
    replaceExisting: boolean,
    rawFileData?: { fileName: string; contentBase64?: string; fileSizeBytes?: number }
  ): Promise<{ success: boolean; count?: number; error?: string }> => {
    // 1. Structure each class period entry cleanly
    const formattedEntries: TimetableEntry[] = entries.map((e, idx) => ({
      id: e.id || `tt_import_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      facultyId: e.facultyId || 'fac_1',
      facultyName: e.facultyName || 'Faculty Member',
      subjectCode: e.subjectCode || 'CS101',
      subjectName: e.subjectName || 'Course',
      room: e.room || 'Room No. C1',
      day: e.day || 'Monday',
      startTime: e.startTime || '09:00',
      endTime: e.endTime || '10:15',
      batch: e.batch || 'FYUGP',
      department: e.department || 'Commerce',
      semesterCycle: e.semesterCycle || 'Odd',
      programSemester: e.programSemester || 'FYUGP 1st Semester',
      paperCategory: e.paperCategory || 'Major',
      notes: e.notes || '',
      isSubstitute: e.isSubstitute || false,
    }));

    // 2. Pre-Import Backup of current routine if replacing existing data
    if (replaceExisting && timetable.length > 0) {
      await createRoutineBackupInFirestore({
        id: `bkp_pre_import_${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'pre_import_backup',
        description: `Automatic Safety Snapshot before importing ${rawFileData?.fileName || 'routine spreadsheet'}`,
        totalClasses: timetable.length,
        entriesSnapshot: timetable,
      });
    }

    // 3. Raw File Retention in Firestore
    let rawFileId: string | undefined;
    if (rawFileData) {
      const fileRes = await saveRawRoutineFileToFirestore({
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fileName: rawFileData.fileName,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.name || currentUser?.email || 'Academic Admin',
        fileSizeBytes: rawFileData.fileSizeBytes || 0,
        contentBase64: rawFileData.contentBase64,
      });
      if (fileRes.success) {
        rawFileId = fileRes.fileId;
      }
    }

    // 4. Calculate new full routine dataset
    const newFullRoutine = replaceExisting ? formattedEntries : [...timetable, ...formattedEntries];

    // Persist locally in state and localStorage immediately
    setTimetable(newFullRoutine);
    try {
      localStorage.setItem('classpilot_timetable', JSON.stringify(newFullRoutine));
    } catch (e) {}

    // 5. Write directly to persistent Firestore Database
    const fsResult = await saveTimetableToFirestore(formattedEntries, replaceExisting);

    // Record Version History Log in Firestore
    recordRoutineVersionInFirestore({
      id: `ver_${Date.now()}`,
      timestamp: new Date().toISOString(),
      uploadedBy: currentUser?.name || currentUser?.email || 'Academic Admin',
      fileName: rawFileData?.fileName || 'Routine Upload',
      totalRecords: formattedEntries.length,
      mode: replaceExisting ? 'replace' : 'append',
      changeSummary: replaceExisting
        ? `Replaced timetable with ${formattedEntries.length} new class schedules`
        : `Appended ${formattedEntries.length} new class schedules`,
      rawFileId,
      rawFileName: rawFileData?.fileName,
      entriesSnapshot: newFullRoutine,
    }).catch((e) => console.warn('Version history log notice:', e));

    // Sync memory store on Express backend
    try {
      await fetch('/api/timetable/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: formattedEntries, replaceExisting }),
      });
    } catch (e) {
      console.warn('Backend API import sync notice:', e);
    }

    if (fsResult.success) {
      return { success: true, count: formattedEntries.length };
    } else {
      console.warn('Firestore sync notice:', fsResult.error);
      return { success: true, count: formattedEntries.length, error: fsResult.error };
    }
  };

  const handleRollbackRoutine = async (entriesSnapshot: TimetableEntry[], versionLabel: string) => {
    const res = await rollbackRoutineToSnapshot(
      entriesSnapshot,
      versionLabel,
      currentUser?.email || currentUser?.name || 'Admin'
    );
    if (res.success) {
      setTimetable(entriesSnapshot);
      alert(`✅ Routine Rollback Successful! Restored ${entriesSnapshot.length} class schedules from "${versionLabel}".`);
    } else {
      alert(`❌ Rollback Failed: ${res.error}`);
    }
  };

  const handleCreateManualBackup = async (description: string) => {
    const res = await createRoutineBackupInFirestore({
      id: `bkp_manual_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'manual_snapshot',
      description: description || 'On-Demand Academic Routine Backup',
      totalClasses: timetable.length,
      entriesSnapshot: timetable,
    });
    if (res.success) {
      alert(`✅ Manual Backup Snapshot Created! ${timetable.length} class entries archived.`);
    } else {
      alert(`❌ Backup Creation Failed: ${res.error}`);
    }
  };

  const handleAddFaculty = (fac: Partial<Faculty>) => {
    const newFac: Faculty = {
      id: fac.id || `fac_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: fac.name || 'New Faculty',
      email: fac.email || 'faculty@college.edu',
      department: fac.department || 'Computer Science',
      designation: fac.designation || 'Lecturer',
      phone: fac.phone || (fac as any).whatsappPhone || '',
      employeeId: fac.employeeId || '',
      isVerified: true,
    };

    setFacultyList((prev) => {
      // Avoid duplicate faculty by ID or email
      if (prev.some((f) => f.id === newFac.id || (newFac.email && f.email.toLowerCase() === newFac.email.toLowerCase()))) {
        return prev;
      }
      const updated = [...prev, newFac];
      try {
        localStorage.setItem('classpilot_faculty_list', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // Save to Firestore Database
    saveFacultyToFirestore(newFac).catch((e) => console.warn('Firestore faculty save notice:', e));

    // Sync with Express backend
    fetch('/api/faculty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFac),
    }).catch((e) => console.warn('Express faculty sync notice:', e));
  };

  const handleUpdateFaculty = (facId: string, updatedData: Partial<Faculty>) => {
    setFacultyList((prev) => {
      const oldFac = prev.find((f) => f.id === facId);
      const oldName = oldFac?.name;

      const updated = prev.map((f) => {
        if (f.id === facId) {
          return {
            ...f,
            ...updatedData,
            phone: updatedData.phone || (updatedData as any).whatsappPhone || f.phone,
            whatsappPhone: updatedData.whatsappPhone || updatedData.phone || f.whatsappPhone,
          };
        }
        return f;
      });

      try {
        localStorage.setItem('classpilot_faculty_list', JSON.stringify(updated));
      } catch (e) {}

      // If faculty name changed, synchronize name across active timetable routine entries
      if (updatedData.name && oldName && updatedData.name.trim() !== oldName.trim()) {
        const newName = updatedData.name.trim();
        setTimetable((prevTT) => {
          const updatedTT = prevTT.map((item) => {
            if (item.facultyId === facId || item.facultyName.toLowerCase().trim() === oldName.toLowerCase().trim()) {
              return { ...item, facultyName: newName };
            }
            return item;
          });
          try {
            localStorage.setItem('classpilot_timetable', JSON.stringify(updatedTT));
          } catch (e) {}
          saveTimetableToFirestore(updatedTT, true).catch((e) => console.warn('Sync timetable faculty name error:', e));
          return updatedTT;
        });
      }

      const updatedFacObj = updated.find((f) => f.id === facId);
      if (updatedFacObj) {
        saveFacultyToFirestore(updatedFacObj).catch((e) => console.warn('Firestore faculty update notice:', e));

        fetch(`/api/faculty/${facId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedFacObj),
        }).catch((e) => console.warn('Express faculty update notice:', e));
      }

      return updated;
    });
  };

  const handleDeleteFaculty = (facId: string) => {
    setFacultyList((prev) => {
      const updated = prev.filter((f) => f.id !== facId);
      try {
        localStorage.setItem('classpilot_faculty_list', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    deleteFacultyFromFirestore(facId).catch((e) => console.warn('Firestore faculty delete notice:', e));
  };

  const handleClearAllFaculty = () => {
    setFacultyList([]);
    try {
      localStorage.setItem('classpilot_faculty_list', JSON.stringify([]));
    } catch (e) {}
    clearAllFacultyInFirestore().catch((e) => console.warn('Firestore clear faculty notice:', e));
  };

  const handleAddRoom = (rm: Partial<Room>) => {
    const newRm: Room = {
      id: rm.id || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: rm.name || 'Room X',
      building: rm.building || 'Block A',
      floor: rm.floor || 1,
      capacity: rm.capacity || 50,
      type: rm.type || 'Lecture Hall',
      equipment: rm.equipment || [],
    };

    setRoomList((prev) => {
      if (prev.some((r) => r.id === newRm.id || r.name.toLowerCase() === newRm.name.toLowerCase())) {
        return prev;
      }
      const updated = [...prev, newRm];
      try {
        localStorage.setItem('classpilot_room_list', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // Save to Firestore Database
    saveRoomToFirestore(newRm).catch((e) => console.warn('Firestore room save notice:', e));

    // Sync with Express backend
    fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRm),
    }).catch((e) => console.warn('Express room sync notice:', e));
  };

  const handleResetData = () => {
    fetch('/api/reset', { method: 'POST' }).catch(() => {});
    setFacultyList([...INITIAL_FACULTY]);
    setRoomList([...INITIAL_ROOMS]);
    setTimetable([...INITIAL_TIMETABLE]);
    handleResetToRealTime();
  };

  const handleToggleUserAdminRole = (userEmail: string, makeAdmin: boolean) => {
    setFacultyList((prev) =>
      prev.map((f) => {
        if (f.email.toLowerCase() === userEmail.toLowerCase()) {
          return { ...f, role: makeAdmin ? 'admin' : 'faculty' };
        }
        return f;
      })
    );
    if (currentUser && currentUser.email.toLowerCase() === userEmail.toLowerCase()) {
      const updatedUser: User = { ...currentUser, role: makeAdmin ? 'admin' : 'faculty' };
      setCurrentUser(updatedUser);
      localStorage.setItem('classpilot_user_session', JSON.stringify(updatedUser));
    }
  };

  const currentFaculty = facultyList.find((f) => f.id === selectedFacultyId) || facultyList[0];
  const unreadAlertsCount = notifications.filter((n) => !n.read).length;

  // Render Landing Page if no active user session
  if (!currentUser) {
    return (
      <LandingPage
        currentUser={currentUser}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
        onGoToDashboard={() => setActiveTab('schedule')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      {/* Header */}
      <Header
        currentUser={currentUser}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
        simulatedTimeStr={formatTime24H(currentDate)}
        isSimulated={isSimulated}
        onOpenInstallModal={() => setIsPwaModalOpen(true)}
        unreadCount={unreadAlertsCount}
      />

      {/* Demo Time Control Bar ("Time Traveler") */}
      <DemoTimeBar
        currentDate={currentDate}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        isSimulated={isSimulated}
        onAdvanceMinutes={handleAdvanceMinutes}
        onSetCustomTime={handleSetCustomTime}
        onResetToRealTime={handleResetToRealTime}
        onJumpToNextClass10Mins={handleJumpToNextClass10Mins}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Dashboard Analytics & Summary Header */}
        <DashboardAnalytics
          currentUser={currentUser}
          timetable={timetable}
          onNavigateTab={setActiveTab}
        />

        {/* Top Countdown Widget */}
        <CountdownWidget
          entries={timetable}
          facultyId={selectedFacultyId}
          facultyName={currentFaculty?.name || 'Faculty Member'}
          currentDate={currentDate}
          selectedDay={selectedDay}
          onTestTriggerAlert={(entry) => trigger10MinAlert(entry, 10)}
        />

        {/* Tab 1: Faculty Schedule */}
        {activeTab === 'schedule' && (
          <FacultySchedule
            timetable={timetable}
            facultyList={facultyList}
            selectedFacultyId={selectedFacultyId}
            onSelectFaculty={setSelectedFacultyId}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            currentDate={currentDate}
            onTriggerAlert={(entry) => trigger10MinAlert(entry, 10)}
            currentUser={currentUser}
            onNavigateToDiary={(entry) => {
              setSelectedClassForDiary(entry);
              setActiveTab('diary');
            }}
            students={students}
          />
        )}

        {/* Tab 2: Class Diary & Syllabus Tracker */}
        {activeTab === 'diary' && (
          <ClassDiaryView
            currentUser={currentUser}
            timetable={timetable}
            selectedClassForDiary={selectedClassForDiary}
            students={students}
            faculties={facultyList}
          />
        )}

        {/* Tab 3: Google Calendar Agenda & School Bell */}
        {activeTab === 'calendar' && (
          <GoogleCalendarView
            currentUser={currentUser}
            timetable={timetable}
            onTriggerAlarm={(title, room, startTime) => triggerSchoolBellAlarm(title, room, startTime)}
          />
        )}

        {/* Tab 4: Compliance & Research Portfolio */}
        {activeTab === 'compliance' && (
          <ComplianceResearchView
            currentUser={currentUser}
          />
        )}

        {/* Tab 5: Room Occupancy Finder */}
        {activeTab === 'rooms' && (
          <RoomFinder
            rooms={roomList}
            timetable={timetable}
            currentDate={currentDate}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}


        {/* Tab 3: Admin Timetable Upload & Management */}
        {activeTab === 'admin' && (
          <AdminTimetable
            currentUser={currentUser}
            timetable={timetable}
            facultyList={facultyList}
            roomList={roomList}
            students={students}
            routineVersions={routineVersions}
            routineBackups={routineBackups}
            onUpdateStudents={handleUpdateStudents}
            onAddEntry={handleAddEntry}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onBulkImport={handleBulkImport}
            onRollbackRoutine={handleRollbackRoutine}
            onCreateManualBackup={handleCreateManualBackup}
            onAddFaculty={handleAddFaculty}
            onUpdateFaculty={handleUpdateFaculty}
            onDeleteFaculty={handleDeleteFaculty}
            onClearAllFaculty={handleClearAllFaculty}
            onAddRoom={handleAddRoom}
            onResetData={handleResetData}
            onToggleUserAdminRole={handleToggleUserAdminRole}
          />
        )}

        {/* Tab 4: Alert Notification History Logs */}
        {activeTab === 'alerts' && (
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700/80 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bell className="w-5 h-5 text-amber-400" />
                <h3 className="font-heading font-bold text-xl text-white">
                  Automated Class Alert Logs
                </h3>
              </div>

              {notifications.length > 0 && (
                <button
                  onClick={() => setNotifications([])}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-2 border border-dashed border-slate-700 rounded-2xl bg-slate-900/40">
                <Bell className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">No alert logs recorded yet.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Use the &quot;Test 10-Min Alert&quot; button in the top Demo Bar or schedule classes to see alerts fire!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className="p-4 bg-slate-900/90 rounded-2xl border border-slate-700 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-amber-300">{notif.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{notif.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-300">{notif.message}</p>
                      <div className="text-[11px] text-blue-300 font-medium flex items-center space-x-2">
                        <span>Room: {notif.room}</span>
                        <span>•</span>
                        <span>Time: {notif.startTime}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Active Toast / Popup Alert Banner */}
      <AlertBanner
        notifications={notifications}
        onDismiss={(id) => {
          setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        }}
        onClearAll={() => setNotifications([])}
        onSelectRoom={(roomName) => {
          setActiveTab('rooms');
        }}
      />

      {/* Modals */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        currentUser={currentUser}
        onSelectUser={(user) => {
          setCurrentUser(user);
          if (user.facultyId) {
            setSelectedFacultyId(user.facultyId);
          }
        }}
        onLoginCustomEmail={(email, role) => {
          const user: User = {
            id: `user_${Date.now()}`,
            name: email.split('@')[0],
            email,
            role,
            facultyId: facultyList[0]?.id || 'fac_1',
            department: 'Computer Science',
          };
          setCurrentUser(user);
        }}
      />

      <PwaInstallModal
        isOpen={isPwaModalOpen}
        onClose={() => setIsPwaModalOpen(false)}
        isInstallable={!!deferredInstallPrompt}
        onPromptInstall={() => {
          if (deferredInstallPrompt) {
            (deferredInstallPrompt as { prompt: () => void }).prompt();
          } else {
            alert('To install this PWA app, tap "Add to Home Screen" or "Install" in your browser menu!');
          }
        }}
      />

      {/* School Bell Active Alarm Modal */}
      <AlarmModal
        activeAlarm={activeAlarm}
        onStop={handleStopAlarm}
        onSnooze={handleSnoozeAlarm}
      />

      {/* Subtle Sync Status Footer */}
      <FooterSyncStatus
        timetableCount={timetable.length}
        facultyCount={facultyList.length}
        studentCount={students.length}
        onRefreshData={() => {
          fetch('/api/timetable').then(r => r.json()).then(d => Array.isArray(d) && setTimetable(d)).catch(e => {});
          fetch('/api/faculty').then(r => r.json()).then(d => Array.isArray(d) && setFacultyList(d)).catch(e => {});
          fetch('/api/students').then(r => r.json()).then(d => Array.isArray(d) && setStudents(d)).catch(e => {});
        }}
      />
    </div>
  );
}

