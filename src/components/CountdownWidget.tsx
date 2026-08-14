import React, { useState, useEffect } from 'react';
import { TimetableEntry, DayOfWeek } from '../types';
import { getNextClassForFaculty, getSecondsUntilStart, formatMinutesTo12H, parseTimeToMinutes } from '../utils/timeUtils';
import { Clock, MapPin, Users, BookOpen, AlertCircle, CheckCircle2, ArrowRight, Play, Sparkles } from 'lucide-react';

interface CountdownWidgetProps {
  entries: TimetableEntry[];
  facultyId: string;
  facultyName: string;
  currentDate: Date;
  selectedDay: DayOfWeek;
  onTestTriggerAlert: (entry: TimetableEntry) => void;
}

export const CountdownWidget: React.FC<CountdownWidgetProps> = ({
  entries,
  facultyId,
  facultyName,
  currentDate,
  selectedDay,
  onTestTriggerAlert,
}) => {
  const { nextEntry, ongoingEntry } = getNextClassForFaculty(
    entries,
    facultyId,
    currentDate,
    selectedDay,
    facultyName
  );

  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (nextEntry) {
      const sec = getSecondsUntilStart(nextEntry, currentDate);
      setSecondsLeft(sec > 0 ? sec : 0);
    } else {
      setSecondsLeft(0);
    }
  }, [nextEntry, currentDate]);

  const minsLeft = Math.floor(secondsLeft / 60);
  const secsLeft = secondsLeft % 60;

  const isWithin10Mins = secondsLeft > 0 && secondsLeft <= 600;

  return (
    <div className="bg-gradient-to-br from-slate-800 via-slate-800/95 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl text-white relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
      {isWithin10Mins && (
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-amber-500/15 rounded-full blur-2xl pointer-events-none animate-pulse" />
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        {/* Left: Ongoing or Next Class info */}
        <div className="space-y-3 flex-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Faculty Focus • {facultyName}
            </span>
            <span className="text-xs text-slate-500">• {selectedDay}</span>
          </div>

          {ongoingEntry ? (
            <div className="space-y-2">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Class Currently In Session</span>
              </div>
              <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                {ongoingEntry.subjectName}{' '}
                <span className="text-slate-400 text-lg">({ongoingEntry.subjectCode})</span>
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-300">
                <span className="flex items-center space-x-1.5 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-700/60 text-blue-300">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  <span>Room: {ongoingEntry.room}</span>
                </span>
                <span className="flex items-center space-x-1.5 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-700/60">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Batch: {ongoingEntry.batch}</span>
                </span>
                <span className="flex items-center space-x-1.5 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-700/60">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {formatMinutesTo12H(parseTimeToMinutes(ongoingEntry.startTime))} -{' '}
                    {formatMinutesTo12H(parseTimeToMinutes(ongoingEntry.endTime))}
                  </span>
                </span>
              </div>
            </div>
          ) : nextEntry ? (
            <div className="space-y-2">
              <div
                className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold border ${
                  isWithin10Mins
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse'
                    : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {isWithin10Mins ? '⚠️ Upcoming Class Alert (<10m)' : 'Next Scheduled Lecture'}
                </span>
              </div>
              <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                {nextEntry.subjectName}{' '}
                <span className="text-slate-400 text-lg">({nextEntry.subjectCode})</span>
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-300">
                <span className="flex items-center space-x-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700 text-cyan-300">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{nextEntry.room}</span>
                </span>
                <span className="flex items-center space-x-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>{nextEntry.batch}</span>
                </span>
                <span className="flex items-center space-x-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    Starts at {formatMinutesTo12H(parseTimeToMinutes(nextEntry.startTime))}
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <div className="py-2 space-y-1">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-700/50 text-slate-300 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>No Remaining Classes Today</span>
              </div>
              <h2 className="font-heading font-bold text-lg text-slate-200">
                You have completed all scheduled lectures for {selectedDay}!
              </h2>
              <p className="text-xs text-slate-400">
                Use the day selector or Demo Time Traveler to check upcoming days.
              </p>
            </div>
          )}
        </div>

        {/* Right: Live Countdown Clock or Action Card */}
        {nextEntry && (
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-700/80 flex flex-col items-center justify-center min-w-[200px] text-center shadow-inner">
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">
              Countdown to Class
            </span>

            <div className="flex items-baseline space-x-1 font-mono font-extrabold my-1">
              <span className={`text-3xl sm:text-4xl ${isWithin10Mins ? 'text-amber-400' : 'text-blue-400'}`}>
                {minsLeft < 10 ? `0${minsLeft}` : minsLeft}
              </span>
              <span className="text-xs text-slate-400 mr-1">m</span>
              <span className={`text-3xl sm:text-4xl ${isWithin10Mins ? 'text-amber-400' : 'text-blue-400'}`}>
                {secsLeft < 10 ? `0${secsLeft}` : secsLeft}
              </span>
              <span className="text-xs text-slate-400">s</span>
            </div>

            {isWithin10Mins ? (
              <button
                onClick={() => onTestTriggerAlert(nextEntry)}
                className="mt-2 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-all flex items-center space-x-1 shadow-md shadow-amber-500/20"
              >
                <Sparkles className="w-3 h-3" />
                <span>Trigger Alert Now</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 mt-1">
                Automated 10m alert pending
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
