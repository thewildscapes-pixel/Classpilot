import { Faculty, Room, Student, TimetableEntry, User } from '../types';

// Prototype ships with a clean state — no sample/dummy data.
// Real data is populated dynamically via Excel import or live admin creation.

export const INITIAL_FACULTY: Faculty[] = [
  {
    id: 'fac_1',
    name: 'Dr. Deborshee Gogoi',
    email: 'thewildscapes@gmail.com',
    department: 'Commerce',
    designation: 'Associate Professor',
    phone: '9706375001',
    whatsappPhone: '9706375001',
    employeeId: 'DC-EMP-001',
    isVerified: true,
  },
  {
    id: 'fac_2',
    name: 'Dr. Jitu Borah',
    email: 'jitu.borah@digboicollege.edu.in',
    department: 'Economics',
    designation: 'Assistant Professor',
    phone: '9876543210',
    whatsappPhone: '9876543210',
    employeeId: 'DC-EMP-002',
    isVerified: true,
  },
  {
    id: 'fac_3',
    name: 'Prof. Rashmi Saikia',
    email: 'rashmi.s@digboicollege.edu.in',
    department: 'Commerce',
    designation: 'Assistant Professor',
    phone: '9101234567',
    whatsappPhone: '9101234567',
    employeeId: 'DC-EMP-003',
    isVerified: true,
  },
];

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
