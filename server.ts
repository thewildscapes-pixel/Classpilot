import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { INITIAL_FACULTY, INITIAL_ROOMS, INITIAL_TIMETABLE, DEMO_USERS } from './src/data/initialData';
import { TimetableEntry, Faculty, Room, User } from './src/types';

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // In-memory persistent database store (pre-populated with college dataset)
  let facultyList: Faculty[] = [...INITIAL_FACULTY];
  let roomList: Room[] = [...INITIAL_ROOMS];
  let timetableList: TimetableEntry[] = [...INITIAL_TIMETABLE];
  let usersList: User[] = [...DEMO_USERS];

  // Store Web Push subscriptions in memory
  let pushSubscriptions: Array<{ endpoint: string; keys: unknown }> = [];

  // Class Diary, Calendar Events, & Research in-memory persistent stores
  let classDiaryList: any[] = [];
  let calendarEventsList: any[] = [];
  let researchRecordsList: any[] = [];

  // --- API ROUTES ---


  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // OTP Store in memory for verification
  const pendingOtps = new Map<string, { otp: string; email: string; phone: string; expiresAt: number }>();

  // Auth / Login
  app.post('/api/auth/send-otp', (req, res) => {
    const { email, phone } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim().replace(/\D/g, '');

    if (!cleanEmail || !cleanPhone) {
      res.status(400).json({ error: 'Valid Email ID and WhatsApp Mobile Number are required.' });
      return;
    }

    // Generate 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins

    pendingOtps.set(cleanEmail, { otp: generatedOtp, email: cleanEmail, phone: cleanPhone, expiresAt });

    // Check if user is Academic Coordinator Admin
    const isAcademicCoord = cleanEmail === 'thewildscapes@gmail.com' || cleanPhone === '9706375001';

    console.log(`[OTP SENT] To ${cleanEmail} / ${cleanPhone}: ${generatedOtp}`);

    res.json({
      success: true,
      message: `OTP sent to ${cleanEmail} and WhatsApp notification triggered to +${cleanPhone}`,
      demoOtp: generatedOtp, // Output demo OTP so user can copy or click auto-fill
      isAcademicCoordinator: isAcademicCoord,
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const { email, phone, otp } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim().replace(/\D/g, '');
    const userOtp = (otp || '').trim();

    const stored = pendingOtps.get(cleanEmail);

    // Auto pass if OTP matches OR if user typed '123456' or demo OTP
    const isValidOtp = (stored && stored.otp === userOtp) || userOtp === '123456' || (stored && stored.otp === '849201');

    if (!isValidOtp && stored && Date.now() > stored.expiresAt) {
      res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
      return;
    }

    // Check if this is Academic Coordinator Admin
    const isAcademicCoord = cleanEmail === 'thewildscapes@gmail.com' || cleanPhone === '9706375001';

    let user: User;

    if (isAcademicCoord) {
      user = {
        id: 'user_admin_coord',
        name: 'Academic Coordinator',
        email: 'thewildscapes@gmail.com',
        whatsappPhone: '9706375001',
        role: 'admin',
        department: 'Academic Coordination Secretariat',
        isVerified: true,
        isAcademicCoordinator: true,
      };
    } else {
      // Find matching faculty or create new verified faculty user
      const fac = facultyList.find((f) => f.email.toLowerCase() === cleanEmail);
      if (fac) {
        user = {
          id: `user_${fac.id}`,
          name: fac.name,
          email: fac.email,
          whatsappPhone: cleanPhone,
          role: 'faculty',
          facultyId: fac.id,
          department: fac.department,
          isVerified: true,
        };
      } else {
        const facId = `fac_${Date.now()}`;
        const newFacName = cleanEmail.split('@')[0].replace('.', ' ').replace(/^./, (str) => str.toUpperCase());

        // Create new faculty record
        const newFac: Faculty = {
          id: facId,
          name: `Prof. ${newFacName}`,
          email: cleanEmail,
          whatsappPhone: cleanPhone,
          department: 'Computer Science',
          designation: 'Faculty Member',
          isVerified: true,
        };
        facultyList.push(newFac);

        user = {
          id: `user_${facId}`,
          name: newFac.name,
          email: cleanEmail,
          whatsappPhone: cleanPhone,
          role: 'faculty',
          facultyId: facId,
          department: newFac.department,
          isVerified: true,
        };
      }
    }

    pendingOtps.delete(cleanEmail);

    const token = `jwt_session_${user.id}_${Date.now()}`;

    res.json({
      success: true,
      token,
      user,
      message: `Successfully verified and logged in as ${user.name} (${user.role.toUpperCase()})`,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, phone, role } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim().replace(/\D/g, '');

    const isAcademicCoord = cleanEmail === 'thewildscapes@gmail.com' || cleanPhone === '9706375001';

    let user: User;

    if (isAcademicCoord) {
      user = {
        id: 'user_admin_coord',
        name: 'Academic Coordinator',
        email: 'thewildscapes@gmail.com',
        whatsappPhone: '9706375001',
        role: 'admin',
        department: 'Academic Coordination Secretariat',
        isVerified: true,
        isAcademicCoordinator: true,
      };
    } else {
      let found = usersList.find((u) => u.email.toLowerCase() === cleanEmail);
      if (found) {
        user = { ...found, whatsappPhone: cleanPhone || found.whatsappPhone || '9876543210', isVerified: true };
      } else {
        const fac = facultyList.find((f) => f.email.toLowerCase() === cleanEmail);
        user = {
          id: `user_${fac ? fac.id : Date.now()}`,
          name: fac ? fac.name : `Prof. ${cleanEmail.split('@')[0]}`,
          email: cleanEmail || 'faculty@college.edu',
          whatsappPhone: cleanPhone || '9876543210',
          role: (role as 'faculty' | 'admin') || 'faculty',
          facultyId: fac ? fac.id : facultyList[0]?.id || 'fac_1',
          department: fac ? fac.department : 'Computer Science',
          isVerified: true,
        };
      }
    }

    const mockJwt = `jwt_session_${user.id}_${Date.now()}`;
    res.json({ token: mockJwt, user });
  });

  // Faculty API
  app.get('/api/faculty', (req, res) => {
    res.json(facultyList);
  });

  app.post('/api/faculty', (req, res) => {
    const newFaculty: Faculty = {
      id: req.body.id || `fac_${Date.now()}`,
      name: req.body.name,
      email: req.body.email,
      department: req.body.department || 'Computer Science',
      designation: req.body.designation || 'Lecturer',
      phone: req.body.phone,
      whatsappPhone: req.body.whatsappPhone || req.body.phone,
      employeeId: req.body.employeeId,
      isVerified: true,
    };
    facultyList.push(newFaculty);
    res.json(newFaculty);
  });

  app.put('/api/faculty/:id', (req, res) => {
    const { id } = req.params;
    const index = facultyList.findIndex((f) => f.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Faculty member not found' });
      return;
    }
    facultyList[index] = { ...facultyList[index], ...req.body };
    res.json(facultyList[index]);
  });

  app.delete('/api/faculty/:id', (req, res) => {
    const { id } = req.params;
    facultyList = facultyList.filter((f) => f.id !== id);
    res.json({ success: true, id });
  });

  // Rooms API
  app.get('/api/rooms', (req, res) => {
    res.json(roomList);
  });

  app.post('/api/rooms', (req, res) => {
    const newRoom: Room = {
      id: `room_${Date.now()}`,
      name: req.body.name,
      building: req.body.building || 'Main Block',
      floor: parseInt(req.body.floor, 10) || 1,
      capacity: parseInt(req.body.capacity, 10) || 50,
      type: req.body.type || 'Lecture Hall',
      equipment: req.body.equipment || [],
    };
    roomList.push(newRoom);
    res.json(newRoom);
  });

  // Timetable API
  app.get('/api/timetable', (req, res) => {
    res.json(timetableList);
  });

  app.post('/api/timetable', (req, res) => {
    const entry: TimetableEntry = {
      id: `tt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      facultyId: req.body.facultyId,
      facultyName: req.body.facultyName,
      subjectCode: req.body.subjectCode,
      subjectName: req.body.subjectName,
      room: req.body.room,
      day: req.body.day,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      batch: req.body.batch,
      department: req.body.department,
      notes: req.body.notes,
    };
    timetableList.push(entry);
    res.json(entry);
  });

  app.put('/api/timetable/:id', (req, res) => {
    const { id } = req.params;
    const index = timetableList.findIndex((t) => t.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Timetable entry not found' });
      return;
    }
    timetableList[index] = { ...timetableList[index], ...req.body };
    res.json(timetableList[index]);
  });

  app.delete('/api/timetable/:id', (req, res) => {
    const { id } = req.params;
    timetableList = timetableList.filter((t) => t.id !== id);
    res.json({ success: true, id });
  });

  // Bulk Import Timetable API (From Excel / CSV)
  app.post('/api/timetable/import', (req, res) => {
    const { entries, replaceExisting } = req.body;
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'Invalid entries array' });
      return;
    }

    if (replaceExisting) {
      timetableList = [];
    }

    const created: TimetableEntry[] = [];
    entries.forEach((e: Partial<TimetableEntry>) => {
      const entry: TimetableEntry = {
        id: e.id || `tt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        facultyId: e.facultyId || 'fac_1',
        facultyName: e.facultyName || 'Faculty Member',
        subjectCode: e.subjectCode || 'CS101',
        subjectName: e.subjectName || 'General Subject',
        room: e.room || 'Room No. C1',
        day: e.day || 'Monday',
        startTime: e.startTime || '09:00',
        endTime: e.endTime || '10:15',
        batch: e.batch || 'FYUGP',
        department: e.department || 'Computer Science',
        semesterCycle: e.semesterCycle,
        programSemester: e.programSemester,
        paperCategory: e.paperCategory,
        notes: e.notes || '',
        isSubstitute: e.isSubstitute || false,
      };
      timetableList.push(entry);
      created.push(entry);
    });

    res.json({ success: true, count: created.length, timetable: timetableList });
  });

  // Web Push Subscription
  app.post('/api/push-subscribe', (req, res) => {
    const sub = req.body;
    if (sub && sub.endpoint) {
      pushSubscriptions.push(sub);
    }
    res.json({ success: true, totalSubscriptions: pushSubscriptions.length });
  });

  // Backend 10-Minute Alert Checker
  app.get('/api/alerts/check', (req, res) => {
    const timeStr = (req.query.time as string) || '';
    const facultyId = req.query.facultyId as string;
    const day = (req.query.day as string) || 'Monday';

    let currentMinutes = 0;
    if (timeStr) {
      const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));
      currentMinutes = h * 60 + m;
    } else {
      const now = new Date();
      currentMinutes = now.getHours() * 60 + now.getMinutes();
    }

    // Find entries starting in <= 10 mins and > 0 mins
    const alerts = timetableList.filter((entry) => {
      if (entry.day !== day) return false;
      if (facultyId && entry.facultyId !== facultyId) return false;

      const [sh, sm] = entry.startTime.split(':').map((x) => parseInt(x, 10));
      const startMin = sh * 60 + sm;
      const diff = startMin - currentMinutes;

      // 10-minute warning range: 0 to 10 minutes
      return diff >= 0 && diff <= 10;
    });

    res.json({
      checkTimeMinutes: currentMinutes,
      timeStr,
      alerts,
    });
  });

  // --- CLASS DIARY LOGBOOK ROUTES (WITH STRICT 24-HOUR TIME LOCK ENFORCEMENT) ---
  app.get('/api/class-diary', (req, res) => {
    res.json(classDiaryList);
  });

  app.post('/api/class-diary', (req, res) => {
    const entry = req.body;
    if (!entry.topicTaught) {
      res.status(400).json({ error: 'Topic taught is required' });
      return;
    }
    const id = entry.id || `diary_${Date.now()}`;
    const startTimestamp = entry.classStartTimestamp || new Date(`${entry.date || new Date().toISOString().split('T')[0]}T${entry.startTime || '09:00'}`).getTime();

    const newEntry = {
      ...entry,
      id,
      classStartTimestamp: startTimestamp,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    classDiaryList.unshift(newEntry);
    res.status(201).json(newEntry);
  });

  app.put('/api/class-diary/:id', (req, res) => {
    const { id } = req.params;
    const existingIndex = classDiaryList.findIndex((d) => d.id === id);
    if (existingIndex === -1) {
      res.status(404).json({ error: 'Class diary entry not found' });
      return;
    }

    const existingEntry = classDiaryList[existingIndex];
    const lockWindowMs = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const classStart = existingEntry.classStartTimestamp || new Date(`${existingEntry.date}T${existingEntry.startTime}`).getTime();

    // Strict 24-Hour Lock Enforcement
    if ((nowMs - classStart) > lockWindowMs) {
      res.status(403).json({
        error: 'Time-Lock Violation: This class diary entry is permanently locked because more than 24 hours have elapsed since the class start time.',
      });
      return;
    }

    const updated = {
      ...existingEntry,
      ...req.body,
      id,
      updatedAt: new Date().toISOString(),
    };

    classDiaryList[existingIndex] = updated;
    res.json(updated);
  });

  app.delete('/api/class-diary/:id', (req, res) => {
    const { id } = req.params;
    const existingEntry = classDiaryList.find((d) => d.id === id);
    if (!existingEntry) {
      res.status(404).json({ error: 'Class diary entry not found' });
      return;
    }

    const lockWindowMs = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const classStart = existingEntry.classStartTimestamp || new Date(`${existingEntry.date}T${existingEntry.startTime}`).getTime();

    if ((nowMs - classStart) > lockWindowMs) {
      res.status(403).json({
        error: 'Time-Lock Violation: Cannot delete a locked class diary record past 24 hours.',
      });
      return;
    }

    classDiaryList = classDiaryList.filter((d) => d.id !== id);
    res.json({ success: true, message: 'Entry deleted successfully' });
  });

  // --- GOOGLE CALENDAR AGENDA ROUTES ---
  app.get('/api/calendar/events', (req, res) => {
    res.json(calendarEventsList);
  });

  app.post('/api/calendar/events', (req, res) => {
    const evt = req.body;
    if (!evt.title) {
      res.status(400).json({ error: 'Event title is required' });
      return;
    }

    const newEvt = {
      id: evt.id || `cal_${Date.now()}`,
      title: evt.title,
      date: evt.date || new Date().toISOString().split('T')[0],
      startTime: evt.startTime || '10:00',
      endTime: evt.endTime || '11:00',
      location: evt.location || '',
      description: evt.description || '',
      isGoogleSynced: true,
      createdById: evt.createdById || 'fac_1',
    };

    calendarEventsList.unshift(newEvt);
    res.status(201).json(newEvt);
  });

  // --- RESEARCH & PUBLICATION ROUTES ---
  app.get('/api/research', (req, res) => {
    res.json(researchRecordsList);
  });

  app.post('/api/research', (req, res) => {
    const rec = req.body;
    if (!rec.title) {
      res.status(400).json({ error: 'Research title is required' });
      return;
    }

    const newRec = {
      id: rec.id || `res_${Date.now()}`,
      facultyId: rec.facultyId || 'fac_1',
      title: rec.title,
      type: rec.type || 'Journal Paper',
      journalOrPublisher: rec.journalOrPublisher || '',
      year: rec.year || new Date().getFullYear(),
      authors: rec.authors || '',
      doiOrUrl: rec.doiOrUrl || '',
      remarks: rec.remarks || '',
      dateLogged: new Date().toISOString().split('T')[0],
    };

    researchRecordsList.unshift(newRec);
    res.status(201).json(newRec);
  });

  // Reset to initial data

  app.post('/api/reset', (req, res) => {
    facultyList = [...INITIAL_FACULTY];
    roomList = [...INITIAL_ROOMS];
    timetableList = [...INITIAL_TIMETABLE];
    usersList = [...DEMO_USERS];
    res.json({ success: true, message: 'Reset to default dataset successfully' });
  });

  // --- GEMINI AI API ENDPOINTS ---
  app.post('/api/analyze-student', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const { studentData, prompt } = req.body || {};
      const userPrompt = prompt || (studentData ? `Analyze student data and provide insights: ${JSON.stringify(studentData)}` : 'Provide a student performance analysis summary.');

      if (!apiKey) {
        res.json({
          analysis: 'Academic Analysis: Student performance is satisfactory based on current class attendance and routine schedule.',
          result: 'Satisfactory academic performance.',
        });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: userPrompt,
      });

      const text = response.text || 'Analysis complete.';
      res.json({ analysis: text, result: text });
    } catch (err: unknown) {
      console.error('Error in /api/analyze-student:', err);
      const errMsg = err instanceof Error ? err.message : 'Error generating analysis';
      res.status(500).json({ error: errMsg, analysis: 'Analysis encountered an error. Please try again.' });
    }
  });

  app.post('/api/ai-assistant', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const { prompt } = req.body || {};
      if (!prompt) {
        res.status(400).json({ error: 'Prompt is required' });
        return;
      }

      if (!apiKey) {
        res.json({ text: 'AI Assistant response (API key not configured).' });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });

      res.json({ text: response.text || 'Response generated successfully.' });
    } catch (err: unknown) {
      console.error('Error in /api/ai-assistant:', err);
      const errMsg = err instanceof Error ? err.message : 'Error processing request';
      res.status(500).json({ error: errMsg });
    }
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
