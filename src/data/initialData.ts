import { Faculty, Room, Student, TimetableEntry, User } from '../types';

// Prototype ships with a clean state — no sample/dummy data.
// Real data is populated dynamically via Excel import or live admin creation.

export const INITIAL_FACULTY: Faculty[] = [];

export const INITIAL_ROOMS: Room[] = [];

export const INITIAL_TIMETABLE: TimetableEntry[] = [];

export const INITIAL_STUDENTS: Student[] = [
  { id: 'st_1', rollNo: 'COM-2025-01', name: 'Ananya Gogoi', classBatch: 'FYUGP 1st Sem Commerce', section: 'Sec A', academicYear: '2025–26', sessionId: 'Odd-2025-26' },
  { id: 'st_2', rollNo: 'COM-2025-02', name: 'Bishal Sonowal', classBatch: 'FYUGP 1st Sem Commerce', section: 'Sec A', academicYear: '2025–26', sessionId: 'Odd-2025-26' },
  { id: 'st_3', rollNo: 'COM-2025-03', name: 'Debashree Sharma', classBatch: 'FYUGP 1st Sem Commerce', section: 'Sec A', academicYear: '2025–26', sessionId: 'Odd-2025-26' },
  { id: 'st_4', rollNo: 'COM-2025-04', name: 'Hemanta Baruah', classBatch: 'FYUGP 1st Sem Commerce', section: 'Sec A', academicYear: '2025–26', sessionId: 'Odd-2025-26' },
  { id: 'st_5', rollNo: 'COM-2025-05', name: 'Jubin Saikia', classBatch: 'FYUGP 1st Sem Commerce', section: 'Sec A', academicYear: '2025–26', sessionId: 'Odd-2025-26' },
  { id: 'st_6', rollNo: 'COM-2025-06', name: 'Kavita Agarwal', classBatch: 'FYUGP 1st Sem Commerce', section: 'Sec A', academicYear: '2025–26', sessionId: 'Odd-2025-26' },
  { id: 'st_7', rollNo: 'COM-2025-07', name: 'Manash Protim Das', classBatch: 'FYUGP 1st Sem Commerce', section: 'Sec A', academicYear: '2025–26', sessionId: 'Odd-2025-26' },
  { id: 'st_8', rollNo: 'COM-2025-08', name: 'Nabanita Borgohain', classBatch: 'FYUGP 1st Sem Commerce', section: 'Sec A', academicYear: '2025–26', sessionId: 'Odd-2025-26' },
];

export const DEMO_USERS: User[] = [
  {
    id: 'user_superadmin',
    name: 'Super Admin',
    email: 'thewildscapes@gmail.com',
    role: 'admin',
    department: 'Commerce',
    whatsappPhone: '9706375001',
    isVerified: true,
    isAcademicCoordinator: true,
  },
];
