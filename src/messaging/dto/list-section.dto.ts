/**
 * A row in a list section.
 */
export interface ListRow {
  /** Internal ID returned on selection */
  id: string;
  /** Display title (max 24 chars) */
  title: string;
  /** Optional description (max 72 chars) */
  description?: string;
}

/**
 * A section in a list message.
 */
export interface ListSection {
  /** Section title */
  title: string;
  /** Rows in this section */
  rows: ListRow[];
}
