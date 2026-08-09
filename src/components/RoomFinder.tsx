import React, { useState } from 'react';
import { Room, TimetableEntry, DayOfWeek } from '../types';
import { getEntryStatus, parseTimeToMinutes, formatMinutesTo12H } from '../utils/timeUtils';
import { MapPin, Users, CheckCircle, XCircle, Clock, Cpu, Filter, Search, Building } from 'lucide-react';

interface RoomFinderProps {
  rooms: Room[];
  timetable: TimetableEntry[];
  currentDate: Date;
  selectedDay: DayOfWeek;
  onSelectDay: (day: DayOfWeek) => void;
}

export const RoomFinder: React.FC<RoomFinderProps> = ({
  rooms,
  timetable,
  currentDate,
  selectedDay,
  onSelectDay,
}) => {
  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredRooms = rooms.filter((r) => {
    if (filterType !== 'All' && r.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.building.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-md">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div>
            <h2 className="font-heading font-bold text-xl text-white flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              <span>Campus Room Occupancy & Location Finder</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time room status for {selectedDay} at{' '}
              <span className="font-mono text-blue-300 font-semibold">
                {currentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          </div>

          {/* Search & Type Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search room name or building..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 text-white text-xs rounded-xl pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-500"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-900 text-white text-xs font-semibold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="All">All Room Types</option>
              <option value="Lecture Hall">Lecture Halls</option>
              <option value="Computer Lab">Computer Labs</option>
              <option value="Auditorium">Auditorium / Halls</option>
            </select>
          </div>
        </div>
      </div>

      {/* Room Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredRooms.map((room) => {
          // Find entries for this room today
          const roomTodayEntries = timetable.filter(
            (e) =>
              e.day === selectedDay &&
              e.room.trim().toLowerCase() === room.name.trim().toLowerCase()
          );

          // Find current ongoing entry
          const ongoing = roomTodayEntries.find(
            (e) => getEntryStatus(e, currentDate) === 'Ongoing'
          );

          // Find next upcoming entry
          const currentMin = currentDate.getHours() * 60 + currentDate.getMinutes();
          const upcoming = roomTodayEntries
            .filter((e) => parseTimeToMinutes(e.startTime) > currentMin)
            .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime))[0];

          return (
            <div
              key={room.id}
              className={`bg-slate-800/90 rounded-2xl p-5 border transition-all duration-200 shadow-md hover:shadow-xl space-y-4 flex flex-col justify-between ${
                ongoing
                  ? 'border-rose-500/50 bg-gradient-to-br from-slate-800 to-rose-950/20'
                  : 'border-emerald-500/50 bg-gradient-to-br from-slate-800 to-emerald-950/20'
              }`}
            >
              <div className="space-y-3">
                {/* Room Title & Status Pill */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-heading font-extrabold text-xl text-white">
                      {room.name}
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center space-x-1 mt-0.5">
                      <Building className="w-3.5 h-3.5" />
                      <span>
                        {room.building} • Floor {room.floor}
                      </span>
                    </p>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 ${
                      ongoing
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {ongoing ? (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span>Occupied</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Available Now</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Capacity & Type Badges */}
                <div className="flex items-center space-x-2 text-xs font-medium text-slate-300">
                  <span className="bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700/80 flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    <span>Cap: {room.capacity} seats</span>
                  </span>
                  <span className="bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700/80 text-cyan-300">
                    {room.type}
                  </span>
                </div>

                {/* Current Class or Next Class Banner */}
                {ongoing ? (
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-rose-500/30 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                      Currently In Session
                    </div>
                    <div className="font-bold text-sm text-white">{ongoing.subjectName}</div>
                    <div className="text-xs text-slate-300 font-medium">
                      Faculty: {ongoing.facultyName} ({ongoing.batch})
                    </div>
                    <div className="text-[11px] text-rose-300/80 font-mono">
                      {formatMinutesTo12H(parseTimeToMinutes(ongoing.startTime))} -{' '}
                      {formatMinutesTo12H(parseTimeToMinutes(ongoing.endTime))}
                    </div>
                  </div>
                ) : upcoming ? (
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-700 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                      Next Lecture Today
                    </div>
                    <div className="font-bold text-sm text-white">{upcoming.subjectName}</div>
                    <div className="text-xs text-slate-300 font-medium">
                      {upcoming.facultyName} • Batch {upcoming.batch}
                    </div>
                    <div className="text-[11px] text-blue-300 font-mono">
                      Starts at {formatMinutesTo12H(parseTimeToMinutes(upcoming.startTime))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-xs text-slate-400 italic">
                    No further classes scheduled in {room.name} today.
                  </div>
                )}

                {/* Equipment Pills */}
                {room.equipment && room.equipment.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Room Equipment:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {room.equipment.map((eq, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-medium bg-slate-900 px-2 py-0.5 rounded border border-slate-700/60 text-slate-300"
                        >
                          {eq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
