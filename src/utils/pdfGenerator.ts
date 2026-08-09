import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ClassDiaryEntry, Faculty } from '../types';

export function generateFacultyClassDiaryPDF(
  faculty: Faculty | { name: string; department: string; email?: string },
  entries: ClassDiaryEntry[],
  sessionName: string = 'Odd Semester 2025–26'
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const reportId = `CP-RPT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const nowStr = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 297, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('DIGBOI COLLEGE (AUTONOMOUS), DIGBOI - ASSAM', 14, 11);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Official Academic Class Diary Logbook • ${sessionName}`, 14, 18);

  doc.setTextColor(251, 191, 36); // amber-400
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Report ID: ${reportId}`, 230, 11);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${nowStr}`, 230, 18);

  // Faculty Info Card
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(14, 32, 269, 18, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, 32, 269, 18, 'S');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`Faculty Name: ${faculty.name}`, 18, 39);
  doc.text(`Department: ${faculty.department}`, 120, 39);
  doc.text(`Total Logged Entries: ${entries.length}`, 210, 39);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Email: ${faculty.email || 'N/A'}`, 18, 45);
  doc.text(`Audit Compliance: NAAC & SSR Record Standard`, 120, 45);

  // Table Data Preparation
  const tableRows = entries.map((e, idx) => {
    const lockWindowMs = 24 * 60 * 60 * 1000;
    const startMs = e.classStartTimestamp || new Date(`${e.date}T${e.startTime}`).getTime();
    const isLocked = Date.now() - startMs > lockWindowMs;
    const verifiedStatus = isLocked ? 'Verified (Locked)' : 'Provisional';

    let attText = 'N/A';
    if (e.attendance && e.attendance.length > 0) {
      const present = e.attendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
      attText = `${present}/${e.attendance.length} (${Math.round((present / e.attendance.length) * 100)}%)`;
    }

    return [
      (idx + 1).toString(),
      `${e.date}\n(${e.startTime}-${e.endTime})`,
      `${e.batch}\nRoom: ${e.room}`,
      `${e.subjectCode}\n${e.subjectName}`,
      `${e.topicTaught}${e.syllabusUnit ? `\n[${e.syllabusUnit}]` : ''}`,
      `${e.durationMins} m`,
      attText,
      verifiedStatus,
    ];
  });

  autoTable(doc, {
    startY: 54,
    head: [
      [
        '#',
        'Date & Time',
        'Class / Room',
        'Subject',
        'Topic Taught & Syllabus Mapping',
        'Duration',
        'Attendance',
        'Verification',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 32, halign: 'center' },
      2: { cellWidth: 35 },
      3: { cellWidth: 42 },
      4: { cellWidth: 80 },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 26, halign: 'center' },
      7: { cellWidth: 26, halign: 'center' },
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
    doc.rect(14, finalY + 6, 269, 20, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, finalY + 6, 269, 20, 'S');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('SUMMARY LOG STATISTICS:', 18, finalY + 12);

    doc.setFont('helvetica', 'normal');
    doc.text(`Total Classes Conducted: ${totalClasses}`, 70, finalY + 12);
    doc.text(`Total Duration: ${totalHours} Hours (${totalMins} Mins)`, 135, finalY + 12);
    doc.text(`Average Attendance: ${avgAtt}%`, 215, finalY + 12);

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Digital Signature / Verification Line: Generated on ${nowStr} via ClassPilot — Digboi College (Autonomous) • Unique Report ID: ${reportId}`,
      18,
      finalY + 21
    );
  }

  doc.save(`ClassPilot_ClassDiary_${faculty.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
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
