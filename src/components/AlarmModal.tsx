import React, { useState, useEffect } from 'react';
import { ActiveAlarm } from '../types';
import { stopSchoolBellSound, playSchoolBellSound } from '../utils/audioUtils';
import { Bell, BellOff, Clock, MapPin, BookOpen, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface AlarmModalProps {
  alarm: ActiveAlarm | null;
  onStop: () => void;
  onSnooze: (minutes: number) => void;
}

export const AlarmModal: React.FC<AlarmModalProps> = ({ alarm, onStop, onSnooze }) => {
  const [snoozeMins, setSnoozeMins] = useState<number>(5);

  useEffect(() => {
    if (alarm) {
      // Ring the school bell sound repeatedly for 8 seconds when active
      playSchoolBellSound(8);
    } else {
      stopSchoolBellSound();
    }
    return () => {
      stopSchoolBellSound();
    };
  }, [alarm]);

  if (!alarm) return null;

  const handleStopClick = () => {
    stopSchoolBellSound();
    onStop();
  };

  const handleSnoozeClick = () => {
    stopSchoolBellSound();
    onSnooze(snoozeMins);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/80 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 text-white relative animate-bounce-subtle ring-4 ring-amber-500/20">
        
        {/* Animated Bell Icon Header */}
        <div className="flex flex-col items-center justify-center text-center space-y-2 pt-2">
          <div className="relative">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 animate-pulse shadow-lg shadow-amber-500/20">
              <Bell className="w-8 h-8 animate-wiggle" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-mono tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-full font-bold">
              ClassPilot Class Alert
            </span>
            <h3 className="font-heading font-black text-2xl text-white tracking-tight">
              {alarm.title || 'Class Period Alarm'}
            </h3>
            <p className="text-xs text-slate-300 font-medium">
              {alarm.message || 'Your scheduled class lecture is about to begin!'}
            </p>
          </div>
        </div>

        {/* Class Details Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-inner">
          <div className="flex items-center space-x-3 text-slate-200">
            <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Subject / Paper</span>
              <span className="font-extrabold text-white text-sm">{alarm.subjectName}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Room</span>
                <span className="font-bold text-xs text-emerald-300">{alarm.room}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Start Time</span>
                <span className="font-bold text-xs text-blue-300">{alarm.startTime}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* STOP BUTTON */}
            <button
              onClick={handleStopClick}
              className="py-3 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center space-x-2 border border-red-400/40"
            >
              <BellOff className="w-4 h-4" />
              <span>Stop Bell</span>
            </button>

            {/* SNOOZE BUTTON */}
            <button
              onClick={handleSnoozeClick}
              className="py-3 px-4 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-amber-600/30 transition-all flex items-center justify-center space-x-2 border border-amber-400/40"
            >
              <Clock className="w-4 h-4" />
              <span>Snooze ({snoozeMins}m)</span>
            </button>
          </div>

          {/* Snooze Interval Picker */}
          <div className="flex items-center justify-center space-x-2 text-xs text-slate-400 pt-1">
            <span>Snooze Duration:</span>
            <select
              value={snoozeMins}
              onChange={(e) => setSnoozeMins(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-amber-300 text-xs font-bold rounded-xl px-2 py-1 focus:outline-none"
            >
              <option value={2}>2 minutes</option>
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
