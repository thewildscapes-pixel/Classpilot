import { Faculty, Room, Student, TimetableEntry, User } from '../types';

// Clean initial state — no sample/dummy seed data.
// Real data is populated strictly via Excel/CSV import or live admin and faculty entries.

export const INITIAL_FACULTY: Faculty[] = [];

export const INITIAL_ROOMS: Room[] = [];

export const INITIAL_TIMETABLE: TimetableEntry[] = [];

export const INITIAL_STUDENTS: Student[] = [];

export const DEMO_USERS: User[] = [
  {
    id: 'user_superadmin',
    name: 'Dr. Deborshee Gogoi',
    email: 'thewildscapes@gmail.com',
    role: 'admin',
    department: 'Commerce',
    whatsappPhone: '9706375001',
    isVerified: true,
    isAcademicCoordinator: true,
  },
];

