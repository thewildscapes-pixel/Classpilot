import { DayOfWeek, ScheduleConflict, TimetableEntry } from '../types';

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface TimeSlot {
  label: string;
  startTime: string;
  endTime: string;
  displayLabel: string;
}

export const HOURLY_TIME_SLOTS: TimeSlot[] = [
  { label: '08:00 - 09:00', startTime: '08:00', endTime: '09:00', displayLabel: '8:00 AM - 9:00 AM' },
  { label: '09:00 - 10:00', startTime: '09:00', endTime: '10:00', displayLabel: '9:00 AM - 10:00 AM' },
  { label: '10:00 - 11:00', startTime: '10:00', endTime: '11:00', displayLabel: '10:00 AM - 11:00 AM' },
  { label: '11:00 - 12:00', startTime: '11:00', endTime: '12:00', displayLabel: '11:00 AM - 12:00 PM' },
  { label: '12:00 - 13:00', startTime: '12:00', endTime: '13:00', displayLabel: '12:00 PM - 1:00 PM' },
  { label: '13:00 - 14:00', startTime: '13:00', endTime: '14:00', displayLabel: '1:00 PM - 2:00 PM' },
  { label: '14:00 - 15:00', startTime: '14:00', endTime: '15:00', displayLabel: '2:00 PM - 3:00 PM' },
  { label: '15:00 - 16:00', startTime: '15:00', endTime: '16:00', displayLabel: '3:00 PM - 4:00 PM' },
];

export const ODD_SEMESTERS_LIST: string[] = [
  'HS 1st Year (Commerce)',
  'HS 1st Year (Arts/Science)',
  'HS 2nd Year (Commerce)',
  'HS 2nd Year (Arts/Science)',
  'FYUGP 1st Semester',
  'FYUGP 3rd Semester',
  'FYUGP 5th Semester',
  'FYUGP 7th Semester',
  'PG 1st Semester',
  'PG 3rd Semester',
];

export const EVEN_SEMESTERS_LIST: string[] = [
  'HS 1st Year (Term 2)',
  'HS 2nd Year (Final)',
  'FYUGP 2nd Semester',
  'FYUGP 4th Semester',
  'FYUGP 6th Semester',
  'FYUGP 8th Semester',
  'PG 2nd Semester',
  'PG 4th Semester',
];

export const COMMERCE_HS_SUBJECTS: string[] = [
  'English',
  'MIL (Assamese/Bengali/Hindi)',
  'Accountancy',
  'Business Studies',
  'Economics',
  'SAAD (Commercial Architecture/Banking)',
];

export const FYUGP_PAPER_CATEGORIES = [
  { code: 'Major', name: 'Major Paper', badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  { code: 'Minor', name: 'Minor Paper', badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  { code: 'MDC', name: 'Multidisciplinary Course (MDC)', badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { code: 'Vocational', name: 'Vocational Course', badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' },
  { code: 'AEC', name: 'Ability Enhancement Course (AEC)', badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { code: 'SEC', name: 'Skill Enhancement Course (SEC)', badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { code: 'VAC', name: 'Value Added Course (VAC)', badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  { code: 'HS Core', name: 'HS Subject', badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  { code: 'PG Core', name: 'PG Core', badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  { code: 'PG Elective', name: 'PG Elective', badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
] as const;

export const DEPARTMENTS_LIST: string[] = [
  'Assamese',
  'Bengali',
  'Botany',
  'Chemistry',
  'Commerce',
  'Computer Science',
  'Economics',
  'Education',
  'Electronics',
  'English',
  'Geography',
  'Hindi',
  'History',
  'ITEP (Arts)',
  'ITEP (Science)',
  'Mathematics',
  'Nepali',
  'Philosophy',
  'Physics',
  'Rural Development',
  'Tea Garden Mgt (TGM)',
  'Tourism & Hospitality Mgt (THM)',
  'Zoology',
];

export function getCurrentDayName(date: Date): DayOfWeek {
  const dayIndex = date.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  if (dayIndex === 0) return 'Monday'; // Default Sunday to Monday for demo
  return DAYS_OF_WEEK[dayIndex - 1] || 'Monday';
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

export function formatMinutesTo12H(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${h12}:${mStr} ${period}`;
}

export function formatTime24H(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function getEntryStatus(
  entry: TimetableEntry,
  currentDate: Date
): 'Ongoing' | 'Upcoming' | 'Completed' {
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
  const startMin = parseTimeToMinutes(entry.startTime);
  const endMin = parseTimeToMinutes(entry.endTime);

  if (currentMinutes >= startMin && currentMinutes < endMin) {
    return 'Ongoing';
  } else if (currentMinutes < startMin) {
    return 'Upcoming';
  } else {
    return 'Completed';
  }
}

export function getSecondsUntilStart(entry: TimetableEntry, currentDate: Date): number {
  const startMin = parseTimeToMinutes(entry.startTime);
  const currentMin = currentDate.getHours() * 60 + currentDate.getMinutes();
  const currentSec = currentDate.getSeconds();

  const minDiff = startMin - currentMin;
  const totalSec = minDiff * 60 - currentSec;
  return totalSec;
}

export function getNextClassForFaculty(
  entries: TimetableEntry[],
  facultyId: string,
  currentDate: Date,
  selectedDay: DayOfWeek,
  facultyName?: string
): { nextEntry: TimetableEntry | null; ongoingEntry: TimetableEntry | null } {
  const dayEntries = entries.filter((e) => {
    if (e.day !== selectedDay) return false;
    if (!facultyId || facultyId === 'all') return true;
    if (e.facultyId === facultyId) return true;
    if (facultyName && isFacultyNameMatch(e.facultyName, facultyName)) return true;
    if (isFacultyNameMatch(e.facultyName, facultyId)) return true;
    return false;
  });

  const currentMin = currentDate.getHours() * 60 + currentDate.getMinutes();

  let ongoingEntry: TimetableEntry | null = null;
  let nextEntry: TimetableEntry | null = null;
  let smallestDiff = Infinity;

  dayEntries.forEach((entry) => {
    const startMin = parseTimeToMinutes(entry.startTime);
    const endMin = parseTimeToMinutes(entry.endTime);

    if (currentMin >= startMin && currentMin < endMin) {
      ongoingEntry = entry;
    } else if (startMin > currentMin) {
      const diff = startMin - currentMin;
      if (diff < smallestDiff) {
        smallestDiff = diff;
        nextEntry = entry;
      }
    }
  });

  return { nextEntry, ongoingEntry };
}

export function detectConflicts(entries: TimetableEntry[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const e1 = entries[i];
      const e2 = entries[j];

      if (e1.day !== e2.day) continue;

      const e1Start = parseTimeToMinutes(e1.startTime);
      const e1End = parseTimeToMinutes(e1.endTime);
      const e2Start = parseTimeToMinutes(e2.startTime);
      const e2End = parseTimeToMinutes(e2.endTime);

      const timesOverlap = e1Start < e2End && e2Start < e1End;

      if (timesOverlap) {
        if (e1.facultyId === e2.facultyId) {
          conflicts.push({
            id: `conflict_fac_${e1.id}_${e2.id}`,
            type: 'faculty',
            entry1: e1,
            entry2: e2,
            description: `${e1.facultyName} is scheduled for both "${e1.subjectName}" in ${e1.room} and "${e2.subjectName}" in ${e2.room} on ${e1.day} (${e1.startTime}-${e1.endTime})`,
          });
        }

        if (e1.room.trim().toLowerCase() === e2.room.trim().toLowerCase()) {
          conflicts.push({
            id: `conflict_room_${e1.id}_${e2.id}`,
            type: 'room',
            entry1: e1,
            entry2: e2,
            description: `Room "${e1.room}" is double-booked for "${e1.subjectName}" (${e1.facultyName}) and "${e2.subjectName}" (${e2.facultyName}) on ${e1.day} (${e1.startTime}-${e1.endTime})`,
          });
        }

        if (e1.batch && e2.batch && e1.batch.trim().toLowerCase() === e2.batch.trim().toLowerCase()) {
          conflicts.push({
            id: `conflict_batch_${e1.id}_${e2.id}`,
            type: 'batch',
            entry1: e1,
            entry2: e2,
            description: `Batch/Class "${e1.batch}" is double-booked for both "${e1.subjectName}" (${e1.facultyName}, ${e1.room}) and "${e2.subjectName}" (${e2.facultyName}, ${e2.room}) on ${e1.day} (${e1.startTime}-${e1.endTime})`,
          });
        }
      }
    }
  }

  return conflicts;
}


export function normalizeFacultyName(name: string = ''): string {
  return name
    .toLowerCase()
    .replace(/\b(dr|prof|mr|mrs|ms|doc|associate|assistant|professor|sir|madam)\.?:?\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

export function isFacultyNameMatch(name1: string = '', name2: string = ''): boolean {
  if (!name1 || !name2) return false;
  const norm1 = normalizeFacultyName(name1);
  const norm2 = normalizeFacultyName(name2);
  if (!norm1 || !norm2) return false;

  const s1 = norm1.replace(/\s+/g, '');
  const s2 = norm2.replace(/\s+/g, '');
  if (s1 === s2) return true;

  // 1. Direct Substring Check for non-trivial strings (must be >= 6 chars to avoid short partial collisions)
  if (s1.length >= 6 && s2.length >= 6 && (s1.includes(s2) || s2.includes(s1))) return true;

  const tokens1 = norm1.split(/\s+/).filter(Boolean);
  const tokens2 = norm2.split(/\s+/).filter(Boolean);

  if (tokens1.length === 0 || tokens2.length === 0) return false;

  // Exact token set check
  if (tokens1.length === tokens2.length && tokens1.every((t, i) => t === tokens2[i])) return true;

  // 2. Acronym / Initials Matching (e.g. "DG" vs "Deborshee Gogoi")
  const acronym1 = tokens1.map((t) => t[0]).join('');
  const acronym2 = tokens2.map((t) => t[0]).join('');

  if (s1.length >= 2 && s1.length <= 4 && s1 === acronym2) return true;
  if (s2.length >= 2 && s2.length <= 4 && s2 === acronym1) return true;

  // 3. Surname Match + First Name Initial
  // e.g. "D. Gogoi" vs "Deborshee Gogoi", "S. Boruah" vs "Sampreeti Boruah"
  const surname1 = tokens1[tokens1.length - 1];
  const surname2 = tokens2[tokens2.length - 1];

  if (surname1 === surname2 && surname1.length >= 3) {
    const first1 = tokens1[0];
    const first2 = tokens2[0];
    // Only match if first names are strictly identical, OR if one is a single-letter initial matching the other's start
    if (first1 === first2) return true;
    if (first1.length === 1 && first2.startsWith(first1)) return true;
    if (first2.length === 1 && first1.startsWith(first2)) return true;
  }

  // 4. First Name Match + Surname Initial (e.g. "Deborshee G" vs "Deborshee Gogoi")
  const firstName1 = tokens1[0];
  const firstName2 = tokens2[0];
  if (firstName1 === firstName2 && firstName1.length >= 4) {
    if (tokens1.length === 1 || tokens2.length === 1) return true;
    const second1 = tokens1[1];
    const second2 = tokens2[1];
    if (second1 && second2 && (second1 === second2 || (second1.length === 1 && second2.startsWith(second1)) || (second2.length === 1 && second1.startsWith(second2)))) {
      return true;
    }
  }

  return false;
}

export function isPhoneMatch(p1?: string, p2?: string): boolean {
  if (!p1 || !p2) return false;
  const clean1 = p1.replace(/\D/g, '');
  const clean2 = p2.replace(/\D/g, '');
  if (!clean1 || !clean2) return false;
  if (clean1 === clean2) return true;
  const last10_1 = clean1.length >= 10 ? clean1.slice(-10) : clean1;
  const last10_2 = clean2.length >= 10 ? clean2.slice(-10) : clean2;
  return last10_1 === last10_2;
}

export function generateSampleCsvContent(): string {
  return `Faculty ID,Faculty Name,Department,Subject Code,Subject Name,Room,Day,Start Time,End Time,Batch
EMP-001,Faculty Member 1,Commerce,MAJ101,Major Course 1,Room No. C1,Monday,08:00,09:00,FYUGP 1st Sem
EMP-002,Faculty Member 2,Commerce,MIN101,Minor Course 1,Room No. C4,Monday,09:00,10:00,FYUGP 1st Sem
`;
}
