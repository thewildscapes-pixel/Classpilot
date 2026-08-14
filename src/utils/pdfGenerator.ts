import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ClassDiaryEntry, Faculty } from '../types';

export interface FacultyClassDiaryPDFOptions {
  faculty: Faculty | { name: string; department?: string; email?: string };
  entries: ClassDiaryEntry[];
  sessionName?: string;
  selectedSubjectName?: string;
  selectedSubjectCode?: string;
  timeFrameLabel?: string;
  startDate?: string;
  endDate?: string;
}

export function generateFacultyClassDiaryPDF(
  optionsOrFaculty: FacultyClassDiaryPDFOptions | (Faculty | { name: string; department?: string; email?: string }),
  legacyEntries?: ClassDiaryEntry[],
  legacySessionName: string = 'Odd Semester 2026'
) {
  let faculty: { name: string; department?: string; email?: string };
  let entries: ClassDiaryEntry[];
  let sessionName: string;
  let selectedSubjectName: string;
  let timeFrameLabel: string;

  if ('entries' in optionsOrFaculty && Array.isArray((optionsOrFaculty as any).entries)) {
    const opts = optionsOrFaculty as FacultyClassDiaryPDFOptions;
    faculty = {
      name: opts.faculty.name || 'Faculty Member',
      department: opts.faculty.department || 'Commerce',
      email: opts.faculty.email || '',
    };
    entries = opts.entries || [];
    sessionName = opts.sessionName || 'Academic Session 2026';
    selectedSubjectName = opts.selectedSubjectName || (opts.selectedSubjectCode ? `${opts.selectedSubjectCode}` : 'All Subjects');
    timeFrameLabel = opts.timeFrameLabel || (opts.startDate && opts.endDate ? `${opts.startDate} to ${opts.endDate}` : 'All Dates');
  } else {
    faculty = {
      name: (optionsOrFaculty as any).name || 'Faculty Member',
      department: (optionsOrFaculty as any).department || 'Commerce',
      email: (optionsOrFaculty as any).email || '',
    };
    entries = legacyEntries || [];
    sessionName = legacySessionName;
    selectedSubjectName = 'All Subjects';
    timeFrameLabel = 'All Dates';
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const reportId = `CP-DIARY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const nowStr = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 297, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('DIGBOI COLLEGE (AUTONOMOUS), DIGBOI - ASSAM', 14, 10);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Official Academic Class Diary Logbook • ${sessionName}`, 14, 17);

  doc.setTextColor(251, 191, 36); // amber-400
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Report ID: ${reportId}`, 225, 10);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${nowStr}`, 225, 17);

  // Summary Metrics Banner (Faculty Name, Total Classes Taken, Subject, Time Period)
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(14, 30, 269, 22, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, 30, 269, 22, 'S');

  // Row 1: Faculty Name & Total Classes Taken
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Faculty Name: ${faculty.name}`, 18, 37);

  doc.setTextColor(30, 64, 175); // blue-800
  doc.text(`Total Classes Taken: ${entries.length} Classes`, 175, 37);

  // Row 2: Subject & Time Period
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text(`Subject: ${selectedSubjectName}`, 18, 45);

  doc.setTextColor(71, 85, 105);
  doc.text(`Time Period: ${timeFrameLabel}`, 175, 45);

  // Helper for Day Name
  const getDayOfWeek = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short' });
    } catch {
      return '';
    }
  };

  // Table Data Preparation
  const tableRows = entries.map((e, idx) => {
    const lockWindowMs = 24 * 60 * 60 * 1000;
    const startMs = e.classStartTimestamp || new Date(`${e.date}T${e.startTime}`).getTime();
    const isLocked = Date.now() - startMs > lockWindowMs;
    const verifiedStatus = isLocked ? 'Verified (Locked)' : 'Provisional (<24h)';

    let attText = 'N/A';
    if (e.attendance && e.attendance.length > 0) {
      const present = e.attendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
      attText = `${present}/${e.attendance.length} (${Math.round((present / e.attendance.length) * 100)}%)`;
    }

    const dayName = getDayOfWeek(e.date);
    const dateAndDay = dayName ? `${e.date}\n(${dayName})` : e.date;
    const timeStr = `${e.startTime} - ${e.endTime}\n(${e.durationMins || 60}m)`;
    const roomStr = e.room || 'N/A';
    const classBatch = e.batch || '';
    const subjectInfo = e.subjectCode ? `${e.subjectCode}\n${e.subjectName}` : e.subjectName;

    // Detailed topic & syllabus unit details entered during 24h
    let details = e.topicTaught || 'Class Lecture';
    if (e.syllabusUnit) {
      details += `\n[Unit: ${e.syllabusUnit}]`;
    }
    if (e.remarks) {
      details += `\nNote: ${e.remarks}`;
    }

    return [
      (idx + 1).toString(),
      dateAndDay,
      timeStr,
      roomStr,
      classBatch,
      subjectInfo,
      details,
      attText,
      verifiedStatus,
    ];
  });

  autoTable(doc, {
    startY: 56,
    head: [
      [
        '#',
        'Date & Day',
        'Time',
        'Room No.',
        'Class / Batch',
        'Subject',
        'Details Entered (Topic, Syllabus & Remarks)',
        'Attendance',
        '24h Status',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85],
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 28 },
      5: { cellWidth: 38 },
      6: { cellWidth: 77 },
      7: { cellWidth: 24, halign: 'center' },
      8: { cellWidth: 24, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  // Calculate summary metrics
  const totalClasses = entries.length;
  const totalMins = entries.reduce((acc, curr) => acc + (curr.durationMins || 60), 0);
  const totalHours = (totalMins / 60).toFixed(1);

  let totalStudentsCount = 0;
  let totalPresentCount = 0;
  entries.forEach((e) => {
    if (e.attendance) {
      totalStudentsCount += e.attendance.length;
      totalPresentCount += e.attendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
    }
  });
  const avgAtt = totalStudentsCount > 0 ? Math.round((totalPresentCount / totalStudentsCount) * 100) : 100;

  // Footer & Digital Signature
  const finalY = (doc as any).lastAutoTable?.finalY || 160;
  
  if (finalY < 170) {
    doc.setFillColor(248, 250, 252);
    doc.rect(14, finalY + 5, 269, 19, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, finalY + 5, 269, 19, 'S');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('SUMMARY STATISTICS:', 18, finalY + 11);

    doc.setFont('helvetica', 'normal');
    doc.text(`Total Classes Taken: ${totalClasses}`, 68, finalY + 11);
    doc.text(`Total Duration: ${totalHours} Hours (${totalMins} Mins)`, 128, finalY + 11);
    doc.text(`Average Attendance: ${avgAtt}%`, 208, finalY + 11);

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Digital Signature / Verification Line: Generated on ${nowStr} via ClassPilot — Digboi College (Autonomous) • Unique Report ID: ${reportId}`,
      18,
      finalY + 19
    );
  }

  const cleanSubject = selectedSubjectName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  doc.save(`ClassPilot_ClassDiary_${faculty.name.replace(/\s+/g, '_')}_${cleanSubject}_${new Date().toISOString().split('T')[0]}.pdf`);
}

export function generateAdminConsolidatedPDF(
  entries: ClassDiaryEntry[],
  faculties: Faculty[],
  sessionName: string = 'Odd Semester 2025–26'
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const reportId = `CP-ADMIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const nowStr = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('DIGBOI COLLEGE (AUTONOMOUS) - CONSOLIDATED DIARY REPORT', 14, 11);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`Institutional NAAC/SSR Academic Audit Summary • ${sessionName}`, 14, 18);

  doc.setTextColor(251, 191, 36);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Report ID: ${reportId}`, 220, 11);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${nowStr}`, 220, 18);

  // Group entries by faculty
  const facultySummary = faculties.map((fac) => {
    const facEntries = entries.filter((e) => e.facultyId === fac.id || e.facultyName === fac.name);
    const totalConduct = facEntries.length;
    const totalMins = facEntries.reduce((acc, curr) => acc + (curr.durationMins || 60), 0);
    const hours = (totalMins / 60).toFixed(1);

    let studTotal = 0;
    let presTotal = 0;
    facEntries.forEach((e) => {
      if (e.attendance) {
        studTotal += e.attendance.length;
        presTotal += e.attendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
      }
    });
    const avgAtt = studTotal > 0 ? Math.round((presTotal / studTotal) * 100) : 100;

    return [
      fac.name,
      fac.department,
      fac.designation || 'Assistant Professor',
      totalConduct.toString(),
      `${hours} hrs`,
      `${avgAtt}%`,
      totalConduct > 0 ? 'Active / Audit Ready' : 'Pending Entries',
    ];
  });

  autoTable(doc, {
    startY: 34,
    head: [
      [
        'Faculty Name',
        'Department',
        'Designation',
        'Classes Logged',
        'Teaching Hours',
        'Avg. Attendance',
        'Audit Status',
      ],
    ],
    body: facultySummary,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
    },
  });

  doc.save(`ClassPilot_Admin_Consolidated_Diary_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}
