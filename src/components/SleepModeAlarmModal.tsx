import React, { useState, useEffect } from 'react';
import { TimetableEntry, User, Faculty } from '../types';
import {
  generateClassAlarmsIcs,
  downloadIcsCalendarFile,
  generateGoogleCalendarUrl,
  requestWebNotificationPermission,
  sendLocalClassNotification,
} from '../utils/calendarSyncUtils';
import { playSchoolBellSound, stopSchoolBellSound, playAlertChime } from '../utils/audioUtils';
import {
  Bell,
  Clock,
  Calendar,
  Download,
  Smartphone,
  ShieldCheck,
  Zap,
  Volume2,
  CheckCircle2,
  ExternalLink,
  X,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface SleepModeAlarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  timetable: TimetableEntry[];
  facultyList: Faculty[];
}

export const SleepModeAlarmModal: React.FC<SleepModeAlarmModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  timetable,
  facultyList,
}) => {
  const [alarmLeadMins, setAlarmLeadMins] = useState<number>(10);
  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(false);
  const [isTestingSound, setIsTestingSound] = useState<boolean>(false);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setHasNotificationPermission(Notification.permission === 'granted');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter timetable for logged-in faculty or all entries
  const userFacultyName = currentUser?.name || 'Faculty Member';
  const assignedClasses = timetable.filter((t) => {
    if (!currentUser) return true;
    if (t.facultyId && currentUser.facultyId && t.facultyId === currentUser.facultyId) return true;
    if (t.facultyName && currentUser.name && t.facultyName.toLowerCase().includes(currentUser.name.toLowerCase())) return true;
    return false;
  });

  const activeRoutineList = assignedClasses.length > 0 ? assignedClasses : timetable;

  // Handle ICS export with native VALARM
  const handleExportIcsAlarms = () => {
    if (activeRoutineList.length === 0) {
      alert('No timetable class entries available to schedule alarms for.');
      return;
    }

    const icsData = generateClassAlarmsIcs(activeRoutineList, userFacultyName, alarmLeadMins);
    const cleanFileName = `ClassPilot_Alarms_${userFacultyName.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
    downloadIcsCalendarFile(icsData, cleanFileName);

    setDownloadSuccessMessage(
      `Downloaded ${activeRoutineList.length} class alarm events! Open the .ics file on your phone to add alarms to your mobile calendar.`
    );
    setTimeout(() => setDownloadSuccessMessage(''), 8000);
  };

  // Enable Web Notifications
  const handleEnableNotifications = async () => {
    const granted = await requestWebNotificationPermission();
    setHasNotificationPermission(granted);
    if (granted) {
      sendLocalClassNotification(
        '🔔 ClassPilot Notifications Active!',
        'You will receive pre-class warning alerts directly on your screen.'
      );
    }
  };

  // Test Bell Chime Sound
  const handleTestChime = () => {
    setIsTestingSound(true);
    playSchoolBellSound(5);
    setTimeout(() => setIsTestingSound(false), 5000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border-2 border-indigo-500/80 rounded-3xl max-w-xl w-full p-6 shadow-2xl text-white space-y-6 my-8 relative ring-4 ring-indigo-500/20">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3.5 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
            <Bell className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                100% Reliable Alarm System
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                Mobile Sleep Mode
              </span>
            </div>
            <h3 className="font-heading font-black text-xl text-white tracking-tight">
              Class Warning Bell & Mobile Sleep Alarm
            </h3>
          </div>
        </div>

        {/* Sleep Mode Explanation Banner */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 space-y-2 text-xs leading-relaxed text-slate-300">
          <div className="flex items-center space-x-2 text-amber-400 font-bold">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>How to ensure alarms ring when your mobile phone is in sleep mode:</span>
          </div>
          <p>
            When a smartphone screen locks or enters power-saving sleep mode, mobile browsers pause web sound playback. To guarantee <strong>loud warning alarms ring before class even when your phone is sleeping</strong>, sync your routine with your phone&apos;s native calendar below!
          </p>
        </div>

        {/* Alarm Settings Form */}
        <div className="space-y-4">
          
          {/* Lead Time Selection */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <label className="text-xs font-bold text-slate-200 block">
                Warning Alarm Timing
              </label>
              <p className="text-[11px] text-slate-400">
                How many minutes before class start time should the alarm ring?
              </p>
            </div>
            <select
              value={alarmLeadMins}
              onChange={(e) => setAlarmLeadMins(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-amber-300 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value={5}>5 Minutes Before Class</option>
              <option value={10}>10 Minutes Before Class (Recommended)</option>
              <option value={15}>15 Minutes Before Class</option>
            </select>
          </div>

          {/* METHOD 1: Mobile Calendar Alarm Sync (.ics file download with VALARM) */}
          <div className="bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-950 p-4 rounded-2xl border border-indigo-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-300 font-bold text-xs">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>Option 1: Mobile Phone Calendar Alarms (Rings in Sleep Mode)</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Recommended
              </span>
            </div>

            <p className="text-[11px] text-slate-300">
              Downloads your assigned weekly classes ({activeRoutineList.length} periods) into an iCalendar (`.ics`) file configured with native phone audio alarms ({alarmLeadMins}m & 5m before class).
            </p>

            <div className="pt-1">
              <button
                onClick={handleExportIcsAlarms}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer border border-emerald-400/30"
              >
                <Download className="w-4 h-4" />
                <span>Sync Routine Alarms to Mobile Phone Calendar (.ics)</span>
              </button>
            </div>

            {downloadSuccessMessage && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-medium flex items-center space-x-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{downloadSuccessMessage}</span>
              </div>
            )}
          </div>

          {/* METHOD 2: Web Push Notifications */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-200 font-bold text-xs">
                <Bell className="w-4 h-4 text-blue-400" />
                <span>Option 2: Browser Screen Notifications</span>
              </div>
              {hasNotificationPermission ? (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Enabled
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                  Permission Required
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400">
              Triggers lock screen web notifications and vibration alerts when ClassPilot is open in your browser tab.
            </p>

            {!hasNotificationPermission && (
              <button
                onClick={handleEnableNotifications}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer w-full"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Enable Screen Notifications & Vibration</span>
              </button>
            )}
          </div>

          {/* Audio Chime Sound Test */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-200">
              <Volume2 className="w-4 h-4 text-amber-400" />
              <span>Test Warning Bell Ringtone</span>
            </div>
            <button
              onClick={handleTestChime}
              disabled={isTestingSound}
              className="py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isTestingSound ? 'Ringing Bell...' : 'Test Bell Sound'}</span>
            </button>
          </div>

          {/* Individual Google Calendar Direct Links */}
          {activeRoutineList.length > 0 && (
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-300 block">
                Quick Single-Class Google Calendar Links:
              </span>
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                {activeRoutineList.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs p-2 bg-slate-900 rounded-lg border border-slate-800/80"
                  >
                    <div>
                      <span className="font-bold text-white">{item.day} {item.startTime}</span>
                      <span className="text-slate-400 ml-2">({item.subjectCode} - {item.room})</span>
                    </div>
                    <a
                      href={generateGoogleCalendarUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-[11px] font-bold flex items-center space-x-1"
                    >
                      <span>Google Calendar</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
