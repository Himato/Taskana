import { Module } from '@nestjs/common';

import { PersistenceModule } from '../persistence/persistence.module';

import { TaskService } from './task.service';

/**
 * Task Module
 *
 * Manages ad-hoc and recurring tasks, including CRUD and shifting operations.
 */
@Module({
  imports: [PersistenceModule],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
