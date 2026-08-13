import React, { useState } from 'react';
import { DayOfWeek } from '../types';
import { DAYS_OF_WEEK } from '../utils/timeUtils';
import { FastForward, RotateCcw, Clock, Play, Pause, Zap, Calendar, Sparkles } from 'lucide-react';

interface DemoTimeBarProps {
  currentDate: Date;
  selectedDay: DayOfWeek;
  onSelectDay: (day: DayOfWeek) => void;
  isSimulated: boolean;
  onAdvanceMinutes: (mins: number) => void;
  onSetCustomTime: (timeStr: string) => void;
  onResetToRealTime: (day?: DayOfWeek) => void;
  onJumpToNextClass10Mins: () => void;
  onOpenSleepAlarmModal?: () => void;
}

export const DemoTimeBar: React.FC<DemoTimeBarProps> = ({
  currentDate,
  selectedDay,
  onSelectDay,
  isSimulated,
  onAdvanceMinutes,
  onSetCustomTime,
  onResetToRealTime,
  onJumpToNextClass10Mins,
  onOpenSleepAlarmModal,
}) => {
  const timeFormatted = currentDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const hoursStr = currentDate.getHours().toString().padStart(2, '0');
  const minsStr = currentDate.getMinutes().toString().padStart(2, '0');
  const timeInputValue = `${hoursStr}:${minsStr}`;

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border-b border-indigo-500/20 py-3 px-4 sm:px-6 shadow-inner">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* Left: Time status & Day selector */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center space-x-2 bg-indigo-950/80 px-3 py-1.5 rounded-xl border border-indigo-500/30">
            <Clock className={`w-4 h-4 ${isSimulated ? 'text-amber-400 animate-spin' : 'text-blue-400'}`} />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-300">
                {isSimulated ? 'Simulated Time' : 'Real System Time'}
              </span>
              <span className="text-sm font-mono font-bold text-white leading-none">
                {timeFormatted}
              </span>
            </div>
            {isSimulated && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                Fast-Forwarding
              </span>
            )}
          </div>

          {/* Day of week pill selector */}
          <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1" />
            <select
              value={selectedDay}
              onChange={(e) => onSelectDay(e.target.value as DayOfWeek)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none pr-2 cursor-pointer"
            >
              {DAYS_OF_WEEK.map((day) => (
                <option key={day} value={day} className="bg-slate-900 text-white">
                  {day}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Custom Time Picker */}
          <div className="flex items-center space-x-1 bg-slate-800/80 px-2 py-1 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-medium">Set Time:</span>
            <input
              type="time"
              value={timeInputValue}
              onChange={(e) => onSetCustomTime(e.target.value)}
              className="bg-slate-900 text-white text-xs font-mono font-bold px-1.5 py-0.5 rounded border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Right: Fast Forward Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
          <span className="text-xs text-indigo-200/80 font-medium hidden sm:inline flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> Demo Controls:
          </span>

          {/* Fast jump to 10 min trigger */}
          <button
            onClick={onJumpToNextClass10Mins}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            title="Fast forward directly to 10 minutes before next scheduled class to see the alert fire!"
          >
            <Zap className="w-3.5 h-3.5 fill-slate-950" />
            <span>Test 10-Min Alert</span>
          </button>

          {/* Sleep Mode Alarm Configuration Modal Launcher */}
          {onOpenSleepAlarmModal && (
            <button
              onClick={onOpenSleepAlarmModal}
              className="px-3 py-1.5 rounded-xl bg-indigo-900/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 font-bold text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
              title="Configure phone alarms that ring even when mobile is in sleep mode"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>⏰ Mobile Sleep Alarms</span>
            </button>
          )}

          {/* Fast forward step buttons */}
          <div className="flex items-center space-x-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
            <button
              onClick={() => onAdvanceMinutes(10)}
              className="px-2 py-1 hover:bg-slate-700 rounded text-xs font-bold text-slate-200 hover:text-white transition-all"
              title="Add 10 minutes"
            >
              +10m
            </button>
            <button
              onClick={() => onAdvanceMinutes(30)}
              className="px-2 py-1 hover:bg-slate-700 rounded text-xs font-bold text-slate-200 hover:text-white transition-all"
              title="Add 30 minutes"
            >
              +30m
            </button>
            <button
              onClick={() => onAdvanceMinutes(60)}
              className="px-2 py-1 hover:bg-slate-700 rounded text-xs font-bold text-slate-200 hover:text-white transition-all"
              title="Add 1 hour"
            >
              +1h
            </button>
          </div>

          {/* Reset button */}
          {isSimulated && (
            <button
              onClick={() => onResetToRealTime()}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 flex items-center space-x-1 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Real Time</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
