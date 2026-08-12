import React, { useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QREnrollmentSession } from '../types';
import { saveQREnrollmentSessionToFirestore } from '../lib/firebaseService';
import {
  QrCode,
  Download,
  Share2,
  Copy,
  Check,
  Clock,
  Power,
  X,
  Sparkles,
  Building2,
  Users,
  BookOpen,
  Calendar,
} from 'lucide-react';

interface QREnrollmentGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
  defaultClassBatch?: string;
  defaultSection?: string;
  defaultDepartment?: string;
  defaultSemester?: string;
  existingSessions?: QREnrollmentSession[];
  onSessionCreated?: (session: QREnrollmentSession) => void;
}

export const QREnrollmentGeneratorModal: React.FC<QREnrollmentGeneratorModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  defaultClassBatch = 'FYUGP 1st Sem Commerce',
  defaultSection = 'Section A',
  defaultDepartment = 'Commerce',
  defaultSemester = '1st Semester',
  existingSessions = [],
  onSessionCreated,
}) => {
  const [classBatch, setClassBatch] = useState(defaultClassBatch);
  const [section, setSection] = useState(defaultSection);
  const [department, setDepartment] = useState(defaultDepartment);
  const [semester, setSemester] = useState(defaultSemester);
  const [expiryOption, setExpiryOption] = useState<'24h' | '48h' | '7d' | 'never' | 'custom'>('24h');
  const [customExpiryDate, setCustomExpiryDate] = useState('');
  const [notes, setNotes] = useState('');

  const [activeSession, setActiveSession] = useState<QREnrollmentSession | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const qrCanvasRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const calculateExpiryTimestamp = (): string | null => {
    const now = new Date();
    if (expiryOption === '24h') {
      now.setHours(now.getHours() + 24);
      return now.toISOString();
    }
    if (expiryOption === '48h') {
      now.setHours(now.getHours() + 48);
      return now.toISOString();
    }
    if (expiryOption === '7d') {
      now.setDate(now.getDate() + 7);
      return now.toISOString();
    }
    if (expiryOption === 'custom' && customExpiryDate) {
      return new Date(customExpiryDate).toISOString();
    }
    return null; // never
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);

    const sessionId = `qr_sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const baseUrl = window.location.origin;
    const enrollmentUrl = `${baseUrl}/?enrollToken=${token}`;
    const expiresAt = calculateExpiryTimestamp();

    const newSession: QREnrollmentSession = {
      id: sessionId,
      token,
      title: `${classBatch} - ${section} Enrollment`,
      classBatch,
      section,
      department,
      semester,
      createdBy: currentUser?.name || currentUser?.email || 'Class Coordinator',
      createdAt: new Date().toISOString(),
      expiresAt,
      isActive: true,
      enrollmentUrl,
      notes,
    };

    try {
      // Save to server SQLite DB
      await fetch('/api/qr-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSession),
      });

      // Save to Firestore central DB for real-time synchronization
      await saveQREnrollmentSessionToFirestore(newSession);

      setActiveSession(newSession);
      if (onSessionCreated) onSessionCreated(newSession);
    } catch (err) {
      console.error('Error creating QR Enrollment session:', err);
      // Still set active locally as fallback
      setActiveSession(newSession);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadQR = () => {
    if (!qrCanvasRef.current) return;
    const canvas = qrCanvasRef.current.querySelector('canvas');
    if (!canvas) return;

    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = `Student_Enrollment_QR_${classBatch.replace(/\s+/g, '_')}_${section.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = () => {
    if (!activeSession) return;
    navigator.clipboard.writeText(activeSession.enrollmentUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareWhatsApp = () => {
    if (!activeSession) return;
    const msg = `📱 *Student Self-Enrollment QR Link*\n\nClass: *${activeSession.classBatch}*\nSection: *${activeSession.section}*\nDepartment: ${activeSession.department}\n\nStudents, please click or scan this official link to complete your class self-enrollment:\n${activeSession.enrollmentUrl}\n\n_ClassPilot Academic System_`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  const handleToggleDeactivate = async () => {
    if (!activeSession) return;
    const updatedStatus = !activeSession.isActive;

    try {
      await fetch(`/api/qr-sessions/${activeSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: updatedStatus }),
      });

      const updated = { ...activeSession, isActive: updatedStatus };
      await saveQREnrollmentSessionToFirestore(updated);
      setActiveSession(updated);
    } catch (err) {
      console.error('Error toggling session status:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-tight">
              Class Enrollment QR Generator
            </h2>
            <p className="text-xs text-slate-400">
              Generate shareable WhatsApp QR code & link for student self-registration
            </p>
          </div>
        </div>

        {/* Form OR QR Preview View */}
        {!activeSession ? (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Class / Batch */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Class / Batch <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={classBatch}
                  onChange={(e) => setClassBatch(e.target.value)}
                  placeholder="e.g. FYUGP 1st Sem Commerce"
                  className="w-full bg-slate-950 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Section */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Section <span className="text-rose-400">*</span>
                </label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full bg-slate-950 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="Section A">Section A</option>
                  <option value="Section B">Section B</option>
                  <option value="Section C">Section C</option>
                  <option value="Section D">Section D</option>
                  <option value="All Sections">All Sections</option>
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Commerce"
                  className="w-full bg-slate-950 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Semester */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Semester / Year
                </label>
                <input
                  type="text"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  placeholder="e.g. 1st Semester"
                  className="w-full bg-slate-950 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Expiry Controls */}
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                QR Code Validity Period
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: '24h', label: '24 Hours' },
                  { id: '48h', label: '48 Hours' },
                  { id: '7d', label: '7 Days' },
                  { id: 'never', label: 'No Expiry' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExpiryOption(opt.id as any)}
                    className={`py-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                      expiryOption === opt.id
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes / Instructions */}
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Optional Notes for WhatsApp
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Deadline to register is Friday 5 PM"
                className="w-full bg-slate-950 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Submit / Generate Button */}
            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate Enrollment QR Code & Link</span>
            </button>
          </form>
        ) : (
          /* QR Code Generated View */
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 shadow-inner">
              {/* Canvas QR Code */}
              <div ref={qrCanvasRef} className="p-4 bg-white rounded-2xl shadow-xl border border-slate-200">
                <QRCodeCanvas
                  value={activeSession.enrollmentUrl}
                  size={190}
                  level="H"
                  includeMargin={true}
                />
              </div>

              {/* Status Badge */}
              <div className="flex items-center space-x-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center space-x-1 border ${
                    activeSession.isActive
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${activeSession.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  <span>{activeSession.isActive ? 'Active QR Link' : 'Deactivated'}</span>
                </span>

                {activeSession.expiresAt && (
                  <span className="text-[10px] text-slate-400 font-medium">
                    Expires: {new Date(activeSession.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-300">
                <span className="font-extrabold text-white">{activeSession.classBatch}</span> — {activeSession.section}
              </div>
            </div>

            {/* Sharing Action Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={handleShareWhatsApp}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share WhatsApp</span>
              </button>

              <button
                onClick={handleDownloadQR}
                className="py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 border border-slate-700 transition-all cursor-pointer"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>

            {/* Session Controls */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <button
                onClick={handleToggleDeactivate}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                  activeSession.isActive
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-500/30 hover:bg-rose-900'
                    : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{activeSession.isActive ? 'Deactivate QR' : 'Re-activate QR'}</span>
              </button>

              <button
                onClick={() => setActiveSession(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Create Another QR Code
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
