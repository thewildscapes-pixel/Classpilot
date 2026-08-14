import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  FacultySelfImportRecord,
  QREnrollmentSession,
  StudentEnrollment,
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
  getTimetableFromFirestore,
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
  subscribeToFacultySelfImportsRealtime,
  getFacultySelfImportsFromFirestore,
  subscribeToQREnrollmentSessionsRealtime,
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
import { PublicStudentEnrollmentPage } from './components/PublicStudentEnrollmentPage';
import { ClassDiaryView } from './components/ClassDiaryView';
import { GoogleCalendarView } from './components/GoogleCalendarView';
import { ComplianceResearchView } from './components/ComplianceResearchView';
import { DashboardAnalytics } from './components/DashboardAnalytics';
import { AlarmModal } from './components/AlarmModal';
import { SleepModeAlarmModal } from './components/SleepModeAlarmModal';
import { sendLocalClassNotification } from './utils/calendarSyncUtils';
import { FooterSyncStatus } from './components/FooterSyncStatus';
import { ActiveAlarm } from './types';


import { Bell, Clock, Trash2, MapPin, CheckCircle, Volume2, Shield } from 'lucide-react';

// Helper to extract student self-enrollment token from any URL structure (query params, hash, path)
function getEnrollTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Check window.location.search (?enrollToken=... or ?token=... or ?enroll=... or ?sessionId=... or ?classId=... or ?qr=...)
    let params = new URLSearchParams(window.location.search);
    let tok = params.get('enrollToken') || params.get('token') || params.get('enroll') || params.get('sessionId') || params.get('classId') || params.get('qr') || params.get('scan');
    if (tok) return tok;

    const action = params.get('action');
    if (action === 'student-enroll' || action === 'enroll') {
      return params.get('sessionId') || params.get('classId') || 'public_qr_session';
    }

    // 2. Check window.location.hash (#/?enrollToken=... or #/enroll/...)
    if (window.location.hash) {
      const hashStr = window.location.hash;
      const qIndex = hashStr.indexOf('?');
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hashStr.substring(qIndex));
        tok = hashParams.get('enrollToken') || hashParams.get('token') || hashParams.get('enroll') || hashParams.get('sessionId') || hashParams.get('classId') || hashParams.get('qr') || hashParams.get('scan');
        if (tok) return tok;
      }
      if (hashStr.includes('/enroll/') || hashStr.includes('/qr/')) {
        const parts = hashStr.split(/[/](?:enroll|qr)[/]/);
        if (parts[1]) return parts[1].split('?')[0];
      }
    }

    // 3. Check window.location.pathname (/enroll/token_123 or /qr/token_123)
    const path = window.location.pathname;
    if (path.includes('/enroll/') || path.includes('/qr/')) {
      const parts = path.split(/[/](?:enroll|qr)[/]/);
      if (parts[1]) return parts[1].split('?')[0];
    }
  } catch (e) {
    console.warn('Error parsing URL for enroll token:', e);
  }

  return null;
}

export default function App() {
  // --- STATE MANAGEMENT ---
  const [enrollToken, setEnrollToken] = useState<string | null>(() => getEnrollTokenFromUrl());

  // Listen for dynamic URL changes (e.g. scanning QR codes or clicking shared links)
  useEffect(() => {
    const handleUrlChange = () => {
      const tok = getEnrollTokenFromUrl();
      if (tok) {
        setEnrollToken(tok);
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  const [qrSessions, setQrSessions] = useState<QREnrollmentSession[]>([]);

  useEffect(() => {
    const unsub = subscribeToQREnrollmentSessionsRealtime((sessions) => {
      setQrSessions(sessions);
    });
    return () => unsub();
  }, []);

  const [facultyList, setFacultyList] = useState<Faculty[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_faculty_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.filter((f: Faculty) => {
            if (!f || !f.name) return false;
            const lower = f.name.toLowerCase().trim();
            return (
              !lower.includes('test') &&
              lower !== 'faculty member' &&
              lower !== 'dr. faculty member' &&
              lower !== 'dr faculty member' &&
              f.id !== 'fac_1' &&
              f.id !== 'fac_2' &&
              f.id !== 'fac_3'
            );
          });
          return cleaned;
        }
      }
    } catch (e) {}
    return INITIAL_FACULTY;
  });

  const [roomList, setRoomList] = useState<Room[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_room_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.filter((r: Room) => !['rm_1', 'rm_2', 'rm_3', 'rm_4', 'rm_5'].includes(r.id));
          return cleaned;
        }
      }
    } catch (e) {}
    return INITIAL_ROOMS;
  });
  // Routine timetable loaded exclusively from central cloud database (Firestore / Express API)
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_students');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.filter((s: Student) => !['st_1', 'st_2', 'st_3', 'st_4', 'st_5', 'st_6', 'st_7', 'st_8'].includes(s.id));
          return cleaned;
        }
      }
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
    return '';
  });

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'schedule' | 'diary' | 'calendar' | 'compliance' | 'rooms' | 'admin' | 'alerts'>('schedule');

  // School Bell Active Alarm modal state
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm>({ isRinging: false });
  const [isSleepAlarmModalOpen, setIsSleepAlarmModalOpen] = useState<boolean>(false);

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


  // Helper to resolve and link faculty record with step-by-step verification logging
  const resolveFacultyForUser = (user: User, facList: Faculty[], currentTimetable: TimetableEntry[] = []): User => {
    const rawName = user.name || '';
    const rawEmail = user.email || '';
    const rawPhone = user.phone || '';
    const rawWhatsapp = user.whatsappPhone || '';
    const rawFacultyId = user.facultyId || '';

    const cleanEmail = rawEmail.toLowerCase().trim();
    const cleanPhone = rawPhone.trim().replace(/\D/g, '');
    const cleanWhatsapp = rawWhatsapp.trim().replace(/\D/g, '');

    console.group(`[FacultyLookup] Resolving Faculty linkage for user: "${rawName}"`);
    console.log(`[FacultyLookup] Raw User Inputs:`, {
      name: rawName,
      email: rawEmail,
      phone: rawPhone,
      whatsappPhone: rawWhatsapp,
      facultyId: rawFacultyId,
      role: user.role,
    });
    console.log(`[FacultyLookup] Cleaned Matching Criteria:`, {
      cleanEmail,
      cleanPhone,
      cleanWhatsapp,
    });
    console.log(`[FacultyLookup] Total Faculty Records in Database: ${facList?.length || 0}`);

    let matched: Faculty | undefined = undefined;

    if (facList && facList.length > 0) {
      // Step 1: Direct ID Match
      if (rawFacultyId) {
        matched = facList.find((f) => f.id === rawFacultyId);
      }

      // Step 2: Strict Case-Insensitive Email Match
      if (!matched && cleanEmail) {
        matched = facList.find((f) => f.email && f.email.toLowerCase().trim() === cleanEmail);
      }

      // Step 3: Phone / WhatsApp Match
      if (!matched && (cleanPhone || cleanWhatsapp)) {
        matched = facList.find(
          (f) =>
            isPhoneMatch(f.phone, cleanPhone) ||
            isPhoneMatch(f.whatsappPhone, cleanPhone) ||
            isPhoneMatch(f.phone, cleanWhatsapp) ||
            isPhoneMatch(f.whatsappPhone, cleanWhatsapp)
        );
      }

      // Step 4: Name Match (Case-insensitive & Token Match)
      if (!matched && rawName) {
        matched = facList.find((f) => f.name && isFacultyNameMatch(f.name, rawName));
      }
    }

    // Step 5: Check Central Timetable Entries for matching faculty identity
    if (!matched && currentTimetable && currentTimetable.length > 0 && rawName) {
      const ttMatch = currentTimetable.find(
        (e) => e.facultyName && isFacultyNameMatch(e.facultyName, rawName)
      );
      if (ttMatch) {
        console.log(`[FacultyLookup] -> Step 5 MATCH FOUND in Central Timetable! Found: "${ttMatch.facultyName}" (ID: "${ttMatch.facultyId}")`);
        matched = {
          id: ttMatch.facultyId || `fac_${Date.now()}`,
          name: ttMatch.facultyName,
          email: cleanEmail || user.email || '',
          department: ttMatch.department || user.department || 'Commerce',
          designation: 'Faculty Member',
          isVerified: true,
        };
      }
    }

    if (matched) {
      console.log(
        `[FacultyLookup] SUCCESS: Verified linkage for user "${rawName}". Linked to Faculty ID "${matched.id}" (${matched.name}, Dept: ${matched.department || 'N/A'})`
      );
      console.groupEnd();
      return {
        ...user,
        facultyId: matched.id,
        name: user.name || matched.name,
        department: user.department || matched.department,
      };
    } else {
      // If user logs in as faculty/admin and no existing faculty matched, dynamically register clean profile
      if ((user.role === 'faculty' || user.role === 'admin') && (rawName || cleanEmail)) {
        const cleanFacName = rawName || user.name || 'Faculty Member';
        const cleanFacId = rawFacultyId && rawFacultyId !== 'fac_2' && rawFacultyId !== 'fac_3'
          ? rawFacultyId
          : `fac_${Date.now()}`;

        const newFacultyProfile: Faculty = {
          id: cleanFacId,
          name: cleanFacName,
          email: cleanEmail || user.email || '',
          phone: cleanPhone || user.phone || '',
          whatsappPhone: cleanWhatsapp || user.whatsappPhone || cleanPhone || '',
          department: user.department || 'Commerce',
          designation: 'Faculty Member',
          isVerified: true,
        };

        setFacultyList((prev) => {
          const exists = prev.some((f) => f.id === cleanFacId || f.name.toLowerCase().trim() === cleanFacName.toLowerCase().trim());
          if (!exists) {
            const updated = [...prev, newFacultyProfile];
            try {
              localStorage.setItem('classpilot_faculty_list', JSON.stringify(updated));
            } catch (e) {}
            saveFacultyToFirestore(newFacultyProfile).catch(() => {});
            return updated;
          }
          return prev;
        });

        console.log(`[FacultyLookup] Registered new clean faculty profile for "${cleanFacName}" (ID: ${cleanFacId})`);
        console.groupEnd();
        return {
          ...user,
          facultyId: cleanFacId,
          name: cleanFacName,
          department: user.department || newFacultyProfile.department,
        };
      }

      console.warn(
        `[FacultyLookup] Could not link user "${rawName}" (Email: "${rawEmail}", Phone: "${rawPhone}") to any existing faculty. Retaining default user state.`
      );
      console.groupEnd();
      return user;
    }
  };

  // Login handler from Landing Page or Modal
  const handleLoginSuccess = (user: User, token?: string) => {
    const resolvedUser = resolveFacultyForUser(user, facultyList, timetable);
    setCurrentUser(resolvedUser);
    if (resolvedUser.facultyId) {
      setSelectedFacultyId(resolvedUser.facultyId);
    }
    // Sync profile to Firestore
    saveUserProfileInFirestore(resolvedUser).catch((err) => console.warn('Firestore profile sync error:', err));
    try {
      localStorage.setItem('classpilot_user_session', JSON.stringify(resolvedUser));
      if (token) localStorage.setItem('classpilot_user_token', token);
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
    setIsLoginModalOpen(false);
  };

  // Explicit Logout handler (Does NOT wipe central routine database!)
  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedFacultyId('');
    firebaseSignOut().catch((e) => console.warn('Firebase signout:', e));
    try {
      localStorage.removeItem('classpilot_user_session');
      localStorage.removeItem('lecturapulse_user_session');
    } catch (e) {
      console.warn('LocalStorage remove item failed:', e);
    }
  };

  // --- FIREBASE AUTH STATE LISTENER & SESSION PERSISTENCE ---
  useEffect(() => {
    const unsubscribeAuth = listenToAuthChanges((fbAppUser) => {
      if (fbAppUser) {
        console.log('[AuthPersistence] Firebase auth re-synced session for user:', fbAppUser.email);
        const resolvedUser = resolveFacultyForUser(fbAppUser, facultyList, timetable);
        setCurrentUser(resolvedUser);
        if (resolvedUser.facultyId) {
          setSelectedFacultyId(resolvedUser.facultyId);
        }
        try {
          localStorage.setItem('classpilot_user_session', JSON.stringify(resolvedUser));
        } catch (e) {
          console.warn('LocalStorage save error:', e);
        }
      } else {
        console.log('[AuthPersistence] Firebase auth state: No user signed in.');
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, [facultyList, timetable]);

  // Auto-sync logged-in currentUser with facultyList to ensure facultyId points directly to their official routine
  useEffect(() => {
    if (!currentUser) return;

    const resolvedUser = resolveFacultyForUser(currentUser, facultyList, timetable);

    if (resolvedUser.facultyId !== currentUser.facultyId) {
      console.log(
        `[FacultySyncEffect] Updating currentUser.facultyId from "${currentUser.facultyId}" to "${resolvedUser.facultyId}"`
      );
      setCurrentUser(resolvedUser);
      try {
        localStorage.setItem('classpilot_user_session', JSON.stringify(resolvedUser));
      } catch (e) {}
    }

    if (resolvedUser.facultyId && selectedFacultyId !== resolvedUser.facultyId && currentUser.role === 'faculty') {
      setSelectedFacultyId(resolvedUser.facultyId);
    }
  }, [currentUser, facultyList, timetable]);

  // Time & Demo Simulation
  const [realTimeOffsetMs, setRealTimeOffsetMs] = useState<number>(0);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(getCurrentDayName(new Date()));

  // Central Database Sync Status Indicator ('synced' | 'syncing' | 'offline')
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('syncing');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

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

  // Faculty Self-Import Records State
  const [facultySelfImports, setFacultySelfImports] = useState<FacultySelfImportRecord[]>([]);

  // Realtime subscription for Faculty Self-Imports
  useEffect(() => {
    const unsubscribe = subscribeToFacultySelfImportsRealtime((records) => {
      console.log(`[App.tsx] Realtime listener received ${records.length} faculty self-import records.`);
      setFacultySelfImports(records);
    });
    return () => unsubscribe();
  }, []);

  const handleFacultySelfImportSuccess = (entries: TimetableEntry[], record: FacultySelfImportRecord) => {
    console.log(`[App.tsx] Faculty self-import success: ${entries.length} entries for ${record.facultyName}`);
    setFacultySelfImports((prev) => {
      const filtered = prev.filter((r) => r.id !== record.id && r.facultyId !== record.facultyId);
      return [record, ...filtered];
    });

    setTimetable((prev) => {
      const nonSelfEntries = prev.filter(
        (e) => e.facultyId !== record.facultyId && !isFacultyNameMatch(e.facultyName, record.facultyName)
      );
      const updated = [...nonSelfEntries, ...entries];
      try {
        localStorage.setItem('classpilot_timetable', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Central Database Sync Engine (Fetches directly from central server API)
  const syncCentralDatabase = useCallback(async () => {
    const timeStr = new Date().toLocaleTimeString();
    console.log(`[CentralSync @ ${timeStr}] Starting database fetch check...`);

    // 1. Fetch /api/timetable with Cloud Firestore fallback
    let fetched = false;
    try {
      const res = await fetch('/api/timetable');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          console.log(`[CentralSync] Endpoint '/api/timetable': HTTP 200 OK — Loaded ${data.length} routine entries.`);
          setTimetable(data);
          try {
            localStorage.setItem('classpilot_timetable', JSON.stringify(data));
          } catch (e) {}
          setSyncStatus('synced');
          setLastSyncTime(new Date());
          fetched = true;
        }
      }
    } catch (err: any) {
      console.warn(`[CentralSync] Endpoint '/api/timetable' fetch network note: ${err.message || err}`);
    }

    if (!fetched) {
      try {
        const fsEntries = await getTimetableFromFirestore();
        if (Array.isArray(fsEntries) && fsEntries.length > 0) {
          console.log(`[CentralSync] Cloud Firestore fallback — Loaded ${fsEntries.length} routine entries.`);
          setTimetable(fsEntries);
          try {
            localStorage.setItem('classpilot_timetable', JSON.stringify(fsEntries));
          } catch (e) {}
          setSyncStatus('synced');
          setLastSyncTime(new Date());
        }
      } catch (e) {
        console.warn('[CentralSync] Firestore fallback note:', e);
      }
    }

    // 2. Fetch /api/faculty
    fetch('/api/faculty')
      .then(async (r) => {
        if (!r.ok) {
          console.warn(`[CentralSync] Endpoint '/api/faculty': HTTP ${r.status} (${r.statusText})`);
          return;
        }
        const facData = await r.json();
        if (Array.isArray(facData) && facData.length > 0) {
          console.log(`[CentralSync] Endpoint '/api/faculty': HTTP 200 OK — Loaded ${facData.length} faculty members.`);
          setFacultyList(facData);
        } else {
          console.warn(`[CentralSync] Endpoint '/api/faculty': Returned empty or non-array data.`, facData);
        }
      })
      .catch((err) => console.warn(`[CentralSync] Endpoint '/api/faculty' fetch exception: ${err.message || err}`));

    // 3. Fetch /api/rooms
    fetch('/api/rooms')
      .then(async (r) => {
        if (!r.ok) {
          console.warn(`[CentralSync] Endpoint '/api/rooms': HTTP ${r.status} (${r.statusText})`);
          return;
        }
        const rmData = await r.json();
        if (Array.isArray(rmData) && rmData.length > 0) {
          console.log(`[CentralSync] Endpoint '/api/rooms': HTTP 200 OK — Loaded ${rmData.length} rooms.`);
          setRoomList(rmData);
        } else {
          console.warn(`[CentralSync] Endpoint '/api/rooms': Returned empty or non-array data.`, rmData);
        }
      })
      .catch((err) => console.warn(`[CentralSync] Endpoint '/api/rooms' fetch exception: ${err.message || err}`));

    // 4. Fetch /api/students
    fetch('/api/students')
      .then(async (r) => {
        if (!r.ok) {
          console.warn(`[CentralSync] Endpoint '/api/students': HTTP ${r.status} (${r.statusText})`);
          return;
        }
        const stData = await r.json();
        if (Array.isArray(stData) && stData.length > 0) {
          console.log(`[CentralSync] Endpoint '/api/students': HTTP 200 OK — Loaded ${stData.length} student records.`);
          setStudents(stData);
        } else {
          console.warn(`[CentralSync] Endpoint '/api/students': Returned empty or non-array data.`, stData);
        }
      })
      .catch((err) => console.warn(`[CentralSync] Endpoint '/api/students' fetch exception: ${err.message || err}`));
  }, []);

  // --- FETCH CENTRAL BACKEND DATA ON MOUNT & REALTIME FIRESTORE TIMETABLE ---
  useEffect(() => {
    // Initial fetch from central cloud database
    syncCentralDatabase();

    // Background multi-device sync poll (every 4 seconds)
    const pollTimer = setInterval(() => {
      syncCentralDatabase();
    }, 4000);

    // Firestore Real-Time Timetable Listener
    const unsubscribeTimetable = subscribeToTimetableRealtime((entries) => {
      if (Array.isArray(entries) && entries.length > 0) {
        console.log(`[FirestoreRealtime] Listener received ${entries.length} routine records from Cloud Firestore.`);
        setTimetable(entries);
        setSyncStatus('synced');
        setLastSyncTime(new Date());
        try {
          localStorage.setItem('classpilot_timetable', JSON.stringify(entries));
        } catch (e) {}
        checkAndTriggerAutomatedDailyBackup(entries).catch((err) =>
          console.warn('Auto backup trigger notice:', err)
        );
        // Best-effort sync to Express SQLite server
        fetch('/api/timetable/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries, replaceExisting: true }),
        }).catch((e) => {});
      } else {
        console.warn(`[FirestoreRealtime] Listener returned empty snapshot or 0 entries. Triggering syncCentralDatabase fallback...`);
        syncCentralDatabase();
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
      if (Array.isArray(list) && list.length > 0) {
        setFacultyList(list);
        try {
          localStorage.setItem('classpilot_faculty_list', JSON.stringify(list));
        } catch (e) {}
      }
    });

    const unsubscribeRooms = subscribeToRoomsRealtime(INITIAL_ROOMS, (list) => {
      if (Array.isArray(list) && list.length > 0) {
        setRoomList(list);
        try {
          localStorage.setItem('classpilot_room_list', JSON.stringify(list));
        } catch (e) {}
      }
    });

    // Listen for PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    });

    // Request Browser Notification permissions check
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }

    return () => {
      clearInterval(pollTimer);
      unsubscribeTimetable();
      unsubscribeVersions();
      unsubscribeBackups();
      unsubscribeFaculty();
      unsubscribeRooms();
    };
  }, [syncCentralDatabase]);

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
      // Find matching registered faculty profile in facultyList using enhanced isFacultyNameMatch
      const matched = facultyList.find(
        (f) =>
          isFacultyNameMatch(f.name, entry.facultyName) ||
          (f.email && entry.facultyName && f.email.toLowerCase().startsWith(entry.facultyName.toLowerCase()))
      );

      if (matched && (entry.facultyId !== matched.id || entry.facultyName !== matched.name)) {
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
      saveTimetableToFirestore(reconciled, false).catch(() => {});
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

  // --- RESOLVED ACTIVE FACULTY ---
  const currentFaculty = useMemo(() => {
    return facultyList.find((f) => f.id === selectedFacultyId) ||
      (currentUser?.facultyId ? facultyList.find((f) => f.id === currentUser.facultyId) : undefined) ||
      facultyList[0];
  }, [facultyList, selectedFacultyId, currentUser]);

  // --- AUTOMATED 10-MINUTE ALERT CHECKER ENGINE ---
  useEffect(() => {
    const currentMin = currentDate.getHours() * 60 + currentDate.getMinutes();
    const targetFacId = selectedFacultyId || currentUser?.facultyId;
    const targetFacName = currentFaculty?.name || currentUser?.name;

    // Check timetable entries for selected day (scoped to concerned faculty if viewing specific faculty)
    timetable.forEach((entry) => {
      if (entry.day !== selectedDay) return;

      if (targetFacId && targetFacId !== 'all') {
        const matchesId = entry.facultyId === targetFacId;
        const matchesName = targetFacName && isFacultyNameMatch(entry.facultyName, targetFacName);
        if (!matchesId && !matchesName) return;
      }

      const startMin = parseTimeToMinutes(entry.startTime);
      const diffMins = startMin - currentMin;

      // Trigger 10-minute alert if class starts in 10 minutes (diffMins === 10 or <= 10 and >= 0)
      const alertKey = `${entry.id}_10m_${selectedDay}_${currentDate.getFullYear()}_${currentDate.getMonth()}_${currentDate.getDate()}_${startMin}`;

      if (diffMins >= 0 && diffMins <= 10 && !triggeredAlertIds.current.has(alertKey)) {
        triggeredAlertIds.current.add(alertKey);
        trigger10MinAlert(entry, diffMins);
      }
    });
  }, [currentDate, selectedDay, timetable, selectedFacultyId, currentUser, currentFaculty]);

  // Function to fire 10-min alert
  const trigger10MinAlert = (entry: TimetableEntry, minsRemaining: number) => {
    playAlertChime();
    triggerSchoolBellAlarm(entry.subjectName, entry.room, entry.startTime);

    const title = minsRemaining === 0 ? `⏰ Class Starting Now!` : `🔔 Class Alert: ${minsRemaining}m Remaining!`;
    const message = `"${entry.subjectName}" (${entry.subjectCode}) in ${entry.room} for ${entry.batch}`;

    // Send local OS screen notification if permission granted
    sendLocalClassNotification(title, message);

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
    // Find next upcoming class for selected faculty (or logged-in faculty) on selected day
    const currentMin = currentDate.getHours() * 60 + currentDate.getMinutes();
    const targetFacId = selectedFacultyId || currentUser?.facultyId;
    const targetFacName = currentFaculty?.name || currentUser?.name;

    const upcoming = timetable
      .filter((e) => {
        if (e.day !== selectedDay) return false;
        if (targetFacId && targetFacId !== 'all') {
          const matchesId = e.facultyId === targetFacId;
          const matchesName = targetFacName && isFacultyNameMatch(e.facultyName, targetFacName);
          return matchesId || matchesName;
        }
        return true;
      })
      .map((e) => ({ ...e, startMin: parseTimeToMinutes(e.startTime) }))
      .filter((e) => e.startMin > currentMin)
      .sort((a, b) => a.startMin - b.startMin)[0];

    if (!upcoming) {
      alert(`No upcoming class found for ${targetFacName || 'faculty'} on ${selectedDay}. Try selecting a different day or faculty member!`);
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
    const nowIso = new Date().toISOString();
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
      createdAt: entryData.createdAt || nowIso,
      updatedAt: nowIso,
      lastSyncedAt: nowIso,
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
    const nowIso = new Date().toISOString();
    const patch = {
      ...entryData,
      updatedAt: nowIso,
      lastSyncedAt: nowIso,
    };

    setTimetable((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      try {
        localStorage.setItem('classpilot_timetable', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    updateTimetableEntryInFirestore(id, patch).catch((err) =>
      console.warn('Firestore update entry notice:', err)
    );

    try {
      await fetch(`/api/timetable/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
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
    // 1. Structure each class period entry & auto-link to faculty members
    const updatedFacultyList = [...facultyList];
    const createdNewFacultyList: Faculty[] = [];

    const formattedEntries: TimetableEntry[] = entries.map((e, idx) => {
      const rawFacName = (e.facultyName || '').trim();
      let matchedFac = updatedFacultyList.find(
        (f) =>
          (e.facultyId && f.id === e.facultyId) ||
          (rawFacName && isFacultyNameMatch(f.name, rawFacName)) ||
          (f.email && rawFacName && f.email.toLowerCase().startsWith(rawFacName.toLowerCase()))
      );

      // Auto-register faculty into faculty database if not currently existing
      if (!matchedFac && rawFacName && rawFacName.toLowerCase() !== 'faculty member' && rawFacName.toLowerCase() !== 'unassigned') {
        const newFacId = `fac_auto_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
        matchedFac = {
          id: newFacId,
          name: rawFacName,
          email: `${rawFacName.toLowerCase().replace(/[^a-z0-9]/g, '')}@college.edu`,
          department: e.department || 'Commerce',
          designation: 'Faculty Member',
          phone: '',
          employeeId: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
          isVerified: true,
        };
        updatedFacultyList.push(matchedFac);
        createdNewFacultyList.push(matchedFac);
      }

      const nowIso = new Date().toISOString();
      return {
        id: e.id || `tt_import_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        facultyId: matchedFac ? matchedFac.id : e.facultyId || 'fac_1',
        facultyName: matchedFac ? matchedFac.name : rawFacName || 'Faculty Member',
        subjectCode: e.subjectCode || 'CS101',
        subjectName: e.subjectName || 'Course',
        room: e.room || 'Room No. C1',
        day: e.day || 'Monday',
        startTime: e.startTime || '09:00',
        endTime: e.endTime || '10:15',
        batch: e.batch || 'FYUGP',
        department: e.department || (matchedFac ? matchedFac.department : 'Commerce'),
        semesterCycle: e.semesterCycle || 'Odd',
        programSemester: e.programSemester || 'FYUGP 1st Semester',
        paperCategory: e.paperCategory || 'Major',
        notes: e.notes || '',
        isSubstitute: e.isSubstitute || false,
        createdAt: e.createdAt || nowIso,
        updatedAt: nowIso,
        lastSyncedAt: nowIso,
      };
    });

    if (createdNewFacultyList.length > 0) {
      setFacultyList(updatedFacultyList);
      try {
        localStorage.setItem('classpilot_faculty_list', JSON.stringify(updatedFacultyList));
      } catch (e) {}
      createdNewFacultyList.forEach((f) => {
        saveFacultyToFirestore(f).catch(() => {});
        fetch('/api/faculty', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(f),
        }).catch(() => {});
      });
    }

    // 2. Ensure clean formatting and explicit IDs for all entries
    const completeEntries: TimetableEntry[] = formattedEntries.map((e, idx) => ({
      id: e.id || `tt_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      facultyId: e.facultyId || 'fac_1',
      facultyName: e.facultyName || 'Faculty Member',
      subjectCode: e.subjectCode || 'CS101',
      subjectName: e.subjectName || 'General Subject',
      room: e.room || 'Room No. C1',
      day: e.day || 'Monday',
      startTime: e.startTime || '09:00',
      endTime: e.endTime || '10:15',
      batch: e.batch || 'FYUGP 1st Sem CS',
      department: e.department || 'Computer Science',
      semesterCycle: e.semesterCycle || 'Odd',
      programSemester: e.programSemester || 'Odd',
      paperCategory: e.paperCategory || 'Major',
      notes: e.notes || '',
      isSubstitute: e.isSubstitute || false,
    }));

    const newFullRoutine = replaceExisting ? completeEntries : [...timetable, ...completeEntries];

    // 3. Update primary local state and persistent storage
    setTimetable(newFullRoutine);
    try {
      localStorage.setItem('classpilot_timetable', JSON.stringify(newFullRoutine));
    } catch (e) {}

    // 4. Primary Cloud Database Write (Firestore Realtime)
    const fsResult = await saveTimetableToFirestore(newFullRoutine, replaceExisting).catch((err) => ({
      success: false,
      count: 0,
      error: err?.message || 'Firestore write error',
    }));

    if (fsResult.success) {
      setSyncStatus('synced');
      setLastSyncTime(new Date());
    } else {
      console.warn('Firestore timetable sync warning (saved locally in browser storage):', fsResult.error);
    }

    // 5. Best-effort sync to optional Express server endpoint (if available in container environment)
    try {
      await fetch('/api/timetable/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: completeEntries, replaceExisting }),
      });
    } catch (e: any) {
      console.warn('Optional Express server API sync notice (running on static host/Vercel):', e);
    }

    // 6. Store routine version log & backup snapshot in Firestore
    if (replaceExisting && timetable.length > 0) {
      await createRoutineBackupInFirestore({
        id: `bkp_pre_import_${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'pre_import_backup',
        description: `Automatic Safety Snapshot before importing ${rawFileData?.fileName || 'routine spreadsheet'}`,
        totalClasses: timetable.length,
        entriesSnapshot: timetable,
      }).catch((err) => console.warn('Pre-import backup notice:', err));
    }

    let rawFileId: string | undefined;
    if (rawFileData) {
      const fileRes = await saveRawRoutineFileToFirestore({
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fileName: rawFileData.fileName,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.name || currentUser?.email || 'Academic Admin',
        fileSizeBytes: rawFileData.fileSizeBytes || 0,
        contentBase64: rawFileData.contentBase64,
      }).catch(() => ({ success: false, fileId: undefined }));
      if (fileRes && fileRes.success) {
        rawFileId = fileRes.fileId;
      }
    }

    await recordRoutineVersionInFirestore({
      id: `ver_${Date.now()}`,
      timestamp: new Date().toISOString(),
      uploadedBy: currentUser?.name || currentUser?.email || 'Academic Admin',
      fileName: rawFileData?.fileName || 'Routine Upload',
      totalRecords: completeEntries.length,
      mode: replaceExisting ? 'replace' : 'append',
      changeSummary: replaceExisting
        ? `Replaced timetable with ${completeEntries.length} new class schedules`
        : `Appended ${completeEntries.length} new class schedules`,
      rawFileId,
      rawFileName: rawFileData?.fileName,
      entriesSnapshot: newFullRoutine,
    }).catch((e) => console.warn('Version history log notice:', e));

    return { success: true, count: completeEntries.length };
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

  const handlePurgeMockDataAndKeepCustom = async () => {
    const customOnly = timetable.filter(
      (e) => e.id && !(e.id.startsWith('tt_dg_') || e.id.startsWith('tt_jb_') || e.id.startsWith('tt_rs_'))
    );

    setTimetable(customOnly);
    try {
      localStorage.setItem('classpilot_timetable', JSON.stringify(customOnly));
    } catch (e) {}

    await saveTimetableToFirestore(customOnly, true);

    fetch('/api/timetable/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: customOnly, replaceExisting: true }),
    }).catch(() => {});
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

  const unreadAlertsCount = notifications.filter((n) => !n.read).length;

  // Render Public Student Self-Enrollment Page if link or QR scanned (No Login Required)
  if (enrollToken) {
    return (
      <PublicStudentEnrollmentPage
        token={enrollToken}
        qrSessions={qrSessions}
        onUpdateStudents={(newStudent) => setStudents((prev) => [...prev, newStudent])}
        onBackToApp={currentUser ? () => {
          setEnrollToken(null);
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } : undefined}
      />
    );
  }

  // Render Landing Page if no active user session
  if (!currentUser) {
    return (
      <LandingPage
        currentUser={currentUser}
        facultyList={facultyList}
        onUpdateFaculty={handleUpdateFaculty}
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
        syncStatus={syncStatus}
        lastSyncTime={lastSyncTime}
        timetableCount={timetable.length}
        onManualSync={syncCentralDatabase}
        onOpenSleepAlarmModal={() => setIsSleepAlarmModalOpen(true)}
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
        onOpenSleepAlarmModal={() => setIsSleepAlarmModalOpen(true)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Dashboard Analytics & Summary Header */}
        {activeTab !== 'diary' && (
          <DashboardAnalytics
            currentUser={currentUser}
            timetable={timetable}
            onNavigateTab={setActiveTab}
          />
        )}

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
            onFacultySelfImportSuccess={handleFacultySelfImportSuccess}
            existingSelfImportRecord={
              facultySelfImports.find(
                (r) =>
                  (r.facultyId && r.facultyId === currentUser?.facultyId) ||
                  isFacultyNameMatch(r.facultyName, currentUser?.name || '')
              ) || null
            }
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onAddEntry={handleAddEntry}
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
            onOpenSleepAlarmModal={() => setIsSleepAlarmModalOpen(true)}
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
            onPurgeMockData={handlePurgeMockDataAndKeepCustom}
            onToggleUserAdminRole={handleToggleUserAdminRole}
            facultySelfImports={facultySelfImports}
            onRefreshSelfImports={() => getFacultySelfImportsFromFirestore().then(setFacultySelfImports)}
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
          handleLoginSuccess(user);
        }}
        onLoginCustomEmail={(email, role) => {
          const user: User = {
            id: `user_${Date.now()}`,
            name: email.split('@')[0],
            email,
            role,
            facultyId: '',
            department: 'Commerce',
          };
          handleLoginSuccess(user);
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

      {/* Sleep Mode Mobile Phone Alarm Sync Modal */}
      <SleepModeAlarmModal
        isOpen={isSleepAlarmModalOpen}
        onClose={() => setIsSleepAlarmModalOpen(false)}
        currentUser={currentUser}
        timetable={timetable}
        facultyList={facultyList}
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

