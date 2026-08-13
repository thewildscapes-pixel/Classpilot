import { TimetableEntry } from '../types';

/**
 * Converts DayOfWeek string to 2-letter RRULE day code for iCalendar
 */
function getRruleDayCode(dayStr: string): string {
  const d = dayStr.toUpperCase().trim();
  if (d.startsWith('MON')) return 'MO';
  if (d.startsWith('TUE')) return 'TU';
  if (d.startsWith('WED')) return 'WE';
  if (d.startsWith('THU')) return 'TH';
  if (d.startsWith('FRI')) return 'FR';
  if (d.startsWith('SAT')) return 'SA';
  if (d.startsWith('SUN')) return 'SU';
  return 'MO';
}

/**
 * Calculates next upcoming date for a given day of week
 */
function getNextDateForDay(dayStr: string): Date {
  const dayMap: Record<string, number> = {
    MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 0,
  };
  const targetDayNum = dayMap[dayStr.toUpperCase()] ?? 1;
  const now = new Date();
  const currentDayNum = now.getDay();

  let daysAhead = targetDayNum - currentDayNum;
  if (daysAhead < 0) daysAhead += 7;

  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + daysAhead);
  return targetDate;
}

/**
 * Helper to format Date into iCalendar timestamp string (YYYYMMDDTHHMMSSZ)
 */
function formatIcsDateTime(date: Date, timeStr: string): string {
  // Parse timeStr like "09:00", "09:00 AM", "14:30"
  let hours = 9;
  let minutes = 0;

  if (timeStr) {
    const isPM = /pm/i.test(timeStr);
    const isAM = /am/i.test(timeStr);
    const cleanTime = timeStr.replace(/(am|pm)/i, '').trim();
    const parts = cleanTime.split(':').map((p) => parseInt(p.trim(), 10));

    if (!isNaN(parts[0])) {
      hours = parts[0];
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
    }
    if (parts[1] && !isNaN(parts[1])) {
      minutes = parts[1];
    }
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');

  return `${year}${month}${day}T${hh}${mm}00`;
}

/**
 * Generates RFC 5545 iCalendar (.ics) string with VALARM blocks
 * so native phone calendar apps ring alarms even when phone is in sleep mode.
 */
export function generateClassAlarmsIcs(
  entries: TimetableEntry[],
  facultyName = 'Faculty Member',
  alarmLeadMinutes = 10
): string {
  const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClassPilot Timetable Alarm System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${facultyName} - ClassPilot Routine Alarms`,
    'X-WR-TIMEZONE:Asia/Kolkata',
  ];

  entries.forEach((entry, idx) => {
    const nextDate = getNextDateForDay(entry.day);
    const startIcs = formatIcsDateTime(nextDate, entry.startTime);
    const endIcs = formatIcsDateTime(nextDate, entry.endTime);
    const dayCode = getRruleDayCode(entry.day);

    const summary = `⏰ CLASS: ${entry.subjectName || entry.subjectCode} (${entry.room})`;
    const description = `ClassPeriod: ${entry.startTime} - ${entry.endTime}\\nSubject: ${entry.subjectName} (${entry.subjectCode})\\nRoom: ${entry.room}\\nBatch: ${entry.batch}\\nDepartment: ${entry.department || 'General'}`;

    icsLines.push(
      'BEGIN:VEVENT',
      `UID:classpilot_alarm_${entry.id || idx}_${startIcs}@digboicollege.edu.in`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startIcs}`,
      `DTEND:${endIcs}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${dayCode}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:Room ${entry.room}`,
      'STATUS:CONFIRMED',
      // Native Alarm 1: 10 mins before class
      'BEGIN:VALARM',
      `TRIGGER:-PT${alarmLeadMinutes}M`,
      'ACTION:AUDIO',
      `DESCRIPTION:Upcoming Class Alarm: ${entry.subjectName} in ${entry.room}`,
      'END:VALARM',
      // Native Alarm 2: 5 mins before class
      'BEGIN:VALARM',
      'TRIGGER:-PT5M',
      'ACTION:AUDIO',
      `DESCRIPTION:Final Warning Bell: ${entry.subjectName} starting in 5 mins!`,
      'END:VALARM',
      // Native Display Notification
      'BEGIN:VALARM',
      `TRIGGER:-PT${alarmLeadMinutes}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:⏰ Class Alert: ${entry.subjectName} in Room ${entry.room} in ${alarmLeadMinutes} mins`,
      'END:VALARM',
      'END:VEVENT'
    );
  });

  icsLines.push('END:VCALENDAR');

  return icsLines.join('\r\n');
}

/**
 * Downloads .ics calendar file to device
 */
export function downloadIcsCalendarFile(icsContent: string, filename = 'ClassPilot_Routine_Alarms.ics'): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates direct Google Calendar web event URL for single class
 */
export function generateGoogleCalendarUrl(entry: TimetableEntry): string {
  const nextDate = getNextDateForDay(entry.day);
  const startIcs = formatIcsDateTime(nextDate, entry.startTime);
  const endIcs = formatIcsDateTime(nextDate, entry.endTime);

  const title = encodeURIComponent(`⏰ Class: ${entry.subjectName || entry.subjectCode} (Room ${entry.room})`);
  const details = encodeURIComponent(
    `Class Period: ${entry.startTime} - ${entry.endTime}\nSubject: ${entry.subjectName} (${entry.subjectCode})\nBatch: ${entry.batch}\nRoom: ${entry.room}`
  );
  const location = encodeURIComponent(`Room ${entry.room}, Digboi College`);
  const dates = `${startIcs}/${endIcs}`;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}&recur=RRULE:FREQ=WEEKLY;BYDAY=${getRruleDayCode(entry.day)}`;
}

/**
 * Request Web Notification permissions
 */
export async function requestWebNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    alert('Web Notifications are not supported in this browser.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

/**
 * Send local OS Web Notification (works on desktop / Android browser when screen is on or backgrounded)
 */
export function sendLocalClassNotification(title: string, message: string, tag = 'classpilot_alert'): void {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const options: NotificationOptions & { vibrate?: number[] } = {
        body: message,
        icon: '/favicon.ico',
        tag: tag,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 400],
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, options);
        });
      } else {
        new Notification(title, options);
      }
    } catch (err) {
      console.warn('Unable to trigger Notification API:', err);
    }
  }
}
