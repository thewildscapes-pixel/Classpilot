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
  selectedDay: DayOfWeek
): { nextEntry: TimetableEntry | null; ongoingEntry: TimetableEntry | null } {
  const dayEntries = entries.filter(
    (e) => e.facultyId === facultyId && e.day === selectedDay
  );

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

export function generateSampleCsvContent(): string {
  return `Faculty ID,Faculty Name,Department,Subject Code,Subject Name,Room,Day,Start Time,End Time,Batch
fac_1,Dr. Deborshee Gogoi,Commerce,COM101,Financial Accounting,Room No. C1,Monday,08:00,09:00,FYUGP 1st Sem Commerce
fac_2,Dr. Sampreeti Boruah,Commerce,COM102,Business Law,Room No. C4,Monday,09:00,10:00,FYUGP 1st Sem Commerce
fac_3,Dr. Murchana Gogoi,Commerce,ENG101,Business English,Room No. C9,Monday,11:00,12:00,HS 1st Yr Commerce
fac_4,Dr. Subhadeep Chakraborty,Commerce,AEC101,Business Communication,Hall,Monday,11:00,12:00,FYUGP 1st Sem All
fac_5,Dr. Viveka Gupta,Commerce,MAT101,Business Mathematics,Room No. C10,Monday,09:00,10:00,FYUGP 1st Sem Commerce
fac_6,Pradip Chandra Das,Commerce,ACC101,Accountancy,Room No. C5,Monday,08:00,09:00,HS 1st Yr Commerce
fac_7,Samim Sultana Bora,Commerce,ECO101,Microeconomics,Room No. C6,Monday,10:00,11:00,HS 1st Yr Commerce
`;
}
