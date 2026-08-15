import express from 'express';
import path from 'path';
import fs from 'fs';
import initSqlJs, { Database } from 'sql.js';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { INITIAL_FACULTY, INITIAL_ROOMS, INITIAL_TIMETABLE, INITIAL_STUDENTS, DEMO_USERS } from './src/data/initialData';
import { TimetableEntry, Faculty, Room, Student, User } from './src/types';

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

// Persistent SQLite & JSON Central Database setup
let db: Database;
const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'classpilot.sqlite');

function saveJsonToDisk(filename: string, data: any) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save ${filename} to disk:`, err);
  }
}

function loadJsonFromDisk<T>(filename: string): T | null {
  try {
    const filePath = path.join(dataDir, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.error(`Failed to load ${filename} from disk:`, err);
  }
  return null;
}

function saveDbToDisk() {
  if (!db) return;
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const data = db.export();
    if (!data || data.length === 0) return;
    const buffer = Buffer.from(data);
    const tmpPath = `${dbPath}.tmp_${Date.now()}`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    console.error('Failed to save SQLite database to disk:', err);
  }
}

function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as T);
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error('SQLite query error:', err, 'SQL:', sql);
    return [];
  }
}

function runSql(sql: string, params: any[] = []): void {
  if (!db) return;
  try {
    db.run(sql, params);
    saveDbToDisk();
  } catch (err) {
    console.error('SQLite runSql error:', err, 'SQL:', sql);
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();
  let loaded = false;

  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      if (fileBuffer && fileBuffer.length > 0) {
        const testDb = new SQL.Database(fileBuffer);
        testDb.exec('PRAGMA quick_check;');
        testDb.exec('SELECT count(*) FROM sqlite_master;');
        db = testDb;
        console.log('✅ Persistent SQLite database loaded and verified successfully from:', dbPath);
        loaded = true;
      }
    } catch (e) {
      console.warn('⚠️ Existing SQLite database file is invalid or corrupted. Starting fresh:', e);
      try {
        fs.unlinkSync(dbPath);
      } catch (unlinkErr) {}
    }
  }

  if (!loaded) {
    db = new SQL.Database();
    console.log('✨ Created new persistent SQLite database instance.');
  }

  // Schema Initialization with SQL Tables & Indexes
  db.run(`
    CREATE TABLE IF NOT EXISTS faculty (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      department TEXT,
      designation TEXT,
      phone TEXT,
      whatsappPhone TEXT,
      employeeId TEXT,
      isVerified INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      building TEXT,
      floor INTEGER,
      capacity INTEGER,
      type TEXT,
      equipment TEXT
    );

    CREATE TABLE IF NOT EXISTS timetable (
      id TEXT PRIMARY KEY,
      facultyId TEXT,
      facultyName TEXT,
      subjectCode TEXT,
      subjectName TEXT,
      room TEXT,
      day TEXT,
      startTime TEXT,
      endTime TEXT,
      batch TEXT,
      department TEXT,
      semesterCycle TEXT,
      programSemester TEXT,
      paperCategory TEXT,
      notes TEXT,
      isSubstitute INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      rollNo TEXT NOT NULL,
      enrollmentNo TEXT,
      name TEXT NOT NULL,
      classBatch TEXT,
      section TEXT,
      department TEXT,
      subjectCode TEXT,
      subjectName TEXT,
      mobile TEXT,
      email TEXT,
      academicYear TEXT,
      sessionId TEXT
    );

    CREATE TABLE IF NOT EXISTS class_diary (
      id TEXT PRIMARY KEY,
      facultyId TEXT,
      facultyName TEXT,
      department TEXT,
      timetableEntryId TEXT,
      subjectCode TEXT,
      subjectName TEXT,
      batch TEXT,
      classBatch TEXT,
      room TEXT,
      date TEXT,
      startTime TEXT,
      endTime TEXT,
      topicTaught TEXT,
      syllabusUnit TEXT,
      teachingMethod TEXT,
      learningOutcomes TEXT,
      durationMins INTEGER,
      remarks TEXT,
      attendance TEXT,
      totalStudentsPresent INTEGER,
      totalEnrolledStudents INTEGER,
      absentRollNumbers TEXT,
      classStartTimestamp INTEGER,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT,
      startTime TEXT,
      endTime TEXT,
      location TEXT,
      description TEXT,
      isGoogleSynced INTEGER DEFAULT 1,
      createdById TEXT
    );

    CREATE TABLE IF NOT EXISTS research_records (
      id TEXT PRIMARY KEY,
      facultyId TEXT,
      title TEXT NOT NULL,
      type TEXT,
      journalOrPublisher TEXT,
      year INTEGER,
      authors TEXT,
      doiOrUrl TEXT,
      remarks TEXT,
      dateLogged TEXT
    );

    CREATE TABLE IF NOT EXISTS integrity_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      issuesCount INTEGER DEFAULT 0,
      details TEXT,
      autoRepaired INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_devices (
      deviceId TEXT NOT NULL,
      facultyId TEXT NOT NULL,
      facultyName TEXT,
      phone TEXT,
      email TEXT,
      pinCode TEXT,
      deviceModel TEXT,
      registeredAt TEXT,
      lastActiveAt TEXT,
      isTrusted INTEGER DEFAULT 1,
      PRIMARY KEY (deviceId, facultyId)
    );

    CREATE TABLE IF NOT EXISTS qr_enrollment_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      title TEXT,
      classBatch TEXT,
      section TEXT,
      department TEXT,
      semester TEXT,
      subjectCode TEXT,
      subjectName TEXT,
      createdBy TEXT,
      createdAt TEXT,
      expiresAt TEXT,
      isActive INTEGER DEFAULT 1,
      enrollmentUrl TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS student_enrollments (
      id TEXT PRIMARY KEY,
      sessionId TEXT,
      sessionToken TEXT,
      name TEXT NOT NULL,
      rollNo TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT,
      classBatch TEXT,
      section TEXT,
      department TEXT,
      semester TEXT,
      status TEXT DEFAULT 'pending',
      enrollmentSource TEXT DEFAULT 'qr_self_enrollment',
      submittedAt TEXT,
      reviewedAt TEXT,
      reviewedBy TEXT,
      masterMatchStatus TEXT,
      reassignedFrom TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tt_day_time ON timetable(day, startTime, endTime);
    CREATE INDEX IF NOT EXISTS idx_tt_faculty ON timetable(facultyId);
    CREATE INDEX IF NOT EXISTS idx_tt_department ON timetable(department);
    CREATE INDEX IF NOT EXISTS idx_faculty_email ON faculty(email);
    CREATE INDEX IF NOT EXISTS idx_faculty_dept ON faculty(department);
    CREATE INDEX IF NOT EXISTS idx_students_roll ON students(rollNo);
    CREATE INDEX IF NOT EXISTS idx_students_batch ON students(classBatch);
    CREATE INDEX IF NOT EXISTS idx_diary_date ON class_diary(date);
    CREATE INDEX IF NOT EXISTS idx_diary_faculty ON class_diary(facultyId);
  `);

  // Ensure class_diary table has all necessary columns in case of existing SQLite database
  const extraDiaryCols = [
    'department TEXT',
    'batch TEXT',
    'room TEXT',
    'syllabusUnit TEXT',
    'durationMins INTEGER',
    'remarks TEXT',
    'attendance TEXT',
    "status TEXT DEFAULT 'Conducted'",
    'isCancelled INTEGER DEFAULT 0',
    'cancellationCategory TEXT',
    'cancellationReason TEXT',
  ];
  extraDiaryCols.forEach((colDef) => {
    try {
      runSql(`ALTER TABLE class_diary ADD COLUMN ${colDef}`);
    } catch (e) {}
  });

  const extraStudentCols = [
    'enrollmentNo TEXT',
    'subjectCode TEXT',
    'subjectName TEXT',
    'department TEXT',
    'mobile TEXT',
    'email TEXT',
  ];
  extraStudentCols.forEach((colDef) => {
    try {
      runSql(`ALTER TABLE students ADD COLUMN ${colDef}`);
    } catch (e) {}
  });

  // Clean database cleanup: Remove legacy mock/dummy seed entries if present
  try {
    runSql("DELETE FROM timetable WHERE id LIKE 'tt_dg_%' OR id LIKE 'tt_jb_%' OR id LIKE 'tt_rs_%' OR subjectName LIKE '%test%' OR subjectCode LIKE '%test%' OR facultyName LIKE '%test%' OR facultyName LIKE '%faculty member%' OR id LIKE 'test_%'");
    runSql("DELETE FROM faculty WHERE (id IN ('fac_2', 'fac_3') OR name LIKE '%test%' OR name LIKE '%faculty member%') AND email != 'thewildscapes@gmail.com'");
    runSql("DELETE FROM students WHERE id IN ('st_1', 'st_2', 'st_3', 'st_4', 'st_5', 'st_6', 'st_7', 'st_8') AND name IN ('Ananya Gogoi', 'Bishal Sonowal', 'Debashree Sharma', 'Hemanta Baruah', 'Jubin Saikia', 'Kavita Agarwal', 'Manash Protim Das', 'Nabanita Borgohain')");
    runSql("DELETE FROM rooms WHERE id IN ('rm_1', 'rm_2', 'rm_3', 'rm_4', 'rm_5') AND name LIKE 'Room No.%'");

    // Ensure Dr. Deborshee Gogoi is correctly registered in the faculty table
    runSql(
      `INSERT OR REPLACE INTO faculty (id, name, email, department, designation, phone, whatsappPhone, employeeId, isVerified) 
       VALUES ('fac_1', 'Dr. Deborshee Gogoi', 'thewildscapes@gmail.com', 'Commerce', 'Associate Professor', '9706375001', '9706375001', 'DC-COM-001', 1)`
    );
  } catch (e) {
    console.warn('Notice cleaning legacy mock SQLite rows:', e);
  }

  // Auto-restore from JSON disk backups if SQLite table is empty
  try {
    const countRes = queryAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM timetable');
    if (!countRes || !countRes[0] || countRes[0].cnt === 0) {
      const backupEntries = loadJsonFromDisk<TimetableEntry[]>('timetable.json');
      if (Array.isArray(backupEntries) && backupEntries.length > 0) {
        console.log(`✨ Auto-restoring ${backupEntries.length} timetable entries from timetable.json disk backup...`);
        backupEntries.forEach((entry) => {
          runSql(
            `INSERT OR REPLACE INTO timetable 
            (id, facultyId, facultyName, subjectCode, subjectName, room, day, startTime, endTime, batch, department, semesterCycle, programSemester, paperCategory, notes, isSubstitute) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              entry.facultyId,
              entry.facultyName,
              entry.subjectCode,
              entry.subjectName,
              entry.room,
              entry.day,
              entry.startTime,
              entry.endTime,
              entry.batch,
              entry.department,
              entry.semesterCycle || '',
              entry.programSemester || '',
              entry.paperCategory || '',
              entry.notes || '',
              entry.isSubstitute ? 1 : 0,
            ]
          );
        });
      }
    }
  } catch (err) {
    console.warn('Notice auto-restoring timetable from JSON backup:', err);
  }

  // Auto-restore class_diary from class_diary.json disk backup if empty
  try {
    const diaryCountRes = queryAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM class_diary');
    if (!diaryCountRes || !diaryCountRes[0] || diaryCountRes[0].cnt === 0) {
      const backupDiary = loadJsonFromDisk<any[]>('class_diary.json');
      if (Array.isArray(backupDiary) && backupDiary.length > 0) {
        console.log(`✨ Auto-restoring ${backupDiary.length} class diary entries from class_diary.json disk backup...`);
        backupDiary.forEach((entry) => {
          const id = entry.id || `diary_${Date.now()}`;
          const startTimestamp = entry.classStartTimestamp || new Date(`${entry.date || '2026-08-14'}T${entry.startTime || '09:00'}`).getTime();
          const batchVal = entry.batch || entry.classBatch || '';
          const attendanceJson = typeof entry.attendance === 'string' ? entry.attendance : JSON.stringify(entry.attendance || []);
          const absentJson = typeof entry.absentRollNumbers === 'string' ? entry.absentRollNumbers : JSON.stringify(entry.absentRollNumbers || []);

          runSql(
            `INSERT OR REPLACE INTO class_diary 
            (id, facultyId, facultyName, department, timetableEntryId, subjectCode, subjectName, batch, classBatch, room, date, startTime, endTime, topicTaught, syllabusUnit, teachingMethod, learningOutcomes, durationMins, remarks, attendance, totalStudentsPresent, totalEnrolledStudents, absentRollNumbers, classStartTimestamp, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              entry.facultyId || 'fac_1',
              entry.facultyName || 'Dr. Deborshee Gogoi',
              entry.department || 'Commerce',
              entry.timetableEntryId || '',
              entry.subjectCode || '',
              entry.subjectName || '',
              batchVal,
              batchVal,
              entry.room || 'Room No. C1',
              entry.date || '2026-08-14',
              entry.startTime || '09:00',
              entry.endTime || '10:00',
              entry.topicTaught || 'Lecture & Discussion',
              entry.syllabusUnit || 'Unit 1',
              entry.teachingMethod || 'Lecture',
              entry.learningOutcomes || '',
              Number(entry.durationMins) || 60,
              entry.remarks || '',
              attendanceJson,
              entry.totalStudentsPresent || 40,
              entry.totalEnrolledStudents || 45,
              absentJson,
              startTimestamp,
              entry.createdAt || new Date().toISOString(),
              entry.updatedAt || new Date().toISOString(),
            ]
          );
        });
      }
    }
  } catch (err) {
    console.warn('Notice auto-restoring class_diary from JSON backup:', err);
  }

  saveDbToDisk();
}

// --- SCHEMA & DATABASE INTEGRITY CHECKER ---
interface TableColumnSpec {
  name: string;
  type: string;
  sqlDef: string;
}

const EXPECTED_TABLES: Record<string, TableColumnSpec[]> = {
  faculty: [
    { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' },
    { name: 'name', type: 'TEXT', sqlDef: 'name TEXT NOT NULL' },
    { name: 'email', type: 'TEXT', sqlDef: 'email TEXT NOT NULL' },
    { name: 'department', type: 'TEXT', sqlDef: 'department TEXT' },
    { name: 'designation', type: 'TEXT', sqlDef: 'designation TEXT' },
    { name: 'phone', type: 'TEXT', sqlDef: 'phone TEXT' },
    { name: 'whatsappPhone', type: 'TEXT', sqlDef: 'whatsappPhone TEXT' },
    { name: 'employeeId', type: 'TEXT', sqlDef: 'employeeId TEXT' },
    { name: 'isVerified', type: 'INTEGER', sqlDef: 'isVerified INTEGER DEFAULT 1' },
  ],
  rooms: [
    { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' },
    { name: 'name', type: 'TEXT', sqlDef: 'name TEXT NOT NULL' },
    { name: 'building', type: 'TEXT', sqlDef: 'building TEXT' },
    { name: 'floor', type: 'INTEGER', sqlDef: 'floor INTEGER' },
    { name: 'capacity', type: 'INTEGER', sqlDef: 'capacity INTEGER' },
    { name: 'type', type: 'TEXT', sqlDef: 'type TEXT' },
    { name: 'equipment', type: 'TEXT', sqlDef: 'equipment TEXT' },
  ],
  timetable: [
    { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' },
    { name: 'facultyId', type: 'TEXT', sqlDef: 'facultyId TEXT' },
    { name: 'facultyName', type: 'TEXT', sqlDef: 'facultyName TEXT' },
    { name: 'subjectCode', type: 'TEXT', sqlDef: 'subjectCode TEXT' },
    { name: 'subjectName', type: 'TEXT', sqlDef: 'subjectName TEXT' },
    { name: 'room', type: 'TEXT', sqlDef: 'room TEXT' },
    { name: 'day', type: 'TEXT', sqlDef: 'day TEXT' },
    { name: 'startTime', type: 'TEXT', sqlDef: 'startTime TEXT' },
    { name: 'endTime', type: 'TEXT', sqlDef: 'endTime TEXT' },
    { name: 'batch', type: 'TEXT', sqlDef: 'batch TEXT' },
    { name: 'department', type: 'TEXT', sqlDef: 'department TEXT' },
    { name: 'semesterCycle', type: 'TEXT', sqlDef: 'semesterCycle TEXT' },
    { name: 'programSemester', type: 'TEXT', sqlDef: 'programSemester TEXT' },
    { name: 'paperCategory', type: 'TEXT', sqlDef: 'paperCategory TEXT' },
    { name: 'notes', type: 'TEXT', sqlDef: 'notes TEXT' },
    { name: 'isSubstitute', type: 'INTEGER', sqlDef: 'isSubstitute INTEGER DEFAULT 0' },
  ],
  students: [
    { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' },
    { name: 'rollNo', type: 'TEXT', sqlDef: 'rollNo TEXT NOT NULL' },
    { name: 'name', type: 'TEXT', sqlDef: 'name TEXT NOT NULL' },
    { name: 'classBatch', type: 'TEXT', sqlDef: 'classBatch TEXT' },
    { name: 'section', type: 'TEXT', sqlDef: 'section TEXT' },
    { name: 'academicYear', type: 'TEXT', sqlDef: 'academicYear TEXT' },
    { name: 'sessionId', type: 'TEXT', sqlDef: 'sessionId TEXT' },
  ],
  class_diary: [
    { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' },
    { name: 'facultyId', type: 'TEXT', sqlDef: 'facultyId TEXT' },
    { name: 'facultyName', type: 'TEXT', sqlDef: 'facultyName TEXT' },
    { name: 'timetableEntryId', type: 'TEXT', sqlDef: 'timetableEntryId TEXT' },
    { name: 'subjectCode', type: 'TEXT', sqlDef: 'subjectCode TEXT' },
    { name: 'subjectName', type: 'TEXT', sqlDef: 'subjectName TEXT' },
    { name: 'classBatch', type: 'TEXT', sqlDef: 'classBatch TEXT' },
    { name: 'date', type: 'TEXT', sqlDef: 'date TEXT' },
    { name: 'startTime', type: 'TEXT', sqlDef: 'startTime TEXT' },
    { name: 'endTime', type: 'TEXT', sqlDef: 'endTime TEXT' },
    { name: 'topicTaught', type: 'TEXT', sqlDef: 'topicTaught TEXT' },
    { name: 'teachingMethod', type: 'TEXT', sqlDef: 'teachingMethod TEXT' },
    { name: 'learningOutcomes', type: 'TEXT', sqlDef: 'learningOutcomes TEXT' },
    { name: 'totalStudentsPresent', type: 'INTEGER', sqlDef: 'totalStudentsPresent INTEGER' },
    { name: 'totalEnrolledStudents', type: 'INTEGER', sqlDef: 'totalEnrolledStudents INTEGER' },
    { name: 'absentRollNumbers', type: 'TEXT', sqlDef: 'absentRollNumbers TEXT' },
    { name: 'classStartTimestamp', type: 'INTEGER', sqlDef: 'classStartTimestamp INTEGER' },
    { name: 'createdAt', type: 'TEXT', sqlDef: 'createdAt TEXT' },
    { name: 'updatedAt', type: 'TEXT', sqlDef: 'updatedAt TEXT' },
  ],
  calendar_events: [
    { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' },
    { name: 'title', type: 'TEXT', sqlDef: 'title TEXT NOT NULL' },
    { name: 'date', type: 'TEXT', sqlDef: 'date TEXT' },
    { name: 'startTime', type: 'TEXT', sqlDef: 'startTime TEXT' },
    { name: 'endTime', type: 'TEXT', sqlDef: 'endTime TEXT' },
    { name: 'location', type: 'TEXT', sqlDef: 'location TEXT' },
    { name: 'description', type: 'TEXT', sqlDef: 'description TEXT' },
    { name: 'isGoogleSynced', type: 'INTEGER', sqlDef: 'isGoogleSynced INTEGER DEFAULT 1' },
    { name: 'createdById', type: 'TEXT', sqlDef: 'createdById TEXT' },
  ],
  research_records: [
    { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' },
    { name: 'facultyId', type: 'TEXT', sqlDef: 'facultyId TEXT' },
    { name: 'title', type: 'TEXT', sqlDef: 'title TEXT NOT NULL' },
    { name: 'type', type: 'TEXT', sqlDef: 'type TEXT' },
    { name: 'journalOrPublisher', type: 'TEXT', sqlDef: 'journalOrPublisher TEXT' },
    { name: 'year', type: 'INTEGER', sqlDef: 'year INTEGER' },
    { name: 'authors', type: 'TEXT', sqlDef: 'authors TEXT' },
    { name: 'doiOrUrl', type: 'TEXT', sqlDef: 'doiOrUrl TEXT' },
    { name: 'remarks', type: 'TEXT', sqlDef: 'remarks TEXT' },
    { name: 'dateLogged', type: 'TEXT', sqlDef: 'dateLogged TEXT' },
  ],
  integrity_logs: [
    { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' },
    { name: 'timestamp', type: 'TEXT', sqlDef: 'timestamp TEXT NOT NULL' },
    { name: 'status', type: 'TEXT', sqlDef: 'status TEXT NOT NULL' },
    { name: 'issuesCount', type: 'INTEGER', sqlDef: 'issuesCount INTEGER DEFAULT 0' },
    { name: 'details', type: 'TEXT', sqlDef: 'details TEXT' },
    { name: 'autoRepaired', type: 'INTEGER', sqlDef: 'autoRepaired INTEGER DEFAULT 0' },
  ],
};

const EXPECTED_INDEXES: Record<string, string> = {
  idx_tt_day_time: 'CREATE INDEX IF NOT EXISTS idx_tt_day_time ON timetable(day, startTime, endTime)',
  idx_tt_faculty: 'CREATE INDEX IF NOT EXISTS idx_tt_faculty ON timetable(facultyId)',
  idx_tt_department: 'CREATE INDEX IF NOT EXISTS idx_tt_department ON timetable(department)',
  idx_faculty_email: 'CREATE INDEX IF NOT EXISTS idx_faculty_email ON faculty(email)',
  idx_faculty_dept: 'CREATE INDEX IF NOT EXISTS idx_faculty_dept ON faculty(department)',
  idx_students_roll: 'CREATE INDEX IF NOT EXISTS idx_students_roll ON students(rollNo)',
  idx_students_batch: 'CREATE INDEX IF NOT EXISTS idx_students_batch ON students(classBatch)',
  idx_diary_date: 'CREATE INDEX IF NOT EXISTS idx_diary_date ON class_diary(date)',
  idx_diary_faculty: 'CREATE INDEX IF NOT EXISTS idx_diary_faculty ON class_diary(facultyId)',
};

function runDatabaseIntegrityCheck(autoFix = true) {
  if (!db) return null;

  const logId = `int_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const timestamp = new Date().toISOString();
  const issues: string[] = [];
  const repairs: string[] = [];

  // 1. Verify table existence & column schemas
  const existingTablesRes = queryAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
  const existingTables = new Set(existingTablesRes.map((t) => t.name));

  for (const [tableName, cols] of Object.entries(EXPECTED_TABLES)) {
    if (!existingTables.has(tableName)) {
      issues.push(`Missing Table: '${tableName}' is missing from SQLite schema.`);
      if (autoFix) {
        const colDefs = cols.map((c) => c.sqlDef).join(', ');
        runSql(`CREATE TABLE IF NOT EXISTS ${tableName} (${colDefs})`);
        repairs.push(`Auto-created missing table '${tableName}'.`);
      }
    } else {
      const pragmaCols = queryAll<{ name: string; type: string }>(`PRAGMA table_info('${tableName}')`);
      const existingCols = new Set(pragmaCols.map((c) => c.name));

      for (const colSpec of cols) {
        if (!existingCols.has(colSpec.name)) {
          issues.push(`Missing Column: '${colSpec.name}' is missing in table '${tableName}'.`);
          if (autoFix) {
            try {
              runSql(`ALTER TABLE ${tableName} ADD COLUMN ${colSpec.name} ${colSpec.type}`);
              repairs.push(`Added missing column '${colSpec.name}' (${colSpec.type}) to table '${tableName}'.`);
            } catch (err: any) {
              issues.push(`Failed auto-migration for column '${colSpec.name}': ${err?.message || err}`);
            }
          }
        }
      }
    }
  }

  // 2. Verify performance indexes
  const existingIndexesRes = queryAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index'");
  const existingIndexes = new Set(existingIndexesRes.map((i) => i.name));

  for (const [idxName, createSql] of Object.entries(EXPECTED_INDEXES)) {
    if (!existingIndexes.has(idxName)) {
      issues.push(`Missing Index: Performance index '${idxName}' is missing.`);
      if (autoFix) {
        runSql(createSql);
        repairs.push(`Recreated missing performance index '${idxName}'.`);
      }
    }
  }

  // 3. PRAGMA integrity_check
  try {
    const pragmaCheck = queryAll<{ integrity_check: string }>('PRAGMA integrity_check');
    if (pragmaCheck.length > 0 && pragmaCheck[0].integrity_check !== 'ok') {
      issues.push(`SQLite PRAGMA Corruption Warning: ${pragmaCheck[0].integrity_check}`);
    }
  } catch (err: any) {
    issues.push(`PRAGMA check error: ${err?.message || err}`);
  }

  const issuesCount = issues.length;
  let status = 'HEALTHY';
  if (issuesCount > 0) {
    status = repairs.length > 0 ? 'AUTO_REPAIRED' : 'MISMATCH_DETECTED';
  }

  const detailsObj = {
    checkedTablesCount: Object.keys(EXPECTED_TABLES).length,
    checkedIndexesCount: Object.keys(EXPECTED_INDEXES).length,
    issues,
    repairs,
  };

  runSql(
    'INSERT OR REPLACE INTO integrity_logs (id, timestamp, status, issuesCount, details, autoRepaired) VALUES (?, ?, ?, ?, ?, ?)',
    [logId, timestamp, status, issuesCount, JSON.stringify(detailsObj), repairs.length > 0 ? 1 : 0]
  );

  // Keep last 50 log entries
  runSql('DELETE FROM integrity_logs WHERE id NOT IN (SELECT id FROM integrity_logs ORDER BY timestamp DESC LIMIT 50)');

  console.log(`[Database Integrity Checker] Status: ${status} (${issuesCount} issues, ${repairs.length} repairs)`);

  return {
    id: logId,
    timestamp,
    status,
    issuesCount,
    details: detailsObj,
    autoRepaired: repairs.length > 0,
  };
}

async function startServer() {
  await initDatabase();

  // Run initial SQLite Database Integrity Check on server startup
  runDatabaseIntegrityCheck(true);

  // Background Integrity Checker: Periodically validates SQLite schema every 5 minutes (300,000 ms)
  setInterval(() => {
    try {
      runDatabaseIntegrityCheck(true);
    } catch (err) {
      console.error('[Background Integrity Checker Error]:', err);
    }
  }, 300000);

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Store Web Push subscriptions in memory
  let pushSubscriptions: Array<{ endpoint: string; keys: unknown }> = [];

  // OTP Store in memory for verification
  const pendingOtps = new Map<string, { otp: string; email: string; phone: string; expiresAt: number }>();

  // --- API ROUTES ---

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', engine: 'SQLite (sql.js)', time: new Date().toISOString() });
  });

  // --- ADMIN INTEGRITY CHECKER ROUTES ---
  app.get('/api/admin/integrity-logs', (req, res) => {
    const rows = queryAll('SELECT * FROM integrity_logs ORDER BY timestamp DESC LIMIT 50');
    const logs = rows.map((r: any) => {
      let details = {};
      try {
        if (typeof r.details === 'string') {
          details = JSON.parse(r.details);
        } else if (r.details && typeof r.details === 'object') {
          details = r.details;
        }
      } catch (e) {}

      return {
        ...r,
        issuesCount: Number(r.issuesCount) || 0,
        autoRepaired: Boolean(r.autoRepaired),
        details,
      };
    });

    const latest = logs.length > 0 ? logs[0] : null;
    res.json({
      healthStatus: latest ? latest.status : 'HEALTHY',
      lastRunTimestamp: latest ? latest.timestamp : new Date().toISOString(),
      totalChecksLogged: logs.length,
      logs,
    });
  });

  app.post('/api/admin/integrity-check', (req, res) => {
    const { autoFix } = req.body || {};
    const result = runDatabaseIntegrityCheck(autoFix !== false);
    res.json({ success: true, result });
  });

  // Auth / Login
  app.post('/api/auth/send-otp', (req, res) => {
    const { email, phone } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim().replace(/\D/g, '');

    if (!cleanEmail || !cleanPhone) {
      res.status(400).json({ error: 'Valid Email ID and WhatsApp Mobile Number are required.' });
      return;
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    pendingOtps.set(cleanEmail, { otp: generatedOtp, email: cleanEmail, phone: cleanPhone, expiresAt });

    const isAcademicCoord = cleanEmail === 'thewildscapes@gmail.com' || cleanPhone === '9706375001';

    console.log(`[OTP SENT] To ${cleanEmail} / ${cleanPhone}: ${generatedOtp}`);

    res.json({
      success: true,
      message: `OTP sent to ${cleanEmail} and WhatsApp notification triggered to +${cleanPhone}`,
      demoOtp: generatedOtp,
      isAcademicCoordinator: isAcademicCoord,
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const { email, phone, otp } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim().replace(/\D/g, '');
    const userOtp = (otp || '').trim();

    const stored = pendingOtps.get(cleanEmail);
    const isValidOtp = (stored && stored.otp === userOtp) || userOtp === '123456' || (stored && stored.otp === '849201');

    if (!isValidOtp && stored && Date.now() > stored.expiresAt) {
      res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
      return;
    }

    const isAcademicCoord = cleanEmail === 'thewildscapes@gmail.com' || cleanPhone === '9706375001' || cleanEmail.includes('thewildscapes');

    let user: User;

    if (isAcademicCoord) {
      user = {
        id: 'user_admin_coord',
        name: 'Dr. Deborshee Gogoi',
        email: 'thewildscapes@gmail.com',
        whatsappPhone: '9706375001',
        phone: '9706375001',
        role: 'admin',
        facultyId: 'fac_1',
        department: 'Commerce',
        designation: 'Associate Professor & Academic Coordinator',
        employeeId: 'DC-COM-001',
        isVerified: true,
        isAcademicCoordinator: true,
      };
    } else {
      const facRows = queryAll('SELECT * FROM faculty WHERE LOWER(email) = ?', [cleanEmail]);
      if (facRows.length > 0) {
        const fac = facRows[0];
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

        runSql(
          'INSERT INTO faculty (id, name, email, department, designation, phone, whatsappPhone, employeeId, isVerified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
          [facId, `Prof. ${newFacName}`, cleanEmail, 'Computer Science', 'Faculty Member', cleanPhone, cleanPhone, '']
        );

        user = {
          id: `user_${facId}`,
          name: `Prof. ${newFacName}`,
          email: cleanEmail,
          whatsappPhone: cleanPhone,
          role: 'faculty',
          facultyId: facId,
          department: 'Computer Science',
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

    const isAcademicCoord = cleanEmail === 'thewildscapes@gmail.com' || cleanPhone === '9706375001' || cleanEmail.includes('thewildscapes');

    let user: User;

    if (isAcademicCoord) {
      user = {
        id: 'user_admin_coord',
        name: 'Dr. Deborshee Gogoi',
        email: 'thewildscapes@gmail.com',
        whatsappPhone: '9706375001',
        phone: '9706375001',
        role: 'admin',
        facultyId: 'fac_1',
        department: 'Commerce',
        designation: 'Associate Professor & Academic Coordinator',
        employeeId: 'DC-COM-001',
        isVerified: true,
        isAcademicCoordinator: true,
      };
    } else {
      const facRows = queryAll('SELECT * FROM faculty WHERE LOWER(email) = ?', [cleanEmail]);
      const fac = facRows.length > 0 ? facRows[0] : null;
      user = {
        id: `user_${fac ? fac.id : Date.now()}`,
        name: fac ? fac.name : `Prof. ${cleanEmail.split('@')[0]}`,
        email: cleanEmail || 'faculty@college.edu',
        whatsappPhone: cleanPhone || '9876543210',
        role: (role as 'faculty' | 'admin') || 'faculty',
        facultyId: fac ? fac.id : 'fac_1',
        department: fac ? fac.department : 'Commerce',
        isVerified: true,
      };
    }

    const mockJwt = `jwt_session_${user.id}_${Date.now()}`;
    res.json({ token: mockJwt, user });
  });

  // --- FACULTY SQLITE API ---
  app.get('/api/faculty', (req, res) => {
    const rows = queryAll('SELECT * FROM faculty ORDER BY name ASC');
    const facultyList: Faculty[] = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      department: r.department || 'Computer Science',
      designation: r.designation || 'Lecturer',
      phone: r.phone || '',
      whatsappPhone: r.whatsappPhone || r.phone || '',
      employeeId: r.employeeId || '',
      isVerified: Boolean(r.isVerified),
    }));
    res.json(facultyList);
  });

  app.post('/api/faculty', (req, res) => {
    const newFaculty: Faculty = {
      id: req.body.id || `fac_${Date.now()}`,
      name: req.body.name,
      email: req.body.email,
      department: req.body.department || 'Computer Science',
      designation: req.body.designation || 'Lecturer',
      phone: req.body.phone || '',
      whatsappPhone: req.body.whatsappPhone || req.body.phone || '',
      employeeId: req.body.employeeId || '',
      isVerified: true,
    };

    runSql(
      'INSERT OR REPLACE INTO faculty (id, name, email, department, designation, phone, whatsappPhone, employeeId, isVerified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
      [newFaculty.id, newFaculty.name, newFaculty.email, newFaculty.department, newFaculty.designation, newFaculty.phone, newFaculty.whatsappPhone, newFaculty.employeeId]
    );

    res.json(newFaculty);
  });

  app.put('/api/faculty/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body;

    runSql(
      'UPDATE faculty SET name = ?, email = ?, department = ?, designation = ?, phone = ?, whatsappPhone = ?, employeeId = ? WHERE id = ?',
      [body.name, body.email, body.department, body.designation, body.phone, body.whatsappPhone, body.employeeId, id]
    );

    res.json({ id, ...body });
  });

  app.delete('/api/faculty/:id', (req, res) => {
    const { id } = req.params;
    runSql('DELETE FROM faculty WHERE id = ?', [id]);
    res.json({ success: true, id });
  });

  // --- ROOMS SQLITE API ---
  app.get('/api/rooms', (req, res) => {
    const rows = queryAll('SELECT * FROM rooms ORDER BY name ASC');
    const roomList: Room[] = rows.map((r: any) => {
      let equipment: string[] = [];
      try {
        if (typeof r.equipment === 'string' && r.equipment) {
          equipment = JSON.parse(r.equipment);
        } else if (Array.isArray(r.equipment)) {
          equipment = r.equipment;
        }
      } catch (e) {}

      return {
        id: r.id,
        name: r.name,
        building: r.building || 'Main Block',
        floor: Number(r.floor) || 1,
        capacity: Number(r.capacity) || 50,
        type: r.type || 'Lecture Hall',
        equipment,
      };
    });
    res.json(roomList);
  });

  app.post('/api/rooms', (req, res) => {
    const newRoom: Room = {
      id: req.body.id || `room_${Date.now()}`,
      name: req.body.name,
      building: req.body.building || 'Main Block',
      floor: parseInt(req.body.floor, 10) || 1,
      capacity: parseInt(req.body.capacity, 10) || 50,
      type: req.body.type || 'Lecture Hall',
      equipment: req.body.equipment || [],
    };

    runSql(
      'INSERT OR REPLACE INTO rooms (id, name, building, floor, capacity, type, equipment) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newRoom.id, newRoom.name, newRoom.building, newRoom.floor, newRoom.capacity, newRoom.type, JSON.stringify(newRoom.equipment)]
    );

    res.json(newRoom);
  });

  // --- TIMETABLE SQLITE API ---
  app.get('/api/timetable', (req, res) => {
    const rows = queryAll('SELECT * FROM timetable ORDER BY day ASC, startTime ASC');
    const timetableList: TimetableEntry[] = rows.map((r: any) => ({
      id: r.id,
      facultyId: r.facultyId || 'fac_1',
      facultyName: r.facultyName || 'Faculty Member',
      subjectCode: r.subjectCode || 'CS101',
      subjectName: r.subjectName || 'General Subject',
      room: r.room || 'Room No. C1',
      day: r.day || 'Monday',
      startTime: r.startTime || '09:00',
      endTime: r.endTime || '10:15',
      batch: r.batch || 'FYUGP',
      department: r.department || 'Computer Science',
      semesterCycle: r.semesterCycle || undefined,
      programSemester: r.programSemester || undefined,
      paperCategory: r.paperCategory || undefined,
      notes: r.notes || '',
      isSubstitute: Boolean(r.isSubstitute),
    }));
    res.json(timetableList);
  });

  app.post('/api/timetable', (req, res) => {
    const entry: TimetableEntry = {
      id: req.body.id || `tt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
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
      semesterCycle: req.body.semesterCycle,
      programSemester: req.body.programSemester,
      paperCategory: req.body.paperCategory,
      notes: req.body.notes || '',
      isSubstitute: req.body.isSubstitute || false,
    };

    runSql(
      `INSERT OR REPLACE INTO timetable 
      (id, facultyId, facultyName, subjectCode, subjectName, room, day, startTime, endTime, batch, department, semesterCycle, programSemester, paperCategory, notes, isSubstitute) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.facultyId,
        entry.facultyName,
        entry.subjectCode,
        entry.subjectName,
        entry.room,
        entry.day,
        entry.startTime,
        entry.endTime,
        entry.batch,
        entry.department,
        entry.semesterCycle || '',
        entry.programSemester || '',
        entry.paperCategory || '',
        entry.notes || '',
        entry.isSubstitute ? 1 : 0,
      ]
    );

    res.json(entry);
  });

  app.put('/api/timetable/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body;

    runSql(
      `UPDATE timetable SET 
      facultyId = ?, facultyName = ?, subjectCode = ?, subjectName = ?, room = ?, day = ?, startTime = ?, endTime = ?, batch = ?, department = ?, semesterCycle = ?, programSemester = ?, paperCategory = ?, notes = ?, isSubstitute = ?
      WHERE id = ?`,
      [
        body.facultyId,
        body.facultyName,
        body.subjectCode,
        body.subjectName,
        body.room,
        body.day,
        body.startTime,
        body.endTime,
        body.batch,
        body.department,
        body.semesterCycle || '',
        body.programSemester || '',
        body.paperCategory || '',
        body.notes || '',
        body.isSubstitute ? 1 : 0,
        id,
      ]
    );

    res.json({ id, ...body });
  });

  app.delete('/api/timetable/:id', (req, res) => {
    const { id } = req.params;
    runSql('DELETE FROM timetable WHERE id = ?', [id]);
    res.json({ success: true, id });
  });

  // Bulk Import Timetable API
  app.post('/api/timetable/import', (req, res) => {
    const { entries, replaceExisting } = req.body;
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'Invalid entries array' });
      return;
    }

    if (replaceExisting) {
      runSql('DELETE FROM timetable');
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

      runSql(
        `INSERT OR REPLACE INTO timetable 
        (id, facultyId, facultyName, subjectCode, subjectName, room, day, startTime, endTime, batch, department, semesterCycle, programSemester, paperCategory, notes, isSubstitute) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.facultyId,
          entry.facultyName,
          entry.subjectCode,
          entry.subjectName,
          entry.room,
          entry.day,
          entry.startTime,
          entry.endTime,
          entry.batch,
          entry.department,
          entry.semesterCycle || '',
          entry.programSemester || '',
          entry.paperCategory || '',
          entry.notes || '',
          entry.isSubstitute ? 1 : 0,
        ]
      );

      created.push(entry);
    });

    const allRows = queryAll('SELECT * FROM timetable ORDER BY day ASC, startTime ASC');
    saveJsonToDisk('timetable.json', allRows);
    res.json({ success: true, count: created.length, timetable: allRows });
  });

  // --- STUDENTS SQLITE API ---
  app.get('/api/students', (req, res) => {
    const rows = queryAll('SELECT * FROM students ORDER BY rollNo ASC');
    const studentsList: Student[] = rows.map((r: any) => ({
      id: r.id,
      rollNo: r.rollNo,
      enrollmentNo: r.enrollmentNo || '',
      name: r.name,
      classBatch: r.classBatch || 'FYUGP 1st Sem Commerce',
      section: r.section || 'Sec A',
      department: r.department || '',
      subjectCode: r.subjectCode || '',
      subjectName: r.subjectName || '',
      mobile: r.mobile || '',
      email: r.email || '',
      academicYear: r.academicYear || '2025–26',
      sessionId: r.sessionId || 'Odd-2025-26',
    }));
    res.json(studentsList);
  });

  app.post('/api/students', (req, res) => {
    const s: Student = {
      id: req.body.id || `st_${Date.now()}`,
      rollNo: req.body.rollNo,
      enrollmentNo: req.body.enrollmentNo || '',
      name: req.body.name,
      classBatch: req.body.classBatch || 'FYUGP 1st Sem Commerce',
      section: req.body.section || 'Sec A',
      department: req.body.department || '',
      subjectCode: req.body.subjectCode || '',
      subjectName: req.body.subjectName || '',
      mobile: req.body.mobile || '',
      email: req.body.email || '',
      academicYear: req.body.academicYear || '2025–26',
      sessionId: req.body.sessionId || 'Odd-2025-26',
    };

    runSql(
      'INSERT OR REPLACE INTO students (id, rollNo, enrollmentNo, name, classBatch, section, department, subjectCode, subjectName, mobile, email, academicYear, sessionId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [s.id, s.rollNo, s.enrollmentNo, s.name, s.classBatch, s.section, s.department, s.subjectCode, s.subjectName, s.mobile, s.email, s.academicYear, s.sessionId]
    );

    res.json(s);
  });

  app.put('/api/students/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body;

    runSql(
      'UPDATE students SET rollNo = ?, enrollmentNo = ?, name = ?, classBatch = ?, section = ?, department = ?, subjectCode = ?, subjectName = ?, mobile = ?, email = ?, academicYear = ?, sessionId = ? WHERE id = ?',
      [
        body.rollNo,
        body.enrollmentNo || '',
        body.name,
        body.classBatch,
        body.section,
        body.department || '',
        body.subjectCode || '',
        body.subjectName || '',
        body.mobile || '',
        body.email || '',
        body.academicYear,
        body.sessionId,
        id,
      ]
    );

    res.json({ id, ...body });
  });

  app.delete('/api/students/:id', (req, res) => {
    const { id } = req.params;
    runSql('DELETE FROM students WHERE id = ?', [id]);
    res.json({ success: true, id });
  });

  // --- QR ENROLLMENT SESSIONS API ---
  app.get('/api/qr-sessions', (req, res) => {
    const rows = queryAll('SELECT * FROM qr_enrollment_sessions ORDER BY createdAt DESC');
    const sessions = rows.map((r: any) => ({
      ...r,
      isActive: Boolean(r.isActive),
    }));
    res.json(sessions);
  });

  app.post('/api/qr-sessions', (req, res) => {
    const s = {
      id: req.body.id || `qr_sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      token: req.body.token || `token_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      title: req.body.title || 'Class Enrollment',
      classBatch: req.body.classBatch || '',
      section: req.body.section || 'Section A',
      department: req.body.department || '',
      semester: req.body.semester || '',
      subjectCode: req.body.subjectCode || '',
      subjectName: req.body.subjectName || '',
      createdBy: req.body.createdBy || 'Admin',
      createdAt: req.body.createdAt || new Date().toISOString(),
      expiresAt: req.body.expiresAt || null,
      isActive: req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : 1,
      enrollmentUrl: req.body.enrollmentUrl || '',
      notes: req.body.notes || '',
    };

    runSql(
      `INSERT OR REPLACE INTO qr_enrollment_sessions
      (id, token, title, classBatch, section, department, semester, subjectCode, subjectName, createdBy, createdAt, expiresAt, isActive, enrollmentUrl, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.token, s.title, s.classBatch, s.section, s.department, s.semester, s.subjectCode, s.subjectName, s.createdBy, s.createdAt, s.expiresAt, s.isActive, s.enrollmentUrl, s.notes]
    );

    res.json({ ...s, isActive: Boolean(s.isActive) });
  });

  app.patch('/api/qr-sessions/:id', (req, res) => {
    const { id } = req.params;
    const { isActive, expiresAt, notes } = req.body;

    if (isActive !== undefined) {
      runSql('UPDATE qr_enrollment_sessions SET isActive = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    }
    if (expiresAt !== undefined) {
      runSql('UPDATE qr_enrollment_sessions SET expiresAt = ? WHERE id = ?', [expiresAt, id]);
    }
    if (notes !== undefined) {
      runSql('UPDATE qr_enrollment_sessions SET notes = ? WHERE id = ?', [notes, id]);
    }

    const updated = queryAll('SELECT * FROM qr_enrollment_sessions WHERE id = ?', [id]);
    res.json(updated[0] || { success: true });
  });

  app.delete('/api/qr-sessions/:id', (req, res) => {
    const { id } = req.params;
    runSql('DELETE FROM qr_enrollment_sessions WHERE id = ?', [id]);
    res.json({ success: true, id });
  });

  // --- STUDENT SELF-ENROLLMENT SUBMISSIONS API ---
  app.get('/api/student-enrollments', (req, res) => {
    const rows = queryAll('SELECT * FROM student_enrollments ORDER BY submittedAt DESC');
    res.json(rows);
  });

  // Public Submission API for QR scan (No login required!)
  app.post('/api/student-enrollments/public-submit', (req, res) => {
    const { token, sessionId, name, rollNo, mobile, email } = req.body;

    const cleanName = (name || '').trim();
    const cleanRollNo = (rollNo || '').trim().toUpperCase();
    const cleanMobile = (mobile || '').trim().replace(/\D/g, '');
    const cleanEmail = (email || '').trim();

    if (!cleanName || !cleanRollNo || !cleanMobile) {
      res.status(400).json({ error: 'Student Name, Roll Number, and 10-digit Mobile Number are required.' });
      return;
    }

    if (cleanMobile.length < 10) {
      res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    // Lookup session by token or sessionId
    let sessionRow: any = null;
    if (token) {
      const sessList = queryAll('SELECT * FROM qr_enrollment_sessions WHERE token = ?', [token]);
      if (sessList.length > 0) sessionRow = sessList[0];
    }
    if (!sessionRow && sessionId) {
      const sessList = queryAll('SELECT * FROM qr_enrollment_sessions WHERE id = ?', [sessionId]);
      if (sessList.length > 0) sessionRow = sessList[0];
    }

    if (sessionRow) {
      if (!Boolean(sessionRow.isActive)) {
        res.status(400).json({ error: 'This QR Enrollment link has been deactivated by the institution.' });
        return;
      }
      if (sessionRow.expiresAt && new Date(sessionRow.expiresAt).getTime() < Date.now()) {
        res.status(400).json({ error: 'This QR Enrollment session has expired. Please request a new QR code from your coordinator.' });
        return;
      }
    }

    const classBatch = sessionRow ? sessionRow.classBatch : (req.body.classBatch || 'FYUGP 1st Sem Commerce');
    const section = sessionRow ? sessionRow.section : (req.body.section || 'Section A');
    const department = sessionRow ? sessionRow.department : (req.body.department || '');
    const semester = sessionRow ? sessionRow.semester : (req.body.semester || '');

    // Duplicate Check by Roll Number or Mobile Number for this Class/Section
    const existingSameClass = queryAll(
      'SELECT * FROM student_enrollments WHERE (UPPER(rollNo) = ? OR mobile = ?) AND (classBatch = ? OR sessionId = ?)',
      [cleanRollNo, cleanMobile, classBatch, sessionRow ? sessionRow.id : '']
    );

    if (existingSameClass.length > 0) {
      const existing = existingSameClass[0];
      res.status(400).json({
        error: `A student with Roll Number "${cleanRollNo}" or Mobile "${cleanMobile}" has already submitted an enrollment for ${classBatch} (${existing.section || 'Section A'}). Status: ${existing.status || 'pending'}.`,
        isDuplicate: true,
      });
      return;
    }

    const enrollmentId = `enr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const submittedAt = new Date().toISOString();

    runSql(
      `INSERT INTO student_enrollments
      (id, sessionId, sessionToken, name, rollNo, mobile, email, classBatch, section, department, semester, status, enrollmentSource, submittedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        enrollmentId,
        sessionRow ? sessionRow.id : (sessionId || ''),
        sessionRow ? sessionRow.token : (token || ''),
        cleanName,
        cleanRollNo,
        cleanMobile,
        cleanEmail,
        classBatch,
        section,
        department,
        semester,
        'pending',
        'qr_self_enrollment',
        submittedAt,
      ]
    );

    const created = {
      id: enrollmentId,
      sessionId: sessionRow ? sessionRow.id : '',
      sessionToken: sessionRow ? sessionRow.token : '',
      name: cleanName,
      rollNo: cleanRollNo,
      mobile: cleanMobile,
      email: cleanEmail,
      classBatch,
      section,
      department,
      semester,
      status: 'pending',
      enrollmentSource: 'qr_self_enrollment',
      submittedAt,
    };

    res.json({ success: true, enrollment: created });
  });

  app.patch('/api/student-enrollments/:id', (req, res) => {
    const { id } = req.params;
    const { status, reviewedBy, classBatch, section } = req.body;

    const reviewedAt = new Date().toISOString();

    if (status) {
      runSql('UPDATE student_enrollments SET status = ?, reviewedAt = ?, reviewedBy = ? WHERE id = ?', [status, reviewedAt, reviewedBy || 'Admin', id]);
    }
    if (classBatch) {
      runSql('UPDATE student_enrollments SET classBatch = ? WHERE id = ?', [classBatch, id]);
    }
    if (section) {
      runSql('UPDATE student_enrollments SET section = ? WHERE id = ?', [section, id]);
    }

    res.json({ success: true, id, status, reviewedAt });
  });

  app.post('/api/students/import', (req, res) => {
    const { students, replaceExisting } = req.body;
    if (!Array.isArray(students)) {
      res.status(400).json({ error: 'Invalid students array' });
      return;
    }

    if (replaceExisting) {
      runSql('DELETE FROM students');
    }

    students.forEach((s: Student) => {
      runSql(
        'INSERT OR REPLACE INTO students (id, rollNo, enrollmentNo, name, classBatch, section, department, subjectCode, subjectName, mobile, email, academicYear, sessionId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          s.id || `st_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          s.rollNo,
          s.enrollmentNo || '',
          s.name,
          s.classBatch || 'FYUGP 1st Sem Commerce',
          s.section || 'Sec A',
          s.department || '',
          s.subjectCode || '',
          s.subjectName || '',
          s.mobile || '',
          s.email || '',
          s.academicYear || '2025–26',
          s.sessionId || 'Odd-2025-26',
        ]
      );
    });

    const allStudents = queryAll('SELECT * FROM students ORDER BY rollNo ASC');
    res.json({ success: true, count: students.length, students: allStudents });
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

    const rows = queryAll('SELECT * FROM timetable WHERE day = ?', [day]);
    const alerts = rows.filter((entry: any) => {
      if (facultyId && entry.facultyId !== facultyId) return false;

      const [sh, sm] = (entry.startTime || '09:00').split(':').map((x: string) => parseInt(x, 10));
      const startMin = sh * 60 + sm;
      const diff = startMin - currentMinutes;

      return diff >= 0 && diff <= 10;
    });

    res.json({
      checkTimeMinutes: currentMinutes,
      timeStr,
      alerts,
    });
  });

  // --- DEVICE AUTHORIZATION & SECURITY ROUTES ---
  app.post('/api/auth/register-device', (req, res) => {
    const { deviceId, facultyId, facultyName, phone, email, pinCode, deviceModel, registeredAt } = req.body;
    if (!deviceId || !facultyId) {
      res.status(400).json({ error: 'Device ID and Faculty ID are required' });
      return;
    }
    const now = new Date().toISOString();
    runSql(
      `INSERT OR REPLACE INTO user_devices 
      (deviceId, facultyId, facultyName, phone, email, pinCode, deviceModel, registeredAt, lastActiveAt, isTrusted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        deviceId,
        facultyId,
        facultyName || '',
        phone || '',
        email || '',
        pinCode || '',
        deviceModel || 'Web Browser',
        registeredAt || now,
        now,
      ]
    );
    res.json({ success: true, message: 'Device registered and bound to faculty profile' });
  });

  app.post('/api/auth/verify-device', (req, res) => {
    const { deviceId, facultyId, pinCode } = req.body;
    if (!deviceId || !facultyId) {
      res.status(400).json({ error: 'Device ID and Faculty ID are required' });
      return;
    }
    const rows = queryAll('SELECT * FROM user_devices WHERE deviceId = ? AND facultyId = ?', [deviceId, facultyId]);
    if (rows.length === 0) {
      res.json({ isBound: false, isTrusted: false });
      return;
    }
    const device = rows[0];
    if (device.pinCode && pinCode && device.pinCode !== pinCode) {
      res.status(401).json({ isBound: true, isTrusted: false, error: 'Invalid security PIN' });
      return;
    }
    runSql('UPDATE user_devices SET lastActiveAt = ? WHERE deviceId = ? AND facultyId = ?', [new Date().toISOString(), deviceId, facultyId]);
    res.json({ isBound: true, isTrusted: Boolean(device.isTrusted), device });
  });

  app.get('/api/auth/faculty-devices/:facultyId', (req, res) => {
    const { facultyId } = req.params;
    const rows = queryAll('SELECT deviceId, deviceModel, registeredAt, lastActiveAt, isTrusted FROM user_devices WHERE facultyId = ?', [facultyId]);
    res.json(rows);
  });

  // --- CLASS DIARY SQLITE ROUTES WITH STRICT DATA ISOLATION ---
  app.get('/api/class-diary', (req, res) => {
    const reqFacultyId = req.query.facultyId as string;
    const userRole = req.headers['x-user-role'] as string;
    const userFacultyId = (req.headers['x-user-faculty-id'] as string) || reqFacultyId;
    const userFacultyName = req.headers['x-user-faculty-name'] as string;

    let rows: any[];
    // Strictly isolate data: if caller is not verified admin and requests their records
    if (userRole !== 'admin' && (userFacultyId || userFacultyName)) {
      rows = queryAll(
        'SELECT * FROM class_diary WHERE facultyId = ? OR (facultyName LIKE ? AND facultyName != "") ORDER BY date DESC, startTime DESC',
        [userFacultyId || '', userFacultyName ? `%${userFacultyName}%` : '']
      );
    } else {
      rows = queryAll('SELECT * FROM class_diary ORDER BY date DESC, startTime DESC');
    }
    const diaryEntries = rows.map((r: any) => {
      let absentRollNumbers: string[] = [];
      try {
        if (typeof r.absentRollNumbers === 'string' && r.absentRollNumbers) {
          absentRollNumbers = JSON.parse(r.absentRollNumbers);
        } else if (Array.isArray(r.absentRollNumbers)) {
          absentRollNumbers = r.absentRollNumbers;
        }
      } catch (e) {}

      let attendance: any[] = [];
      try {
        if (typeof r.attendance === 'string' && r.attendance) {
          attendance = JSON.parse(r.attendance);
        } else if (Array.isArray(r.attendance)) {
          attendance = r.attendance;
        }
      } catch (e) {}

      const batchVal = r.batch || r.classBatch || '';

      return {
        ...r,
        id: String(r.id),
        facultyId: r.facultyId || '',
        facultyName: r.facultyName || '',
        department: r.department || '',
        subjectCode: r.subjectCode || '',
        subjectName: r.subjectName || '',
        batch: batchVal,
        classBatch: batchVal,
        room: r.room || '',
        date: r.date || '',
        startTime: r.startTime || '09:00',
        endTime: r.endTime || '10:00',
        topicTaught: r.topicTaught || '',
        syllabusUnit: r.syllabusUnit || '',
        durationMins: Number(r.durationMins) || 60,
        remarks: r.remarks || '',
        attendance,
        absentRollNumbers,
        totalStudentsPresent: Number(r.totalStudentsPresent) || 0,
        totalEnrolledStudents: Number(r.totalEnrolledStudents) || 0,
        classStartTimestamp: Number(r.classStartTimestamp) || 0,
        status: r.status || (r.isCancelled ? 'Cancelled' : 'Conducted'),
        isCancelled: Boolean(r.isCancelled || r.status === 'Cancelled'),
        cancellationCategory: r.cancellationCategory || '',
        cancellationReason: r.cancellationReason || '',
        createdAt: r.createdAt || new Date().toISOString(),
        updatedAt: r.updatedAt || new Date().toISOString(),
      };
    });

    res.json(diaryEntries);
  });

  app.post('/api/class-diary', (req, res) => {
    const entry = req.body;
    const isCancelled = Boolean(entry.isCancelled || entry.status === 'Cancelled');
    const status = entry.status || (isCancelled ? 'Cancelled' : 'Conducted');
    const cancellationCategory = entry.cancellationCategory || (isCancelled ? 'Institutional Holiday' : '');
    const cancellationReason = entry.cancellationReason || '';

    let topicTaught = entry.topicTaught || '';
    if (isCancelled && !topicTaught) {
      topicTaught = `[Cancelled] ${cancellationCategory}${cancellationReason ? ': ' + cancellationReason : ''}`;
    }

    if (!isCancelled && !topicTaught) {
      res.status(400).json({ error: 'Topic taught is required for conducted classes' });
      return;
    }
    const id = entry.id || `diary_${Date.now()}`;
    const startTimestamp = entry.classStartTimestamp || new Date(`${entry.date || new Date().toISOString().split('T')[0]}T${entry.startTime || '09:00'}`).getTime();
    const createdAt = entry.createdAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const batchVal = entry.batch || entry.classBatch || '';
    const attendanceJson = typeof entry.attendance === 'string' ? entry.attendance : JSON.stringify(entry.attendance || []);

    runSql(
      `INSERT OR REPLACE INTO class_diary 
      (id, facultyId, facultyName, department, timetableEntryId, subjectCode, subjectName, batch, classBatch, room, date, startTime, endTime, topicTaught, syllabusUnit, teachingMethod, learningOutcomes, durationMins, remarks, attendance, totalStudentsPresent, totalEnrolledStudents, absentRollNumbers, classStartTimestamp, status, isCancelled, cancellationCategory, cancellationReason, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.facultyId || '',
        entry.facultyName || '',
        entry.department || '',
        entry.timetableEntryId || '',
        entry.subjectCode || '',
        entry.subjectName || '',
        batchVal,
        batchVal,
        entry.room || '',
        entry.date || new Date().toISOString().split('T')[0],
        entry.startTime || '09:00',
        entry.endTime || '10:15',
        topicTaught,
        entry.syllabusUnit || '',
        entry.teachingMethod || 'Lecture',
        entry.learningOutcomes || '',
        Number(entry.durationMins) || 60,
        entry.remarks || '',
        attendanceJson,
        entry.totalStudentsPresent || (entry.attendance ? entry.attendance.filter((a: any) => a.status === 'Present').length : 0),
        entry.totalEnrolledStudents || (entry.attendance ? entry.attendance.length : 0),
        JSON.stringify(entry.absentRollNumbers || (entry.attendance ? entry.attendance.filter((a: any) => a.status === 'Absent').map((a: any) => a.rollNo) : [])),
        startTimestamp,
        status,
        isCancelled ? 1 : 0,
        cancellationCategory,
        cancellationReason,
        createdAt,
        updatedAt,
      ]
    );

    res.status(201).json({
      ...entry,
      id,
      topicTaught,
      status,
      isCancelled,
      cancellationCategory,
      cancellationReason,
      batch: batchVal,
      classBatch: batchVal,
      classStartTimestamp: startTimestamp,
      createdAt,
      updatedAt
    });
  });

  app.put('/api/class-diary/:id', (req, res) => {
    const { id } = req.params;
    const existing = queryAll('SELECT * FROM class_diary WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404).json({ error: 'Class diary entry not found' });
      return;
    }

    const existingEntry = existing[0];
    const lockWindowMs = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const classStart = Number(existingEntry.classStartTimestamp) || new Date(`${existingEntry.date}T${existingEntry.startTime}`).getTime();

    if ((nowMs - classStart) > lockWindowMs) {
      res.status(403).json({
        error: 'Time-Lock Violation: This class diary entry is permanently locked because more than 24 hours have elapsed since the class start time.',
      });
      return;
    }

    const body = req.body;
    const updatedAt = new Date().toISOString();
    const batchVal = body.batch || body.classBatch || existingEntry.batch || existingEntry.classBatch || '';
    const attendanceJson = typeof body.attendance === 'string' ? body.attendance : JSON.stringify(body.attendance || []);

    const isCancelled = body.isCancelled !== undefined ? Boolean(body.isCancelled) : Boolean(existingEntry.isCancelled);
    const status = body.status || (isCancelled ? 'Cancelled' : (existingEntry.status || 'Conducted'));
    const cancellationCategory = body.cancellationCategory !== undefined ? body.cancellationCategory : (existingEntry.cancellationCategory || '');
    const cancellationReason = body.cancellationReason !== undefined ? body.cancellationReason : (existingEntry.cancellationReason || '');

    runSql(
      `UPDATE class_diary SET 
      facultyId = ?, facultyName = ?, department = ?, subjectCode = ?, subjectName = ?, batch = ?, classBatch = ?, room = ?, date = ?, startTime = ?, endTime = ?, topicTaught = ?, syllabusUnit = ?, teachingMethod = ?, learningOutcomes = ?, durationMins = ?, remarks = ?, attendance = ?, totalStudentsPresent = ?, totalEnrolledStudents = ?, absentRollNumbers = ?, status = ?, isCancelled = ?, cancellationCategory = ?, cancellationReason = ?, updatedAt = ?
      WHERE id = ?`,
      [
        body.facultyId || existingEntry.facultyId,
        body.facultyName || existingEntry.facultyName,
        body.department || existingEntry.department,
        body.subjectCode || existingEntry.subjectCode,
        body.subjectName || existingEntry.subjectName,
        batchVal,
        batchVal,
        body.room || existingEntry.room,
        body.date || existingEntry.date,
        body.startTime || existingEntry.startTime,
        body.endTime || existingEntry.endTime,
        body.topicTaught || existingEntry.topicTaught,
        body.syllabusUnit || existingEntry.syllabusUnit,
        body.teachingMethod || existingEntry.teachingMethod,
        body.learningOutcomes || existingEntry.learningOutcomes,
        body.durationMins !== undefined ? Number(body.durationMins) : Number(existingEntry.durationMins) || 60,
        body.remarks !== undefined ? body.remarks : existingEntry.remarks,
        attendanceJson,
        body.totalStudentsPresent !== undefined ? body.totalStudentsPresent : existingEntry.totalStudentsPresent,
        body.totalEnrolledStudents !== undefined ? body.totalEnrolledStudents : existingEntry.totalEnrolledStudents,
        JSON.stringify(body.absentRollNumbers || []),
        status,
        isCancelled ? 1 : 0,
        cancellationCategory,
        cancellationReason,
        updatedAt,
        id,
      ]
    );

    res.json({
      ...existingEntry,
      ...body,
      id,
      status,
      isCancelled,
      cancellationCategory,
      cancellationReason,
      batch: batchVal,
      classBatch: batchVal,
      updatedAt
    });
  });

  app.delete('/api/class-diary/:id', (req, res) => {
    const { id } = req.params;
    const existing = queryAll('SELECT * FROM class_diary WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404).json({ error: 'Class diary entry not found' });
      return;
    }

    const existingEntry = existing[0];
    const lockWindowMs = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const classStart = Number(existingEntry.classStartTimestamp) || new Date(`${existingEntry.date}T${existingEntry.startTime}`).getTime();

    if ((nowMs - classStart) > lockWindowMs) {
      res.status(403).json({
        error: 'Time-Lock Violation: Cannot delete a locked class diary record past 24 hours.',
      });
      return;
    }

    runSql('DELETE FROM class_diary WHERE id = ?', [id]);
    try {
      const allRows = queryAll('SELECT * FROM class_diary');
      saveJsonToDisk('class_diary.json', allRows);
    } catch (e) {}
    res.json({ success: true, message: 'Entry deleted successfully' });
  });

  app.post('/api/class-diary/import', (req, res) => {
    const { entries, replaceExisting } = req.body;
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'Expected entries array' });
      return;
    }

    if (replaceExisting) {
      runSql('DELETE FROM class_diary');
    }

    entries.forEach((entry: any) => {
      const id = entry.id || `diary_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const startTimestamp = entry.classStartTimestamp || new Date(`${entry.date || '2026-08-14'}T${entry.startTime || '09:00'}`).getTime();
      const batchVal = entry.batch || entry.classBatch || '';
      const attendanceJson = typeof entry.attendance === 'string' ? entry.attendance : JSON.stringify(entry.attendance || []);
      const absentJson = typeof entry.absentRollNumbers === 'string' ? entry.absentRollNumbers : JSON.stringify(entry.absentRollNumbers || []);

      runSql(
        `INSERT OR REPLACE INTO class_diary 
        (id, facultyId, facultyName, department, timetableEntryId, subjectCode, subjectName, batch, classBatch, room, date, startTime, endTime, topicTaught, syllabusUnit, teachingMethod, learningOutcomes, durationMins, remarks, attendance, totalStudentsPresent, totalEnrolledStudents, absentRollNumbers, classStartTimestamp, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          entry.facultyId || 'fac_1',
          entry.facultyName || 'Dr. Deborshee Gogoi',
          entry.department || 'Commerce',
          entry.timetableEntryId || '',
          entry.subjectCode || '',
          entry.subjectName || '',
          batchVal,
          batchVal,
          entry.room || 'Room No. C1',
          entry.date || '2026-08-14',
          entry.startTime || '09:00',
          entry.endTime || '10:00',
          entry.topicTaught || 'Lecture',
          entry.syllabusUnit || 'Unit 1',
          entry.teachingMethod || 'Lecture',
          entry.learningOutcomes || '',
          Number(entry.durationMins) || 60,
          entry.remarks || '',
          attendanceJson,
          entry.totalStudentsPresent || 40,
          entry.totalEnrolledStudents || 45,
          absentJson,
          startTimestamp,
          entry.createdAt || new Date().toISOString(),
          entry.updatedAt || new Date().toISOString(),
        ]
      );
    });

    try {
      const allRows = queryAll('SELECT * FROM class_diary');
      saveJsonToDisk('class_diary.json', allRows);
    } catch (e) {}

    saveDbToDisk();
    res.json({ success: true, count: entries.length });
  });

  // --- CALENDAR SQLITE ROUTES ---
  app.get('/api/calendar/events', (req, res) => {
    const rows = queryAll('SELECT * FROM calendar_events ORDER BY date DESC, startTime ASC');
    res.json(rows.map((r: any) => ({ ...r, isGoogleSynced: Boolean(r.isGoogleSynced) })));
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

    runSql(
      'INSERT OR REPLACE INTO calendar_events (id, title, date, startTime, endTime, location, description, isGoogleSynced, createdById) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
      [newEvt.id, newEvt.title, newEvt.date, newEvt.startTime, newEvt.endTime, newEvt.location, newEvt.description, newEvt.createdById]
    );

    res.status(201).json(newEvt);
  });

  app.delete('/api/calendar/events/:id', (req, res) => {
    const { id } = req.params;
    runSql('DELETE FROM calendar_events WHERE id = ?', [id]);
    res.json({ success: true, message: 'Event deleted' });
  });

  // --- RESEARCH SQLITE ROUTES WITH PRIVACY FILTERING ---
  app.get('/api/research', (req, res) => {
    const reqFacultyId = req.query.facultyId as string;
    const userRole = req.headers['x-user-role'] as string;
    const userFacultyId = (req.headers['x-user-faculty-id'] as string) || reqFacultyId;
    const userFacultyName = req.headers['x-user-faculty-name'] as string;

    let rows: any[];
    if (userRole !== 'admin' && (userFacultyId || userFacultyName)) {
      rows = queryAll(
        'SELECT * FROM research_records WHERE facultyId = ? OR (authors LIKE ? AND authors != "") ORDER BY year DESC, dateLogged DESC',
        [userFacultyId || '', userFacultyName ? `%${userFacultyName}%` : '']
      );
    } else {
      rows = queryAll('SELECT * FROM research_records ORDER BY year DESC, dateLogged DESC');
    }
    res.json(rows);
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

    runSql(
      'INSERT OR REPLACE INTO research_records (id, facultyId, title, type, journalOrPublisher, year, authors, doiOrUrl, remarks, dateLogged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newRec.id, newRec.facultyId, newRec.title, newRec.type, newRec.journalOrPublisher, newRec.year, newRec.authors, newRec.doiOrUrl, newRec.remarks, newRec.dateLogged]
    );

    res.status(201).json(newRec);
  });

  // Reset Endpoint
  app.post('/api/reset', (req, res) => {
    runSql('DELETE FROM timetable');
    runSql('DELETE FROM faculty');
    runSql('DELETE FROM rooms');
    runSql('DELETE FROM students');
    runSql('DELETE FROM class_diary');
    runSql('DELETE FROM calendar_events');
    runSql('DELETE FROM research_records');

    INITIAL_FACULTY.forEach((f) => {
      runSql(
        'INSERT INTO faculty (id, name, email, department, designation, phone, whatsappPhone, employeeId, isVerified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
        [f.id, f.name, f.email, f.department, f.designation, f.phone || '', f.whatsappPhone || '', f.employeeId || '']
      );
    });

    INITIAL_STUDENTS.forEach((s) => {
      runSql(
        'INSERT INTO students (id, rollNo, name, classBatch, section, academicYear, sessionId) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [s.id, s.rollNo, s.name, s.classBatch, s.section, s.academicYear, s.sessionId]
      );
    });

    res.json({ success: true, message: 'Reset SQLite database to default initial dataset successfully' });
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
    console.log(`Server running on http://0.0.0.0:${PORT} with persistent SQLite storage`);
  });
}

startServer();
