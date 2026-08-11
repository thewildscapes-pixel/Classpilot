export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export type Role = 'faculty' | 'admin';

export interface Faculty {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  phone?: string;
  whatsappPhone?: string;
  employeeId?: string;
  avatarUrl?: string;
  isVerified?: boolean;
}

export interface Room {
  id: string;
  name: string;
  building: string;
  floor: number;
  capacity: number;
  type: 'Lecture Hall' | 'Computer Lab' | 'Seminar Room' | 'Auditorium';
  equipment?: string[];
}

export interface TimetableEntry {
  id: string;
  facultyId: string;
  facultyName: string;
  subjectCode: string;
  subjectName: string;
  room: string;
  day: DayOfWeek;
  startTime: string; // e.g. "08:00"
  endTime: string;   // e.g. "09:00"
  batch: string;     // e.g. "FYUGP 1st Sem - CS" or "HS 1st Yr Commerce"
  department: string;
  semesterCycle?: 'Odd' | 'Even';
  programSemester?: string; // e.g. 'FYUGP 1st Semester', 'HS 1st Year Commerce', 'PG 1st Semester'
  paperCategory?: 'Major' | 'Minor' | 'MDC' | 'AEC' | 'SEC' | 'VAC' | 'Vocational' | 'HS Core' | 'PG Core' | 'PG Elective';
  notes?: string;
  isSubstitute?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastSyncedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  facultyId?: string;
  department: string;
  phone?: string;
  whatsappPhone?: string;
  employeeId?: string;
  isVerified?: boolean;
  isAcademicCoordinator?: boolean;
}

export interface FacultyNotification {
  id: string;
  facultyId?: string;
  facultyName: string;
  semesterTerm: string;
  timestamp: string;
  message: string;
  totalClasses: number;
  read?: boolean;
}

export interface AlertNotification {
  id: string;
  title: string;
  message: string;
  entryId: string;
  timestamp: string;
  read: boolean;
  type: '10min_warning' | 'class_started' | 'schedule_update';
  subjectName: string;
  room: string;
  startTime: string;
}

export interface TimeState {
  isSimulated: boolean;
  simulatedTime: string; // ISO string or format
  offsetMs: number;
  isPaused: boolean;
}

export interface SavedFacultyProfile {
  id: string;
  name: string;
  email: string;
  department: string;
  avatarUrl?: string;
  designation?: string;
  facultyId?: string;
  token?: string;
  lastLoginAt: string;
}

export interface Student {
  id: string;
  rollNo: string;
  name: string;
  classBatch: string;
  section?: string;
  academicYear: string;
  sessionId: string;
}

export interface AttendanceRecord {
  studentId: string;
  rollNo: string;
  name: string;
  status: 'Present' | 'Absent' | 'Late';
  remarks?: string;
}

export interface ClassDiaryEntry {
  id: string;
  facultyId: string;
  facultyName: string;
  department: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  classStartTimestamp: number; // unix ms timestamp
  subjectCode: string;
  subjectName: string;
  batch: string;
  room: string;
  topicTaught: string;
  syllabusUnit?: string;
  durationMins: number;
  remarks?: string;
  attachments?: { name: string; url: string; size?: string }[];
  attendance?: AttendanceRecord[];
  createdAt: string;
  updatedAt: string;
  isSynced?: boolean;
}

export interface SyllabusTopic {
  id: string;
  subjectCode: string;
  subjectName: string;
  department: string;
  unitName: string;
  topicTitle: string;
  isCompleted: boolean;
  completedDate?: string;
}

export interface ResearchRecord {
  id: string;
  facultyId: string;
  title: string;
  type: 'Journal Paper' | 'Conference' | 'Patent' | 'Book Chapter' | 'Workshop' | 'Grant Project';
  journalOrPublisher?: string;
  year: number;
  doiOrUrl?: string;
  authors: string;
  remarks?: string;
  dateLogged: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  location?: string;
  description?: string;
  isGoogleSynced?: boolean;
  googleEventId?: string;
  createdById: string;
}

export interface ScheduleConflict {
  id?: string;
  type: 'faculty' | 'room' | 'batch';
  message?: string;
  description: string;
  entry1: TimetableEntry;
  entry2: TimetableEntry;
}


export interface ActiveAlarm {
  isRinging: boolean;
  id?: string;
  title?: string;
  message?: string;
  subjectName?: string;
  room?: string;
  startTime?: string;
  triggerTime?: number;
  snoozedCount?: number;
}



export interface ImportPreviewItem {
  facultyName: string;
  facultyId: string;
  subjectCode: string;
  subjectName: string;
  room: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  batch: string;
  department: string;
  isValid: boolean;
  errorReason?: string;
}

export interface RoutineVersion {
  id: string;
  timestamp: string;
  uploadedBy: string;
  fileName: string;
  totalRecords: number;
  mode: 'replace' | 'append';
  changeSummary: string;
  rawFileId?: string;
  rawFileName?: string;
  entriesSnapshot: TimetableEntry[];
}

export interface RoutineBackup {
  id: string;
  timestamp: string;
  type: 'automated_daily' | 'manual_snapshot' | 'pre_import_backup';
  description: string;
  totalClasses: number;
  entriesSnapshot: TimetableEntry[];
}

export interface RawRoutineFile {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  fileSizeBytes: number;
  contentBase64?: string;
}
