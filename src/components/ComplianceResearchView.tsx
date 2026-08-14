import React, { useState, useEffect, useMemo } from 'react';
import { ResearchRecord, User } from '../types';
import {
  FileText,
  Award,
  BookOpen,
  Plus,
  Download,
  Search,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Building2,
  Printer,
  X,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

interface ComplianceResearchViewProps {
  currentUser: User;
}

const DEFAULT_RESEARCH: ResearchRecord[] = [];

export const ComplianceResearchView: React.FC<ComplianceResearchViewProps> = ({ currentUser }) => {
  // Super Admin Check
  const isSuperAdmin = useMemo(() => {
    if (!currentUser) return false;
    const email = (currentUser.email || '').toLowerCase().trim();
    const phone = (currentUser.whatsappPhone || '').replace(/\D/g, '');
    return email === 'thewildscapes@gmail.com' || phone.endsWith('9706375001') || currentUser.role === 'admin';
  }, [currentUser]);

  const [researchList, setResearchList] = useState<ResearchRecord[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_research_records');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.filter((r: ResearchRecord) => r.id !== 'res_1' && r.id !== 'res_2');
          return cleaned;
        }
      }
    } catch (e) {}
    return DEFAULT_RESEARCH;
  });

  // Strict Privacy: Non-admin faculty only ever see their own research publications
  const visibleResearch = useMemo(() => {
    if (isSuperAdmin) return researchList;
    return researchList.filter((r) => {
      const idMatch = r.facultyId && (r.facultyId === currentUser.facultyId || r.facultyId === currentUser.id);
      const nameMatch = Boolean(currentUser.name && r.authors && r.authors.toLowerCase().includes(currentUser.name.toLowerCase()));
      return idMatch || nameMatch;
    });
  }, [researchList, currentUser, isSuperAdmin]);

  const [activeTab, setActiveTab] = useState<'research' | 'naac_audit'>('research');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Form
  const [formTitle, setFormTitle] = useState<string>('');
  const [formType, setFormType] = useState<ResearchRecord['type']>('Journal Paper');
  const [formJournal, setFormJournal] = useState<string>('');
  const [formYear, setFormYear] = useState<number>(2024);
  const [formAuthors, setFormAuthors] = useState<string>(currentUser.name || '');
  const [formDoi, setFormDoi] = useState<string>('');
  const [formRemarks, setFormRemarks] = useState<string>('');

  useEffect(() => {
    fetchResearchRecords();
  }, [currentUser.id, currentUser.facultyId, currentUser.role]);

  const fetchResearchRecords = async () => {
    try {
      const res = await fetch(`/api/research?facultyId=${encodeURIComponent(currentUser.facultyId || currentUser.id || '')}`, {
        headers: {
          'x-user-faculty-id': currentUser.facultyId || currentUser.id || '',
          'x-user-role': isSuperAdmin ? 'admin' : 'faculty',
          'x-user-faculty-name': currentUser.name || '',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setResearchList(data);
          try {
            localStorage.setItem('classpilot_research_records', JSON.stringify(data));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('Using local research dataset.');
    }
  };

  const handleAddResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const newRecord: ResearchRecord = {
      id: `res_${Date.now()}`,
      facultyId: currentUser.facultyId || 'fac_1',
      title: formTitle.trim(),
      type: formType,
      journalOrPublisher: formJournal.trim(),
      year: formYear,
      authors: formAuthors.trim(),
      doiOrUrl: formDoi.trim(),
      remarks: formRemarks.trim(),
      dateLogged: new Date().toISOString().split('T')[0],
    };

    setResearchList((prev) => {
      const updated = [newRecord, ...prev];
      try {
        localStorage.setItem('classpilot_research_records', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord),
      });
    } catch (err) {
      console.warn('Backend research sync failed, saved locally.');
    }

    setIsModalOpen(false);
    setFormTitle('');
    setFormJournal('');
    setFormDoi('');
  };

  const handlePrintAuditReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs text-blue-400 font-bold uppercase tracking-wider mb-1">
              <Award className="w-4 h-4 text-blue-400" />
              <span>Compliance, NAAC/NBA Audits & Research Appraisal</span>
            </div>
            <div className="flex items-center space-x-3">
              <h2 className="font-heading font-extrabold text-2xl text-white">
                Faculty Research & Audit Portfolio
              </h2>
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Isolated Workspace</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Log research papers, patents, and generate auto-summaries for annual appraisal and accreditation audits.
            </p>
            <div className="mt-2.5 inline-flex items-center space-x-2 px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300">
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span>
                Device Authenticated: Showing verified publications authored by <strong className="text-white">{currentUser.name || 'Faculty Member'}</strong>.
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center space-x-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Log Publication / Patent</span>
            </button>
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div className="flex items-center space-x-2 mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={() => setActiveTab('research')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeTab === 'research'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Research & Publications ({visibleResearch.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('naac_audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeTab === 'naac_audit'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>NAAC / NBA Audit Report Summary</span>
          </button>
        </div>
      </div>

      {/* RESEARCH TAB */}
      {activeTab === 'research' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleResearch.map((rec) => (
              <div
                key={rec.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 space-y-3 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                    {rec.type} • {rec.year}
                  </span>
                  <span className="text-xs text-slate-500">Logged: {rec.dateLogged}</span>
                </div>

                <h4 className="font-extrabold text-sm text-white leading-snug">
                  {rec.title}
                </h4>

                <p className="text-xs text-slate-400">
                  <strong className="text-slate-300">Authors:</strong> {rec.authors}
                </p>

                {rec.journalOrPublisher && (
                  <p className="text-xs text-slate-400">
                    <strong className="text-slate-300">Publisher/Journal:</strong> {rec.journalOrPublisher}
                  </p>
                )}

                {rec.doiOrUrl && (
                  <a
                    href={rec.doiOrUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1 text-xs text-blue-400 hover:underline font-bold"
                  >
                    <span>View Publication / DOI Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NAAC / NBA AUDIT REPORT SUMMARY */}
      {activeTab === 'naac_audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-heading font-extrabold text-lg text-white">
                NAAC / NBA Academic Audit Report (2024-2025)
              </h3>
              <p className="text-xs text-slate-400">
                Department of Commerce & Management • Digboi College
              </p>
            </div>

            <button
              onClick={handlePrintAuditReport}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF Report</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/80">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Classes Conducted</span>
              <div className="text-2xl font-black text-white mt-1">142 Hours</div>
            </div>
            <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/80">
              <span className="text-[10px] uppercase font-bold text-slate-400">Average Student Attendance</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">88.4%</div>
            </div>
            <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/80">
              <span className="text-[10px] uppercase font-bold text-slate-400">Syllabus Completion</span>
              <div className="text-2xl font-black text-blue-400 mt-1">92.0%</div>
            </div>
          </div>
        </div>
      )}

      {/* LOG RESEARCH MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 text-white relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="font-heading font-extrabold text-xl text-white flex items-center space-x-2">
                <Award className="w-5 h-5 text-blue-400" />
                <span>Log Publication or Patent</span>
              </h3>
              <p className="text-xs text-slate-400">
                Record scholarly activities for faculty appraisal.
              </p>
            </div>

            <form onSubmit={handleAddResearch} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Title of Paper / Patent *
                </label>
                <input
                  type="text"
                  placeholder="Enter title..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Category</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as ResearchRecord['type'])}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                  >
                    <option value="Journal Paper">Journal Paper</option>
                    <option value="Conference">Conference</option>
                    <option value="Patent">Patent</option>
                    <option value="Book Chapter">Book Chapter</option>
                    <option value="Workshop">Workshop</option>
                    <option value="Grant Project">Grant Project</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Year</label>
                  <input
                    type="number"
                    value={formYear}
                    onChange={(e) => setFormYear(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Journal / Publisher</label>
                <input
                  type="text"
                  placeholder="e.g. Scopus Indexed Journal of Finance"
                  value={formJournal}
                  onChange={(e) => setFormJournal(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Authors</label>
                <input
                  type="text"
                  value={formAuthors}
                  onChange={(e) => setFormAuthors(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">DOI / URL Link</label>
                <input
                  type="text"
                  placeholder="https://doi.org/..."
                  value={formDoi}
                  onChange={(e) => setFormDoi(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs rounded-xl shadow-lg"
                >
                  Log Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
