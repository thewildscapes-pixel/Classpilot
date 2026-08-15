import {
  db,
  auth,
  googleProvider,
  githubProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  FirebaseUser,
} from './firebase';
import { User, TimetableEntry, ClassDiaryEntry, RoutineVersion, RoutineBackup, RawRoutineFile, Faculty, Room, FacultySelfImportRecord, QREnrollmentSession, StudentEnrollment, Student } from '../types';

// ==========================================
// 1. AUTHENTICATION & FACULTY PROFILES
// ==========================================

/**
 * Sign in with Google Auth provider and sync profile to Firestore users/{uid}
 */
export async function signInWithGoogleFirebase(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const fbUser = result.user;

  // Check if profile exists in Firestore
  const userRef = doc(db, 'users', fbUser.uid);
  const userSnap = await getDoc(userRef);

  let appUser: User;

  if (userSnap.exists()) {
    const data = userSnap.data();
    const isDeborshee = fbUser.email?.toLowerCase() === 'thewildscapes@gmail.com' || (fbUser.displayName && fbUser.displayName.toLowerCase().includes('deborshee'));
    appUser = {
      id: isDeborshee ? 'fac_1' : fbUser.uid,
      name: isDeborshee ? 'Dr. Deborshee Gogoi' : (data.name || fbUser.displayName || 'Dr. Faculty Member'),
      email: fbUser.email || (isDeborshee ? 'thewildscapes@gmail.com' : 'faculty@digboicollege.edu.in'),
      whatsappPhone: isDeborshee ? '9706375001' : (data.whatsappPhone || '9706375001'),
      role: isDeborshee ? 'admin' : (data.role || 'faculty'),
      facultyId: isDeborshee ? 'fac_1' : (data.facultyId || `fac_${fbUser.uid.substring(0, 5)}`),
      department: isDeborshee ? 'Commerce' : (data.department || 'Commerce'),
      isVerified: true,
      isAcademicCoordinator: isDeborshee ? true : data.isAcademicCoordinator,
    };
  } else {
    // Create new faculty profile in Firestore linked to Auth UID
    const isDeborshee = fbUser.email?.toLowerCase() === 'thewildscapes@gmail.com' || (fbUser.displayName && fbUser.displayName.toLowerCase().includes('deborshee'));
    appUser = {
      id: isDeborshee ? 'fac_1' : fbUser.uid,
      name: isDeborshee ? 'Dr. Deborshee Gogoi' : (fbUser.displayName || 'Faculty Member'),
      email: fbUser.email || (isDeborshee ? 'thewildscapes@gmail.com' : ''),
      whatsappPhone: '9706375001',
      role: isDeborshee ? 'admin' : 'faculty',
      facultyId: isDeborshee ? 'fac_1' : `fac_${fbUser.uid.substring(0, 5)}`,
      department: 'Commerce',
      isVerified: true,
      isAcademicCoordinator: isDeborshee,
    };

    await setDoc(userRef, {
      ...appUser,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return appUser;
}

/**
 * Sign in with GitHub Auth provider and sync profile to Firestore users/{uid}
 */
export async function signInWithGithubFirebase(): Promise<User> {
  const result = await signInWithPopup(auth, githubProvider);
  const fbUser = result.user;

  // Extract GitHub user details safely (handles private emails and GitHub screenName)
  const reloadInfo = (fbUser as any).reloadUserInfo;
  const screenName = reloadInfo?.screenName; // GitHub username
  const githubEmail = fbUser.email || (fbUser.providerData?.[0]?.email) || (screenName ? `${screenName}@users.noreply.github.com` : 'thewildscapes@gmail.com');
  const isSuperAdmin = githubEmail.toLowerCase().includes('thewildscapes') || (screenName && screenName.toLowerCase().includes('wildscape'));
  const displayName = fbUser.displayName || (screenName ? `@${screenName}` : (isSuperAdmin ? 'Super Admin' : 'Dr. Faculty Member'));

  // Check if profile exists in Firestore
  const userRef = doc(db, 'users', fbUser.uid);
  let appUser: User;

  try {
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      appUser = {
        id: fbUser.uid,
        name: data.name || displayName,
        email: data.email || githubEmail,
        whatsappPhone: data.whatsappPhone || '9706375001',
        role: data.role || (isSuperAdmin ? 'admin' : 'faculty'),
        facultyId: data.facultyId || `fac_${fbUser.uid.substring(0, 5)}`,
        department: data.department || 'Commerce',
        isVerified: true,
      };
    } else {
      // Create new faculty profile in Firestore linked to Auth UID
      appUser = {
        id: fbUser.uid,
        name: displayName,
        email: githubEmail,
        whatsappPhone: '9706375001',
        role: isSuperAdmin ? 'admin' : 'faculty',
        facultyId: `fac_${fbUser.uid.substring(0, 5)}`,
        department: 'Commerce',
        isVerified: true,
      };

      await setDoc(userRef, {
        ...appUser,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (firestoreErr) {
    console.warn('Firestore profile sync error during GitHub sign in:', firestoreErr);
    appUser = {
      id: fbUser.uid,
      name: displayName,
      email: githubEmail,
      whatsappPhone: '9706375001',
      role: isSuperAdmin ? 'admin' : 'faculty',
      facultyId: `fac_${fbUser.uid.substring(0, 5)}`,
      department: 'Commerce',
      isVerified: true,
    };
  }

  return appUser;
}

/**
 * Save / Update faculty profile in Firestore users/{uid}
 */
export async function saveUserProfileInFirestore(user: User): Promise<void> {
  if (!user.id) return;
  const userRef = doc(db, 'users', user.id);
  await setDoc(
    userRef,
    {
      ...user,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Subscribe to Auth State changes with persistent session recovery
 */
export function listenToAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      callback(null);
      return;
    }

    try {
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        const userEmail = fbUser.email || data.email || '';
        const isAdmin = userEmail.toLowerCase().includes('thewildscapes');
        callback({
          id: fbUser.uid,
          name: data.name || fbUser.displayName || 'Faculty Member',
          email: userEmail,
          whatsappPhone: data.whatsappPhone || '',
          role: data.role || (isAdmin ? 'admin' : 'faculty'),
          facultyId: data.facultyId || `fac_${fbUser.uid.substring(0, 8)}`,
          department: data.department || 'Commerce',
          isVerified: true,
        });
      } else {
        const userEmail = fbUser.email || '';
        const isAdmin = userEmail.toLowerCase().includes('thewildscapes');
        const newUser: User = {
          id: fbUser.uid,
          name: fbUser.displayName || 'Faculty Member',
          email: userEmail,
          whatsappPhone: '',
          role: isAdmin ? 'admin' : 'faculty',
          facultyId: `fac_${fbUser.uid.substring(0, 8)}`,
          department: 'Commerce',
          isVerified: true,
        };
        await setDoc(userRef, { ...newUser, createdAt: serverTimestamp() });
        callback(newUser);
      }
    } catch (e) {
      console.warn('Error fetching Firestore user profile:', e);
      const userEmail = fbUser.email || '';
      const isAdmin = userEmail.toLowerCase().includes('thewildscapes');
      callback({
        id: fbUser.uid,
        name: fbUser.displayName || 'Faculty Member',
        email: userEmail,
        role: isAdmin ? 'admin' : 'faculty',
        facultyId: `fac_${fbUser.uid.substring(0, 8)}`,
        department: 'Commerce',
        isVerified: true,
      });
    }
  });
}

/**
 * Sign out from Firebase Auth
 */
export async function firebaseSignOut(): Promise<void> {
  await signOut(auth);
}

// ==========================================
// 2. REAL-TIME TIMETABLE SYNC & FIRESTORE PERSISTENCE
// ==========================================

/**
 * Listen to Firestore timetables collection in real time.
 * Automatically updates view the moment Admin modifies or uploads a new routine.
 */
export function subscribeToTimetableRealtime(callback: (entries: TimetableEntry[]) => void) {
  const q = collection(db, 'timetables');
  return onSnapshot(
    q,
    (snapshot) => {
      const entries: TimetableEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        let formattedSyncTime = '';
        if (data.updatedAt) {
          if (typeof data.updatedAt.toDate === 'function') {
            formattedSyncTime = data.updatedAt.toDate().toISOString();
          } else if (typeof data.updatedAt === 'string') {
            formattedSyncTime = data.updatedAt;
          } else if (typeof data.updatedAt === 'number') {
            formattedSyncTime = new Date(data.updatedAt).toISOString();
          }
        }
        if (!formattedSyncTime && data.lastSyncedAt) {
          if (typeof data.lastSyncedAt === 'string') {
            formattedSyncTime = data.lastSyncedAt;
          } else if (typeof data.lastSyncedAt === 'number') {
            formattedSyncTime = new Date(data.lastSyncedAt).toISOString();
          }
        }

        entries.push({
          id: docSnap.id,
          facultyId: data.facultyId || '',
          facultyName: data.facultyName || '',
          subjectCode: data.subjectCode || '',
          subjectName: data.subjectName || '',
          room: data.room || data.roomNo || '',
          day: data.day || 'Monday',
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          batch: data.batch || '',
          department: data.department || '',
          semesterCycle: data.semesterCycle || 'Odd',
          programSemester: data.programSemester || 'FYUGP 1st Semester',
          paperCategory: data.paperCategory || 'Major',
          notes: data.notes || '',
          isSubstitute: data.isSubstitute || false,
          updatedAt: formattedSyncTime || data.updatedAt || undefined,
          lastSyncedAt: formattedSyncTime || data.lastSyncedAt || undefined,
        });
      });

      if (entries.length === 0) {
        console.warn('[subscribeToTimetableRealtime] Firestore "timetables" collection returned 0 entries (empty database collection).');
      } else {
        const isMockData = entries.every((e) => e.id.startsWith('tt_dg_') || e.id.startsWith('tt_jb_') || e.id.startsWith('tt_rs_'));
        console.log(
          `[subscribeToTimetableRealtime] Retrieved ${entries.length} routine entries from Firestore database. Source: ${
            isMockData ? 'Mock Initial State' : 'Actual Database (Uploaded/Custom Routine)'
          }`
        );
      }

      callback(entries);
    },
    (error) => {
      console.warn('Realtime timetable listener error:', error);
    }
  );
}

/**
 * One-time direct fetch of all timetable entries from Firestore
 */
export async function getTimetableFromFirestore(): Promise<TimetableEntry[]> {
  try {
    const snapshot = await getDocs(collection(db, 'timetables'));
    const entries: TimetableEntry[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      let formattedSyncTime = '';
      if (data.updatedAt) {
        if (typeof data.updatedAt.toDate === 'function') {
          formattedSyncTime = data.updatedAt.toDate().toISOString();
        } else if (typeof data.updatedAt === 'string') {
          formattedSyncTime = data.updatedAt;
        } else if (typeof data.updatedAt === 'number') {
          formattedSyncTime = new Date(data.updatedAt).toISOString();
        }
      }
      if (!formattedSyncTime && data.lastSyncedAt) {
        if (typeof data.lastSyncedAt === 'string') {
          formattedSyncTime = data.lastSyncedAt;
        } else if (typeof data.lastSyncedAt === 'number') {
          formattedSyncTime = new Date(data.lastSyncedAt).toISOString();
        }
      }

      entries.push({
        id: docSnap.id,
        facultyId: data.facultyId || '',
        facultyName: data.facultyName || '',
        subjectCode: data.subjectCode || '',
        subjectName: data.subjectName || '',
        room: data.room || data.roomNo || '',
        day: data.day || 'Monday',
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        batch: data.batch || '',
        department: data.department || '',
        semesterCycle: data.semesterCycle || 'Odd',
        programSemester: data.programSemester || 'FYUGP 1st Semester',
        paperCategory: data.paperCategory || 'Major',
        notes: data.notes || '',
        isSubstitute: data.isSubstitute || false,
        updatedAt: formattedSyncTime || data.updatedAt || undefined,
        lastSyncedAt: formattedSyncTime || data.lastSyncedAt || undefined,
      });
    });
    return entries;
  } catch (err) {
    console.warn('[getTimetableFromFirestore] Exception:', err);
    return [];
  }
}

/**
 * Save / Upload Timetable batch to Firestore (Admin function).
 * Ensures one document per class period for proper querying and faculty schedule views.
 */
export async function saveTimetableToFirestore(
  entries: TimetableEntry[],
  replaceExisting: boolean = false
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (replaceExisting) {
      // Clear all existing documents in timetables collection using batched deletes
      const existingSnapshot = await getDocs(collection(db, 'timetables'));
      const docs = existingSnapshot.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 400);
        chunk.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
      }
    }

    // Write each timetable record in batches of 400
    for (let i = 0; i < entries.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = entries.slice(i, i + 400);

      chunk.forEach((entry, idx) => {
        const docId = entry.id || `tt_${Date.now()}_${i + idx}_${Math.random().toString(36).substring(2, 6)}`;
        const docRef = doc(db, 'timetables', docId);

        const nowIso = new Date().toISOString();
        const cleanEntry: TimetableEntry = {
          id: docId,
          facultyId: entry.facultyId || (entry.facultyName ? `fac_${entry.facultyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : 'fac_unassigned'),
          facultyName: entry.facultyName || 'Faculty Member',
          subjectCode: entry.subjectCode || 'CS101',
          subjectName: entry.subjectName || 'General Subject',
          room: entry.room || 'Room No. C1',
          day: entry.day || 'Monday',
          startTime: entry.startTime || '09:00',
          endTime: entry.endTime || '10:15',
          batch: entry.batch || 'FYUGP',
          department: entry.department || 'Commerce',
          semesterCycle: entry.semesterCycle || 'Odd',
          programSemester: entry.programSemester || 'FYUGP 1st Semester',
          paperCategory: entry.paperCategory || 'Major',
          notes: entry.notes || '',
          isSubstitute: Boolean(entry.isSubstitute),
          lastSyncedAt: nowIso,
          updatedAt: nowIso,
        };

        // Deep sanitize to prevent any undefined fields from throwing Firestore error
        const sanitized = JSON.parse(JSON.stringify(cleanEntry));

        batch.set(docRef, {
          ...sanitized,
          updatedAt: serverTimestamp(),
          lastSyncedAt: nowIso,
        });
      });

      await batch.commit();
    }

    return { success: true, count: entries.length };
  } catch (error: any) {
    console.error('Error saving timetable batch to Firestore:', error);
    return {
      success: false,
      count: 0,
      error: error?.message || 'Failed to write routine entries to Firestore database.',
    };
  }
}

/**
 * Single Entry Add to Firestore
 */
export async function addTimetableEntryToFirestore(entryData: Partial<TimetableEntry>): Promise<{ success: boolean; entry?: TimetableEntry; error?: string }> {
  try {
    const docId = entryData.id || `tt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const docRef = doc(db, 'timetables', docId);

    const newEntry: TimetableEntry = {
      id: docId,
      facultyId: entryData.facultyId || '',
      facultyName: entryData.facultyName || 'Faculty Member',
      subjectCode: entryData.subjectCode || 'CS101',
      subjectName: entryData.subjectName || 'New Class',
      room: entryData.room || 'Room No. C1',
      day: entryData.day || 'Monday',
      startTime: entryData.startTime || '09:00',
      endTime: entryData.endTime || '10:15',
      batch: entryData.batch || 'CS-1A',
      department: entryData.department || 'Computer Science',
      ...(entryData.semesterCycle ? { semesterCycle: entryData.semesterCycle } : {}),
      ...(entryData.programSemester ? { programSemester: entryData.programSemester } : {}),
      ...(entryData.paperCategory ? { paperCategory: entryData.paperCategory } : {}),
      ...(entryData.notes ? { notes: entryData.notes } : {}),
      ...(entryData.isSubstitute ? { isSubstitute: entryData.isSubstitute } : {}),
    };

    await setDoc(docRef, {
      ...newEntry,
      updatedAt: serverTimestamp(),
    });

    return { success: true, entry: newEntry };
  } catch (err: any) {
    console.error('Failed to add entry to Firestore:', err);
    return { success: false, error: err?.message || 'Failed to add entry to Firestore' };
  }
}

/**
 * Single Entry Update in Firestore
 */
export async function updateTimetableEntryInFirestore(id: string, entryData: Partial<TimetableEntry>): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'timetables', id);
    await setDoc(docRef, { ...entryData, updatedAt: serverTimestamp() }, { merge: true });
    return { success: true };
  } catch (err: any) {
    console.error('Failed to update entry in Firestore:', err);
    return { success: false, error: err?.message || 'Failed to update entry' };
  }
}

/**
 * Re-sync / Force Upload a single timetable record to Firestore
 */
export async function resyncSingleTimetableEntryInFirestore(
  entry: TimetableEntry
): Promise<{ success: boolean; lastSyncedAt?: string; error?: string }> {
  try {
    const docId = entry.id || `tt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const docRef = doc(db, 'timetables', docId);
    const nowIso = new Date().toISOString();

    const cleanEntry: TimetableEntry = {
      ...entry,
      id: docId,
      lastSyncedAt: nowIso,
      updatedAt: nowIso,
    };

    const sanitized = JSON.parse(JSON.stringify(cleanEntry));

    await setDoc(
      docRef,
      {
        ...sanitized,
        updatedAt: serverTimestamp(),
        lastSyncedAt: nowIso,
      },
      { merge: true }
    );

    return { success: true, lastSyncedAt: nowIso };
  } catch (err: any) {
    console.error('Failed to re-sync single entry to Firestore:', err);
    return { success: false, error: err?.message || 'Failed to re-sync entry to Firestore' };
  }
}

/**
 * Single Entry Delete from Firestore
 */
export async function deleteTimetableEntryFromFirestore(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'timetables', id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete entry from Firestore:', err);
    return { success: false, error: err?.message || 'Failed to delete entry' };
  }
}

// ==========================================
// 2B. DATA BACKUP, VERSION HISTORY & RAW FILE RETENTION
// ==========================================

/**
 * Save Raw Uploaded Excel / CSV file content in Firestore collection `routineRawFiles`
 */
export async function saveRawRoutineFileToFirestore(
  rawFile: RawRoutineFile
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const fileId = rawFile.id || `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const docRef = doc(db, 'routineRawFiles', fileId);

    await setDoc(docRef, {
      ...rawFile,
      id: fileId,
      uploadedAt: rawFile.uploadedAt || new Date().toISOString(),
      createdAt: serverTimestamp(),
    });

    return { success: true, fileId };
  } catch (err: any) {
    console.error('Failed to store raw file in Firestore:', err);
    return { success: false, error: err?.message || 'Failed to store raw file' };
  }
}

/**
 * Retrieve Raw Uploaded Excel / CSV file from Firestore by ID
 */
export async function getRawRoutineFileFromFirestore(fileId: string): Promise<RawRoutineFile | null> {
  try {
    const docRef = doc(db, 'routineRawFiles', fileId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as RawRoutineFile;
    }
    return null;
  } catch (err) {
    console.error('Error fetching raw file from Firestore:', err);
    return null;
  }
}

/**
 * Log a new Routine Upload Version in Firestore `routineVersions`
 */
export async function recordRoutineVersionInFirestore(
  version: RoutineVersion
): Promise<{ success: boolean; versionId?: string; error?: string }> {
  try {
    const versionId = version.id || `ver_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const docRef = doc(db, 'routineVersions', versionId);

    await setDoc(docRef, {
      ...version,
      id: versionId,
      timestamp: version.timestamp || new Date().toISOString(),
      createdAt: serverTimestamp(),
    });

    return { success: true, versionId };
  } catch (err: any) {
    console.error('Failed to record routine version in Firestore:', err);
    return { success: false, error: err?.message || 'Failed to record routine version' };
  }
}

/**
 * Realtime Subscription for Routine Versions
 */
export function subscribeToRoutineVersionsRealtime(callback: (versions: RoutineVersion[]) => void) {
  const colRef = collection(db, 'routineVersions');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const versions: RoutineVersion[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        versions.push({
          id: docSnap.id,
          timestamp: data.timestamp || new Date().toISOString(),
          uploadedBy: data.uploadedBy || 'Admin',
          fileName: data.fileName || 'Routine.xlsx',
          totalRecords: data.totalRecords || 0,
          mode: data.mode || 'replace',
          changeSummary: data.changeSummary || 'Routine updated',
          rawFileId: data.rawFileId,
          rawFileName: data.rawFileName,
          entriesSnapshot: data.entriesSnapshot || [],
        });
      });
      versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      callback(versions);
    },
    (err) => {
      console.warn('Realtime subscription notice for routineVersions:', err);
    }
  );
}

/**
 * Create a Manual or Automated Backup Snapshot in Firestore `routineBackups`
 */
export async function createRoutineBackupInFirestore(
  backup: RoutineBackup
): Promise<{ success: boolean; backupId?: string; error?: string }> {
  try {
    const backupId = backup.id || `bkp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const docRef = doc(db, 'routineBackups', backupId);

    await setDoc(docRef, {
      ...backup,
      id: backupId,
      timestamp: backup.timestamp || new Date().toISOString(),
      createdAt: serverTimestamp(),
    });

    return { success: true, backupId };
  } catch (err: any) {
    console.error('Failed to create backup snapshot in Firestore:', err);
    return { success: false, error: err?.message || 'Failed to create backup snapshot' };
  }
}

/**
 * Realtime Subscription for Routine Backups
 */
export function subscribeToRoutineBackupsRealtime(callback: (backups: RoutineBackup[]) => void) {
  const colRef = collection(db, 'routineBackups');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const backups: RoutineBackup[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        backups.push({
          id: docSnap.id,
          timestamp: data.timestamp || new Date().toISOString(),
          type: data.type || 'manual_snapshot',
          description: data.description || 'Routine Snapshot',
          totalClasses: data.totalClasses || 0,
          entriesSnapshot: data.entriesSnapshot || [],
        });
      });
      backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      callback(backups);
    },
    (err) => {
      console.warn('Realtime subscription notice for routineBackups:', err);
    }
  );
}

/**
 * Automated Daily / Scheduled Backup trigger check
 */
export async function checkAndTriggerAutomatedDailyBackup(entries: TimetableEntry[]): Promise<boolean> {
  if (!entries || entries.length === 0) return false;

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const colRef = collection(db, 'routineBackups');
    const snap = await getDocs(colRef);

    const hasTodayBackup = snap.docs.some((docSnap) => {
      const d = docSnap.data();
      return d.type === 'automated_daily' && d.timestamp && d.timestamp.startsWith(todayStr);
    });

    if (!hasTodayBackup) {
      await createRoutineBackupInFirestore({
        id: `bkp_auto_${todayStr}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'automated_daily',
        description: `Automated Daily Scheduled System Backup (${todayStr})`,
        totalClasses: entries.length,
        entriesSnapshot: entries,
      });
      return true;
    }
  } catch (e) {
    console.warn('Automated daily backup check notice:', e);
  }
  return false;
}

/**
 * Rollback Live Database Routine to a specific Version or Backup Snapshot!
 */
export async function rollbackRoutineToSnapshot(
  entriesSnapshot: TimetableEntry[],
  versionLabel: string,
  userEmail: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    // 1. Create a safety pre-rollback snapshot of current live database first
    const currentLiveSnap = await getDocs(collection(db, 'timetables'));
    const currentLiveEntries: TimetableEntry[] = currentLiveSnap.docs.map((d) => d.data() as TimetableEntry);

    if (currentLiveEntries.length > 0) {
      await createRoutineBackupInFirestore({
        id: `bkp_pre_rollback_${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'pre_import_backup',
        description: `Pre-Rollback Safety Snapshot before rolling back to "${versionLabel}"`,
        totalClasses: currentLiveEntries.length,
        entriesSnapshot: currentLiveEntries,
      });
    }

    // 2. Overwrite live timetables collection with target entriesSnapshot
    const saveRes = await saveTimetableToFirestore(entriesSnapshot, true);

    if (!saveRes.success) {
      return { success: false, error: saveRes.error };
    }

    // 3. Record a rollback version log in routineVersions
    await recordRoutineVersionInFirestore({
      id: `ver_rollback_${Date.now()}`,
      timestamp: new Date().toISOString(),
      uploadedBy: userEmail || 'Admin',
      fileName: `Rollback: ${versionLabel}`,
      totalRecords: entriesSnapshot.length,
      mode: 'replace',
      changeSummary: `Restored database routine back to version: ${versionLabel}`,
      entriesSnapshot: entriesSnapshot,
    });

    return { success: true, count: entriesSnapshot.length };
  } catch (err: any) {
    console.error('Error executing routine rollback:', err);
    return { success: false, error: err?.message || 'Rollback failed' };
  }
}

// ==========================================
// 2C. FACULTY ROSTER & ROOMS PERSISTENCE
// ==========================================

/**
 * Save a single Faculty record to Firestore collection `faculty`
 */
export async function saveFacultyToFirestore(faculty: Faculty): Promise<{ success: boolean; error?: string }> {
  let firestoreSuccess = false;
  let firestoreError = '';

  try {
    const docRef = doc(db, 'faculty', faculty.id);
    await setDoc(
      docRef,
      {
        ...faculty,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    firestoreSuccess = true;
  } catch (err: any) {
    firestoreError = err?.message || 'Firestore write failed';
    console.warn('[saveFacultyToFirestore] Firestore write note:', firestoreError);
  }

  // Dual-sync to Express API server database
  try {
    const res = await fetch('/api/faculty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(faculty),
    });
    if (res.ok) {
      return { success: true };
    }
  } catch (apiErr) {
    console.warn('[saveFacultyToFirestore] Express API sync note:', apiErr);
  }

  if (firestoreSuccess) {
    return { success: true };
  }

  return { success: false, error: firestoreError || 'Failed to save faculty record' };
}

/**
 * Bulk save Faculty list to Firestore collection `faculty`
 */
export async function saveFacultyListToFirestore(facultyList: Faculty[]): Promise<void> {
  for (const fac of facultyList) {
    await saveFacultyToFirestore(fac);
  }
}

/**
 * Delete a single Faculty member from Firestore
 */
export async function deleteFacultyFromFirestore(facultyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'faculty', facultyId);
    await deleteDoc(docRef);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete faculty from Firestore:', err);
    return { success: false, error: err?.message || 'Failed to delete faculty' };
  }
}

/**
 * Clear all Faculty members from Firestore
 */
export async function clearAllFacultyInFirestore(): Promise<{ success: boolean; error?: string }> {
  try {
    const colRef = collection(db, 'faculty');
    const snap = await getDocs(colRef);
    const deletePromises = snap.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.all(deletePromises);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to clear faculty from Firestore:', err);
    return { success: false, error: err?.message || 'Failed to clear faculty' };
  }
}

/**
 * Realtime Subscription for Faculty Roster in Firestore
 */
export function subscribeToFacultyRealtime(
  initialFallback: Faculty[],
  callback: (facultyList: Faculty[]) => void
) {
  const colRef = collection(db, 'faculty');
  return onSnapshot(
    colRef,
    async (snapshot) => {
      // Check if user explicitly initialized or cleared localStorage
      const hasStoredLocal = localStorage.getItem('classpilot_faculty_list') !== null;

      if (snapshot.empty) {
        if (!hasStoredLocal && initialFallback && initialFallback.length > 0) {
          saveFacultyListToFirestore(initialFallback).catch(() => {});
          callback(initialFallback);
        } else {
          callback([]);
        }
        return;
      }

      const list: Faculty[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          name: data.name || 'Faculty Member',
          email: data.email || 'faculty@college.edu',
          department: data.department || 'Computer Science',
          designation: data.designation || 'Assistant Professor',
          phone: data.phone || data.whatsappPhone || '',
          employeeId: data.employeeId || '',
          isVerified: data.isVerified ?? true,
        });
      });

      list.sort((a, b) => a.name.localeCompare(b.name));
      callback(list);
    },
    (err) => {
      console.warn('Realtime subscription notice for faculty:', err);
    }
  );
}

/**
 * Save a single Room record to Firestore collection `rooms`
 */
export async function saveRoomToFirestore(room: Room): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'rooms', room.id);
    await setDoc(
      docRef,
      {
        ...room,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { success: true };
  } catch (err: any) {
    console.error('Failed to save room to Firestore:', err);
    return { success: false, error: err?.message || 'Failed to save room' };
  }
}

/**
 * Bulk save Room list to Firestore collection `rooms`
 */
export async function saveRoomListToFirestore(roomList: Room[]): Promise<void> {
  for (const rm of roomList) {
    await saveRoomToFirestore(rm);
  }
}

/**
 * Delete a single Room record from Firestore
 */
export async function deleteRoomFromFirestore(roomId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'rooms', roomId);
    await deleteDoc(docRef);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete room from Firestore:', err);
    return { success: false, error: err?.message || 'Failed to delete room' };
  }
}

/**
 * Realtime Subscription for Rooms Directory in Firestore
 */
export function subscribeToRoomsRealtime(
  initialFallback: Room[],
  callback: (roomList: Room[]) => void
) {
  const colRef = collection(db, 'rooms');
  return onSnapshot(
    colRef,
    async (snapshot) => {
      const hasStoredLocal = localStorage.getItem('classpilot_room_list') !== null;

      if (snapshot.empty) {
        if (!hasStoredLocal && initialFallback && initialFallback.length > 0) {
          saveRoomListToFirestore(initialFallback).catch(() => {});
          callback(initialFallback);
        } else {
          callback([]);
        }
        return;
      }

      const list: Room[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          name: data.name || 'Room',
          building: data.building || 'Main Block',
          floor: data.floor || 1,
          capacity: data.capacity || 50,
          type: data.type || 'Lecture Hall',
          equipment: data.equipment || [],
        });
      });

      list.sort((a, b) => a.name.localeCompare(b.name));
      callback(list);
    },
    (err) => {
      console.warn('Realtime subscription notice for rooms:', err);
    }
  );
}

// ==========================================
// 3. CLASS DIARY WITH OFFLINE SUPPORT & MULTI-DEVICE SYNC
// ==========================================

/**
 * Fetch all Class Diary entries directly from Firestore.
 */
export async function getClassDiaryFromFirestore(): Promise<ClassDiaryEntry[]> {
  try {
    const colRef = collection(db, 'classDiary');
    const snapshot = await getDocs(colRef);
    const list: ClassDiaryEntry[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      list.push({
        id: docSnap.id,
        facultyId: data.facultyId || '',
        facultyName: data.facultyName || '',
        facultyEmail: data.facultyEmail || '',
        facultyPhone: data.facultyPhone || '',
        department: data.department || '',
        date: data.date || '',
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        classStartTimestamp: data.classStartTimestamp || Date.now(),
        subjectCode: data.subjectCode || '',
        subjectName: data.subjectName || '',
        batch: data.batch || data.classBatch || '',
        classBatch: data.batch || data.classBatch || '',
        room: data.room || '',
        topicTaught: data.topicTaught || '',
        syllabusUnit: data.syllabusUnit || '',
        durationMins: Number(data.durationMins) || 60,
        remarks: data.remarks || '',
        attendance: data.attendance || [],
        status: data.status || (data.isCancelled ? 'Cancelled' : 'Conducted'),
        isCancelled: Boolean(data.isCancelled || data.status === 'Cancelled'),
        cancellationCategory: data.cancellationCategory || '',
        cancellationReason: data.cancellationReason || '',
        timetableEntryId: data.timetableEntryId || '',
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || new Date().toISOString(),
        isSynced: true,
      });
    });
    list.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
    return list;
  } catch (error) {
    console.warn('Could not fetch class diary from Firestore:', error);
    return [];
  }
}

/**
 * Subscribe to Class Diary entries in real time for multi-device sync across all logins.
 */
export function subscribeToClassDiaryRealtime(
  facultyId: string,
  isAdmin: boolean,
  callback: (entries: ClassDiaryEntry[]) => void
) {
  const colRef = collection(db, 'classDiary');

  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: ClassDiaryEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          facultyId: data.facultyId || '',
          facultyName: data.facultyName || '',
          facultyEmail: data.facultyEmail || '',
          facultyPhone: data.facultyPhone || '',
          department: data.department || '',
          date: data.date || '',
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          classStartTimestamp: data.classStartTimestamp || Date.now(),
          subjectCode: data.subjectCode || '',
          subjectName: data.subjectName || '',
          batch: data.batch || data.classBatch || '',
          classBatch: data.batch || data.classBatch || '',
          room: data.room || '',
          topicTaught: data.topicTaught || '',
          syllabusUnit: data.syllabusUnit || '',
          durationMins: Number(data.durationMins) || 60,
          remarks: data.remarks || '',
          attendance: data.attendance || [],
          status: data.status || (data.isCancelled ? 'Cancelled' : 'Conducted'),
          isCancelled: Boolean(data.isCancelled || data.status === 'Cancelled'),
          cancellationCategory: data.cancellationCategory || '',
          cancellationReason: data.cancellationReason || '',
          timetableEntryId: data.timetableEntryId || '',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || new Date().toISOString(),
          isSynced: true,
        });
      });
      list.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
      callback(list);
    },
    (err) => {
      console.warn('Class diary snapshot listener notice:', err);
    }
  );
}

/**
 * Add / Update Class Diary entry in Firestore with serverTimestamp().
 * Works seamlessly offline with local persistence. Enforces 24-hour edit lock check.
 */
export async function saveClassDiaryToFirestore(entry: ClassDiaryEntry): Promise<{ success: boolean; message: string }> {
  try {
    const docRef = doc(db, 'classDiary', entry.id);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      const data = existingSnap.data();
      const createdAtMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : new Date(data.createdAt || Date.now()).getTime();
      const elapsedHours = (Date.now() - createdAtMs) / (1000 * 60 * 60);

      if (elapsedHours > 24) {
        return {
          success: false,
          message: 'Entry locked: 24-hour edit period has expired. Only Academic Coordinator can modify locked diary entries for compliance.',
        };
      }
    }

    const payload: any = {
      ...entry,
      updatedAt: serverTimestamp(),
      createdAt: existingSnap.exists() ? existingSnap.data().createdAt || serverTimestamp() : serverTimestamp(),
    };

    await setDoc(docRef, payload, { merge: true });

    return { success: true, message: 'Class diary entry saved and synchronized successfully.' };
  } catch (error: any) {
    console.error('Error saving class diary to Firestore:', error);
    return {
      success: true,
      message: 'Saved locally in offline cache. It will auto-sync with Firestore when back online.',
    };
  }
}

/**
 * Delete Class Diary entry from Firestore.
 */
export async function deleteClassDiaryFromFirestore(entryId: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'classDiary', entryId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.warn('Error deleting class diary from Firestore:', error);
    return false;
  }
}

// ==========================================
// 8. FACULTY SELF-IMPORT ROUTINE FUNCTIONS
// ==========================================

/**
 * Save faculty self-imported routine to Firestore collection `faculty_self_imports`
 */
export async function saveFacultySelfImportToFirestore(
  record: FacultySelfImportRecord
): Promise<{ success: boolean; error?: string }> {
  try {
    const docId = (record.facultyId || record.facultyName).toLowerCase().replace(/[^a-z0-9]/g, '_');
    const docRef = doc(db, 'faculty_self_imports', docId);

    // Get existing doc if any to append import history
    const existingSnap = await getDoc(docRef);
    let history = record.importHistory || [];

    if (existingSnap.exists()) {
      const data = existingSnap.data();
      const prevHistory = data.importHistory || [];
      const currentSnapshot = {
        importedAt: record.importedAt,
        fileName: record.fileName,
        entriesCount: record.entriesCount,
      };
      history = [currentSnapshot, ...prevHistory].slice(0, 10);
    } else {
      history = [
        {
          importedAt: record.importedAt,
          fileName: record.fileName,
          entriesCount: record.entriesCount,
        },
      ];
    }

    const payload = {
      ...record,
      id: docId,
      importHistory: history,
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload, { merge: true });
    console.log(`[saveFacultySelfImportToFirestore] Successfully saved self-import for ${record.facultyName} (${record.entriesCount} classes).`);
    return { success: true };
  } catch (err: any) {
    console.error('[saveFacultySelfImportToFirestore] Error:', err);
    return { success: false, error: err?.message || 'Failed to sync self-imported routine to central database.' };
  }
}

/**
 * Realtime listener for faculty self-imports (for Admin dashboard & Faculty view)
 */
export function subscribeToFacultySelfImportsRealtime(
  callback: (records: FacultySelfImportRecord[]) => void
) {
  try {
    const colRef = collection(db, 'faculty_self_imports');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const records: FacultySelfImportRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          records.push({
            id: docSnap.id,
            facultyId: data.facultyId || docSnap.id,
            facultyName: data.facultyName || 'Faculty Member',
            employeeId: data.employeeId || '',
            phone: data.phone || '',
            email: data.email || '',
            department: data.department || '',
            importedAt: data.importedAt || new Date().toISOString(),
            fileName: data.fileName || 'Self_Import.csv',
            entriesCount: data.entriesCount || (data.entries ? data.entries.length : 0),
            entries: data.entries || [],
            importHistory: data.importHistory || [],
          });
        });
        callback(records);
      },
      (err) => {
        console.warn('[subscribeToFacultySelfImportsRealtime] Firestore listener note:', err);
      }
    );
  } catch (err) {
    console.warn('[subscribeToFacultySelfImportsRealtime] Exception:', err);
    return () => {};
  }
}

/**
 * Fetch all faculty self-imports once
 */
export async function getFacultySelfImportsFromFirestore(): Promise<FacultySelfImportRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, 'faculty_self_imports'));
    const records: FacultySelfImportRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      records.push({
        id: docSnap.id,
        facultyId: data.facultyId || docSnap.id,
        facultyName: data.facultyName || 'Faculty Member',
        employeeId: data.employeeId || '',
        phone: data.phone || '',
        email: data.email || '',
        department: data.department || '',
        importedAt: data.importedAt || new Date().toISOString(),
        fileName: data.fileName || 'Self_Import.csv',
        entriesCount: data.entriesCount || (data.entries ? data.entries.length : 0),
        entries: data.entries || [],
        importHistory: data.importHistory || [],
      });
    });
    return records;
  } catch (err) {
    console.warn('[getFacultySelfImportsFromFirestore] Error:', err);
    return [];
  }
}

// ==========================================
// 8. QR ENROLLMENT SESSIONS & STUDENT SELF-ENROLLMENT
// ==========================================

/**
 * Save or update QR Enrollment Session in Firestore
 */
export async function saveQREnrollmentSessionToFirestore(session: QREnrollmentSession): Promise<void> {
  try {
    const docRef = doc(db, 'qr_enrollment_sessions', session.id);
    await setDoc(docRef, {
      ...session,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log(`[Firestore] Saved QR Enrollment Session ${session.id} (${session.classBatch})`);
  } catch (err) {
    console.warn('[saveQREnrollmentSessionToFirestore] Error:', err);
  }
}

/**
 * Realtime listener for QR Enrollment Sessions
 */
export function subscribeToQREnrollmentSessionsRealtime(callback: (sessions: QREnrollmentSession[]) => void): () => void {
  try {
    const colRef = collection(db, 'qr_enrollment_sessions');
    return onSnapshot(colRef, (snapshot) => {
      const list: QREnrollmentSession[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          token: d.token || docSnap.id,
          title: d.title || 'Class Enrollment',
          classBatch: d.classBatch || '',
          section: d.section || 'Section A',
          department: d.department || '',
          semester: d.semester || '',
          subjectCode: d.subjectCode || '',
          subjectName: d.subjectName || '',
          createdBy: d.createdBy || 'Admin',
          createdAt: d.createdAt || new Date().toISOString(),
          expiresAt: d.expiresAt || null,
          isActive: d.isActive !== undefined ? d.isActive : true,
          enrollmentUrl: d.enrollmentUrl || '',
          notes: d.notes || '',
        });
      });
      callback(list);
    }, (err) => {
      console.warn('[subscribeToQREnrollmentSessionsRealtime] Error:', err);
    });
  } catch (err) {
    console.warn('[subscribeToQREnrollmentSessionsRealtime] Exception:', err);
    return () => {};
  }
}

/**
 * Save Student Self-Enrollment Submission
 */
export async function saveStudentEnrollmentToFirestore(enrollment: StudentEnrollment): Promise<void> {
  try {
    const docRef = doc(db, 'student_enrollments', enrollment.id);
    await setDoc(docRef, {
      ...enrollment,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log(`[Firestore] Saved Student Enrollment Submission ${enrollment.id} (${enrollment.name})`);
  } catch (err) {
    console.warn('[saveStudentEnrollmentToFirestore] Error:', err);
  }
}

/**
 * Save Student Record Directly to Roster in Firestore
 */
export async function saveStudentToFirestore(student: Student): Promise<void> {
  try {
    const docRef = doc(db, 'students', student.id);
    await setDoc(docRef, {
      ...student,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log(`[Firestore] Synchronized student ${student.id} (${student.name}) to Master Roster`);
  } catch (err) {
    console.warn('[saveStudentToFirestore] Error:', err);
  }
}

/**
 * Realtime listener for Student Enrollment Submissions
 */
export function subscribeToStudentEnrollmentsRealtime(callback: (enrollments: StudentEnrollment[]) => void): () => void {
  try {
    const colRef = collection(db, 'student_enrollments');
    return onSnapshot(colRef, (snapshot) => {
      const list: StudentEnrollment[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          sessionId: d.sessionId || '',
          sessionToken: d.sessionToken || '',
          name: d.name || '',
          rollNo: d.rollNo || '',
          mobile: d.mobile || '',
          email: d.email || '',
          classBatch: d.classBatch || '',
          section: d.section || 'Section A',
          department: d.department || '',
          semester: d.semester || '',
          status: d.status || 'pending',
          enrollmentSource: d.enrollmentSource || 'qr_self_enrollment',
          submittedAt: d.submittedAt || new Date().toISOString(),
          reviewedAt: d.reviewedAt || undefined,
          reviewedBy: d.reviewedBy || undefined,
          masterMatchStatus: d.masterMatchStatus || undefined,
          reassignedFrom: d.reassignedFrom || undefined,
        });
      });
      callback(list);
    }, (err) => {
      console.warn('[subscribeToStudentEnrollmentsRealtime] Error:', err);
    });
  } catch (err) {
    console.warn('[subscribeToStudentEnrollmentsRealtime] Exception:', err);
    return () => {};
  }
}

/**
 * Update Student Enrollment Status (e.g. approve / reject / reassign)
 */
export async function updateStudentEnrollmentStatusInFirestore(
  enrollmentId: string,
  status: 'approved' | 'rejected' | 'pending',
  reviewedBy: string,
  reassignedClassBatch?: string,
  reassignedSection?: string
): Promise<void> {
  try {
    const docRef = doc(db, 'student_enrollments', enrollmentId);
    const updates: any = {
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy,
    };
    if (reassignedClassBatch) {
      updates.classBatch = reassignedClassBatch;
    }
    if (reassignedSection) {
      updates.section = reassignedSection;
    }
    await updateDoc(docRef, updates);
  } catch (err) {
    console.warn('[updateStudentEnrollmentStatusInFirestore] Error:', err);
  }
}

