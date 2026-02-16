import { Module } from '@nestjs/common';

import { PersistenceService } from './persistence.service';

/**
 * Persistence Module
 *
 * Handles reading/writing daily JSON log files for habits and tasks.
 */
@Module({
  imports: [],
  providers: [PersistenceService],
  exports: [PersistenceService],
})
export class PersistenceModule {}
