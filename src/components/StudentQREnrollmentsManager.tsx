import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Student, StudentEnrollment, QREnrollmentSession } from '../types';
import {
  saveStudentEnrollmentToFirestore,
  updateStudentEnrollmentStatusInFirestore,
  subscribeToStudentEnrollmentsRealtime,
  subscribeToQREnrollmentSessionsRealtime,
} from '../lib/firebaseService';
import { QREnrollmentGeneratorModal } from './QREnrollmentGeneratorModal';
import {
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  QrCode,
  Download,
  Filter,
  Search,
  RefreshCw,
  Phone,
  Mail,
  ShieldCheck,
  Edit3,
  Trash2,
  Plus,
  Clock,
  Sparkles,
  ChevronRight,
  FileSpreadsheet,
  Check,
  Power,
  Layers,
} from 'lucide-react';

interface StudentQREnrollmentsManagerProps {
  students: Student[];
  onUpdateStudents: (updatedStudents: Student[]) => void;
  currentUser?: any;
}

export const StudentQREnrollmentsManager: React.FC<StudentQREnrollmentsManagerProps> = ({
  students,
  onUpdateStudents,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'qr_sessions' | 'roster'>('pending');
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [qrSessions, setQrSessions] = useState<QREnrollmentSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Modals
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [reassignModalTarget, setReassignModalTarget] = useState<StudentEnrollment | null>(null);
  const [newReassignClass, setNewReassignClass] = useState('');
  const [newReassignSection, setNewReassignSection] = useState('Section A');

  // Load Realtime Data from Firestore + Server API
  useEffect(() => {
    setIsLoading(true);

    // 1. Subscribe to Student Enrollments Realtime
    const unsubscribeEnrollments = subscribeToStudentEnrollmentsRealtime((data) => {
      setEnrollments(data);
      setIsLoading(false);
    });

    // 2. Subscribe to QR Sessions Realtime
    const unsubscribeSessions = subscribeToQREnrollmentSessionsRealtime((data) => {
      setQrSessions(data);
    });

    // Fetch initial list from server API as fallback
    fetch('/api/student-enrollments')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setEnrollments((prev) => (prev.length === 0 ? data : prev));
        }
      })
      .catch((e) => console.warn('Server fetch enrollments note:', e));

    fetch('/api/qr-sessions')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setQrSessions((prev) => (prev.length === 0 ? data : prev));
        }
      })
      .catch((e) => console.warn('Server fetch qr sessions note:', e));

    return () => {
      unsubscribeEnrollments();
      unsubscribeSessions();
    };
  }, []);

  const pendingList = enrollments.filter((e) => e.status === 'pending');

  // Duplicate and Master List Matching Logic
  const getEnrollmentMatchStatus = (enr: StudentEnrollment) => {
    const cleanRoll = enr.rollNo.trim().toUpperCase();
    const cleanMobile = enr.mobile.trim();

    // Check if duplicate in approved master list or another pending entry
    const isMasterMatch = students.some((s) => s.rollNo.trim().toUpperCase() === cleanRoll);

    const duplicateInEnrollments = enrollments.filter(
      (e) =>
        e.id !== enr.id &&
        (e.rollNo.trim().toUpperCase() === cleanRoll || e.mobile.trim() === cleanMobile)
    );

    if (duplicateInEnrollments.length > 0) {
      return { status: 'duplicate_flagged', label: 'Duplicate Entry', color: 'rose' };
    }
    if (isMasterMatch) {
      return { status: 'matched', label: 'Matched Master List', color: 'emerald' };
    }
    return { status: 'unmatched_new', label: 'New Student Record', color: 'amber' };
  };

  // Single Approve Handler
  const handleApproveEnrollment = async (enr: StudentEnrollment) => {
    try {
      // 1. Update Enrollment status in Server & Firestore
      await fetch(`/api/student-enrollments/${enr.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', reviewedBy: currentUser?.name || 'Admin' }),
      });

      await updateStudentEnrollmentStatusInFirestore(enr.id, 'approved', currentUser?.name || 'Admin');

      // 2. Add Student to Master Student Roster
      const newStudent: Student = {
        id: `st_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        rollNo: enr.rollNo,
        name: enr.name,
        classBatch: enr.classBatch,
        section: enr.section || 'Section A',
        department: enr.department || '',
        mobile: enr.mobile,
        email: enr.email || '',
        academicYear: '2025–26',
        sessionId: 'Odd-2025-26',
        enrollmentSource: 'qr_self_enrollment',
        enrollmentId: enr.id,
        enrolledAt: new Date().toISOString(),
      };

      // Push to server API
      await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudent),
      });

      onUpdateStudents([...students, newStudent]);
    } catch (err) {
      console.error('Error approving student enrollment:', err);
    }
  };

  // Bulk Approve Clean Entries
  const handleApproveAllValid = async () => {
    const validCleanEntries = pendingList.filter((e) => {
      const match = getEnrollmentMatchStatus(e);
      return match.status !== 'duplicate_flagged';
    });

    if (validCleanEntries.length === 0) {
      alert('No non-duplicate entries found to approve.');
      return;
    }

    if (!confirm(`Approve all ${validCleanEntries.length} valid student self-enrollment entries?`)) {
      return;
    }

    for (const enr of validCleanEntries) {
      await handleApproveEnrollment(enr);
    }
  };

  // Reject Handler
  const handleRejectEnrollment = async (enr: StudentEnrollment) => {
    try {
      await fetch(`/api/student-enrollments/${enr.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', reviewedBy: currentUser?.name || 'Admin' }),
      });

      await updateStudentEnrollmentStatusInFirestore(enr.id, 'rejected', currentUser?.name || 'Admin');
    } catch (err) {
      console.error('Error rejecting student enrollment:', err);
    }
  };

  // Reassign Class / Section
  const handleConfirmReassign = async () => {
    if (!reassignModalTarget) return;

    try {
      await fetch(`/api/student-enrollments/${reassignModalTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classBatch: newReassignClass || reassignModalTarget.classBatch,
          section: newReassignSection || reassignModalTarget.section,
        }),
      });

      await updateStudentEnrollmentStatusInFirestore(
        reassignModalTarget.id,
        reassignModalTarget.status,
        currentUser?.name || 'Admin',
        newReassignClass || reassignModalTarget.classBatch,
        newReassignSection || reassignModalTarget.section
      );

      setReassignModalTarget(null);
    } catch (err) {
      console.error('Error reassigning enrollment class:', err);
    }
  };

  // Excel Roster Export
  const handleExportRosterToExcel = () => {
    const formatted = students.map((s) => ({
      'Roll Number': s.rollNo,
      'Student Full Name': s.name,
      'Class / Batch': s.classBatch,
      Section: s.section || 'Section A',
      Department: s.department || 'N/A',
      'Mobile Number': s.mobile || 'N/A',
      'Email Address': s.email || 'N/A',
      Source: s.enrollmentSource === 'qr_self_enrollment' ? 'QR Self-Enrolled' : 'Manual Admin',
      'Session Tag': s.sessionId || '2025-26',
    }));

    const ws = XLSX.utils.json_to_sheet(formatted);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Roster');
    XLSX.writeFile(wb, `ClassPilot_Student_Roster_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-extrabold text-xl shadow-lg shadow-emerald-500/20 shrink-0">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-heading font-black text-lg text-white">
                  Student QR Self-Enrollment & Roster
                </h2>
                {pendingList.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-500 text-white animate-pulse">
                    {pendingList.length} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Generate QR codes for WhatsApp distribution, review self-enrollments, and sync rosters
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsGeneratorModalOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-extrabold flex items-center space-x-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Generate New QR Code</span>
            </button>

            <button
              onClick={handleExportRosterToExcel}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold flex items-center space-x-2 shadow-lg transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Roster Excel</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center space-x-2 pt-2 border-t border-slate-700/80 overflow-x-auto">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Pending Approvals</span>
            {pendingList.length > 0 && (
              <span className="px-2 py-0.2 bg-white text-emerald-800 text-[10px] font-black rounded-full">
                {pendingList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('qr_sessions')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'qr_sessions'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Active QR Sessions ({qrSessions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('roster')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'roster'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Master Class Roster ({students.length})</span>
          </button>
        </div>
      </div>

      {/* ==================== TAB 1: PENDING VERIFICATION & APPROVALS ==================== */}
      {activeTab === 'pending' && (
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-sm text-white">Pending Self-Enrollment Submissions</h3>
              <span className="text-xs text-slate-400">({pendingList.length} submissions)</span>
            </div>

            {pendingList.length > 0 && (
              <button
                onClick={handleApproveAllValid}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve All Valid Entries</span>
              </button>
            )}
          </div>

          {/* Search Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student name, roll number, mobile..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none"
              />
            </div>

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none"
            >
              <option value="All">All Classes</option>
              {Array.from(new Set(enrollments.map((e) => e.classBatch))).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Table of Submissions */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="p-3">Roll Number</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Class & Section</th>
                  <th className="p-3">WhatsApp Mobile</th>
                  <th className="p-3">Master List Status</th>
                  <th className="p-3">Submitted At</th>
                  <th className="p-3 text-right">Verification Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {pendingList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      <div className="flex flex-col items-center space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-60" />
                        <p className="font-bold text-white text-sm">No Pending Self-Enrollments</p>
                        <p className="text-xs text-slate-400">
                          All submitted QR enrollments have been reviewed and approved!
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingList
                    .filter((e) => {
                      const matchSearch =
                        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        e.rollNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        e.mobile.includes(searchTerm);
                      const matchClass = classFilter === 'All' || e.classBatch === classFilter;
                      return matchSearch && matchClass;
                    })
                    .map((enr) => {
                      const match = getEnrollmentMatchStatus(enr);
                      return (
                        <tr key={enr.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-amber-300">{enr.rollNo}</td>
                          <td className="p-3 font-bold text-white">{enr.name}</td>
                          <td className="p-3">
                            <div>
                              <span className="font-bold text-slate-200">{enr.classBatch}</span>
                              <span className="block text-[10px] text-blue-300 font-semibold">{enr.section}</span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-slate-300">{enr.mobile}</td>
                          <td className="p-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                                match.color === 'emerald'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : match.color === 'rose'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {match.label}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-slate-400">
                            {new Date(enr.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* Reassign Class Button */}
                              <button
                                onClick={() => {
                                  setReassignModalTarget(enr);
                                  setNewReassignClass(enr.classBatch);
                                  setNewReassignSection(enr.section);
                                }}
                                className="px-2 py-1 bg-slate-900 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-bold border border-slate-700 transition-all cursor-pointer"
                                title="Reassign Class/Section"
                              >
                                Reassign
                              </button>

                              {/* Approve Button */}
                              <button
                                onClick={() => handleApproveEnrollment(enr)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-extrabold flex items-center space-x-1 shadow-sm transition-all cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>

                              {/* Reject Button */}
                              <button
                                onClick={() => handleRejectEnrollment(enr)}
                                className="p-1.5 bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white rounded-lg transition-all cursor-pointer"
                                title="Reject Submission"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
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

      {/* ==================== TAB 2: ACTIVE QR SESSIONS ==================== */}
      {activeTab === 'qr_sessions' && (
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white">Created QR Code Enrollment Links</h3>
            <button
              onClick={() => setIsGeneratorModalOpen(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New QR Link</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {qrSessions.length === 0 ? (
              <div className="col-span-full p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
                No active QR enrollment sessions created yet. Click above to generate your first WhatsApp QR code link!
              </div>
            ) : (
              qrSessions.map((sess) => {
                const isExpired = sess.expiresAt ? new Date(sess.expiresAt).getTime() < Date.now() : false;
                const submissionCount = enrollments.filter((e) => e.sessionId === sess.id || e.sessionToken === sess.token).length;

                return (
                  <div
                    key={sess.id}
                    className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 space-y-3 shadow-lg hover:border-slate-600 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          !sess.isActive
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : isExpired
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {!sess.isActive ? 'Deactivated' : isExpired ? 'Expired' : 'Active'}
                      </span>

                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(sess.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-sm text-white">{sess.classBatch}</h4>
                      <p className="text-xs text-blue-400 font-semibold">{sess.section}</p>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl text-xs">
                      <span className="text-slate-400">Total Enrollments:</span>
                      <span className="font-extrabold text-emerald-400 text-sm">{submissionCount} Students</span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => {
                          const msg = `📱 *Student Self-Enrollment QR Link*\n\nClass: *${sess.classBatch}*\nSection: *${sess.section}*\n\nStudents, click to enroll:\n${sess.enrollmentUrl}`;
                          window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        className="px-3 py-1.5 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        WhatsApp
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(sess.enrollmentUrl);
                          alert('Enrollment Link copied to clipboard!');
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: MASTER CLASS ROSTER ==================== */}
      {activeTab === 'roster' && (
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-bold text-sm text-white">Enrolled Students Roster ({students.length})</h3>

            <button
              onClick={handleExportRosterToExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Roster (.xlsx)</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="p-3">Roll Number</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Class / Batch</th>
                  <th className="p-3">Section</th>
                  <th className="p-3">Enrollment Source</th>
                  <th className="p-3">Mobile Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No enrolled students in master list. Generate a QR code to begin student self-enrollments!
                    </td>
                  </tr>
                ) : (
                  students.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-emerald-400">{st.rollNo}</td>
                      <td className="p-3 font-bold text-white">{st.name}</td>
                      <td className="p-3 text-slate-300">{st.classBatch}</td>
                      <td className="p-3 text-slate-300">{st.section || 'Section A'}</td>
                      <td className="p-3">
                        {st.enrollmentSource === 'qr_self_enrollment' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center space-x-1 w-fit">
                            <QrCode className="w-3 h-3" />
                            <span>QR Self-Enrolled</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700/60 text-slate-300 w-fit block">
                            Manual / Excel Import
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-slate-300">{st.mobile || 'N/A'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generator Modal */}
      <QREnrollmentGeneratorModal
        isOpen={isGeneratorModalOpen}
        onClose={() => setIsGeneratorModalOpen(false)}
        currentUser={currentUser}
        existingSessions={qrSessions}
      />

      {/* Reassign Class Modal */}
      {reassignModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Reassign Student Class/Section</h3>
            <p className="text-xs text-slate-400">
              Reassign <span className="text-white font-bold">{reassignModalTarget.name}</span> ({reassignModalTarget.rollNo}) if they scanned the wrong QR code:
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Class / Batch</label>
                <input
                  type="text"
                  value={newReassignClass}
                  onChange={(e) => setNewReassignClass(e.target.value)}
                  className="w-full bg-slate-950 text-white text-xs rounded-xl p-2.5 border border-slate-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Section</label>
                <select
                  value={newReassignSection}
                  onChange={(e) => setNewReassignSection(e.target.value)}
                  className="w-full bg-slate-950 text-white text-xs rounded-xl p-2.5 border border-slate-700 focus:outline-none"
                >
                  <option value="Section A">Section A</option>
                  <option value="Section B">Section B</option>
                  <option value="Section C">Section C</option>
                  <option value="Section D">Section D</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setReassignModalTarget(null)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReassign}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Save Reassignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
