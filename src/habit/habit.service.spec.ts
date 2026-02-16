import * as fs from 'fs/promises';
import * as path from 'path';

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { Habit } from './habit.schema';
import { HabitService } from './habit.service';

describe('HabitService', () => {
  let service: HabitService;
  let tempDir: string;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: string) => {
      if (key === 'paths.habits') {
        return tempDir;
      }
      return defaultValue;
    }),
  };

  const sampleHabit: Habit = {
    id: 'test-habit',
    name: 'Test Habit',
    description: 'A test habit',
    schedule: {
      days: ['mon', 'wed', 'fri'],
      islamicTimeSlot: 'after_fajr',
      durationMinutes: 30,
    },
    reminders: {
      atStart: true,
      beforeEnd: true,
      beforeEndMinutes: 5,
    },
    requiresJustification: true,
  };

  const dailyHabit: Habit = {
    id: 'daily-habit',
    name: 'Daily Habit',
    schedule: {
      days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      islamicTimeSlot: 'after_maghrib',
      durationMinutes: 15,
    },
    reminders: {
      atStart: true,
      beforeEnd: false,
      beforeEndMinutes: 5,
    },
    requiresJustification: false,
  };

  beforeEach(async () => {
    // Create temp directory for test habits
    tempDir = path.join(process.cwd(), 'test-habits-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [HabitService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<HabitService>(HabitService);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadAll', () => {
    it('should return empty array when no habits exist', async () => {
      const habits = await service.loadAll();
      expect(habits).toEqual([]);
    });

    it('should load valid habit files', async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));

      const habits = await service.loadAll();
      expect(habits).toHaveLength(1);
      expect(habits[0].id).toBe('test-habit');
      expect(habits[0].name).toBe('Test Habit');
    });

    it('should load multiple habit files', async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));
      await fs.writeFile(path.join(tempDir, 'daily-habit.json'), JSON.stringify(dailyHabit));

      const habits = await service.loadAll();
      expect(habits).toHaveLength(2);
    });

    it('should skip non-json files', async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));
      await fs.writeFile(path.join(tempDir, 'readme.txt'), 'Not a habit');

      const habits = await service.loadAll();
      expect(habits).toHaveLength(1);
    });

    it('should throw on invalid habit file', async () => {
      await fs.writeFile(
        path.join(tempDir, 'invalid.json'),
        JSON.stringify({ id: 'no-name' }), // Missing required fields
      );

      await expect(service.loadAll()).rejects.toThrow('Invalid habit definition');
    });
  });

  describe('getAll', () => {
    it('should return all loaded habits', async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));
      await fs.writeFile(path.join(tempDir, 'daily-habit.json'), JSON.stringify(dailyHabit));

      await service.loadAll();
      const habits = service.getAll();
      expect(habits).toHaveLength(2);
    });
  });

  describe('getById', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));
      await service.loadAll();
    });

    it('should return habit by id', () => {
      const habit = service.getById('test-habit');
      expect(habit).toBeDefined();
      expect(habit?.name).toBe('Test Habit');
    });

    it('should return undefined for unknown id', () => {
      const habit = service.getById('unknown');
      expect(habit).toBeUndefined();
    });
  });

  describe('getByTimeSlot', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));
      await fs.writeFile(path.join(tempDir, 'daily-habit.json'), JSON.stringify(dailyHabit));
      await service.loadAll();
    });

    it('should return habits for a specific time slot', () => {
      const fajrHabits = service.getByTimeSlot('after_fajr');
      expect(fajrHabits).toHaveLength(1);
      expect(fajrHabits[0].id).toBe('test-habit');
    });

    it('should return empty array for slot with no habits', () => {
      const asrHabits = service.getByTimeSlot('after_asr');
      expect(asrHabits).toHaveLength(0);
    });
  });

  describe('getForDay', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));
      await fs.writeFile(path.join(tempDir, 'daily-habit.json'), JSON.stringify(dailyHabit));
      await service.loadAll();
    });

    it('should return habits for a specific day', () => {
      const mondayHabits = service.getForDay('mon');
      expect(mondayHabits).toHaveLength(2);
    });

    it('should filter habits not scheduled for that day', () => {
      const tuesdayHabits = service.getForDay('tue');
      expect(tuesdayHabits).toHaveLength(1);
      expect(tuesdayHabits[0].id).toBe('daily-habit');
    });
  });

  describe('getForDayAndSlot', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));
      await fs.writeFile(path.join(tempDir, 'daily-habit.json'), JSON.stringify(dailyHabit));
      await service.loadAll();
    });

    it('should return habits for specific day and slot', () => {
      const habits = service.getForDayAndSlot('mon', 'after_fajr');
      expect(habits).toHaveLength(1);
      expect(habits[0].id).toBe('test-habit');
    });

    it('should return empty when no match', () => {
      const habits = service.getForDayAndSlot('tue', 'after_fajr');
      expect(habits).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('should return 0 when no habits loaded', () => {
      expect(service.count()).toBe(0);
    });

    it('should return correct count after loading', async () => {
      await fs.writeFile(path.join(tempDir, 'test-habit.json'), JSON.stringify(sampleHabit));
      await fs.writeFile(path.join(tempDir, 'daily-habit.json'), JSON.stringify(dailyHabit));
      await service.loadAll();

      expect(service.count()).toBe(2);
    });
  });
});
