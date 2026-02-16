import { Module } from '@nestjs/common';

import { PrayerTimeService } from './prayer-time.service';

/**
 * Prayer Time Module
 *
 * Calculates daily prayer times for the configured location using the adhan library.
 */
@Module({
  imports: [],
  providers: [PrayerTimeService],
  exports: [PrayerTimeService],
})
export class PrayerTimeModule {}
