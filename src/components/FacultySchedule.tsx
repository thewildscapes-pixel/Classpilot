import React, { useState } from 'react';
import { TimetableEntry, Faculty, DayOfWeek, User, Student } from '../types';
import { DAYS_OF_WEEK, getEntryStatus, parseTimeToMinutes, formatMinutesTo12H, getCurrentDayName, isFacultyNameMatch, isPhoneMatch } from '../utils/timeUtils';
import { ClassQrAttendanceModal } from './ClassQrAttendanceModal';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Search,
  CheckCircle2,
  Bell,
  BookOpen,
  LayoutGrid,
  List,
  Sparkles,
  ArrowRight,
  Printer,
  FileText,
  Coffee,
  Tag,
  Zap,
  Check,
  X,
  UserCheck,
  QrCode,
} from 'lucide-react';

interface FacultyScheduleProps {
  timetable: TimetableEntry[];
  facultyList: Faculty[];
  selectedFacultyId: string;
  onSelectFaculty: (id: string) => void;
  selectedDay: DayOfWeek;
  onSelectDay: (day: DayOfWeek) => void;
  currentDate: Date;
  onTriggerAlert: (entry: TimetableEntry) => void;
  currentUser: User;
  onNavigateToDiary?: (entry: TimetableEntry) => void;
  students?: Student[];
}

interface FreePeriodItem {
  isFreePeriod: true;
  id: string;
  startTime: string;
  endTime: string;
  durationMins: number;
}

type TimelineItem = (TimetableEntry & { isFreePeriod?: false }) | FreePeriodItem;

// Helper to count enrolled students matching a timetable entry's batch / department
const getEnrolledStudentCount = (entry: TimetableEntry, studentsList: Student[] = []): number => {
  if (!studentsList || studentsList.length === 0) return 0;

  const b = (entry.batch || '').toLowerCase().trim();
  const ps = (entry.programSemester || '').toLowerCase().trim();
  const d = (entry.department || '').toLowerCase().trim();

  const matched = studentsList.filter((s) => {
    const sb = (s.classBatch || '').toLowerCase().trim();
    if (!sb) return false;

    if (sb === b || sb === ps) return true;
    if (b && (sb.includes(b) || b.includes(sb))) return true;
    if (ps && (sb.includes(ps) || ps.includes(sb))) return true;

    const entryTokens = `${b} ${ps} ${d}`.split(/[\s\-_,]+/).filter((t) => t.length > 2);
    const studentTokens = sb.split(/[\s\-_,]+/).filter((t) => t.length > 2);
    const shared = entryTokens.filter((tok) => studentTokens.includes(tok));
    return shared.length >= 2;
  });

  if (matched.length > 0) return matched.length;

  const deptMatched = studentsList.filter((s) => {
    const sb = (s.classBatch || '').toLowerCase().trim();
    return d && d.length > 2 && sb.includes(d);
  });

  return deptMatched.length;
};

export const FacultySchedule: React.FC<FacultyScheduleProps> = ({
  timetable,
  facultyList,
  selectedFacultyId,
  onSelectFaculty,
  selectedDay,
  onSelectDay,
  currentDate,
  onTriggerAlert,
  currentUser,
  onNavigateToDiary,
  students = [],
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [jumpDate, setJumpDate] = useState<string>('');
  const [qrModalEntry, setQrModalEntry] = useState<TimetableEntry | null>(null);

  // Normalize day helper for robust day comparison (e.g., 'Mon', 'MONDAY', 'Monday ')
  const normalizeDay = (d: string = ''): string => {
    const clean = d.trim().toLowerCase();
    if (clean.startsWith('mon')) return 'Monday';
    if (clean.startsWith('tue')) return 'Tuesday';
    if (clean.startsWith('wed')) return 'Wednesday';
    if (clean.startsWith('thu')) return 'Thursday';
    if (clean.startsWith('fri')) return 'Friday';
    if (clean.startsWith('sat')) return 'Saturday';
    if (clean.startsWith('sun')) return 'Sunday';
    return d.trim();
  };

  // Determine current active faculty object
  const currentFaculty: Faculty =
    facultyList.find((f) => f.id === selectedFacultyId) ||
    facultyList.find(
      (f) =>
        currentUser &&
        (f.id === currentUser.facultyId ||
          (f.email && currentUser.email && f.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim()) ||
          isPhoneMatch(f.phone, currentUser.phone) ||
          isPhoneMatch(f.whatsappPhone, currentUser.phone) ||
          isPhoneMatch(f.phone, currentUser.whatsappPhone) ||
          isFacultyNameMatch(f.name, currentUser.name))
    ) ||
    (currentUser
      ? {
          id: currentUser.facultyId || currentUser.id || 'fac_user',
          name: currentUser.name || 'Faculty Member',
          email: currentUser.email || '',
          department: currentUser.department || 'Commerce',
          designation: 'Faculty Member',
          phone: currentUser.phone || currentUser.whatsappPhone || '',
          whatsappPhone: currentUser.phone || currentUser.whatsappPhone || '',
          isVerified: true,
        }
      : facultyList[0]);

  // Check if viewing logged-in user's own schedule or another faculty's
  const isViewingOwnSchedule = Boolean(
    currentUser &&
      (selectedFacultyId === currentUser.facultyId ||
        (currentFaculty &&
          (currentFaculty.id === currentUser.facultyId ||
            (currentFaculty.email && currentUser.email && currentFaculty.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim()) ||
            isFacultyNameMatch(currentFaculty.name, currentUser.name))))
  );

  // Handle Jump-to-Date selection
  const handleJumpDateChange = (dateStr: string) => {
    setJumpDate(dateStr);
    if (!dateStr) return;
    const parsed = new Date(dateStr + 'T00:00:00');
    if (isNaN(parsed.getTime())) return;
    const dayIdx = parsed.getDay();
    const dayName = DAYS_OF_WEEK[dayIdx === 0 ? 0 : dayIdx - 1] || 'Monday';
    onSelectDay(dayName);
    setViewMode('daily');
  };

  // Filter timetable entries strictly for active target faculty
  const allFacultyEntries = timetable.filter((e) => {
    // If logged-in user is a faculty member (non-admin), strictly scope to their identity
    if (currentUser && currentUser.role === 'faculty') {
      if (currentUser.facultyId && e.facultyId === currentUser.facultyId) return true;
      if (currentUser.employeeId && e.facultyId === currentUser.employeeId) return true;
      if (currentUser.name && isFacultyNameMatch(e.facultyName, currentUser.name)) return true;
      if (currentUser.email && e.facultyName && e.facultyName.toLowerCase().includes(currentUser.email.split('@')[0].toLowerCase())) return true;

      // Match via phone / email / ID linkage in facultyList
      const matchedFacInList = facultyList.find(
        (f) => f.id === e.facultyId || isFacultyNameMatch(f.name, e.facultyName)
      );
      if (
        matchedFacInList &&
        (matchedFacInList.id === currentUser.facultyId ||
          (matchedFacInList.email && currentUser.email && matchedFacInList.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim()) ||
          isPhoneMatch(matchedFacInList.phone, currentUser.phone) ||
          isPhoneMatch(matchedFacInList.whatsappPhone, currentUser.phone) ||
          isPhoneMatch(matchedFacInList.phone, currentUser.whatsappPhone) ||
          isFacultyNameMatch(matchedFacInList.name, currentUser.name))
      ) {
        return true;
      }
      return false;
    }

    // For Admin user, match by selected faculty dropdown ID or selected faculty object
    if (selectedFacultyId && e.facultyId === selectedFacultyId) return true;

    if (currentFaculty) {
      if (e.facultyId && e.facultyId === currentFaculty.id) return true;
      if (e.facultyName && isFacultyNameMatch(e.facultyName, currentFaculty.name)) return true;
      if (currentFaculty.email && e.facultyName && e.facultyName.toLowerCase().includes(currentFaculty.email.split('@')[0].toLowerCase())) return true;
    }

    return false;
  });

  // Filter single day entries with normalized day comparison
  const targetDayNorm = normalizeDay(selectedDay);
  const dayEntries = allFacultyEntries
    .filter((e) => normalizeDay(e.day) === targetDayNorm)
    .filter((e) => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        e.subjectName.toLowerCase().includes(q) ||
        e.subjectCode.toLowerCase().includes(q) ||
        e.room.toLowerCase().includes(q) ||
        e.batch.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

  // --- HIGHLIGHT CURRENT / NEXT CLASS ENGINE ---
  const currentMin = currentDate.getHours() * 60 + currentDate.getMinutes();
  const todayEntriesSorted = [...allFacultyEntries]
    .filter((e) => normalizeDay(e.day) === targetDayNorm)
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

  const ongoingClass = todayEntriesSorted.find((e) => {
    const start = parseTimeToMinutes(e.startTime);
    const end = parseTimeToMinutes(e.endTime);
    return currentMin >= start && currentMin < end;
  });

  const nextClass = !ongoingClass
    ? todayEntriesSorted.find((e) => parseTimeToMinutes(e.startTime) > currentMin)
    : null;

  const highlightClass = ongoingClass || nextClass || todayEntriesSorted[0] || null;
  const isOngoing = Boolean(ongoingClass);

  // --- FREE PERIOD GAPS COMPUTATION ---
  const timelineItems: TimelineItem[] = [];
  let lastEndMin = 540; // 09:00 AM

  dayEntries.forEach((entry) => {
    const start = parseTimeToMinutes(entry.startTime);
    const end = parseTimeToMinutes(entry.endTime);

    if (start > lastEndMin && start - lastEndMin >= 20) {
      timelineItems.push({
        isFreePeriod: true,
        id: `free_${lastEndMin}_${start}`,
        startTime: formatMinutesTo12H(lastEndMin),
        endTime: formatMinutesTo12H(start),
        durationMins: start - lastEndMin,
      });
    }
    timelineItems.push(entry);
    lastEndMin = Math.max(lastEndMin, end);
  });

  // Post-class free period gap if before 16:30
  if (lastEndMin < 990 && dayEntries.length > 0) {
    timelineItems.push({
      isFreePeriod: true,
      id: `free_end_${lastEndMin}`,
      startTime: formatMinutesTo12H(lastEndMin),
      endTime: '04:30 PM',
      durationMins: 990 - lastEndMin,
    });
  }

  // Weekly stats
  const totalWeeklyClasses = allFacultyEntries.length;
  const totalWeeklyMinutes = allFacultyEntries.reduce((acc, entry) => {
    const start = parseTimeToMinutes(entry.startTime);
    const end = parseTimeToMinutes(entry.endTime);
    return acc + Math.max(0, end - start);
  }, 0);
  const totalWeeklyHours = (totalWeeklyMinutes / 60).toFixed(1);

  // --- PRINT / PDF EXPORT PERSONAL TIMETABLE ---
  const handleExportWeeklyPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popup windows to generate your printable PDF timetable.');
      return;
    }

    let rowsHtml = '';
    DAYS_OF_WEEK.forEach((day) => {
      const entries = allFacultyEntries
        .filter((e) => normalizeDay(e.day) === normalizeDay(day))
        .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

      const dayText =
        entries.length === 0
          ? '<em style="color:#94a3b8;">No Scheduled Lectures (Free Day)</em>'
          : entries
              .map(
                (e) => `
                <div style="margin-bottom:6px; padding:8px 10px; background:#f8fafc; border-radius:6px; border-left:4px solid #2563eb; font-size:12px;">
                  <strong style="color:#1e3a8a;">${e.startTime} - ${e.endTime}</strong> | 
                  <strong style="color:#0f172a;">${e.subjectName} (${e.subjectCode})</strong><br/>
                  <span style="color:#475569;">Room No: <strong>${e.room}</strong> | Batch: ${e.batch}${
                  e.isSubstitute || e.notes?.toLowerCase().includes('substitute')
                    ? ' | <span style="color:#d97706; font-weight:bold;">[Substitute]</span>'
                    : ''
                }</span>
                </div>`
              )
              .join('');

      rowsHtml += `
        <tr>
          <td style="padding:10px; border:1px solid #cbd5e1; font-weight:bold; background:#f1f5f9; width:110px; vertical-align:top; color:#1e293b;">${day}</td>
          <td style="padding:10px; border:1px solid #cbd5e1; vertical-align:top;">${dayText}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Digboi College Timetable - ${currentFaculty?.name || 'Faculty'}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #0f172a; line-height: 1.4; }
            .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 18px; }
            .header h1 { margin: 0; font-size: 22px; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; }
            .header h2 { margin: 4px 0 0 0; font-size: 13px; color: #475569; font-weight: 600; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12px; background: #eff6ff; padding: 12px 16px; border-radius: 8px; border: 1px solid #bfdbfe; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>DIGBOI COLLEGE, ASSAM</h1>
            <h2>Faculty Master Workload & Timetable Schedule</h2>
          </div>
          <div class="meta">
            <div><strong>Faculty Member:</strong> ${currentFaculty?.name || 'Dr. Faculty Member'}</div>
            <div><strong>Department:</strong> ${currentFaculty?.department || 'Commerce'}</div>
            <div><strong>Weekly Load:</strong> ${totalWeeklyClasses} Lectures (${totalWeeklyHours} hrs)</div>
            <div><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
          </div>
          <table>
            <thead>
              <tr style="background:#1e293b; color:white; font-size:12px;">
                <th style="padding:10px; border:1px solid #cbd5e1; text-align:left; width:110px;">Day</th>
                <th style="padding:10px; border:1px solid #cbd5e1; text-align:left;">Allotted Lectures & Classrooms</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">
            ClassPilot Academic System | Digboi College | Designed & Developed by © Deborshee Gogoi
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Header Bar */}
      <div className="bg-slate-800/90 rounded-2xl p-4 sm:p-5 border border-slate-700/80 shadow-md space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Faculty Selector */}
          <div className="flex items-center space-x-3 flex-1">
            {currentFaculty?.avatarUrl ? (
              <img
                src={currentFaculty.avatarUrl}
                alt={currentFaculty.name}
                className="w-11 h-11 rounded-xl object-cover ring-2 ring-blue-500/30 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-base ring-2 ring-blue-500/30 shrink-0">
                {currentFaculty?.name.charAt(0) || 'F'}
              </div>
            )}
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Logged-in Faculty Profile
              </label>
              <select
                value={selectedFacultyId}
                onChange={(e) => onSelectFaculty(e.target.value)}
                className="w-full bg-slate-900 text-white font-semibold text-sm sm:text-base rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {facultyList.map((fac) => (
                  <option key={fac.id} value={fac.id} className="bg-slate-900 text-white">
                    {fac.name} ({fac.department})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Box, Jump-to-Date & View Mode Toggle & Export PDF */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-48">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search subject, room..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/90 text-white text-xs rounded-xl pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-500"
              />
            </div>

            {/* Jump-to-Date Calendar Picker */}
            <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700/80 shrink-0 w-full sm:w-auto" title="Jump directly to any date's class allotment">
              <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 hidden lg:inline">Jump Date:</span>
              <input
                type="date"
                value={jumpDate}
                onChange={(e) => handleJumpDateChange(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
              />
              {jumpDate && (
                <button
                  onClick={() => {
                    setJumpDate('');
                    onSelectDay(getCurrentDayName(new Date()));
                  }}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-md text-[10px]"
                  title="Reset to today"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View Mode Switcher (Today / Daily vs Weekly Grid) */}
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700/80 shrink-0 w-full sm:w-auto">
              <button
                onClick={() => setViewMode('daily')}
                className={`flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'daily'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Today</span>
              </button>
              <button
                onClick={() => setViewMode('weekly')}
                className={`flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'weekly'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>This Week</span>
              </button>
            </div>

            {/* Print / Export Personal Timetable PDF */}
            <button
              onClick={handleExportWeeklyPdf}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 flex items-center space-x-1.5 shrink-0 transition-all cursor-pointer"
              title="Print / Export personal weekly timetable as PDF"
            >
              <Printer className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </div>
        </div>

        {/* Day Tabs Bar (Only visible in Daily view) */}
        {viewMode === 'daily' && (
          <div className="pt-3 border-t border-slate-700/60 flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {DAYS_OF_WEEK.map((day) => {
              const count = allFacultyEntries.filter((e) => normalizeDay(e.day) === normalizeDay(day)).length;
              const isSelected = selectedDay === day;

              return (
                <button
                  key={day}
                  onClick={() => onSelectDay(day)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/40'
                      : 'bg-slate-900/60 text-slate-300 hover:bg-slate-700/60 hover:text-white border border-slate-700/50'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{day}</span>
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isSelected ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* VIEW MODE 1: DAILY VIEW */}
      {viewMode === 'daily' && (
        <div className="space-y-5">
          {/* PROMINENT HIGHLIGHT HERO BANNER: CURRENT / NEXT CLASS */}
          {highlightClass && (
            <div
              className={`rounded-2xl p-4 sm:p-5 border shadow-xl relative overflow-hidden transition-all ${
                isOngoing
                  ? 'bg-gradient-to-r from-emerald-950/90 via-slate-900 to-emerald-900/60 border-emerald-500/80 ring-2 ring-emerald-500/30'
                  : 'bg-gradient-to-r from-blue-950/90 via-slate-900 to-indigo-950/70 border-blue-500/80 ring-1 ring-blue-500/30'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    {isOngoing ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>ONGOING LECTURE NOW</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center space-x-1.5">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>NEXT UPCOMING CLASS</span>
                      </span>
                    )}

                    {(highlightClass.isSubstitute ||
                      highlightClass.notes?.toLowerCase().includes('substitute')) && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-amber-400" />
                        <span>SUBSTITUTE LECTURE</span>
                      </span>
                    )}
                  </div>

                  <h3 className="font-heading font-extrabold text-lg sm:text-xl text-white">
                    {highlightClass.startTime} – {highlightClass.endTime} &bull;{' '}
                    <span className="text-blue-300">{highlightClass.subjectName}</span>{' '}
                    <span className="text-slate-400 text-sm font-medium">({highlightClass.subjectCode})</span>
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <span className="flex items-center space-x-1 text-cyan-300 font-semibold bg-slate-900/80 px-2.5 py-0.5 rounded-md border border-slate-700/80">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Room {highlightClass.room}</span>
                    </span>

                    <span className="flex items-center space-x-1 text-slate-300 font-medium bg-slate-900/80 px-2.5 py-0.5 rounded-md border border-slate-700/80">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>Class: {highlightClass.batch}</span>
                    </span>

                    <span className="flex items-center space-x-1.5 text-indigo-200 font-bold bg-indigo-950/80 px-2.5 py-0.5 rounded-md border border-indigo-500/50 shadow-sm" title={`${getEnrolledStudentCount(highlightClass, students)} students enrolled in this class batch`}>
                      <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{getEnrolledStudentCount(highlightClass, students)} Students Enrolled</span>
                    </span>
                  </div>
                </div>

                {/* Direct Action Link to Class Diary Entry */}
                {onNavigateToDiary && (
                  <button
                    onClick={() => onNavigateToDiary(highlightClass)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 shrink-0 transition-all cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-white" />
                    <span>Fill Class Diary Entry</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Timeline Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
              <span>{selectedDay}&apos;s Class Schedule & Timeline</span>
              <span className="text-xs text-slate-400 font-normal">
                ({dayEntries.length} {dayEntries.length === 1 ? 'lecture' : 'lectures'})
              </span>
            </h3>
          </div>

          {dayEntries.length === 0 ? (
            <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <Calendar className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-300">
                No classes scheduled for {currentFaculty?.name} on {selectedDay}.
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Select a different day above or switch to <strong className="text-blue-400">This Week</strong> view to see full workload.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {timelineItems.map((item) => {
                if (item.isFreePeriod) {
                  return (
                    <div
                      key={item.id}
                      className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-3.5 pl-6 flex items-center justify-between text-xs text-slate-400 relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-700" />
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-slate-800/80 text-amber-400">
                          <Coffee className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-mono font-bold text-slate-300">
                            {item.startTime} – {item.endTime}
                          </span>
                          <span className="ml-2 font-semibold text-slate-400">&bull; Free Period / Gap ({item.durationMins} mins)</span>
                          <p className="text-[11px] text-slate-500 italic">
                            Academic consultation, research, grading & session preparation window
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-md">
                        Free Slot
                      </span>
                    </div>
                  );
                }

                const entry = item as TimetableEntry;
                const status = getEntryStatus(entry, currentDate);
                const startMin = parseTimeToMinutes(entry.startTime);
                const minsDiff = startMin - currentMin;
                const isAlertWindow = status === 'Upcoming' && minsDiff >= 0 && minsDiff <= 10;
                const isSubstitute =
                  entry.isSubstitute ||
                  entry.notes?.toLowerCase().includes('substitute') ||
                  entry.batch?.toLowerCase().includes('substitute');

                return (
                  <div
                    key={entry.id}
                    className={`bg-slate-800/90 rounded-2xl p-5 border transition-all duration-200 shadow-md hover:shadow-xl relative overflow-hidden ${
                      status === 'Ongoing'
                        ? 'border-emerald-500/80 ring-1 ring-emerald-500/40 bg-gradient-to-r from-slate-800 via-slate-800 to-emerald-950/20'
                        : isAlertWindow
                        ? 'border-amber-500/80 ring-1 ring-amber-500/40 bg-gradient-to-r from-slate-800 via-slate-800 to-amber-950/20'
                        : isSubstitute
                        ? 'border-amber-500/60 ring-1 ring-amber-500/30'
                        : 'border-slate-700/80 hover:border-slate-600'
                    }`}
                  >
                    {/* Status Strip Accent */}
                    <div
                      className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                        status === 'Ongoing'
                          ? 'bg-emerald-400'
                          : isAlertWindow
                          ? 'bg-amber-400 animate-pulse'
                          : isSubstitute
                          ? 'bg-amber-500'
                          : status === 'Upcoming'
                          ? 'bg-blue-500'
                          : 'bg-slate-600'
                      }`}
                    />

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pl-2">
                      {/* Time Slot & Subject Details */}
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
                            {formatMinutesTo12H(parseTimeToMinutes(entry.startTime))} -{' '}
                            {formatMinutesTo12H(parseTimeToMinutes(entry.endTime))}
                          </span>

                          {/* Status Badge */}
                          {status === 'Ongoing' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                              <span>ONGOING</span>
                            </span>
                          )}

                          {isAlertWindow && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1 animate-pulse">
                              <Bell className="w-3 h-3 text-amber-400" />
                              <span>STARTS IN {minsDiff} MINS</span>
                            </span>
                          )}

                          {/* Substitute Badge */}
                          {isSubstitute && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                              <Tag className="w-3 h-3 text-amber-400" />
                              <span>Substitute Class</span>
                            </span>
                          )}

                          {status === 'Upcoming' && !isAlertWindow && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              Upcoming
                            </span>
                          )}

                          {status === 'Completed' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-700/50 text-slate-400 border border-slate-700">
                              Completed
                            </span>
                          )}
                        </div>

                        <div>
                          <h4 className="font-heading font-bold text-lg text-white">
                            {entry.subjectName}{' '}
                            <span className="text-slate-400 text-sm font-semibold">
                              ({entry.subjectCode})
                            </span>
                          </h4>
                          {entry.notes && (
                            <p className="text-xs text-slate-300 italic mt-1 bg-slate-900/40 px-3 py-1.5 rounded-lg border border-slate-700/50">
                              💡 Note: {entry.notes}
                            </p>
                          )}
                        </div>

                        {/* Location & Batch Meta */}
                        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-300 pt-1">
                          <span className="flex items-center space-x-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700/70 text-cyan-300">
                            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Room: {entry.room}</span>
                          </span>

                          <span className="flex items-center space-x-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700/70 text-slate-300">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>Class/Section: {entry.batch}</span>
                          </span>

                          <span className="flex items-center space-x-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700/70 text-slate-400">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            <span>Dept: {entry.department}</span>
                          </span>

                          <span className="flex items-center space-x-1.5 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-500/40 text-indigo-300 font-bold shadow-sm" title={`${getEnrolledStudentCount(entry, students)} students registered in this batch`}>
                            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{getEnrolledStudentCount(entry, students)} Enrolled</span>
                          </span>
                        </div>
                      </div>

                      {/* Right Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-700/60">
                        <button
                          onClick={() => setQrModalEntry(entry)}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-cyan-300 hover:text-white text-xs font-bold border border-slate-700/80 flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm"
                          title="Generate QR code for student live attendance scan"
                        >
                          <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Attendance QR</span>
                        </button>

                        {onNavigateToDiary && (
                          <button
                            onClick={() => onNavigateToDiary(entry)}
                            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 flex items-center space-x-1.5 transition-all cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Fill Class Diary</span>
                          </button>
                        )}

                        <button
                          onClick={() => onTriggerAlert(entry)}
                          className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center space-x-1.5 transition-all cursor-pointer"
                          title="Simulate 10-min alert chime & notification for this class"
                        >
                          <Bell className="w-3.5 h-3.5 text-amber-400" />
                          <span>Test Alert</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: WEEKLY GRID VIEW */}
      {viewMode === 'weekly' && (
        <div className="space-y-6">
          {/* Weekly Workload Summary Stats Banner */}
          <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 rounded-2xl p-5 border border-blue-500/20 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="font-heading font-extrabold text-base text-white">
                  Weekly Master Timetable: {currentFaculty?.name}
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Department: <strong className="text-slate-200">{currentFaculty?.department}</strong> &bull; Read-only (Admin Controlled)
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-700/80 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Lectures</div>
                <div className="text-lg font-extrabold text-blue-400 font-mono">{totalWeeklyClasses}</div>
              </div>

              <div className="bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-700/80 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Teaching Load</div>
                <div className="text-lg font-extrabold text-amber-400 font-mono">{totalWeeklyHours} hrs</div>
              </div>

              <button
                onClick={handleExportWeeklyPdf}
                className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Timetable</span>
              </button>
            </div>
          </div>

          {/* 6-Day Timetable Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {DAYS_OF_WEEK.map((day) => {
              const entriesForDay = allFacultyEntries
                .filter((e) => normalizeDay(e.day) === normalizeDay(day))
                .filter((e) => {
                  if (!searchTerm.trim()) return true;
                  const q = searchTerm.toLowerCase();
                  return (
                    e.subjectName.toLowerCase().includes(q) ||
                    e.subjectCode.toLowerCase().includes(q) ||
                    e.room.toLowerCase().includes(q) ||
                    e.batch.toLowerCase().includes(q)
                  );
                })
                .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

              const isToday = selectedDay === day;

              return (
                <div
                  key={day}
                  className={`bg-slate-900/80 rounded-2xl border flex flex-col transition-all overflow-hidden ${
                    isToday
                      ? 'border-blue-500/80 ring-1 ring-blue-500/30'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Day Column Header */}
                  <div
                    onClick={() => {
                      onSelectDay(day);
                      setViewMode('daily');
                    }}
                    className={`p-3.5 border-b flex items-center justify-between cursor-pointer transition-colors ${
                      isToday
                        ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                        : 'bg-slate-800/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      <span className="font-heading font-extrabold text-sm">{day}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-950/80 border border-slate-700 text-slate-300">
                      {entriesForDay.length}
                    </span>
                  </div>

                  {/* Day Lectures List */}
                  <div className="p-3 space-y-3 flex-1">
                    {entriesForDay.length === 0 ? (
                      <div className="py-8 text-center text-slate-500 text-xs italic">
                        No lectures
                      </div>
                    ) : (
                      entriesForDay.map((entry) => {
                        const status = getEntryStatus(entry, currentDate);
                        const isSubstitute =
                          entry.isSubstitute ||
                          entry.notes?.toLowerCase().includes('substitute') ||
                          entry.batch?.toLowerCase().includes('substitute');

                        return (
                          <div
                            key={entry.id}
                            className={`p-3 rounded-xl border space-y-2 text-xs relative overflow-hidden transition-all ${
                              status === 'Ongoing'
                                ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-100'
                                : isSubstitute
                                ? 'bg-amber-950/30 border-amber-500/60 text-amber-100'
                                : 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600 text-slate-200'
                            }`}
                          >
                            {/* Time Badge & Substitute Tag */}
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-[11px] text-blue-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                                {formatMinutesTo12H(parseTimeToMinutes(entry.startTime))} - {formatMinutesTo12H(parseTimeToMinutes(entry.endTime))}
                              </span>

                              {isSubstitute && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  SUB
                                </span>
                              )}

                              {status === 'Ongoing' && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" title="Ongoing" />
                              )}
                            </div>

                            {/* Subject & Code */}
                            <div>
                              <div className="font-bold text-white leading-tight">
                                {entry.subjectName}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {entry.subjectCode}
                              </div>
                            </div>

                            {/* Room & Batch info */}
                            <div className="pt-1 border-t border-slate-700/50 flex items-center justify-between text-[10px]">
                              <span className="flex items-center space-x-1 text-cyan-300 font-semibold">
                                <MapPin className="w-3 h-3 text-cyan-400" />
                                <span>{entry.room}</span>
                              </span>
                              <span className="text-slate-400 font-medium">
                                {entry.batch}
                              </span>
                            </div>

                            {/* Enrolled Students Badge */}
                            <div className="flex items-center justify-between text-[10px] bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/30 text-indigo-300 font-semibold">
                              <span className="flex items-center space-x-1">
                                <UserCheck className="w-3 h-3 text-indigo-400" />
                                <span>Enrolled:</span>
                              </span>
                              <span className="font-extrabold text-indigo-200">{getEnrolledStudentCount(entry, students)} Students</span>
                            </div>

                            {/* Direct Fill Class Diary, QR Code or Alert */}
                            <div className="flex items-center space-x-1 pt-1">
                              <button
                                onClick={() => setQrModalEntry(entry)}
                                className="flex-1 py-1 bg-slate-950 hover:bg-slate-800 text-cyan-300 text-[10px] font-bold rounded border border-slate-700/80 flex items-center justify-center space-x-1 transition-all cursor-pointer"
                                title="Generate QR Code"
                              >
                                <QrCode className="w-3 h-3 text-cyan-400" />
                                <span>QR</span>
                              </button>

                              {onNavigateToDiary && (
                                <button
                                  onClick={() => onNavigateToDiary(entry)}
                                  className="flex-1 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-[10px] font-bold rounded flex items-center justify-center space-x-1 transition-all cursor-pointer"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>Diary</span>
                                </button>
                              )}

                              <button
                                onClick={() => onTriggerAlert(entry)}
                                className="py-1 px-2 bg-slate-950 hover:bg-slate-900 text-amber-400 text-[10px] font-medium rounded border border-slate-800 flex items-center justify-center transition-all cursor-pointer"
                                title="Test 10-min bell alarm"
                              >
                                <Bell className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Footer hint to view single day timeline */}
                  <div className="p-2 bg-slate-950/60 border-t border-slate-800 text-center">
                    <button
                      onClick={() => {
                        onSelectDay(day);
                        setViewMode('daily');
                      }}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center justify-center space-x-1 w-full cursor-pointer"
                    >
                      <span>Detailed View</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* QR Attendance Code Generator Modal */}
      {qrModalEntry && (
        <ClassQrAttendanceModal
          entry={qrModalEntry}
          facultyName={currentFaculty?.name || 'Faculty Member'}
          date={currentDate}
          students={students}
          onClose={() => setQrModalEntry(null)}
        />
      )}
    </div>
  );
};


