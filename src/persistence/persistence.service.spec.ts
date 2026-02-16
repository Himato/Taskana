import * as fs from 'fs/promises';
import * as path from 'path';

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { DailyLog } from './daily-log.schema';
import { PersistenceService } from './persistence.service';

describe('PersistenceService', () => {
  let service: PersistenceService;
  let tempDir: string;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: string) => {
      if (key === 'paths.days') {
        return tempDir;
      }
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    // Create temp directory for test data
    tempDir = path.join(process.cwd(), 'test-days-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [PersistenceService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<PersistenceService>(PersistenceService);
  });

  afterEach(async () => {
    service.clearCache();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadDay', () => {
    it('should create new daily log if file does not exist', async () => {
      const log = await service.loadDay('2025-01-15');

      expect(log.date).toBe('2025-01-15');
      expect(log.habits).toEqual([]);
      expect(log.tasks).toEqual([]);
      expect(log.nextTaskId).toBe(1);
    });

    it('should load existing daily log from file', async () => {
      const existingLog: DailyLog = {
        date: '2025-01-15',
        habits: [
          {
            habitId: 'quran',
            status: 'done',
            justification: null,
            completedAt: '2025-01-15T06:30:00Z',
            images: [],
          },
        ],
        tasks: [],
        nextTaskId: 1,
      };

      await fs.writeFile(path.join(tempDir, '2025-01-15.json'), JSON.stringify(existingLog));

      const log = await service.loadDay('2025-01-15');
      expect(log.habits).toHaveLength(1);
      expect(log.habits[0].habitId).toBe('quran');
      expect(log.habits[0].status).toBe('done');
    });

    it('should cache loaded logs', async () => {
      await service.loadDay('2025-01-15');
      await service.loadDay('2025-01-15'); // Should use cache

      // Verify only one file write (for creation)
      const files = await fs.readdir(tempDir);
      expect(files).toHaveLength(1);
    });
  });

  describe('saveDay', () => {
    it('should save daily log to file', async () => {
      const log: DailyLog = {
        date: '2025-01-16',
        habits: [],
        tasks: [],
        nextTaskId: 1,
      };

      await service.saveDay('2025-01-16', log);

      const content = await fs.readFile(path.join(tempDir, '2025-01-16.json'), 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.date).toBe('2025-01-16');
    });
  });

  describe('updateHabitStatus', () => {
    it('should create new habit entry if not exists', async () => {
      const entry = await service.updateHabitStatus('2025-01-15', 'quran', 'pending');

      expect(entry.habitId).toBe('quran');
      expect(entry.status).toBe('pending');
    });

    it('should update existing habit status', async () => {
      await service.updateHabitStatus('2025-01-15', 'quran', 'pending');
      const entry = await service.updateHabitStatus('2025-01-15', 'quran', 'done');

      expect(entry.status).toBe('done');
      expect(entry.completedAt).toBeTruthy();
    });

    it('should set completedAt when marked done', async () => {
      const entry = await service.updateHabitStatus('2025-01-15', 'quran', 'done');

      expect(entry.completedAt).toBeTruthy();
      expect(new Date(entry.completedAt!).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should set justification when skipped', async () => {
      const entry = await service.updateHabitStatus(
        '2025-01-15',
        'quran',
        'skipped',
        'Feeling unwell',
      );

      expect(entry.status).toBe('skipped');
      expect(entry.justification).toBe('Feeling unwell');
    });
  });

  describe('addTask', () => {
    it('should add new task with auto-generated id', async () => {
      const task = await service.addTask('2025-01-15', {
        title: 'Review PRs',
        islamicTimeSlot: 'before_dhuhr',
      });

      expect(task.id).toBe('t-001');
      expect(task.title).toBe('Review PRs');
      expect(task.status).toBe('pending');
      expect(task.createdAt).toBeTruthy();
    });

    it('should increment task id for each new task', async () => {
      const task1 = await service.addTask('2025-01-15', {
        title: 'Task 1',
        islamicTimeSlot: 'before_dhuhr',
      });
      const task2 = await service.addTask('2025-01-15', {
        title: 'Task 2',
        islamicTimeSlot: 'after_dhuhr',
      });

      expect(task1.id).toBe('t-001');
      expect(task2.id).toBe('t-002');
    });

    it('should store optional fields', async () => {
      const task = await service.addTask('2025-01-15', {
        title: 'Detailed task',
        description: 'With description',
        islamicTimeSlot: 'after_fajr',
        origin: '2025-01-14',
        shiftedTo: undefined,
        shiftReason: undefined,
      });

      expect(task.description).toBe('With description');
      expect(task.origin).toBe('2025-01-14');
    });
  });

  describe('updateTask', () => {
    beforeEach(async () => {
      await service.addTask('2025-01-15', {
        title: 'Test task',
        islamicTimeSlot: 'before_dhuhr',
      });
    });

    it('should update task fields', async () => {
      const updated = await service.updateTask('2025-01-15', 't-001', {
        title: 'Updated title',
      });

      expect(updated?.title).toBe('Updated title');
    });

    it('should set completedAt when marked done', async () => {
      const updated = await service.updateTask('2025-01-15', 't-001', {
        status: 'done',
      });

      expect(updated?.status).toBe('done');
      expect(updated?.completedAt).toBeTruthy();
    });

    it('should return null for non-existent task', async () => {
      const result = await service.updateTask('2025-01-15', 't-999', {
        title: 'No such task',
      });

      expect(result).toBeNull();
    });
  });

  describe('getTask', () => {
    beforeEach(async () => {
      await service.addTask('2025-01-15', {
        title: 'Test task',
        islamicTimeSlot: 'before_dhuhr',
      });
    });

    it('should return task by id', async () => {
      const task = await service.getTask('2025-01-15', 't-001');
      expect(task?.title).toBe('Test task');
    });

    it('should return null for non-existent task', async () => {
      const task = await service.getTask('2025-01-15', 't-999');
      expect(task).toBeNull();
    });
  });

  describe('getTasksBySlot', () => {
    beforeEach(async () => {
      await service.addTask('2025-01-15', {
        title: 'Morning task',
        islamicTimeSlot: 'after_fajr',
      });
      await service.addTask('2025-01-15', {
        title: 'Midday task',
        islamicTimeSlot: 'before_dhuhr',
      });
      await service.addTask('2025-01-15', {
        title: 'Another morning task',
        islamicTimeSlot: 'after_fajr',
      });
    });

    it('should group tasks by slot', async () => {
      const grouped = await service.getTasksBySlot('2025-01-15');

      expect(grouped.get('after_fajr')).toHaveLength(2);
      expect(grouped.get('before_dhuhr')).toHaveLength(1);
    });
  });

  describe('getHabitEntry', () => {
    it('should return habit entry if exists', async () => {
      await service.updateHabitStatus('2025-01-15', 'quran', 'done');

      const entry = await service.getHabitEntry('2025-01-15', 'quran');
      expect(entry?.habitId).toBe('quran');
      expect(entry?.status).toBe('done');
    });

    it('should return null if habit entry not exists', async () => {
      await service.loadDay('2025-01-15');

      const entry = await service.getHabitEntry('2025-01-15', 'unknown');
      expect(entry).toBeNull();
    });
  });

  describe('addImage', () => {
    it('should add image to habit entry', async () => {
      await service.updateHabitStatus('2025-01-15', 'quran', 'done');

      const result = await service.addImage(
        '2025-01-15',
        'habit',
        'quran',
        '/images/quran-page.jpg',
      );

      expect(result).toBe(true);

      const entry = await service.getHabitEntry('2025-01-15', 'quran');
      expect(entry?.images).toContain('/images/quran-page.jpg');
    });

    it('should add image to task', async () => {
      await service.addTask('2025-01-15', {
        title: 'Test task',
        islamicTimeSlot: 'before_dhuhr',
      });

      const result = await service.addImage(
        '2025-01-15',
        'task',
        't-001',
        '/images/task-proof.jpg',
      );

      expect(result).toBe(true);

      const task = await service.getTask('2025-01-15', 't-001');
      expect(task?.images).toContain('/images/task-proof.jpg');
    });

    it('should return false for non-existent habit', async () => {
      await service.loadDay('2025-01-15');

      const result = await service.addImage('2025-01-15', 'habit', 'unknown', '/images/test.jpg');

      expect(result).toBe(false);
    });

    it('should return false for non-existent task', async () => {
      await service.loadDay('2025-01-15');

      const result = await service.addImage('2025-01-15', 'task', 't-999', '/images/test.jpg');

      expect(result).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear the internal cache', async () => {
      await service.loadDay('2025-01-15');
      service.clearCache();

      // Modify the file directly
      const modifiedLog: DailyLog = {
        date: '2025-01-15',
        habits: [
          {
            habitId: 'modified',
            status: 'done',
            justification: null,
            completedAt: null,
            images: [],
          },
        ],
        tasks: [],
        nextTaskId: 1,
      };
      await fs.writeFile(path.join(tempDir, '2025-01-15.json'), JSON.stringify(modifiedLog));

      // After clearing cache, should load from file again
      const log = await service.loadDay('2025-01-15');
      expect(log.habits).toHaveLength(1);
      expect(log.habits[0].habitId).toBe('modified');
    });
  });
});
