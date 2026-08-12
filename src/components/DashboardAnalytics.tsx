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
  // Compute unique teachers assigned in routine
  const uniqueTeachers = new Set(
    timetable
      .map((t) => t.facultyName?.trim().toLowerCase())
      .filter((name) => name && name !== 'unassigned' && name !== 'faculty member')
  ).size;

  // Compute unique rooms
  const uniqueRooms = new Set(
    timetable.map((t) => t.room?.trim().toLowerCase()).filter(Boolean)
  ).size;

  // Compute unique departments
  const uniqueDepts = new Set(
    timetable.map((t) => t.department?.trim()).filter(Boolean)
  ).size;

  return (
    <div className="space-y-6">
      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Scheduled Classes */}
        <div
          onClick={() => onNavigateTab('schedule')}
          className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Lectures Scheduled</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-white mt-2 group-hover:text-blue-300 transition-colors">
            {timetable.length} Classes
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
            <span>Master routine active</span>
          </p>
        </div>

        {/* Card 2: Assigned Teachers (Unique count) */}
        <div
          onClick={() => onNavigateTab('schedule')}
          className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Assigned Teachers</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-white mt-2 group-hover:text-indigo-300 transition-colors">
            {uniqueTeachers} {uniqueTeachers === 1 ? 'Teacher' : 'Teachers'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Unique faculty in routine</p>
        </div>

        {/* Card 3: Allotted Rooms */}
        <div
          onClick={() => onNavigateTab('rooms')}
          className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Classrooms & Labs</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-400 mt-2">
            {uniqueRooms} {uniqueRooms === 1 ? 'Venue' : 'Venues'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Active lecture rooms</p>
        </div>

        {/* Card 4: Academic Departments */}
        <div
          onClick={() => onNavigateTab('schedule')}
          className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Departments</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-400 mt-2">
            {uniqueDepts} {uniqueDepts === 1 ? 'Dept' : 'Depts'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Across all programs</p>
        </div>
      </div>
    </div>
  );
};
