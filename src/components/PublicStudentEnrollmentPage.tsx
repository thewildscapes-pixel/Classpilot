import React, { useState, useEffect } from 'react';
import { QREnrollmentSession, StudentEnrollment, Student } from '../types';
import { saveStudentEnrollmentToFirestore, saveStudentToFirestore } from '../lib/firebaseService';
import {
  GraduationCap,
  User,
  Phone,
  Mail,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Building2,
  BookOpen,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface PublicStudentEnrollmentPageProps {
  token: string;
  qrSessions: QREnrollmentSession[];
  existingEnrollments?: StudentEnrollment[];
  onUpdateStudents?: (newStudent: Student) => void;
  onBackToApp?: () => void;
}

export const PublicStudentEnrollmentPage: React.FC<PublicStudentEnrollmentPageProps> = ({
  token,
  qrSessions,
  existingEnrollments = [],
  onUpdateStudents,
  onBackToApp,
}) => {
  const [session, setSession] = useState<QREnrollmentSession | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
  const [fullName, setFullName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState<StudentEnrollment | null>(null);

  // Read URL query params as secondary fallback if session is not in central list
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const urlBatch = urlParams?.get('batch') || urlParams?.get('classBatch') || urlParams?.get('class') || '';
  const urlSection = urlParams?.get('section') || 'Section A';
  const urlDept = urlParams?.get('dept') || urlParams?.get('department') || '';
  const urlSemester = urlParams?.get('semester') || '';

  const displayBatch = session?.classBatch || urlBatch || 'FYUGP 1st Sem';
  const displaySection = session?.section || urlSection || 'Section A';
  const displayDept = session?.department || urlDept || '';
  const displaySemester = session?.semester || urlSemester || '';

  // Lookup session by token or session ID
  useEffect(() => {
    setIsLoadingSession(true);
    let found = qrSessions.find((s) => s.token === token || s.id === token);

    if (!found) {
      // Try fetching from server API directly
      fetch('/api/qr-sessions')
        .then((r) => r.json())
        .then((data: QREnrollmentSession[]) => {
          if (Array.isArray(data)) {
            const match = data.find((s) => s.token === token || s.id === token);
            if (match) {
              setSession(match);
            }
          }
        })
        .catch((e) => console.warn('Failed to fetch session from server:', e))
        .finally(() => setIsLoadingSession(false));
    } else {
      setSession(found);
      setIsLoadingSession(false);
    }
  }, [token, qrSessions]);

  const isExpired = session?.expiresAt ? new Date(session.expiresAt).getTime() < Date.now() : false;
  const isDeactivated = session ? !session.isActive : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanName = fullName.trim();
    const cleanRollNo = rollNo.trim().toUpperCase();
    const cleanMobile = mobile.trim().replace(/\D/g, '');
    const cleanEmail = email.trim();

    if (!cleanName || !cleanRollNo || !cleanMobile) {
      setErrorMsg('Please enter your Full Name, Roll / Admission Number, and 10-digit Mobile Number.');
      return;
    }

    if (cleanMobile.length < 10) {
      setErrorMsg('Please enter a valid 10-digit Mobile Number.');
      return;
    }

    if (isDeactivated) {
      setErrorMsg('This QR enrollment link has been deactivated by the institution.');
      return;
    }

    if (isExpired) {
      setErrorMsg('This QR enrollment session has expired. Please contact your class coordinator.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Call public submit API
      const response = await fetch('/api/student-enrollments/public-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          sessionId: session?.id || token,
          name: cleanName,
          rollNo: cleanRollNo,
          mobile: cleanMobile,
          email: cleanEmail,
          classBatch: displayBatch,
          section: displaySection,
          department: displayDept,
          semester: displaySemester,
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || 'Submission failed. Please check your inputs.');
      }

      const newEnrollment: StudentEnrollment = resData.enrollment || {
        id: `enr_${Date.now()}`,
        sessionId: session?.id || token,
        sessionToken: token,
        name: cleanName,
        rollNo: cleanRollNo,
        mobile: cleanMobile,
        email: cleanEmail,
        classBatch: displayBatch,
        section: displaySection,
        department: displayDept,
        semester: displaySemester,
        status: 'approved',
        enrollmentSource: 'qr_self_enrollment',
        submittedAt: new Date().toISOString(),
      };

      // 2. Save self-enrollment record directly to Firestore
      await saveStudentEnrollmentToFirestore(newEnrollment);

      // 3. AUTOMATIC ROSTER SYNCHRONISATION: Insert directly into Master Student Roster
      const studentId = `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newStudent: Student = {
        id: studentId,
        rollNo: cleanRollNo,
        name: cleanName,
        classBatch: displayBatch,
        section: displaySection,
        department: displayDept,
        mobile: cleanMobile,
        email: cleanEmail,
        academicYear: '2025–26',
        sessionId: 'Odd-2025-26',
        enrollmentSource: 'qr_self_enrollment',
        enrolledAt: new Date().toISOString(),
      };

      await saveStudentToFirestore(newStudent);
      if (onUpdateStudents) {
        onUpdateStudents(newStudent);
      }

      setSuccessData(newEnrollment);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting enrollment request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-300 font-medium">Verifying Enrollment Session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans">
      {/* Background Glow Accents */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-md w-full mx-auto my-auto space-y-6 relative z-10">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-xl shadow-lg shadow-blue-600/30">
              CP
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight">ClassPilot</h1>
              <p className="text-[11px] text-slate-400 font-medium">Student Self-Enrollment</p>
            </div>
          </div>

          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Portal</span>
            </button>
          )}
        </div>

        {/* Success Confirmation View */}
        {successData ? (
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-300 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-white tracking-tight">
                Self-Enrollment Submitted!
              </h2>
              <p className="text-xs text-emerald-400 font-bold bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-500/30 inline-block">
                Added to {successData.classBatch} ({successData.section}) Roster
              </p>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-left space-y-1.5">
              <span className="block text-slate-400 font-semibold uppercase text-[10px] tracking-wider mb-2">
                Recorded Student Details
              </span>
              <span className="block text-white font-bold">
                👤 Student Name: <span className="text-blue-300">{successData.name}</span>
              </span>
              <span className="block text-white font-bold">
                🆔 Roll / Admission No: <span className="text-amber-300 font-mono">{successData.rollNo}</span>
              </span>
              <span className="block text-white font-bold">
                📱 Mobile: <span className="text-slate-300">{successData.mobile}</span>
              </span>
              <span className="block text-white font-bold">
                🏫 Class / Section: <span className="text-emerald-300">{successData.classBatch} — {successData.section}</span>
              </span>
            </p>

            <div className="bg-blue-950/40 border border-blue-500/30 p-3.5 rounded-2xl text-left flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-200 leading-normal">
                Your request is pending verification by your class coordinator. Once verified, you will appear in official class attendance checklists.
              </p>
            </div>

            <button
              onClick={() => {
                setSuccessData(null);
                setFullName('');
                setRollNo('');
                setMobile('');
                setEmail('');
              }}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-700"
            >
              Submit Another Enrollment
            </button>
          </div>
        ) : (
          /* Enrollment Form Card */
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Class Session Info Header */}
            <div className="bg-gradient-to-br from-blue-950/80 to-slate-900 border border-blue-500/30 p-4 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-md border border-blue-500/20">
                  Target Class Roster
                </span>
                {session?.section && (
                  <span className="text-xs font-bold text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20">
                    {session.section}
                  </span>
                )}
              </div>

              <h2 className="text-lg font-black text-white tracking-tight">
                {session?.classBatch || 'Class Roster Enrollment'}
              </h2>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                {session?.department && (
                  <span className="flex items-center space-x-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>{session.department}</span>
                  </span>
                )}
                {session?.semester && (
                  <span className="flex items-center space-x-1">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                    <span>{session.semester}</span>
                  </span>
                )}
              </div>

              {session?.expiresAt && (
                <div className="flex items-center space-x-1.5 text-[11px] text-amber-300 pt-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Valid until {new Date(session.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                  </span>
                </div>
              )}
            </div>

            {/* Expired / Deactivated Warning */}
            {isDeactivated ? (
              <div className="p-4 bg-rose-950/80 border border-rose-500/40 rounded-2xl text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
                <h3 className="text-sm font-bold text-rose-200">QR Code Link Deactivated</h3>
                <p className="text-xs text-rose-300/80">
                  This enrollment session has been closed by the class coordinator.
                </p>
              </div>
            ) : isExpired ? (
              <div className="p-4 bg-amber-950/80 border border-amber-500/40 rounded-2xl text-center space-y-2">
                <Clock className="w-8 h-8 text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-amber-200">QR Code Link Expired</h3>
                <p className="text-xs text-amber-300/80">
                  The validity period for this enrollment link has passed. Please request a new QR link from your teacher.
                </p>
              </div>
            ) : (
              /* Student Self-Registration Form */
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMsg && (
                  <div className="p-3.5 bg-rose-950/90 border border-rose-500/50 rounded-xl text-xs text-rose-200 flex items-start space-x-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Field: Full Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Full Student Name <span className="text-rose-400">*</span></span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-slate-950 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-blue-500 transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Field: Roll / Admission Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Roll Number / Admission No. <span className="text-rose-400">*</span></span>
                  </label>
                  <div className="relative">
                    <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. COM-2025-042"
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value)}
                      className="w-full bg-slate-950 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono border border-slate-700 focus:outline-none focus:border-blue-500 transition-all uppercase"
                      required
                    />
                  </div>
                </div>

                {/* Field: Mobile Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>WhatsApp Mobile Number <span className="text-rose-400">*</span></span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      maxLength={10}
                      className="w-full bg-slate-950 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono border border-slate-700 focus:outline-none focus:border-blue-500 transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Field: Email Address (Optional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Email Address <span className="text-slate-500 font-normal">(Optional)</span></span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      placeholder="student@college.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-950 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50 mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Submitting Registration...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Self-Enrollment</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500">
          Powered by ClassPilot Academic System &bull; Secure Institution Roster
        </p>
      </div>
    </div>
  );
};
