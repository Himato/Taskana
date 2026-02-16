import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalculationMethod, Coordinates, PrayerTimes, CalculationParameters } from 'adhan';
import { format, startOfDay } from 'date-fns';

import { IslamicTimeSlot } from '../common/types/islamic-time-slot';

/**
 * Prayer times for a single day.
 */
export interface DailyPrayerTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
  date: string;
}

/**
 * Service for calculating Islamic prayer times.
 * Uses the adhan library with configurable calculation methods.
 */
@Injectable()
export class PrayerTimeService implements OnModuleInit {
  private readonly logger = new Logger(PrayerTimeService.name);

  private readonly coordinates: Coordinates;
  private readonly calcParams: CalculationParameters;
  private readonly beforeSlotOffsetMinutes: number;

  /** Cache of prayer times by date string (YYYY-MM-DD) */
  private cache: Map<string, DailyPrayerTimes> = new Map();

  constructor(private readonly configService: ConfigService) {
    const latitude = this.configService.get<number>('location.latitude', 30.7865);
    const longitude = this.configService.get<number>('location.longitude', 31.0004);
    const method = this.configService.get<string>('location.calcMethod', 'egyptian');

    this.coordinates = new Coordinates(latitude, longitude);
    this.calcParams = this.getCalculationParams(method);
    this.beforeSlotOffsetMinutes = 30; // Default: 30 minutes before
  }

  async onModuleInit() {
    // Log today's prayer times at startup
    const times = this.getTodayTimes();
    this.logger.log(
      `Prayer times for today (${times.date}): ` +
        `Fajr: ${format(times.fajr, 'HH:mm')}, ` +
        `Sunrise: ${format(times.sunrise, 'HH:mm')}, ` +
        `Dhuhr: ${format(times.dhuhr, 'HH:mm')}, ` +
        `Asr: ${format(times.asr, 'HH:mm')}, ` +
        `Maghrib: ${format(times.maghrib, 'HH:mm')}, ` +
        `Isha: ${format(times.isha, 'HH:mm')}`,
    );
  }

  /**
   * Get prayer times for today.
   */
  getTodayTimes(): DailyPrayerTimes {
    return this.getTimesForDate(new Date());
  }

  /**
   * Get prayer times for a specific date.
   */
  getTimesForDate(date: Date): DailyPrayerTimes {
    const dateStr = format(date, 'yyyy-MM-dd');

    // Check cache
    if (this.cache.has(dateStr)) {
      return this.cache.get(dateStr)!;
    }

    // Calculate prayer times
    const prayerTimes = new PrayerTimes(this.coordinates, date, this.calcParams);

    const times: DailyPrayerTimes = {
      fajr: prayerTimes.fajr,
      sunrise: prayerTimes.sunrise,
      dhuhr: prayerTimes.dhuhr,
      asr: prayerTimes.asr,
      maghrib: prayerTimes.maghrib,
      isha: prayerTimes.isha,
      date: dateStr,
    };

    this.cache.set(dateStr, times);
    return times;
  }

  /**
   * Get the time for a specific Islamic time slot.
   * "before_X" slots are offset by beforeSlotOffsetMinutes.
   */
  getSlotTime(slot: IslamicTimeSlot, date: Date = new Date()): Date {
    const times = this.getTimesForDate(date);

    const slotMap: Record<IslamicTimeSlot, Date> = {
      after_fajr: times.fajr,
      before_dhuhr: this.subtractMinutes(times.dhuhr, this.beforeSlotOffsetMinutes),
      after_dhuhr: times.dhuhr,
      before_asr: this.subtractMinutes(times.asr, this.beforeSlotOffsetMinutes),
      after_asr: times.asr,
      before_maghrib: this.subtractMinutes(times.maghrib, this.beforeSlotOffsetMinutes),
      after_maghrib: times.maghrib,
      before_isha: this.subtractMinutes(times.isha, this.beforeSlotOffsetMinutes),
      after_isha: times.isha,
    };

    return slotMap[slot];
  }

  /**
   * Get the current Islamic time slot based on the current time.
   */
  getCurrentSlot(now: Date = new Date()): IslamicTimeSlot {
    const times = this.getTimesForDate(now);
    const currentTime = now.getTime();

    // Define slot boundaries in order
    const boundaries: { slot: IslamicTimeSlot; start: Date; end: Date }[] = [
      {
        slot: 'after_fajr',
        start: times.fajr,
        end: this.subtractMinutes(times.dhuhr, this.beforeSlotOffsetMinutes),
      },
      {
        slot: 'before_dhuhr',
        start: this.subtractMinutes(times.dhuhr, this.beforeSlotOffsetMinutes),
        end: times.dhuhr,
      },
      {
        slot: 'after_dhuhr',
        start: times.dhuhr,
        end: this.subtractMinutes(times.asr, this.beforeSlotOffsetMinutes),
      },
      {
        slot: 'before_asr',
        start: this.subtractMinutes(times.asr, this.beforeSlotOffsetMinutes),
        end: times.asr,
      },
      {
        slot: 'after_asr',
        start: times.asr,
        end: this.subtractMinutes(times.maghrib, this.beforeSlotOffsetMinutes),
      },
      {
        slot: 'before_maghrib',
        start: this.subtractMinutes(times.maghrib, this.beforeSlotOffsetMinutes),
        end: times.maghrib,
      },
      {
        slot: 'after_maghrib',
        start: times.maghrib,
        end: this.subtractMinutes(times.isha, this.beforeSlotOffsetMinutes),
      },
      {
        slot: 'before_isha',
        start: this.subtractMinutes(times.isha, this.beforeSlotOffsetMinutes),
        end: times.isha,
      },
      { slot: 'after_isha', start: times.isha, end: this.addDays(startOfDay(now), 1) },
    ];

    for (const boundary of boundaries) {
      if (currentTime >= boundary.start.getTime() && currentTime < boundary.end.getTime()) {
        return boundary.slot;
      }
    }

    // Before Fajr (night time) - consider it as after_isha from previous day
    return 'after_isha';
  }

  /**
   * Get the slot end time (when the next slot begins).
   */
  getSlotEndTime(slot: IslamicTimeSlot, date: Date = new Date()): Date {
    const times = this.getTimesForDate(date);

    const endMap: Record<IslamicTimeSlot, Date> = {
      after_fajr: this.subtractMinutes(times.dhuhr, this.beforeSlotOffsetMinutes),
      before_dhuhr: times.dhuhr,
      after_dhuhr: this.subtractMinutes(times.asr, this.beforeSlotOffsetMinutes),
      before_asr: times.asr,
      after_asr: this.subtractMinutes(times.maghrib, this.beforeSlotOffsetMinutes),
      before_maghrib: times.maghrib,
      after_maghrib: this.subtractMinutes(times.isha, this.beforeSlotOffsetMinutes),
      before_isha: times.isha,
      after_isha: this.getTimesForDate(this.addDays(date, 1)).fajr,
    };

    return endMap[slot];
  }

  /**
   * Clear the cache (useful for testing).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get calculation parameters based on method name.
   */
  private getCalculationParams(method: string): CalculationParameters {
    const methodMap: Record<string, CalculationParameters> = {
      egyptian: CalculationMethod.Egyptian(),
      muslim_world_league: CalculationMethod.MuslimWorldLeague(),
      isna: CalculationMethod.NorthAmerica(),
      umm_al_qura: CalculationMethod.UmmAlQura(),
      dubai: CalculationMethod.Dubai(),
      qatar: CalculationMethod.Qatar(),
      kuwait: CalculationMethod.Kuwait(),
      singapore: CalculationMethod.Singapore(),
      tehran: CalculationMethod.Tehran(),
      turkey: CalculationMethod.Turkey(),
    };

    return methodMap[method.toLowerCase()] ?? CalculationMethod.Egyptian();
  }

  private subtractMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() - minutes * 60 * 1000);
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }
}
