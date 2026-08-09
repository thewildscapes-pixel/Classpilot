import React from 'react';
import { User, TimetableEntry } from '../types';
import {
  BarChart3,
  BookOpen,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Award,
  Sparkles,
  ArrowRight,
  Sun,
  Moon,
  Volume2,
} from 'lucide-react';

interface DashboardAnalyticsProps {
  currentUser: User;
  timetable: TimetableEntry[];
  onNavigateTab: (tab: 'schedule' | 'diary' | 'calendar' | 'compliance') => void;
}

export const DashboardAnalytics: React.FC<DashboardAnalyticsProps> = ({
  currentUser,
  timetable,
  onNavigateTab,
}) => {
  return (
    <div className="space-y-6">
      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Classes Taken This Week */}
        <div
          onClick={() => onNavigateTab('schedule')}
          className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Classes Scheduled</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-white mt-2 group-hover:text-blue-300 transition-colors">
            18 Hours
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
            <span>5 lectures today</span>
          </p>
        </div>

        {/* Card 2: Pending Class Diary Lock Alert */}
        <div
          onClick={() => onNavigateTab('diary')}
          className="bg-slate-900 border border-amber-500/30 hover:border-amber-500 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-300">Pending Diary Log</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-400 mt-2">
            1 Pending
          </div>
          <p className="text-xs text-amber-300/80 mt-1 flex items-center space-x-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 inline" />
            <span>18h remaining to edit!</span>
          </p>
        </div>

        {/* Card 3: Google Calendar Events */}
        <div
          onClick={() => onNavigateTab('calendar')}
          className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Upcoming Meetings</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-white mt-2 group-hover:text-indigo-300 transition-colors">
            3 Synced
          </div>
          <p className="text-xs text-slate-400 mt-1">Google Calendar connected</p>
        </div>

        {/* Card 4: Research Portfolio */}
        <div
          onClick={() => onNavigateTab('compliance')}
          className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">NAAC Audit Score</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-400 mt-2">
            92% Ready
          </div>
          <p className="text-xs text-slate-400 mt-1">Syllabus & Diary verified</p>
        </div>
      </div>
    </div>
  );
};
