import React, { useState } from 'react';
import { TimetableEntry, Faculty, Room, Student, DayOfWeek, ScheduleConflict, User } from '../types';
import { AdminNaacReports } from './AdminNaacReports';
import {
  DAYS_OF_WEEK,
  DEPARTMENTS_LIST,
  HOURLY_TIME_SLOTS,
  ODD_SEMESTERS_LIST,
  EVEN_SEMESTERS_LIST,
  COMMERCE_HS_SUBJECTS,
  FYUGP_PAPER_CATEGORIES,
  detectConflicts,
  generateSampleCsvContent,
  parseTimeToMinutes,
} from '../utils/timeUtils';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  CheckCircle,
  Shield,
  Search,
  X,
  UserPlus,
  Building,
  RotateCcw,
  Building2,
  Calendar,
  Layers,
  Filter,
  Grid,
  Clock,
  BookOpen,
  Users,
} from 'lucide-react';

interface AdminTimetableProps {
  currentUser?: User | null;
  timetable: TimetableEntry[];
  facultyList: Faculty[];
  roomList: Room[];
  students?: Student[];
  onUpdateStudents?: (students: Student[]) => void;
  onAddEntry: (entry: Partial<TimetableEntry>) => void;
  onUpdateEntry: (id: string, entry: Partial<TimetableEntry>) => void;
  onDeleteEntry: (id: string) => void;
  onBulkImport: (entries: Partial<TimetableEntry>[], replaceExisting: boolean) => void;
  onAddFaculty: (faculty: Partial<Faculty>) => void;
  onAddRoom: (room: Partial<Room>) => void;
  onResetData: () => void;
  onToggleUserAdminRole?: (userEmail: string, makeAdmin: boolean) => void;
}

export const AdminTimetable: React.FC<AdminTimetableProps> = ({
  currentUser,
  timetable,
  facultyList,
  roomList,
  students = [],
  onUpdateStudents,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onBulkImport,
  onAddFaculty,
  onAddRoom,
  onResetData,
  onToggleUserAdminRole,
}) => {
  // Navigation sub-tabs inside Admin
  const [activeAdminTab, setActiveAdminTab] = useState<'grid' | 'timetable' | 'dept_routine' | 'naac_reports' | 'import' | 'conflicts' | 'roster' | 'students' | 'session' | 'access'>('grid');

  // Semester Cycle & Academic Session State
  const [activeSemesterCycle, setActiveSemesterCycle] = useState<'Odd' | 'Even'>('Odd');
  const [sessionAcademicYear, setSessionAcademicYear] = useState<string>('2025–26');
  const [sessionStartDate, setSessionStartDate] = useState<string>('2025-08-01');
  const [sessionEndDate, setSessionEndDate] = useState<string>('2025-12-31');
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState<boolean>(false);

  // Student roster management local state
  const [studentSearchTerm, setStudentSearchTerm] = useState<string>('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('All');
  const [newStudentRoll, setNewStudentRoll] = useState<string>('');
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentClass, setNewStudentClass] = useState<string>('FYUGP 1st Sem Commerce');

  // Faculty CSV Bulk Import State
  const [facultyCsvPreview, setFacultyCsvPreview] = useState<Partial<Faculty>[]>([]);
  const [facultyCsvFileName, setFacultyCsvFileName] = useState<string>('');

  const handleDownloadFacultyCsvTemplate = () => {
    const csvHeaders = 'Faculty Name,Mobile Number,Employee ID,Department,Designation,Email\n';
    const sampleRows =
      'Dr. Deborshee Gogoi,9706375001,DC-EMP-001,Commerce,Associate Professor,thewildscapes@gmail.com\n' +
      'Dr. Jitu Borah,9876543210,DC-EMP-002,Economics,Assistant Professor,jitu.borah@digboicollege.edu.in\n' +
      'Prof. Rashmi Saikia,9101234567,DC-EMP-003,Commerce,Assistant Professor,rashmi.s@digboicollege.edu.in\n';
    const blob = new Blob([csvHeaders + sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Faculty_Pre_Registration_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFacultyCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFacultyCsvFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rowsData = XLSX.utils.sheet_to_json<any>(ws);

        if (!rowsData || rowsData.length === 0) {
          alert('The uploaded file contains no data rows.');
          return;
        }

        const parsedList: Partial<Faculty>[] = [];
        rowsData.forEach((row, idx) => {
          const name = String(row['Faculty Name'] || row['Name'] || row['facultyName'] || '').trim();
          const mobile = String(row['Mobile Number'] || row['Mobile'] || row['Phone'] || row['whatsappPhone'] || '').trim();
          const empId = String(row['Employee ID'] || row['Emp ID'] || row['employeeId'] || `DC-EMP-${String(100 + idx)}`).trim();
          const dept = String(row['Department'] || row['department'] || 'Commerce').trim();
          const desig = String(row['Designation'] || row['designation'] || 'Assistant Professor').trim();
          const email = String(row['Email'] || row['email'] || `${name.toLowerCase().replace(/\s+/g, '.')}@digboicollege.edu.in`).trim();

          if (name) {
            parsedList.push({
              name,
              phone: mobile,
              whatsappPhone: mobile,
              employeeId: empId,
              department: dept,
              designation: desig,
              email,
            });
          }
        });

        if (parsedList.length === 0) {
          alert('No valid faculty records found. Ensure headers contain "Faculty Name", "Mobile Number", and "Employee ID".');
          return;
        }

        setFacultyCsvPreview(parsedList);
      } catch (err) {
        console.error('CSV/Excel Parsing Error:', err);
        alert('Error parsing CSV file. Please upload a valid CSV file.');
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleConfirmFacultyCsvImport = () => {
    if (facultyCsvPreview.length === 0) return;

    facultyCsvPreview.forEach((fac) => {
      onAddFaculty(fac);
    });

    alert(`Successfully pre-registered ${facultyCsvPreview.length} faculty members into the college database!`);
    setFacultyCsvPreview([]);
    setFacultyCsvFileName('');
  };

  const handleDownloadStudentRosterExcelTemplate = () => {
    const templateData = [
      {
        'Roll No.': 'COM-2025-01',
        'Student Name': 'Ananya Gogoi',
        'Class': 'FYUGP 1st Sem Commerce',
        'Academic Year': sessionAcademicYear,
      },
      {
        'Roll No.': 'COM-2025-02',
        'Student Name': 'Bishal Sonowal',
        'Class': 'FYUGP 1st Sem Commerce',
        'Academic Year': sessionAcademicYear,
      },
      {
        'Roll No.': 'COM-2025-03',
        'Student Name': 'Debashree Sharma',
        'Class': 'FYUGP 1st Sem Commerce',
        'Academic Year': sessionAcademicYear,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Roster Template');
    XLSX.writeFile(workbook, 'Student_Roster_Template.xlsx');
  };

  const handleStudentRosterFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        if (!data || data.length === 0) {
          alert('Uploaded file contains no records.');
          return;
        }

        const activeSessionId = `${activeSemesterCycle}-${sessionAcademicYear}`;
        const newStudents: Student[] = [];
        const seenRolls = new Set<string>();
        let duplicateCount = 0;
        let blankCount = 0;

        data.forEach((row, idx) => {
          const roll = String(row['Roll No.'] || row['Roll No'] || row['RollNo'] || row['Roll'] || '').trim();
          const name = String(row['Student Name'] || row['Name'] || row['StudentName'] || '').trim();
          const classBatch = String(row['Class'] || row['Class/Section'] || row['Batch'] || 'FYUGP 1st Sem Commerce').trim();
          const acadYear = String(row['Academic Year'] || row['Year'] || sessionAcademicYear).trim();

          if (!roll || !name) {
            blankCount++;
            return;
          }

          const rollKey = `${classBatch.toLowerCase()}_${roll.toLowerCase()}`;
          if (seenRolls.has(rollKey)) {
            duplicateCount++;
            return;
          }
          seenRolls.add(rollKey);

          newStudents.push({
            id: `st_${Date.now()}_${idx}`,
            rollNo: roll,
            name: name,
            classBatch: classBatch,
            academicYear: acadYear,
            sessionId: activeSessionId,
          });
        });

        if (newStudents.length === 0) {
          alert('No valid student records found. Please ensure your Excel file has "Roll No." and "Student Name" columns.');
          return;
        }

        const existing = students || [];
        const merged = [
          ...existing.filter((s) => !newStudents.some((ns) => ns.classBatch === s.classBatch && ns.rollNo === s.rollNo)),
          ...newStudents,
        ];

        onUpdateStudents?.(merged);
        alert(`Successfully imported ${newStudents.length} student records for session ${activeSessionId}.${duplicateCount > 0 ? ` (${duplicateCount} duplicate roll numbers skipped)` : ''}${blankCount > 0 ? ` (${blankCount} blank rows skipped)` : ''}`);
      } catch (err) {
        alert('Failed to parse file. Please upload a valid .xlsx or .csv student roster file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAddSingleStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentRoll.trim() || !newStudentName.trim()) {
      alert('Please fill both Roll Number and Student Name.');
      return;
    }

    const activeSessionId = `${activeSemesterCycle}-${sessionAcademicYear}`;
    const newSt: Student = {
      id: `st_${Date.now()}`,
      rollNo: newStudentRoll.trim(),
      name: newStudentName.trim(),
      classBatch: newStudentClass.trim(),
      academicYear: sessionAcademicYear,
      sessionId: activeSessionId,
    };

    onUpdateStudents?.([...students, newSt]);
    setNewStudentRoll('');
    setNewStudentName('');
  };

  const handleDeleteStudent = (stId: string) => {
    if (confirm('Are you sure you want to remove this student from the active roster?')) {
      onUpdateStudents?.(students.filter((s) => s.id !== stId));
    }
  };

  // Check Super Admin status
  const isSuperAdmin = Boolean(
    currentUser && (
      currentUser.email?.toLowerCase().trim() === 'thewildscapes@gmail.com' ||
      (currentUser.whatsappPhone || '').replace(/\D/g, '').endsWith('9706375001')
    )
  );

  // Download Excel Template with exact required columns:
  // Day | Period/Time | Class | Section | Subject | Faculty Name | Class No./Room
  const handleDownloadExcelTemplate = () => {
    const templateData = [
      {
        'Day': 'Monday',
        'Period/Time': '08:00 - 09:00',
        'Class': 'FYUGP 1st Sem Commerce',
        'Section': 'Sec A',
        'Subject': 'Financial Accounting',
        'Faculty Name': 'Dr. Deborshee Gogoi',
        'Class No./Room': 'Room No. C1'
      },
      {
        'Day': 'Monday',
        'Period/Time': '09:00 - 10:00',
        'Class': 'FYUGP 1st Sem Commerce',
        'Section': 'Sec A',
        'Subject': 'Business Organisation',
        'Faculty Name': 'Dr. Sampreeti Boruah',
        'Class No./Room': 'Room No. C4'
      },
      {
        'Day': 'Tuesday',
        'Period/Time': '10:00 - 11:00',
        'Class': 'HS 1st Yr Commerce',
        'Section': 'Sec B',
        'Subject': 'Accountancy',
        'Faculty Name': 'Pradip Chandra Das',
        'Class No./Room': 'Room No. C5'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Official Routine Template');
    XLSX.writeFile(wb, `ClassPilot_Routine_Template_${activeSemesterCycle}_Semester.xlsx`);
  };

  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedProgramSemester, setSelectedProgramSemester] = useState<string>('All');
  const [filterDay, setFilterDay] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals state
  const [isEntryModalOpen, setIsEntryModalOpen] = useState<boolean>(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Form states for new/edit entry
  const [formSemesterCycle, setFormSemesterCycle] = useState<'Odd' | 'Even'>('Odd');
  const [formProgramSemester, setFormProgramSemester] = useState<string>('FYUGP 1st Semester');
  const [formPaperCategory, setFormPaperCategory] = useState<string>('Major');
  const [formFacultyId, setFormFacultyId] = useState<string>(facultyList[0]?.id || '');
  const [formSubjectCode, setFormSubjectCode] = useState<string>('COM101-MAJ');
  const [formSubjectName, setFormSubjectName] = useState<string>('Financial Accounting');
  const [formRoom, setFormRoom] = useState<string>('Room No. C1');
  const [formDay, setFormDay] = useState<DayOfWeek>('Monday');
  const [formStartTime, setFormStartTime] = useState<string>('08:00');
  const [formEndTime, setFormEndTime] = useState<string>('09:00');
  const [formBatch, setFormBatch] = useState<string>('FYUGP 1st Sem CS');
  const [formDepartment, setFormDepartment] = useState<string>('Computer Science');
  const [formNotes, setFormNotes] = useState<string>('');

  // Import Preview State
  const [parsedPreviewEntries, setParsedPreviewEntries] = useState<Partial<TimetableEntry>[]>([]);
  const [replaceMode, setReplaceMode] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importStatusMsg, setImportStatusMsg] = useState<string>('');

  // Faculty/Room Add States
  const [newFacName, setNewFacName] = useState<string>('');
  const [newFacEmail, setNewFacEmail] = useState<string>('');
  const [newFacDept, setNewFacDept] = useState<string>('Computer Science');

  const [newRoomName, setNewRoomName] = useState<string>('');
  const [newRoomBuilding, setNewRoomBuilding] = useState<string>('Science Block A');
  const [newRoomCap, setNewRoomCap] = useState<number>(60);

  // Conflicts list
  const conflicts = detectConflicts(timetable);

  // Active departments present
  const activeDepartmentsList = Array.from(
    new Set([...DEPARTMENTS_LIST, ...timetable.map((t) => t.department)])
  ).filter(Boolean);

  // Program / Semester choices based on active cycle
  const currentProgramList = activeSemesterCycle === 'Odd' ? ODD_SEMESTERS_LIST : EVEN_SEMESTERS_LIST;

  // Filtered timetable for views
  const filteredList = timetable.filter((t) => {
    // Semester cycle filter (if entry defines semesterCycle, match active; default to match if undefined)
    if (t.semesterCycle && t.semesterCycle !== activeSemesterCycle) return false;
    if (selectedDepartment !== 'All' && t.department !== selectedDepartment) return false;
    if (selectedProgramSemester !== 'All' && t.programSemester && t.programSemester !== selectedProgramSemester) return false;
    if (filterDay !== 'All' && t.day !== filterDay) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        t.subjectName.toLowerCase().includes(q) ||
        t.subjectCode.toLowerCase().includes(q) ||
        t.facultyName.toLowerCase().includes(q) ||
        t.room.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.batch.toLowerCase().includes(q) ||
        (t.paperCategory && t.paperCategory.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedDeptFaculty = facultyList.filter(
    (f) => selectedDepartment === 'All' || f.department === selectedDepartment
  );
  const selectedDeptClassCount = filteredList.length;

  // Handle Excel/CSV File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

        const converted: Partial<TimetableEntry>[] = data.map((row) => {
          const facName = row['Faculty Name'] || row['facultyName'] || row['Faculty'] || 'Dr. Deborshee Gogoi';
          const facMatch = facultyList.find(
            (f) => f.name.toLowerCase().includes(facName.toLowerCase())
          ) || facultyList[0];

          return {
            facultyId: facMatch?.id || 'fac_1',
            facultyName: facMatch?.name || facName,
            subjectCode: row['Subject Code'] || row['subjectCode'] || 'CS101',
            subjectName: row['Subject Name'] || row['subjectName'] || 'Course Lecture',
            room: row['Room'] || row['room'] || 'Room No. C1',
            day: (row['Day'] || row['day'] || 'Monday') as DayOfWeek,
            startTime: row['Start Time'] || row['startTime'] || '08:00',
            endTime: row['End Time'] || row['endTime'] || '09:00',
            batch: row['Batch'] || row['batch'] || 'FYUGP 1st Sem CS',
            department: row['Department'] || row['department'] || facMatch?.department || 'Computer Science',
            semesterCycle: (row['Semester Cycle'] || row['semesterCycle'] || activeSemesterCycle) as 'Odd' | 'Even',
            programSemester: row['Program Semester'] || row['programSemester'] || 'FYUGP 1st Semester',
            paperCategory: (row['Paper Category'] || row['paperCategory'] || 'Major') as any,
            notes: row['Notes'] || row['notes'] || '',
          };
        });

        setParsedPreviewEntries(converted);
        setImportStatusMsg(`Parsed ${converted.length} timetable entries from ${file.name}`);
      } catch (err) {
        console.error('Failed to parse spreadsheet:', err);
        alert('Error parsing Excel or CSV file. Please check file format.');
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = generateSampleCsvContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'college_timetable_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleNotifyFacultyRoutineUpload = (customList?: Partial<TimetableEntry>[]) => {
    const listToNotify = customList || timetable;
    const uniqueFacultyNames = Array.from(
      new Set(
        listToNotify
          .map((e) => e.facultyName?.trim())
          .filter((name) => name && name.toLowerCase() !== 'unassigned' && name.toLowerCase() !== 'vacant')
      )
    );

    const unassignedCount = listToNotify.filter(
      (e) => !e.facultyName || e.facultyName.toLowerCase() === 'unassigned'
    ).length;

    const termLabel = `${activeSemesterCycle} Semester (${sessionAcademicYear})`;

    alert(
      `📢 Faculty Notifications Triggered!\n\n` +
      `Successfully generated schedule updates for ${uniqueFacultyNames.length} faculty members for ${termLabel}.\n` +
      `Each faculty member will see their updated "My Routine" schedule upon logging in.\n` +
      (unassignedCount > 0 ? `\n⚠️ Note: ${unassignedCount} period(s) have unassigned faculty names.` : '')
    );
  };

  const handleConfirmImport = () => {
    if (parsedPreviewEntries.length === 0) return;
    onBulkImport(parsedPreviewEntries, replaceMode);
    handleNotifyFacultyRoutineUpload(parsedPreviewEntries);
    setParsedPreviewEntries([]);
    setImportFileName('');
    setActiveAdminTab('grid');
  };

  const openAddModalForSlot = (day?: DayOfWeek, slotStartTime?: string, slotEndTime?: string) => {
    setEditingEntryId(null);
    const defaultFac = facultyList[0];
    setFormSemesterCycle(activeSemesterCycle);
    setFormProgramSemester(selectedProgramSemester !== 'All' ? selectedProgramSemester : currentProgramList[0]);
    setFormPaperCategory('Major');
    setFormFacultyId(defaultFac?.id || 'fac_1');
    setFormSubjectCode('COM101-MAJ');
    setFormSubjectName('Financial Accounting');
    setFormRoom('Room No. C1');
    setFormDay(day || 'Monday');
    setFormStartTime(slotStartTime || '08:00');
    setFormEndTime(slotEndTime || '09:00');
    setFormBatch('FYUGP 1st Sem CS');
    setFormDepartment(selectedDepartment !== 'All' ? selectedDepartment : defaultFac?.department || 'Computer Science');
    setFormNotes('');
    setIsEntryModalOpen(true);
  };

  const openEditModal = (entry: TimetableEntry) => {
    setEditingEntryId(entry.id);
    setFormSemesterCycle(entry.semesterCycle || activeSemesterCycle);
    setFormProgramSemester(entry.programSemester || 'FYUGP 1st Semester');
    setFormPaperCategory(entry.paperCategory || 'Major');
    setFormFacultyId(entry.facultyId);
    setFormSubjectCode(entry.subjectCode);
    setFormSubjectName(entry.subjectName);
    setFormRoom(entry.room);
    setFormDay(entry.day);
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormBatch(entry.batch);
    setFormDepartment(entry.department || 'Computer Science');
    setFormNotes(entry.notes || '');
    setIsEntryModalOpen(true);
  };

  // Double booking override modal state
  const [doubleBookingConflict, setDoubleBookingConflict] = useState<{
    conflictEntry: TimetableEntry;
    pendingPayload: Partial<TimetableEntry>;
  } | null>(null);

  const handleSaveEntry = (e: React.FormEvent, forceOverride: boolean = false) => {
    e.preventDefault();
    const fac = facultyList.find((f) => f.id === formFacultyId) || facultyList[0];

    const payload: Partial<TimetableEntry> = {
      facultyId: formFacultyId,
      facultyName: fac?.name || 'Faculty Member',
      subjectCode: formSubjectCode,
      subjectName: formSubjectName,
      room: formRoom,
      day: formDay,
      startTime: formStartTime,
      endTime: formEndTime,
      batch: formBatch,
      department: formDepartment || fac?.department || 'Computer Science',
      semesterCycle: formSemesterCycle,
      programSemester: formProgramSemester,
      paperCategory: formPaperCategory as any,
      notes: formNotes,
    };

    // Double-booking check if not forced
    if (!forceOverride) {
      const newStart = parseTimeToMinutes(formStartTime);
      const newEnd = parseTimeToMinutes(formEndTime);
      const normRoom = formRoom.trim().toLowerCase();

      const existingConflict = timetable.find((entry) => {
        if (entry.id === editingEntryId) return false;
        if (entry.day !== formDay) return false;
        if (entry.room.trim().toLowerCase() !== normRoom) return false;

        const eStart = parseTimeToMinutes(entry.startTime);
        const eEnd = parseTimeToMinutes(entry.endTime);
        return eStart < newEnd && eEnd > newStart;
      });

      if (existingConflict) {
        setDoubleBookingConflict({ conflictEntry: existingConflict, pendingPayload: payload });
        return;
      }
    }

    if (editingEntryId) {
      onUpdateEntry(editingEntryId, payload);
    } else {
      onAddEntry(payload);
    }
    setDoubleBookingConflict(null);
    setIsEntryModalOpen(false);
  };

  const handleCreateFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFacName || !newFacEmail) return;
    onAddFaculty({
      name: newFacName,
      email: newFacEmail,
      department: newFacDept,
      designation: 'Assistant Professor',
    });
    setNewFacName('');
    setNewFacEmail('');
    alert(`Faculty member "${newFacName}" registered to ${newFacDept} department!`);
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName) return;
    onAddRoom({
      name: newRoomName,
      building: newRoomBuilding,
      capacity: newRoomCap,
      type: 'Lecture Hall',
      floor: 1,
      equipment: ['Smart Board', 'Wi-Fi AP'],
    });
    setNewRoomName('');
    alert('Room created successfully!');
  };

  // Helper for rendering paper badge color
  const getPaperBadgeColor = (category?: string) => {
    const found = FYUGP_PAPER_CATEGORIES.find((c) => c.code === category);
    return found ? found.badgeColor : 'bg-slate-700 text-slate-200 border-slate-600';
  };

  return (
    <div className="space-y-6">
      {/* Top Admin Dashboard Control Header */}
      <div className="bg-slate-800/95 rounded-2xl p-5 border border-slate-700/80 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              <h2 className="font-heading font-bold text-xl text-white">
                Academic Routine & Timetable Master Hub
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Construct, edit, and monitor hourly routines (8:00 AM - 4:00 PM) for Odd & Even Semesters across Digboi College.
            </p>
          </div>

          {/* Admin Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveAdminTab('grid')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'grid'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Grid className="w-3.5 h-3.5 text-amber-300" />
              <span>Weekly Routine Grid Table</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('timetable')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'timetable'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Master Class List ({filteredList.length})</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('dept_routine')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'dept_routine'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-cyan-300" />
              <span>Department View</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('naac_reports')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'naac_reports'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>NAAC/NBA Audit Reports</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('import')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'import'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Excel/CSV Import</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('conflicts')}
              className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'conflicts'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Conflicts</span>
              {conflicts.length > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full">
                  {conflicts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveAdminTab('roster')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'roster'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Faculty/Rooms</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('students')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'students'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-emerald-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Manage Students</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('session')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeAdminTab === 'session'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
              <span>Session & Archival</span>
            </button>

            {isSuperAdmin && (
              <button
                onClick={() => setActiveAdminTab('access')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeAdminTab === 'access'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-purple-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin Access</span>
              </button>
            )}
          </div>
        </div>

        {/* ACADEMIC CYCLE TOGGLE & FILTERS BAR */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-900/90 rounded-xl p-3.5 border border-slate-700/80">
          {/* 1. Academic Cycle (Odd / Even Semesters) */}
          <div className="flex items-center space-x-3 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block mb-1">
                Semester Cycle
              </span>
              <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => {
                    setActiveSemesterCycle('Odd');
                    setSelectedProgramSemester('All');
                  }}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-all ${
                    activeSemesterCycle === 'Odd'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Odd Semesters (Aug–Dec)
                </button>
                <button
                  onClick={() => {
                    setActiveSemesterCycle('Even');
                    setSelectedProgramSemester('All');
                  }}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-all ${
                    activeSemesterCycle === 'Even'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Even Semesters (Jan–Jun)
                </button>
              </div>
            </div>
          </div>

          {/* 2. Department Filter */}
          <div className="flex items-center space-x-3 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <label htmlFor="admin-dept-filter" className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block mb-0.5">
                Department
              </label>
              <select
                id="admin-dept-filter"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full bg-slate-900 text-white font-bold text-xs rounded-lg px-2.5 py-1 border border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="All">All Departments</option>
                {activeDepartmentsList.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Program / Semester Filter */}
          <div className="flex items-center space-x-3 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <label htmlFor="admin-prog-filter" className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block mb-0.5">
                Course / Semester ({activeSemesterCycle})
              </label>
              <select
                id="admin-prog-filter"
                value={selectedProgramSemester}
                onChange={(e) => setSelectedProgramSemester(e.target.value)}
                className="w-full bg-slate-900 text-white font-bold text-xs rounded-lg px-2.5 py-1 border border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
              >
                <option value="All">All Semesters & Classes</option>
                {currentProgramList.map((prog) => (
                  <option key={prog} value={prog}>
                    {prog}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== TAB 0: WEEKLY ROUTINE GRID TABLE MATRIX ===================== */}
      {activeAdminTab === 'grid' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-800/90 p-4 rounded-2xl border border-slate-700/80">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="font-heading font-bold text-base text-white">
                  1-Hour Class Schedule Table (08:00 AM – 04:00 PM)
                </h3>
                <p className="text-xs text-slate-400">
                  Active Cycle: <span className="font-bold text-emerald-400">{activeSemesterCycle} Semesters</span>
                  {selectedDepartment !== 'All' && <span> • Dept: <span className="text-indigo-300">{selectedDepartment}</span></span>}
                  {selectedProgramSemester !== 'All' && <span> • Program: <span className="text-amber-300">{selectedProgramSemester}</span></span>}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => openAddModalForSlot()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Class Entry</span>
              </button>

              <button
                onClick={onResetData}
                title="Reset to default dataset"
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Timetable Grid Table */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-900 text-[11px] font-bold uppercase tracking-wider text-slate-300 border-b border-slate-700">
                    <th className="py-3 px-3 w-28 bg-slate-950 border-r border-slate-800 text-center text-indigo-400">
                      Day / Time
                    </th>
                    {HOURLY_TIME_SLOTS.map((slot) => (
                      <th
                        key={slot.label}
                        className="py-3 px-2 text-center border-r border-slate-800/80 min-w-[130px]"
                      >
                        <div className="font-bold text-white text-xs">{slot.displayLabel}</div>
                        <div className="text-[10px] text-slate-400 font-mono font-normal">1 Hour Duration</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 text-xs">
                  {DAYS_OF_WEEK.map((day) => (
                    <tr key={day} className="hover:bg-slate-700/20 transition-colors">
                      {/* Day Label */}
                      <td className="py-3 px-3 font-bold text-white bg-slate-950/80 border-r border-slate-800 text-center">
                        <div className="text-sm">{day}</div>
                      </td>

                      {/* Hourly Cells */}
                      {HOURLY_TIME_SLOTS.map((slot) => {
                        const slotStartMin = parseTimeToMinutes(slot.startTime);
                        const slotEndMin = parseTimeToMinutes(slot.endTime);

                        // Find matching entries for this day & slot
                        const slotEntries = filteredList.filter((e) => {
                          if (e.day !== day) return false;
                          const eStartMin = parseTimeToMinutes(e.startTime);
                          const eEndMin = parseTimeToMinutes(e.endTime);
                          // Class overlaps with this 1-hour slot
                          return eStartMin < slotEndMin && eEndMin > slotStartMin;
                        });

                        return (
                          <td
                            key={slot.label}
                            className="p-1.5 border-r border-slate-800/80 align-top hover:bg-slate-700/40 transition-colors"
                          >
                            {slotEntries.length === 0 ? (
                              <button
                                onClick={() => openAddModalForSlot(day, slot.startTime, slot.endTime)}
                                className="w-full h-full min-h-[70px] rounded-xl border border-dashed border-slate-700/60 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-slate-500 hover:text-indigo-300 flex flex-col items-center justify-center p-1.5 transition-all group"
                              >
                                <Plus className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 mb-0.5" />
                                <span className="text-[10px] font-semibold">Free Slot</span>
                              </button>
                            ) : (
                              <div className="space-y-1.5">
                                {slotEntries.map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="p-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-indigo-500 shadow-md relative group transition-all"
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span
                                        className={`px-1.5 py-0.2 rounded border font-bold text-[9px] uppercase tracking-wide ${getPaperBadgeColor(
                                          entry.paperCategory
                                        )}`}
                                      >
                                        {entry.paperCategory || 'Core'}
                                      </span>
                                      <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[9px]">
                                        {entry.room}
                                      </span>
                                    </div>

                                    <div className="font-bold text-white text-xs leading-snug line-clamp-2">
                                      {entry.subjectName}
                                    </div>

                                    <div className="text-[10px] font-mono text-indigo-300 font-semibold mt-0.5">
                                      {entry.subjectCode}
                                    </div>

                                    <div className="text-[10px] text-slate-300 mt-1 pt-1 border-t border-slate-800 flex flex-col space-y-0.5">
                                      <span className="truncate font-medium">👤 {entry.facultyName}</span>
                                      <span className="text-[9px] text-slate-400 truncate">🎓 {entry.batch}</span>
                                    </div>

                                    {/* Quick Actions Hover overlay */}
                                    <div className="absolute inset-0 bg-slate-950/90 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 p-1">
                                      <button
                                        onClick={() => openEditModal(entry)}
                                        className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all text-[10px] font-bold flex items-center space-x-1"
                                        title="Edit Class"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (confirm(`Delete class "${entry.subjectName}"?`)) {
                                            onDeleteEntry(entry.id);
                                          }
                                        }}
                                        className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition-all text-[10px] font-bold flex items-center space-x-1"
                                        title="Delete Class"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Delete</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 1: ALL TIMETABLE ENTRIES LIST ===================== */}
      {activeAdminTab === 'timetable' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-2 bg-slate-800 rounded-xl px-2.5 py-1.5 border border-slate-700 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-semibold">Day:</span>
                <select
                  value={filterDay}
                  onChange={(e) => setFilterDay(e.target.value)}
                  className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                >
                  <option value="All" className="bg-slate-900">All Days</option>
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d} className="bg-slate-900">
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search subject, faculty, paper, room..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl pl-8 pr-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => openAddModalForSlot()}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Class Entry</span>
              </button>

              <button
                onClick={onResetData}
                title="Reset to default dataset"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700">
                    <th className="py-3 px-4">Paper Category</th>
                    <th className="py-3 px-4">Subject & Code</th>
                    <th className="py-3 px-4">Day & Time</th>
                    <th className="py-3 px-4">Faculty Member</th>
                    <th className="py-3 px-4">Room</th>
                    <th className="py-3 px-4">Batch / Course</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 text-xs">
                  {filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs font-medium">
                        No class routines found matching active cycle ({activeSemesterCycle}) and department options.
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded border font-bold text-[10px] ${getPaperBadgeColor(
                              entry.paperCategory
                            )}`}
                          >
                            {entry.paperCategory || 'Core'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{entry.subjectName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{entry.subjectCode}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{entry.day}</div>
                          <div className="font-mono text-indigo-300 font-medium text-[11px]">
                            {entry.startTime} - {entry.endTime}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-200 font-medium">{entry.facultyName}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold text-[11px]">
                            {entry.room}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <div>{entry.batch}</div>
                          <div className="text-[10px] text-slate-500">{entry.programSemester}</div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => openEditModal(entry)}
                            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete class "${entry.subjectName}"?`)) {
                                onDeleteEntry(entry.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: DEPARTMENT ROUTINE MATRIX VIEW ===================== */}
      {activeAdminTab === 'dept_routine' && (
        <div className="space-y-6">
          <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                  <Building2 className="w-5 h-5 text-indigo-400" />
                  <span>
                    {selectedDepartment === 'All'
                      ? 'College-Wide Department Routines'
                      : `Department of ${selectedDepartment} (${activeSemesterCycle} Cycle)`}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Weekly overview grouped by days for departmental monitoring.
                </p>
              </div>
            </div>

            {/* Department Weekly Days Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DAYS_OF_WEEK.map((day) => {
                const dayEntries = filteredList
                  .filter((t) => t.day === day)
                  .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

                return (
                  <div key={day} className="bg-slate-900/80 rounded-xl p-4 border border-slate-700/80 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-sm text-indigo-300 flex items-center space-x-1.5">
                        <Calendar className="w-4 h-4 text-indigo-400" />
                        <span>{day}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold">
                        {dayEntries.length} {dayEntries.length === 1 ? 'class' : 'classes'}
                      </span>
                    </div>

                    {dayEntries.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4 text-center">No lectures scheduled for this day.</p>
                    ) : (
                      <div className="space-y-2">
                        {dayEntries.map((item) => (
                          <div
                            key={item.id}
                            className="bg-slate-800/90 p-3 rounded-lg border border-slate-700/60 hover:border-indigo-500/50 transition-all space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-indigo-300 text-[11px]">
                                {item.startTime} - {item.endTime}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                                {item.room}
                              </span>
                            </div>
                            <div className="font-bold text-white text-xs">{item.subjectName} ({item.subjectCode})</div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/50">
                              <span>Faculty: {item.facultyName}</span>
                              <span className="font-semibold text-slate-300">{item.batch}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 3: EXCEL / CSV IMPORT HUB ===================== */}
      {activeAdminTab === 'import' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Upload Box */}
            <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-white">
                    Upload Semester Timetable Sheet
                  </h3>
                  <p className="text-xs text-slate-400">Supports .xlsx, .xls, and .csv files</p>
                </div>
              </div>

              <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 rounded-2xl p-6 text-center space-y-3 bg-slate-900/50 transition-all">
                <Upload className="w-8 h-8 text-indigo-400 mx-auto animate-bounce" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    Click to select file or drag & drop here
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Columns: Faculty Name, Subject Code, Subject Name, Room, Day, Start Time, End Time, Batch
                  </p>
                </div>

                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="timetable-excel-input"
                />
                <label
                  htmlFor="timetable-excel-input"
                  className="inline-block px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer shadow-md transition-all"
                >
                  Browse File
                </label>
              </div>

              {importFileName && (
                <div className="text-xs bg-slate-900 p-3 rounded-xl border border-slate-700 flex items-center justify-between text-indigo-300">
                  <span>Uploaded: {importFileName}</span>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
              )}
            </div>

            {/* Right: Sample CSV Downloader & Instructions */}
            <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                  <Download className="w-5 h-5 text-blue-400" />
                  <span>Download Sample CSV Template</span>
                </h3>
                <p className="text-xs text-slate-300">
                  Need the exact Excel format for college staff? Download our pre-formatted CSV template populated with sample classes.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleDownloadExcelTemplate}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer mb-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Official Excel Routine Template (.xlsx)</span>
                </button>
                
                <button
                  onClick={handleDownloadSampleCsv}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Download Legacy CSV Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* Import Preview Table */}
          {parsedPreviewEntries.length > 0 && (
            <div className="bg-slate-800/90 rounded-2xl p-6 border border-indigo-500/50 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading font-bold text-lg text-white">
                    Preview Parsed Timetable ({parsedPreviewEntries.length} rows)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Review entries below before applying to live database.
                  </p>
                </div>

                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 text-xs font-semibold text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replaceMode}
                      onChange={(e) => setReplaceMode(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>Replace existing timetable</span>
                  </label>

                  <button
                    onClick={handleConfirmImport}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                  >
                    Confirm & Apply Import
                  </button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">Day</th>
                      <th className="p-2.5">Time</th>
                      <th className="p-2.5">Faculty</th>
                      <th className="p-2.5">Subject</th>
                      <th className="p-2.5">Room</th>
                      <th className="p-2.5">Batch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {parsedPreviewEntries.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-700/30">
                        <td className="p-2.5 font-semibold text-white">{item.day}</td>
                        <td className="p-2.5 font-mono text-indigo-300">
                          {item.startTime} - {item.endTime}
                        </td>
                        <td className="p-2.5">{item.facultyName}</td>
                        <td className="p-2.5 font-bold text-white">
                          {item.subjectName} ({item.subjectCode})
                        </td>
                        <td className="p-2.5 text-cyan-300">{item.room}</td>
                        <td className="p-2.5">{item.batch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 4: CONFLICTS DETECTOR ===================== */}
      {activeAdminTab === 'conflicts' && (
        <div className="space-y-4">
          <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700">
            <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <span>Double-Booking & Conflict Detector Engine</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated validation checks for overlapping faculty schedules or duplicate room assignments.
            </p>
          </div>

          {conflicts.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-8 text-center space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="font-bold text-white text-base">No Schedule Conflicts Detected!</h4>
              <p className="text-xs text-slate-400">
                All faculty assignments and room allocations are 100% clash-free.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {conflicts.map((conf) => (
                <div
                  key={conf.id}
                  className="bg-rose-950/30 border border-rose-500/50 rounded-2xl p-4 text-white space-y-2 shadow-lg"
                >
                  <div className="flex items-center space-x-2 text-rose-300 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>
                      {conf.type === 'faculty' ? 'Faculty Double-Booking Clashing' : 'Room Double-Booking Clashing'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200">{conf.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 5: ROSTER MANAGEMENT (FACULTY & ROOMS) ===================== */}
      {activeAdminTab === 'roster' && (
        <div className="space-y-6">
          {/* Top Banner & Manual Trigger Notifications */}
          <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="font-heading font-extrabold text-lg text-white flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span>Faculty Pre-Registration & Mobile Database</span>
              </h3>
              <p className="text-xs text-slate-400">
                Pre-register faculty mobile numbers & employee IDs before routine deployment to enable Mobile OTP Login.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleNotifyFacultyRoutineUpload()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5 cursor-pointer"
                title="Send updated schedule notifications to all faculty members listed in the active routine"
              >
                <span>📢 Notify All Faculty / Resend Schedule Alerts</span>
              </button>
            </div>
          </div>

          {/* DEDICATED UI SECTION: BULK CSV FACULTY PRE-REGISTRATION */}
          <div className="bg-slate-800/95 rounded-2xl border-2 border-blue-500/40 p-6 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-700/80">
              <div>
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                  <h4 className="font-heading font-extrabold text-lg text-white">
                    Bulk CSV / Excel Faculty Pre-Registration
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    CSV / XLSX Supported
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Upload a CSV file containing <strong>Faculty Name, Mobile Number, and Employee ID</strong> to pre-register faculty accounts in bulk.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleDownloadFacultyCsvTemplate}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Download CSV Template (.csv)</span>
                </button>
              </div>
            </div>

            {/* CSV File Upload Box */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="md:col-span-2">
                <label className="border-2 border-dashed border-blue-500/50 hover:border-blue-400 bg-slate-900/80 hover:bg-slate-900 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group">
                  <Upload className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform mb-2" />
                  <span className="text-xs font-bold text-white mb-1">
                    {facultyCsvFileName ? `File Selected: ${facultyCsvFileName}` : 'Click to Upload CSV File (or Drag & Drop)'}
                  </span>
                  <span className="text-[11px] text-slate-400 text-center">
                    Required Headers: <strong>Faculty Name</strong>, <strong>Mobile Number</strong>, <strong>Employee ID</strong>, Department (Optional)
                  </span>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFacultyCsvFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-700/80 space-y-2 text-xs">
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>CSV Column Requirements</span>
                </div>
                <ul className="space-y-1 text-slate-400 text-[11px]">
                  <li>• <strong className="text-slate-200">Faculty Name</strong> (e.g. Dr. Deborshee Gogoi)</li>
                  <li>• <strong className="text-slate-200">Mobile Number</strong> (10-digit, used for OTP)</li>
                  <li>• <strong className="text-slate-200">Employee ID</strong> (e.g. DC-EMP-001)</li>
                  <li>• <strong className="text-slate-200">Department</strong> (e.g. Commerce, Physics)</li>
                </ul>
              </div>
            </div>

            {/* CSV PARSED PREVIEW TABLE */}
            {facultyCsvPreview.length > 0 && (
              <div className="bg-slate-900/95 border border-emerald-500/40 rounded-2xl p-4 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <h5 className="font-heading font-extrabold text-sm text-white">
                      Parsed CSV Faculty Preview ({facultyCsvPreview.length} Records Found)
                    </h5>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setFacultyCsvPreview([])}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
                    >
                      Clear / Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmFacultyCsvImport}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5 cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Confirm & Bulk Add {facultyCsvPreview.length} Faculty Members</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-60 overflow-y-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 font-semibold sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">Faculty Name</th>
                        <th className="p-2.5">Mobile Number</th>
                        <th className="p-2.5">Employee ID</th>
                        <th className="p-2.5">Department</th>
                        <th className="p-2.5">Designation</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {facultyCsvPreview.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="p-2.5 text-slate-500 font-mono">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-white">{item.name}</td>
                          <td className="p-2.5 font-mono text-emerald-400 font-semibold">
                            {item.phone || <span className="text-rose-400 italic">Missing</span>}
                          </td>
                          <td className="p-2.5 font-mono text-slate-300">{item.employeeId}</td>
                          <td className="p-2.5 text-slate-300">{item.department}</td>
                          <td className="p-2.5 text-slate-400">{item.designation}</td>
                          <td className="p-2.5">
                            {item.phone ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ✓ Ready
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                ⚠️ No Phone
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Add Faculty Form */}
            <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 space-y-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <span>Register New Faculty Member</span>
              </h3>

              <form onSubmit={handleCreateFaculty} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Robert Vance"
                    value={newFacName}
                    onChange={(e) => setNewFacName(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">College Email</label>
                  <input
                    type="email"
                    placeholder="e.g. r.vance@digboicollege.edu.in"
                    value={newFacEmail}
                    onChange={(e) => setNewFacEmail(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Department</label>
                  <select
                    value={newFacDept}
                    onChange={(e) => setNewFacDept(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {DEPARTMENTS_LIST.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Add Faculty Member
                </button>
              </form>
            </div>

            {/* Add Room Form */}
            <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700 space-y-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
                <Building className="w-5 h-5 text-cyan-400" />
                <span>Create Campus Room / Lab</span>
              </h3>

              <form onSubmit={handleCreateRoom} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Room Name</label>
                  <input
                    type="text"
                    placeholder="e.g. LH-204 or AI LAB 2"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Building Block</label>
                  <input
                    type="text"
                    value={newRoomBuilding}
                    onChange={(e) => setNewRoomBuilding(e.target.value)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Seating Capacity</label>
                  <input
                    type="number"
                    value={newRoomCap}
                    onChange={(e) => setNewRoomCap(parseInt(e.target.value, 10) || 40)}
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Create Room
                </button>
              </form>
            </div>
          </div>

          {/* ROUTINE VS PRE-REGISTRATION FACULTY AUDIT TABLE */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <h4 className="font-heading font-extrabold text-base text-white">
                  Routine vs. Pre-Registered Faculty Audit & Match Status
                </h4>
              </div>
              <span className="text-xs text-slate-400">
                {facultyList.length} Faculty Accounts Registered
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="p-3">Faculty Name</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Pre-Reg Mobile Number</th>
                    <th className="p-3">Employee ID</th>
                    <th className="p-3">Routine Classes Count</th>
                    <th className="p-3">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {facultyList.map((fac) => {
                    const classCount = timetable.filter(
                      (t) =>
                        t.facultyId === fac.id ||
                        t.facultyName.toLowerCase().trim() === fac.name.toLowerCase().trim()
                    ).length;

                    const isMobilePresent = Boolean(fac.phone || fac.whatsappPhone);

                    return (
                      <tr key={fac.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 font-bold text-white flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span>{fac.name}</span>
                        </td>
                        <td className="p-3 text-slate-300">{fac.department}</td>
                        <td className="p-3 font-mono font-semibold text-emerald-400">
                          {fac.phone || fac.whatsappPhone || <span className="text-rose-400 italic">Missing Mobile</span>}
                        </td>
                        <td className="p-3 font-mono text-slate-400">{fac.employeeId || 'DC-EMP-001'}</td>
                        <td className="p-3 font-mono text-blue-300 font-bold">{classCount} Lectures</td>
                        <td className="p-3">
                          {isMobilePresent ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              ✓ Verified Ready for Mobile OTP
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              ⚠️ Action: Add Mobile Number
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: MANAGE STUDENTS & ROSTER UPLOAD ===================== */}
      {activeAdminTab === 'students' && (
        <div className="space-y-6">
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-white">
                    Class Student Roster & Excel Import
                  </h3>
                  <p className="text-xs text-slate-400">
                    Upload class-wise student rosters to auto-populate Class Diary attendance checklists and cumulative NAAC tracking.
                  </p>
                </div>
              </div>

              {/* Roster Template & Upload Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadStudentRosterExcelTemplate}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download Roster Template (.xlsx)</span>
                </button>

                <label className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-lg transition-all cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Student Roster Excel</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleStudentRosterFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Quick Add Single Student Form */}
            <form onSubmit={handleAddSingleStudent} className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/80 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Roll Number</label>
                <input
                  type="text"
                  placeholder="e.g. COM-2025-09"
                  value={newStudentRoll}
                  onChange={(e) => setNewStudentRoll(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Student Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Priya Chetri"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Class / Section</label>
                <input
                  type="text"
                  placeholder="e.g. FYUGP 1st Sem Commerce"
                  value={newStudentClass}
                  onChange={(e) => setNewStudentClass(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-md transition-all flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Student</span>
                </button>
              </div>
            </form>
          </div>

          {/* Student Roster List Table */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 overflow-hidden shadow-xl space-y-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search student roll number, name..."
                  value={studentSearchTerm}
                  onChange={(e) => setStudentSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">Class Filter:</span>
                <select
                  value={studentClassFilter}
                  onChange={(e) => setStudentClassFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none"
                >
                  <option value="All">All Classes ({students.length})</option>
                  {Array.from(new Set(students.map((s) => s.classBatch))).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="p-3">Roll No.</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Class / Section</th>
                    <th className="p-3">Session Tag</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        No student rosters loaded yet. Download the template above or add a student manually.
                      </td>
                    </tr>
                  ) : (
                    students
                      .filter((s) => {
                        const matchSearch =
                          s.name.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
                          s.rollNo.toLowerCase().includes(studentSearchTerm.toLowerCase());
                        const matchClass = studentClassFilter === 'All' || s.classBatch === studentClassFilter;
                        return matchSearch && matchClass;
                      })
                      .map((s) => (
                        <tr key={s.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-emerald-400">{s.rollNo}</td>
                          <td className="p-3 font-bold text-white">{s.name}</td>
                          <td className="p-3 text-slate-300">{s.classBatch}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {s.sessionId || `${activeSemesterCycle}-${sessionAcademicYear}`}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteStudent(s.id)}
                              className="p-1.5 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                              title="Delete Student"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: SEMESTER SESSION MANAGEMENT & ARCHIVAL ===================== */}
      {activeAdminTab === 'session' && (
        <div className="space-y-6">
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-white">
                  Academic Session Management & Archival Workflow
                </h3>
                <p className="text-xs text-slate-400">
                  Configure Odd / Even semester cycles, academic year dates, and trigger routine archival for NAAC audit compliance.
                </p>
              </div>
            </div>

            {/* Current Active Session Status Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900 p-4 rounded-xl border border-slate-700/80">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Active Semester Type
                </label>
                <select
                  value={activeSemesterCycle}
                  onChange={(e) => setActiveSemesterCycle(e.target.value as 'Odd' | 'Even')}
                  className="w-full bg-slate-800 text-white font-bold text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                >
                  <option value="Odd">Odd Semester (July – Dec)</option>
                  <option value="Even">Even Semester (Jan – June)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={sessionAcademicYear}
                  onChange={(e) => setSessionAcademicYear(e.target.value)}
                  className="w-full bg-slate-800 text-white font-bold text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                  placeholder="e.g. 2025–26"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Session Start Date
                </label>
                <input
                  type="date"
                  value={sessionStartDate}
                  onChange={(e) => setSessionStartDate(e.target.value)}
                  className="w-full bg-slate-800 text-white font-bold text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Session End Date
                </label>
                <input
                  type="date"
                  value={sessionEndDate}
                  onChange={(e) => setSessionEndDate(e.target.value)}
                  className="w-full bg-slate-800 text-white font-bold text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
                />
              </div>
            </div>

            {/* Archival Action Block */}
            <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-5 space-y-3">
              <div className="flex items-center space-x-2 text-amber-300 font-bold text-sm">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>End-of-Semester Archival Action</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                When transitioning between Odd and Even semesters, archiving the active routine safely moves all routine entries to the read-only audit log while resetting the active timetable for the new cycle. Class diary records and research uploads remain preserved permanently for NAAC/SSR inspection.
              </p>

              <button
                onClick={() => setIsArchiveConfirmOpen(true)}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Archive & Reset Active Session Routine</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: DELEGATED ADMIN ACCESS MANAGEMENT ===================== */}
      {activeAdminTab === 'access' && (
        <div className="space-y-4">
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 space-y-2">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <h3 className="font-heading font-bold text-lg text-white">
                Delegated Admin Access Management (Super-Admin Control)
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Only super-admin accounts (<strong>thewildscapes@gmail.com</strong> / <strong>9706375001</strong>) can assign or revoke administrative rights for other faculty members.
            </p>
          </div>

          <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="p-3.5">Faculty Name</th>
                  <th className="p-3.5">Department</th>
                  <th className="p-3.5">Email ID</th>
                  <th className="p-3.5">Role / Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {facultyList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No registered faculty accounts found in database.
                    </td>
                  </tr>
                ) : (
                  facultyList.map((fac) => {
                    const isSuper = fac.email.toLowerCase() === 'thewildscapes@gmail.com' || fac.phone?.includes('9706375001');
                    const isAdmin = isSuper || fac.role === 'admin';

                    return (
                      <tr key={fac.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-3.5 font-bold text-white flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                            {fac.name.charAt(0)}
                          </div>
                          <span>{fac.name}</span>
                        </td>
                        <td className="p-3.5 text-slate-300">{fac.department}</td>
                        <td className="p-3.5 text-slate-400 font-mono text-[11px]">{fac.email}</td>
                        <td className="p-3.5">
                          {isSuper ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Super Admin (Locked)
                            </span>
                          ) : isAdmin ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                              Delegated Admin
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">
                              Faculty User
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          {isSuper ? (
                            <span className="text-[11px] text-slate-500 font-semibold italic">Permanent Access</span>
                          ) : isAdmin ? (
                            <button
                              onClick={() => onToggleUserAdminRole?.(fac.email, false)}
                              className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-[11px] font-bold rounded-lg border border-rose-500/30 transition-all cursor-pointer"
                            >
                              Revoke Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => onToggleUserAdminRole?.(fac.email, true)}
                              className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-bold rounded-lg border border-indigo-500/30 transition-all cursor-pointer"
                            >
                              Grant Admin Access
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Archive Session Confirmation Modal */}
      {isArchiveConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle className="w-7 h-7 shrink-0" />
              <h3 className="font-heading font-bold text-lg text-white">
                Confirm Semester Session Archival
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              This will archive the current <strong>{activeSemesterCycle} Semester {sessionAcademicYear}</strong> session and prepare the app for a new routine. Class diary records will remain safely stored and viewable under Archived Sessions. Continue?
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsArchiveConfirmOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onResetData();
                  setIsArchiveConfirmOpen(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
              >
                Archive & Reset Routine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: NAAC / NBA AUDIT REPORTS ===================== */}
      {activeAdminTab === 'naac_reports' && (
        <AdminNaacReports
          facultyList={facultyList}
          timetable={timetable}
        />
      )}

      {/* ===================== CREATE / EDIT TIMETABLE ENTRY MODAL ===================== */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-heading font-bold text-lg text-white">
                {editingEntryId ? 'Edit Class Timetable Entry' : 'Add New Class Entry'}
              </h3>
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              {/* Semester Cycle & Program/Semester */}
              <div className="grid grid-cols-2 gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <div>
                  <label className="text-xs font-semibold text-emerald-300 block mb-1">Semester Cycle</label>
                  <select
                    value={formSemesterCycle}
                    onChange={(e) => {
                      const val = e.target.value as 'Odd' | 'Even';
                      setFormSemesterCycle(val);
                      const newList = val === 'Odd' ? ODD_SEMESTERS_LIST : EVEN_SEMESTERS_LIST;
                      setFormProgramSemester(newList[0]);
                    }}
                    className="w-full bg-slate-900 text-white text-xs font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Odd">Odd Semesters (Aug–Dec)</option>
                    <option value="Even">Even Semesters (Jan–Jun)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-amber-300 block mb-1">Course / Semester</label>
                  <select
                    value={formProgramSemester}
                    onChange={(e) => {
                      const prog = e.target.value;
                      setFormProgramSemester(prog);
                      setFormBatch(prog);
                      // Pre-fill department if HS Commerce
                      if (prog.includes('Commerce')) {
                        setFormDepartment('Commerce & Management');
                        setFormPaperCategory('HS Core');
                      }
                    }}
                    className="w-full bg-slate-900 text-white text-xs font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    {(formSemesterCycle === 'Odd' ? ODD_SEMESTERS_LIST : EVEN_SEMESTERS_LIST).map((prog) => (
                      <option key={prog} value={prog}>
                        {prog}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Paper Category & Quick Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 block">Paper Category / Type</label>
                  <span className="text-[10px] text-fuchsia-300 font-medium">
                    (PG includes: Major, Minor, MDC, Vocational)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {FYUGP_PAPER_CATEGORIES.map((cat) => (
                    <button
                      type="button"
                      key={cat.code}
                      onClick={() => setFormPaperCategory(cat.code)}
                      className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all text-center ${
                        formPaperCategory === cat.code
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-400/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {cat.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Preset Buttons for Subjects */}
              <div className="bg-slate-800/90 p-3 rounded-xl border border-cyan-500/30 space-y-1.5">
                <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider block">
                  ⚡ Quick Subject Presets (Click or type manually below):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { code: 'COM101', name: 'Financial Accounting' },
                    { code: 'COM102', name: 'Business Law' },
                    { code: 'ECO101', name: 'Microeconomics' },
                    { code: 'MDC101', name: 'Multidisciplinary Course' },
                    { code: 'VOC101', name: 'Vocational Skill Paper' },
                    { code: 'PG101', name: 'Advanced Financial Management' },
                  ].map((sub) => (
                    <button
                      type="button"
                      key={sub.code}
                      onClick={() => {
                        setFormSubjectName(sub.name);
                        setFormSubjectCode(sub.code);
                      }}
                      className="px-2 py-0.5 bg-slate-900 hover:bg-slate-700 text-cyan-300 text-[11px] font-semibold rounded-lg border border-slate-700 transition-all"
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Department & Faculty Member */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Department</label>
                  <select
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {DEPARTMENTS_LIST.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Assigned Teacher</label>
                  <select
                    value={formFacultyId}
                    onChange={(e) => {
                      const fid = e.target.value;
                      setFormFacultyId(fid);
                      const fObj = facultyList.find((f) => f.id === fid);
                      if (fObj?.department) setFormDepartment(fObj.department);
                    }}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {facultyList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.department})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject Code & Manual Subject Name Entry */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Subject Code</label>
                  <input
                    type="text"
                    value={formSubjectCode}
                    onChange={(e) => setFormSubjectCode(e.target.value)}
                    placeholder="e.g. COM101 or PG101-MAJ"
                    className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-emerald-300 block">Subject / Paper Name (Manual Entry)</label>
                    <span className="text-[9px] text-emerald-400 font-semibold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">✏️ Editable</span>
                  </div>
                  <input
                    type="text"
                    value={formSubjectName}
                    onChange={(e) => setFormSubjectName(e.target.value)}
                    placeholder="Type custom subject name manually..."
                    className="w-full bg-slate-900 text-white text-xs font-medium rounded-xl px-3 py-2 border border-emerald-500/60 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                    required
                  />
                  <p className="text-[9.5px] text-slate-400 mt-1">You can enter any PG or UG subject name manually above.</p>
                </div>
              </div>

              {/* Day & 1-Hour Time Slot */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Day of Week</label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value as DayOfWeek)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-indigo-300 block mb-1">1-Hour Time Slot (8 AM - 4 PM)</label>
                  <select
                    value={`${formStartTime} - ${formEndTime}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      const slot = HOURLY_TIME_SLOTS.find((s) => s.label === val);
                      if (slot) {
                        setFormStartTime(slot.startTime);
                        setFormEndTime(slot.endTime);
                      }
                    }}
                    className="w-full bg-slate-800 text-white font-bold text-xs rounded-xl px-3 py-2 border border-indigo-500/50 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {HOURLY_TIME_SLOTS.map((slot) => (
                      <option key={slot.label} value={slot.label}>
                        {slot.displayLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Room & Batch */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300 block">Class No./Room (Free-Text or Dropdown)</label>
                    <span className="text-[9px] text-cyan-300 font-semibold bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30">✏️ Editable</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      list="available_rooms_list"
                      value={formRoom}
                      onChange={(e) => setFormRoom(e.target.value)}
                      placeholder="e.g. Room No. C1, Lib.2, Hall, M2, AT3..."
                      className="w-full bg-slate-800 text-white text-xs font-semibold rounded-xl px-3 py-2 border border-cyan-500/50 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
                      required
                    />
                    <datalist id="available_rooms_list">
                      {roomList.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.building} - Cap {r.capacity}
                        </option>
                      ))}
                      <option value="Lib.2">Library Hall 2</option>
                      <option value="Hall">Main Auditorium Hall</option>
                      <option value="M2">M2 Seminar Room</option>
                      <option value="AT3">Annex Theater 3</option>
                      <option value="Smart Class 1">Smart Classroom 1</option>
                    </datalist>
                  </div>
                  <p className="text-[9.5px] text-slate-400 mt-1">Select from list or type custom codes like Lib.2, Hall, AT3.</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Batch / Class Tag</label>
                  <input
                    type="text"
                    value={formBatch}
                    onChange={(e) => setFormBatch(e.target.value)}
                    placeholder="e.g. HS 1st Yr Commerce or FYUGP 1st Sem CS"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Notes / Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Bring calculator or lab practical notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Double Booking Conflict Warning Modal */}
      {doubleBookingConflict && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-white animate-fadeIn">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-8 h-8 shrink-0 text-amber-400 animate-bounce" />
              <div>
                <h3 className="font-heading font-extrabold text-lg text-white">
                  Room Double-Booking Detected
                </h3>
                <span className="text-[11px] text-amber-300 font-bold uppercase tracking-wider">
                  Conflict Warning
                </span>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Room <strong className="text-amber-300 font-mono text-sm">{formRoom}</strong> is already assigned on{' '}
                <strong className="text-white">{formDay}</strong> between{' '}
                <strong className="text-cyan-300 font-mono">{doubleBookingConflict.conflictEntry.startTime} – {doubleBookingConflict.conflictEntry.endTime}</strong> by:
              </p>

              <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-lg space-y-1">
                <div className="font-bold text-amber-200">
                  {doubleBookingConflict.conflictEntry.subjectName} ({doubleBookingConflict.conflictEntry.subjectCode})
                </div>
                <div className="text-[11px] text-slate-300">
                  Faculty: <strong className="text-white">{doubleBookingConflict.conflictEntry.facultyName}</strong> | Class: {doubleBookingConflict.conflictEntry.batch}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 italic">
                Do you still want to proceed with <strong>Manual Override</strong> (allow double booking)?
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDoubleBookingConflict(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Cancel & Adjust Room
              </button>
              <button
                type="button"
                onClick={(e) => handleSaveEntry(e, true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Confirm & Force Save (Manual Override)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
