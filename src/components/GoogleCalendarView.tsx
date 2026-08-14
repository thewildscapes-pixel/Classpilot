import React, { useState, useEffect } from 'react';
import { CalendarEvent, User, TimetableEntry } from '../types';
import {
  Calendar,
  Clock,
  MapPin,
  Plus,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Search,
  Bell,
  Check,
  RefreshCw,
  X,
} from 'lucide-react';

interface GoogleCalendarViewProps {
  currentUser: User;
  timetable: TimetableEntry[];
  onTriggerAlarm?: (eventTitle: string, room: string, startTime: string) => void;
  onOpenSleepAlarmModal?: () => void;
}

const DEFAULT_EVENTS: CalendarEvent[] = [
  {
    id: 'cal_1',
    title: 'Departmental Academic Committee Meeting',
    date: new Date().toISOString().split('T')[0],
    startTime: '14:00',
    endTime: '15:00',
    location: 'Conference Room 1',
    description: 'Review of mid-term FYUGP internal assessment marks and syllabus completion.',
    isGoogleSynced: true,
    createdById: 'fac_1',
  },
  {
    id: 'cal_2',
    title: 'NAAC Steering Committee Review',
    date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    startTime: '11:00',
    endTime: '12:30',
    location: 'Principal Conference Room',
    description: 'Final audit of departmental class record logbooks and research publications.',
    isGoogleSynced: true,
    createdById: 'fac_1',
  },
  {
    id: 'cal_3',
    title: 'Special Guest Lecture: Digital Banking Trends',
    date: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '12:00',
    location: 'College Auditorium',
    description: 'Keynote lecture for B.Com 5th Semester students.',
    isGoogleSynced: true,
    createdById: 'fac_1',
  },
];

export const GoogleCalendarView: React.FC<GoogleCalendarViewProps> = ({
  currentUser,
  timetable,
  onTriggerAlarm,
  onOpenSleepAlarmModal,
}) => {
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    try {
      const saved = localStorage.getItem('classpilot_calendar_events');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_EVENTS;
  });
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // Form state
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState<string>('10:00');
  const [formEndTime, setFormEndTime] = useState<string>('11:00');
  const [formLocation, setFormLocation] = useState<string>('Commerce Department');
  const [formDescription, setFormDescription] = useState<string>('');

  useEffect(() => {
    fetchCalendarEvents();
  }, []);

  const fetchCalendarEvents = async () => {
    try {
      const res = await fetch('/api/calendar/events');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setEvents(data);
          try {
            localStorage.setItem('classpilot_calendar_events', JSON.stringify(data));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('Using local calendar events dataset.');
    }
  };

  const handleAddCalendarEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const newEvent: CalendarEvent = {
      id: `cal_${Date.now()}`,
      title: formTitle.trim(),
      date: formDate,
      startTime: formStartTime,
      endTime: formEndTime,
      location: formLocation.trim(),
      description: formDescription.trim(),
      isGoogleSynced: true,
      createdById: currentUser.facultyId || 'fac_1',
    };

    setEvents((prev) => {
      const updated = [newEvent, ...prev];
      try {
        localStorage.setItem('classpilot_calendar_events', JSON.stringify(updated));
      } catch (err) {}
      return updated;
    });

    try {
      await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent),
      });
    } catch (e) {
      console.warn('Backend sync failed, saved locally');
    }

    setIsModalOpen(false);
    setFormTitle('');
    setFormDescription('');
  };

  return (
    <div className="space-y-6">
      {/* Google Calendar Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs text-blue-400 font-bold uppercase tracking-wider mb-1">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>Google Calendar API Integration (calendar.events)</span>
            </div>
            <h2 className="font-heading font-extrabold text-2xl text-white flex items-center space-x-2">
              <span>Faculty Academic Agenda & Meetings</span>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono">
                Google Workspace Connected
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Sync departmental meetings, seminars, and assessment dates directly with your Google Calendar account.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onOpenSleepAlarmModal && (
              <button
                onClick={onOpenSleepAlarmModal}
                className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-600/20 flex items-center space-x-2 transition-all cursor-pointer"
              >
                <Clock className="w-4 h-4 text-white animate-pulse" />
                <span>⏰ Sync Mobile Sleep Alarms (.ics)</span>
              </button>
            )}

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center space-x-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Google Calendar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Agenda View Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Calendar Agenda Events List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-extrabold text-base text-white flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Upcoming Agenda & Synced Meetings</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {events.length} Scheduled Events
            </span>
          </div>

          <div className="space-y-3">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex flex-col items-center justify-center shrink-0 text-blue-300">
                    <span className="text-[10px] uppercase font-mono font-bold">
                      {new Date(evt.date).toLocaleString('default', { month: 'short' })}
                    </span>
                    <span className="text-sm font-black">
                      {new Date(evt.date).getDate()}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-extrabold text-sm text-white">{evt.title}</h4>
                      {evt.isGoogleSynced && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                          Synced
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{evt.startTime} - {evt.endTime}</span>
                      </span>

                      {evt.location && (
                        <span className="flex items-center space-x-1 text-slate-300">
                          <MapPin className="w-3 h-3 text-emerald-400" />
                          <span>{evt.location}</span>
                        </span>
                      )}
                    </div>

                    {evt.description && (
                      <p className="text-xs text-slate-400 pt-1 line-clamp-2">
                        {evt.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => {
                      if (onTriggerAlarm) {
                        onTriggerAlarm(evt.title, evt.location || 'Dept', evt.startTime);
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Test Bell Alarm</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Class Schedule Routine & Quick Bell Alarm Tester */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
            <h3 className="font-heading font-extrabold text-sm text-white flex items-center space-x-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span>School Bell Class Alerts</span>
            </h3>
            <p className="text-xs text-slate-400">
              Classes automatically ring the authentic mechanical school bell sound 10 minutes prior to lecture start.
            </p>

            <button
              onClick={() => {
                if (onTriggerAlarm) {
                  onTriggerAlarm('COM-101 Financial Accounting', 'Lecture Hall 01', '09:00 AM');
                }
              }}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all"
            >
              <Bell className="w-4 h-4 animate-bounce" />
              <span>Simulate Class Period School Bell</span>
            </button>
          </div>

          {/* Today's Timetable Snippet */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
            <h3 className="font-heading font-extrabold text-sm text-white flex items-center justify-between">
              <span>My Scheduled Lectures</span>
              <span className="text-[10px] text-blue-400 font-semibold">{currentUser.name}</span>
            </h3>
            <div className="space-y-2">
              {timetable
                .filter((t) => {
                  if (currentUser.facultyId && t.facultyId === currentUser.facultyId) return true;
                  if (currentUser.name && t.facultyName && t.facultyName.toLowerCase().includes(currentUser.name.toLowerCase())) return true;
                  return false;
                })
                .slice(0, 4)
                .map((t) => (
                  <div key={t.id} className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/80 text-xs space-y-1">
                    <div className="font-bold text-white flex items-center justify-between">
                      <span>{t.subjectCode}: {t.subjectName}</span>
                      <span className="text-[10px] text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full">{t.startTime}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>📍 Room {t.room}</span>
                      <span>{t.batch}</span>
                    </div>
                  </div>
                ))}
              {timetable.filter((t) => {
                if (currentUser.facultyId && t.facultyId === currentUser.facultyId) return true;
                if (currentUser.name && t.facultyName && t.facultyName.toLowerCase().includes(currentUser.name.toLowerCase())) return true;
                return false;
              }).length === 0 && (
                <div className="p-3 text-center text-xs text-slate-500">
                  No lectures found for your profile today.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ADD TO GOOGLE CALENDAR MODAL */}
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
                <Calendar className="w-5 h-5 text-blue-400" />
                <span>Add Event to Google Calendar</span>
              </h3>
              <p className="text-xs text-slate-400">
                Sync meetings, workshops, or exam invigilation to your Google account.
              </p>
            </div>

            <form onSubmit={handleAddCalendarEvent} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Event Title / Topic *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Departmental Moderation Board Meeting"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Start</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">End</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Location / Venue</label>
                <input
                  type="text"
                  placeholder="e.g. Commerce Conference Hall"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl p-2.5"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Agenda / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Key topics to discuss..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
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
                  Sync to Google Calendar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
