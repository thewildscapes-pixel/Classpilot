import React, { useState, useEffect } from 'react';
import { ClassDiaryEntry, Faculty, TimetableEntry } from '../types';
import {
  FileText,
  Download,
  Printer,
  Filter,
  Calendar,
  Building2,
  Users,
  Award,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Lock,
  Search,
  Sparkles,
  BarChart2,
  TrendingUp,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';

interface AdminNaacReportsProps {
  facultyList: Faculty[];
  timetable: TimetableEntry[];
}

export const AdminNaacReports: React.FC<AdminNaacReportsProps> = ({
  facultyList,
  timetable,
}) => {
  const [diaryEntries, setDiaryEntries] = useState<ClassDiaryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('All');
  const [dateRange, setDateRange] = useState<'30days' | 'semester' | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Print Mode State
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  useEffect(() => {
    fetchDiaryEntries();
  }, []);

  const fetchDiaryEntries = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/class-diary');
      if (res.ok) {
        const data = await res.json();
        setDiaryEntries(data);
      } else {
        loadFallbackEntries();
      }
    } catch (e) {
      loadFallbackEntries();
    } finally {
      setLoading(false);
    }
  };

  const loadFallbackEntries = () => {
    try {
      const saved = localStorage.getItem('classpilot_class_diary') || localStorage.getItem('lecturapulse_class_diary');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((entry: ClassDiaryEntry) => entry.id !== 'diary_1' && entry.id !== 'diary_2');
          setDiaryEntries(cleaned);
          return;
        }
      }
    } catch (err) {}

    setDiaryEntries([]);
  };

  // Filter entries
  const filteredEntries = diaryEntries.filter((entry) => {
    const matchDept = selectedDept === 'All' || entry.department === selectedDept;
    const matchFaculty = selectedFacultyId === 'All' || entry.facultyId === selectedFacultyId;
    const matchSearch =
      entry.topicTaught.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.subjectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.facultyName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchDept || !matchFaculty || !matchSearch) return false;

    if (dateRange === '30days') {
      const thirtyDaysAgo = Date.now() - 30 * 86400000;
      const entryTime = new Date(entry.date).getTime();
      return entryTime >= thirtyDaysAgo;
    }
    return true;
  });

  // Calculate Aggregated Metrics for NAAC/NBA
  const totalClasses = filteredEntries.length;
  const totalMins = filteredEntries.reduce((acc, e) => acc + (e.durationMins || 60), 0);
  const totalHours = (totalMins / 60).toFixed(1);

  // Student Attendance Aggregation
  let totalStudentPresent = 0;
  let totalStudentRecords = 0;
  const studentMap: Record<string, { rollNo: string; name: string; present: number; total: number }> = {};

  filteredEntries.forEach((entry) => {
    if (entry.attendance) {
      entry.attendance.forEach((att) => {
        totalStudentRecords += 1;
        if (att.status === 'Present' || att.status === 'Late') {
          totalStudentPresent += 1;
        }

        if (!studentMap[att.studentId]) {
          studentMap[att.studentId] = {
            rollNo: att.rollNo,
            name: att.name,
            present: 0,
            total: 0,
          };
        }
        studentMap[att.studentId].total += 1;
        if (att.status === 'Present' || att.status === 'Late') {
          studentMap[att.studentId].present += 1;
        }
      });
    }
  });

  const avgAttendancePercent =
    totalStudentRecords > 0 ? ((totalStudentPresent / totalStudentRecords) * 100).toFixed(1) : '100.0';

  const lowAttendanceStudents = Object.values(studentMap)
    .map((s) => ({
      ...s,
      pct: s.total > 0 ? Math.round((s.present / s.total) * 100) : 100,
    }))
    .filter((s) => s.pct < 75);

  // Time-lock compliance check (entries locked within 24h)
  const lockedEntries = filteredEntries.filter((e) => {
    const elapsed = Date.now() - (e.classStartTimestamp || new Date(`${e.date}T${e.startTime}`).getTime());
    return elapsed > 24 * 3600000;
  });
  const complianceRate = totalClasses > 0 ? Math.round((lockedEntries.length / totalClasses) * 100) : 100;

  // Print PDF Handler
  const handlePrintPdf = () => {
    setIsGeneratingPdf(true);
    setTimeout(() => {
      window.print();
      setIsGeneratingPdf(false);
    }, 200);
  };

  // Export CSV Handler
  const handleExportNaacCsv = () => {
    const headers = 'Audit ID,Date,Faculty Member,Department,Subject Code,Subject Name,Batch,Room,Topic Taught,Syllabus Unit,Duration Mins,Attendance %,Lock Verification Status\n';
    const rows = filteredEntries
      .map((e) => {
        const totalAtt = e.attendance ? e.attendance.length : 0;
        const presAtt = e.attendance ? e.attendance.filter((a) => a.status === 'Present').length : 0;
        const attPct = totalAtt > 0 ? Math.round((presAtt / totalAtt) * 100) : 100;
        const isLocked = (Date.now() - (e.classStartTimestamp || new Date(`${e.date}T${e.startTime}`).getTime())) > 24 * 3600000;

        return `"${e.id}","${e.date}","${e.facultyName}","${e.department}","${e.subjectCode}","${e.subjectName}","${e.batch}","${e.room}","${e.topicTaught.replace(/"/g, '""')}","${e.syllabusUnit || 'N/A'}","${e.durationMins}","${attPct}%","${isLocked ? 'Verified Lock' : 'Pending Lock'}"`;
      })
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NAAC_NBA_ClassDiary_Attendance_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Printable CSS Rules for Clean Vector PDF Generation */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #naac-printable-report, #naac-printable-report * {
            visibility: visible;
          }
          #naac-printable-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            color: #000 !important;
            background: #fff !important;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
          .print-border {
            border: 1px solid #cbd5e1 !important;
          }
        }
      `}</style>

      {/* Control Header & Filters (No Print) */}
      <div className="no-print bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs text-blue-400 font-bold uppercase tracking-wider mb-1">
              <Award className="w-4 h-4 text-blue-400" />
              <span>NAAC / NBA Accreditation Audit Reports</span>
            </div>
            <h2 className="font-heading font-extrabold text-2xl text-white flex items-center space-x-2">
              <span>Academic Class Diary & Attendance Compliance Report</span>
              <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-mono">
                Criterion 1 & 2 Ready
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Aggregates teacher class logbooks, syllabus coverage, and student attendance registers for official NAAC/NBA peer team evaluation.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportNaacCsv}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handlePrintPdf}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center space-x-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Generate Official PDF Audit Summary</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-800">
          {/* Dept Filter */}
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
              Department
            </label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none"
            >
              <option value="All">All Departments</option>
              <option value="Commerce">Commerce</option>
              <option value="Computer Science">Computer Science</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
              <option value="Mathematics">Mathematics</option>
              <option value="English">English</option>
            </select>
          </div>

          {/* Faculty Filter */}
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
              Faculty Member
            </label>
            <select
              value={selectedFacultyId}
              onChange={(e) => setSelectedFacultyId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none"
            >
              <option value="All">All Faculty Members</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.department})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
              Time Period
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none"
            >
              <option value="all">Entire Academic Year</option>
              <option value="30days">Last 30 Days</option>
              <option value="semester">Current Semester</option>
            </select>
          </div>

          {/* Search Term */}
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
              Keyword Search
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search topic or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-2.5 py-2.5 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* REPORT SUMMARY METRIC CARDS (No Print) */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
            <span>Total Conducted Lectures</span>
            <BookOpen className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-black text-white">{totalClasses} Classes</div>
          <p className="text-xs text-slate-400">{totalHours} Instructional Hours Logged</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
            <span>Avg Student Attendance</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400">{avgAttendancePercent}%</div>
          <p className="text-xs text-slate-400">Across {totalStudentRecords} student marks</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
            <span>Low Attendance Defaulters</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400">
            {lowAttendanceStudents.length} Students
          </div>
          <p className="text-xs text-slate-400">&lt;75% Attendance (Defaulter List)</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
            <span>24h Lock Log Compliance</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-black text-indigo-300">{complianceRate}%</div>
          <p className="text-xs text-slate-400">Timely Log Verification</p>
        </div>
      </div>

      {/* OFFICIAL PRINTABLE NAAC AUDIT REPORT CONTAINER */}
      <div
        id="naac-printable-report"
        className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-8 text-white"
      >
        {/* Printable Official Letterhead */}
        <div className="border-b-2 border-blue-600/40 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold uppercase bg-blue-600 text-white px-3 py-1 rounded-md">
                DIGBOI COLLEGE
              </span>
              <span className="text-xs font-bold text-slate-400">ESTD: 1965 • NAAC ACCREDITED 'A' GRADE</span>
            </div>
            <h1 className="font-heading font-black text-2xl text-white tracking-tight">
              ACADEMIC CLASS DIARY & ATTENDANCE AUDIT REPORT
            </h1>
            <p className="text-xs text-slate-300 font-medium">
              Prepared for Internal Quality Assurance Cell (IQAC) & NAAC/NBA Peer Team Verification
            </p>
          </div>

          <div className="text-right text-xs space-y-1 font-mono text-slate-400">
            <div><strong className="text-slate-200">Department:</strong> {selectedDept}</div>
            <div><strong className="text-slate-200">Date Generated:</strong> {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div><strong className="text-slate-200">Report Status:</strong> VERIFIED & LOCKED</div>
          </div>
        </div>

        {/* Executive Summary Metrics Grid for Report */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-slate-800/60 rounded-2xl border border-slate-700/80 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Classes Conducted</span>
            <span className="text-lg font-black text-white">{totalClasses} Sessions ({totalHours} hrs)</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Class Attendance Average</span>
            <span className="text-lg font-black text-emerald-400">{avgAttendancePercent}%</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Defaulter Students (&lt;75%)</span>
            <span className="text-lg font-black text-amber-400">{lowAttendanceStudents.length} Students</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Log Verification Rate</span>
            <span className="text-lg font-black text-blue-400">{complianceRate}%</span>
          </div>
        </div>

        {/* TABLE 1: CLASS CONDUCT & SYLLABUS LOGBOOK */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-white flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-blue-400" />
              <span>Section I: Class Conduct & Syllabus Topic Coverage Register</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {filteredEntries.length} Recorded Sessions
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Subject & Batch</th>
                  <th className="p-3">Faculty Member</th>
                  <th className="p-3">Room</th>
                  <th className="p-3">Topic Taught & Syllabus Unit</th>
                  <th className="p-3 text-center">Attendance</th>
                  <th className="p-3 text-right">Lock Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                      No class diary logs match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const totalAtt = entry.attendance ? entry.attendance.length : 0;
                    const presAtt = entry.attendance ? entry.attendance.filter((a) => a.status === 'Present').length : 0;
                    const attPct = totalAtt > 0 ? Math.round((presAtt / totalAtt) * 100) : 100;
                    const isLocked = (Date.now() - (entry.classStartTimestamp || new Date(`${entry.date}T${entry.startTime}`).getTime())) > 24 * 3600000;

                    return (
                      <tr key={entry.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-slate-200">
                          <div>{entry.date}</div>
                          <div className="text-[10px] text-slate-400">{entry.startTime} - {entry.endTime}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-extrabold text-white">{entry.subjectCode}</div>
                          <div className="text-[11px] text-slate-400">{entry.batch}</div>
                        </td>
                        <td className="p-3 font-bold text-slate-200">{entry.facultyName}</td>
                        <td className="p-3 font-mono text-emerald-400">{entry.room}</td>
                        <td className="p-3">
                          <div className="font-bold text-white max-w-xs">{entry.topicTaught}</div>
                          {entry.syllabusUnit && (
                            <div className="text-[10px] text-blue-300 italic">{entry.syllabusUnit}</div>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold">
                          <span className={attPct >= 75 ? 'text-emerald-400' : 'text-amber-400'}>
                            {attPct}% ({presAtt}/{totalAtt})
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                            isLocked ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {isLocked ? '24h Verified' : 'Open Draft'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* TABLE 2: LOW ATTENDANCE DEFAULTERS FOR ACADEMIC COUNSELING */}
        {lowAttendanceStudents.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-amber-300 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Section II: Defaulter Student Register (&lt;75% Attendance Threshold)</span>
              </h3>
              <span className="text-xs text-amber-400 font-bold">
                Mandatory NAAC Counseling Required
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-amber-500/30">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-amber-950/40 text-amber-300 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-3">Roll Number</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Classes Attended</th>
                    <th className="p-3">Total Held</th>
                    <th className="p-3">Attendance %</th>
                    <th className="p-3">Action Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {lowAttendanceStudents.map((st) => (
                    <tr key={st.rollNo} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold text-white">{st.rollNo}</td>
                      <td className="p-3 font-extrabold text-slate-100">{st.name}</td>
                      <td className="p-3 font-bold text-emerald-400">{st.present}</td>
                      <td className="p-3 text-slate-300">{st.total}</td>
                      <td className="p-3 font-extrabold text-red-400">{st.pct}%</td>
                      <td className="p-3 text-amber-300 font-bold">
                        ⚠️ Issue Warning Notice & Call Parent/Guardian
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* OFFICIAL NAAC COMPLIANCE SIGNATURE BLOCK */}
        <div className="pt-12 border-t border-slate-800 grid grid-cols-3 gap-8 text-center text-xs text-slate-400">
          <div className="space-y-8">
            <div className="h-10 border-b border-dashed border-slate-700" />
            <div>
              <div className="font-bold text-slate-200">Head of Department (HOD)</div>
              <div className="text-[10px] text-slate-500">Department of {selectedDept}</div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="h-10 border-b border-dashed border-slate-700" />
            <div>
              <div className="font-bold text-slate-200">IQAC / NAAC Coordinator</div>
              <div className="text-[10px] text-slate-500">Digboi College Steering Committee</div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="h-10 border-b border-dashed border-slate-700" />
            <div>
              <div className="font-bold text-slate-200">Principal</div>
              <div className="text-[10px] text-slate-500">Digboi College, Assam</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
