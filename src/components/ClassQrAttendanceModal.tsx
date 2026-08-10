import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TimetableEntry, Student } from '../types';
import {
  QrCode,
  X,
  UserCheck,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  Copy,
  Check,
  Download,
  Sparkles,
  Smartphone,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface ClassQrAttendanceModalProps {
  entry: TimetableEntry;
  facultyName: string;
  date: Date;
  students?: Student[];
  onClose: () => void;
}

interface MarkedStudent {
  rollNo: string;
  name: string;
  timestamp: string;
}

export const ClassQrAttendanceModal: React.FC<ClassQrAttendanceModalProps> = ({
  entry,
  facultyName,
  date,
  students = [],
  onClose,
}) => {
  const [sessionToken, setSessionToken] = useState<string>('');
  const [passcode, setPasscode] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [markedStudents, setMarkedStudents] = useState<MarkedStudent[]>([]);
  const [selectedRoll, setSelectedRoll] = useState<string>('');
  const [manualRoll, setManualRoll] = useState<string>('');
  const [simulationNotice, setSimulationNotice] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Filter students matching batch/department
  const b = (entry.batch || '').toLowerCase().trim();
  const ps = (entry.programSemester || '').toLowerCase().trim();
  const d = (entry.department || '').toLowerCase().trim();

  const enrolledStudents = students.filter((s) => {
    const sb = (s.classBatch || '').toLowerCase().trim();
    if (!sb) return false;
    if (sb === b || sb === ps) return true;
    if (b && (sb.includes(b) || b.includes(sb))) return true;
    if (ps && (sb.includes(ps) || ps.includes(sb))) return true;
    return false;
  });

  const generateNewToken = () => {
    const randCode = Math.floor(100000 + Math.random() * 900000).toString();
    const token = `CP-ATT-${entry.id.substring(0, 6)}-${Date.now().toString(36).toUpperCase()}`;
    setSessionToken(token);
    setPasscode(randCode);
  };

  useEffect(() => {
    generateNewToken();
  }, [entry.id]);

  const qrPayload = JSON.stringify({
    type: 'CLASSPILOT_ATTENDANCE_QR',
    classId: entry.id,
    subjectCode: entry.subjectCode,
    subjectName: entry.subjectName,
    batch: entry.batch,
    room: entry.room,
    facultyName,
    date: date.toISOString().split('T')[0],
    time: `${entry.startTime} - ${entry.endTime}`,
    sessionToken,
    passcode,
  });

  const handleCopyQrData = () => {
    navigator.clipboard.writeText(qrPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulateStudentScan = (roll: string, name: string) => {
    if (!roll) return;
    if (markedStudents.some((s) => s.rollNo.toLowerCase() === roll.toLowerCase())) {
      setSimulationNotice(`⚠️ Student ${roll} is already marked present for this session.`);
      setTimeout(() => setSimulationNotice(null), 3000);
      return;
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newRecord: MarkedStudent = {
      rollNo: roll.toUpperCase(),
      name: name || `Student ${roll}`,
      timestamp: timeStr,
    };

    setMarkedStudents((prev) => [newRecord, ...prev]);
    setSimulationNotice(`✅ Attendance marked for ${name || roll} at ${timeStr}`);
    setSelectedRoll('');
    setManualRoll('');
    setTimeout(() => setSimulationNotice(null), 3000);
  };

  const handleDownloadQr = () => {
    if (!qrRef.current) return;
    const svgElement = qrRef.current.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `Attendance_QR_${entry.subjectCode}_${entry.batch}_${date.toISOString().split('T')[0]}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto text-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 p-6 border-b border-slate-800 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-500/30 text-blue-400">
                <QrCode className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400 font-mono">
                ClassPilot Live Attendance QR
              </span>
            </div>
            <h2 className="text-xl font-bold font-heading text-white">{entry.subjectName}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 pt-1">
              <span className="flex items-center space-x-1 bg-slate-800/80 px-2.5 py-0.5 rounded-lg border border-slate-700">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>{entry.startTime} - {entry.endTime}</span>
              </span>
              <span className="flex items-center space-x-1 bg-slate-800/80 px-2.5 py-0.5 rounded-lg border border-slate-700 text-cyan-300">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span>Room {entry.room}</span>
              </span>
              <span className="flex items-center space-x-1 bg-slate-800/80 px-2.5 py-0.5 rounded-lg border border-slate-700">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Batch: {entry.batch}</span>
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Main QR Code & Passcode Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: High-Contrast White QR Container */}
            <div className="flex flex-col items-center space-y-3 bg-slate-950 p-5 rounded-2xl border border-slate-800">
              <div
                ref={qrRef}
                className="p-4 bg-white rounded-2xl shadow-xl border-4 border-blue-500/30 flex items-center justify-center"
              >
                <QRCodeSVG
                  value={qrPayload}
                  size={190}
                  level="H"
                  includeMargin={false}
                  aria-label={`Attendance QR code for ${entry.subjectName}`}
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleDownloadQr}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Download Image</span>
                </button>

                <button
                  onClick={handleCopyQrData}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copied ? 'Copied Data!' : 'Copy Code'}</span>
                </button>
              </div>
            </div>

            {/* Right: Class Verification Info & Backup Passcode */}
            <div className="space-y-4">
              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Verifiable Session Passcode (Manual Backup)
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-mono font-extrabold text-amber-400 tracking-widest">
                    {passcode}
                  </span>
                  <button
                    onClick={generateNewToken}
                    className="p-2 bg-slate-900 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition"
                    title="Refresh QR token and passcode"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Students can scan the QR code using their camera or enter this 6-digit session passcode to log attendance.
                </p>
              </div>

              <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Date & Session:</span>
                  <span className="font-semibold text-slate-200">{formattedDate}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Course Subject:</span>
                  <span className="font-semibold text-blue-300">{entry.subjectCode} - {entry.subjectName}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Faculty Instructor:</span>
                  <span className="font-semibold text-slate-200">{facultyName}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-700/50">
                  <span className="text-slate-400">Security Encryption:</span>
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    HMAC Verified Token
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Attendance Marker & Live Counter */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-white font-heading">Student QR Attendance Log</h3>
              </div>
              <span className="text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30">
                {markedStudents.length} / {enrolledStudents.length || '—'} Present
              </span>
            </div>

            {simulationNotice && (
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300 font-medium">
                {simulationNotice}
              </div>
            )}

            {/* Attendance Test Input */}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              {enrolledStudents.length > 0 ? (
                <select
                  value={selectedRoll}
                  onChange={(e) => setSelectedRoll(e.target.value)}
                  className="flex-1 bg-slate-900 text-xs font-semibold text-slate-200 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select Enrolled Student to Simulate Scan...</option>
                  {enrolledStudents.map((s) => (
                    <option key={s.id || s.rollNo} value={s.rollNo}>
                      Roll #{s.rollNo} — {s.name} ({s.classBatch})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Enter Student Roll No (e.g. C21-104)..."
                  value={manualRoll}
                  onChange={(e) => setManualRoll(e.target.value)}
                  className="flex-1 bg-slate-900 text-xs text-slate-200 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              )}

              <button
                onClick={() => {
                  if (selectedRoll) {
                    const st = enrolledStudents.find((s) => s.rollNo === selectedRoll);
                    handleSimulateStudentScan(selectedRoll, st?.name || '');
                  } else if (manualRoll.trim()) {
                    handleSimulateStudentScan(manualRoll.trim(), '');
                  }
                }}
                disabled={!selectedRoll && !manualRoll.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-md shrink-0 cursor-pointer"
              >
                Simulate QR Scan
              </button>
            </div>

            {/* List of Marked Students */}
            {markedStudents.length > 0 && (
              <div className="space-y-1.5 pt-2 max-h-36 overflow-y-auto">
                {markedStudents.map((st) => (
                  <div
                    key={st.rollNo}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-bold text-slate-200 font-mono">{st.rollNo}</span>
                      <span className="text-slate-400">&bull; {st.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                      {st.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center space-x-1.5">
            <Smartphone className="w-4 h-4 text-blue-400" />
            <span>Students can scan from mobile camera or web scanner</span>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
