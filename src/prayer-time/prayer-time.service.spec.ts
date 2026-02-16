import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrayerTimeService } from './prayer-time.service';

describe('PrayerTimeService', () => {
  let service: PrayerTimeService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: unknown) => {
      const config: Record<string, unknown> = {
        'location.latitude': 30.0444, // Cairo
        'location.longitude': 31.2357,
        'location.calcMethod': 'egyptian',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrayerTimeService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<PrayerTimeService>(PrayerTimeService);
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('getTodayTimes', () => {
    it('should return prayer times for today', () => {
      const times = service.getTodayTimes();

      expect(times).toHaveProperty('fajr');
      expect(times).toHaveProperty('sunrise');
      expect(times).toHaveProperty('dhuhr');
      expect(times).toHaveProperty('asr');
      expect(times).toHaveProperty('maghrib');
      expect(times).toHaveProperty('isha');
      expect(times).toHaveProperty('date');

      // All should be Date objects
      expect(times.fajr).toBeInstanceOf(Date);
      expect(times.sunrise).toBeInstanceOf(Date);
      expect(times.dhuhr).toBeInstanceOf(Date);
      expect(times.asr).toBeInstanceOf(Date);
      expect(times.maghrib).toBeInstanceOf(Date);
      expect(times.isha).toBeInstanceOf(Date);
    });

    it('should return times in correct chronological order', () => {
      const times = service.getTodayTimes();

      expect(times.fajr.getTime()).toBeLessThan(times.sunrise.getTime());
      expect(times.sunrise.getTime()).toBeLessThan(times.dhuhr.getTime());
      expect(times.dhuhr.getTime()).toBeLessThan(times.asr.getTime());
      expect(times.asr.getTime()).toBeLessThan(times.maghrib.getTime());
      expect(times.maghrib.getTime()).toBeLessThan(times.isha.getTime());
    });
  });

  describe('getTimesForDate', () => {
    it('should return prayer times for a specific date', () => {
      const date = new Date('2025-06-15');
      const times = service.getTimesForDate(date);

      expect(times.date).toBe('2025-06-15');
      expect(times.fajr).toBeInstanceOf(Date);
    });

    it('should cache results', () => {
      const date = new Date('2025-06-15');

      const times1 = service.getTimesForDate(date);
      const times2 = service.getTimesForDate(date);

      expect(times1).toBe(times2); // Same object reference
    });

    it('should calculate different times for different dates', () => {
      const date1 = new Date('2025-06-15'); // Summer
      const date2 = new Date('2025-12-15'); // Winter

      const times1 = service.getTimesForDate(date1);
      const times2 = service.getTimesForDate(date2);

      // Fajr in summer is earlier than in winter (in Egypt)
      expect(times1.fajr.getHours()).not.toBe(times2.fajr.getHours());
    });
  });

  describe('getSlotTime', () => {
    const testDate = new Date('2025-03-15');

    it('should return fajr time for after_fajr slot', () => {
      const times = service.getTimesForDate(testDate);
      const slotTime = service.getSlotTime('after_fajr', testDate);

      expect(slotTime.getTime()).toBe(times.fajr.getTime());
    });

    it('should return dhuhr time for after_dhuhr slot', () => {
      const times = service.getTimesForDate(testDate);
      const slotTime = service.getSlotTime('after_dhuhr', testDate);

      expect(slotTime.getTime()).toBe(times.dhuhr.getTime());
    });

    it('should return 30 minutes before dhuhr for before_dhuhr slot', () => {
      const times = service.getTimesForDate(testDate);
      const slotTime = service.getSlotTime('before_dhuhr', testDate);

      const expectedTime = times.dhuhr.getTime() - 30 * 60 * 1000;
      expect(slotTime.getTime()).toBe(expectedTime);
    });

    it('should return 30 minutes before asr for before_asr slot', () => {
      const times = service.getTimesForDate(testDate);
      const slotTime = service.getSlotTime('before_asr', testDate);

      const expectedTime = times.asr.getTime() - 30 * 60 * 1000;
      expect(slotTime.getTime()).toBe(expectedTime);
    });

    it('should return 30 minutes before maghrib for before_maghrib slot', () => {
      const times = service.getTimesForDate(testDate);
      const slotTime = service.getSlotTime('before_maghrib', testDate);

      const expectedTime = times.maghrib.getTime() - 30 * 60 * 1000;
      expect(slotTime.getTime()).toBe(expectedTime);
    });

    it('should return 30 minutes before isha for before_isha slot', () => {
      const times = service.getTimesForDate(testDate);
      const slotTime = service.getSlotTime('before_isha', testDate);

      const expectedTime = times.isha.getTime() - 30 * 60 * 1000;
      expect(slotTime.getTime()).toBe(expectedTime);
    });
  });

  describe('getCurrentSlot', () => {
    it('should return after_fajr when time is after fajr but before before_dhuhr', () => {
      const testDate = new Date('2025-03-15');
      const times = service.getTimesForDate(testDate);

      // Set time to 1 hour after fajr
      const now = new Date(times.fajr.getTime() + 60 * 60 * 1000);
      const slot = service.getCurrentSlot(now);

      expect(slot).toBe('after_fajr');
    });

    it('should return before_dhuhr when time is 30 minutes before dhuhr', () => {
      const testDate = new Date('2025-03-15');
      const times = service.getTimesForDate(testDate);

      // Set time to 20 minutes before dhuhr
      const now = new Date(times.dhuhr.getTime() - 20 * 60 * 1000);
      const slot = service.getCurrentSlot(now);

      expect(slot).toBe('before_dhuhr');
    });

    it('should return after_dhuhr when time is after dhuhr but before before_asr', () => {
      const testDate = new Date('2025-03-15');
      const times = service.getTimesForDate(testDate);

      // Set time to 1 hour after dhuhr
      const now = new Date(times.dhuhr.getTime() + 60 * 60 * 1000);
      const slot = service.getCurrentSlot(now);

      expect(slot).toBe('after_dhuhr');
    });

    it('should return after_isha when time is after isha', () => {
      const testDate = new Date('2025-03-15');
      const times = service.getTimesForDate(testDate);

      // Set time to 1 hour after isha
      const now = new Date(times.isha.getTime() + 60 * 60 * 1000);
      const slot = service.getCurrentSlot(now);

      expect(slot).toBe('after_isha');
    });

    it('should return after_isha when time is before fajr (night)', () => {
      const testDate = new Date('2025-03-15');
      const times = service.getTimesForDate(testDate);

      // Set time to 1 hour before fajr
      const now = new Date(times.fajr.getTime() - 60 * 60 * 1000);
      const slot = service.getCurrentSlot(now);

      expect(slot).toBe('after_isha');
    });
  });

  describe('getSlotEndTime', () => {
    const testDate = new Date('2025-03-15');

    it('should return before_dhuhr start time as end of after_fajr', () => {
      const times = service.getTimesForDate(testDate);
      const endTime = service.getSlotEndTime('after_fajr', testDate);

      const expectedEnd = times.dhuhr.getTime() - 30 * 60 * 1000;
      expect(endTime.getTime()).toBe(expectedEnd);
    });

    it('should return dhuhr time as end of before_dhuhr', () => {
      const times = service.getTimesForDate(testDate);
      const endTime = service.getSlotEndTime('before_dhuhr', testDate);

      expect(endTime.getTime()).toBe(times.dhuhr.getTime());
    });
  });

  describe('calculation methods', () => {
    it('should support Egyptian calculation method', () => {
      const times = service.getTodayTimes();
      expect(times).toBeDefined();
    });

    // Note: Other calculation methods are tested implicitly through the constructor
  });

  describe('clearCache', () => {
    it('should clear cached prayer times', () => {
      const date = new Date('2025-06-15');

      const times1 = service.getTimesForDate(date);
      service.clearCache();
      const times2 = service.getTimesForDate(date);

      // After clearing cache, should be a different object
      expect(times1).not.toBe(times2);
      // But values should be the same
      expect(times1.fajr.getTime()).toBe(times2.fajr.getTime());
    });
  });
});
