/**
 * Arabic user-facing message strings.
 * All WhatsApp messages should reference strings from this file.
 */
export const AR = {
  // Habit reminders
  HABIT_REMINDER_START: (name: string) =>
    `🕌 حان وقت *${name}*!\nرد بـ ✅ لما تخلص أو ❌ لو معملتش`,
  HABIT_REMINDER_END: (name: string, mins: number) =>
    `⏳ *${name}* هيخلص بعد ${mins} دقيقة. عملته؟`,
  HABIT_DONE: (name: string) => `✅ تم تسجيل *${name}* كمكتمل`,
  HABIT_SKIPPED: (name: string) => `⏭️ تم تخطي *${name}*`,
  HABIT_ASK_JUSTIFICATION: 'ممكن تقولي ليه متعملتش؟',

  // Task operations
  TASK_CREATED: (title: string) => `✅ تم إضافة مهمة: "${title}"`,
  TASK_COMPLETED: (title: string) => `✅ تم إنهاء مهمة: "${title}"`,
  TASK_SHIFTED: (title: string, date: string) => `✅ تم نقل "${title}" لـ ${date}`,
  TASK_DELETED: (title: string) => `🗑️ تم حذف مهمة: "${title}"`,
  TASK_ASK_SHIFT_DATE: 'لأي يوم تحب تنقل المهمة؟',
  TASK_SHIFT_INVALID_DATE: 'مينفعش تنقل لتاريخ فات. اختار تاريخ جاي.',

  // Image tagging
  IMAGE_ASK_TAG: 'الصورة دي تخص أي عادة أو مهمة من اللي فاتوا؟ رد بالرقم:',
  IMAGE_TAGGED: 'تم ربط الصورة بنجاح ✅',
  IMAGE_NO_ITEMS: 'مفيش عادات أو مهام النهارده. الصورة اتحفظت.',

  // Conversation
  GREETING: 'أهلاً! 👋 أنا تسكانا، مساعدك لتتبع العادات والمهام. كيف أقدر أساعدك؟',
  HELP: `ممكن تقولي:
• *مهامي* — عرض ملخص اليوم
• *ضيف مهمة [اسم المهمة]* — إضافة مهمة جديدة
• *خلصت [رقم]* — تسجيل مهمة كمكتملة
• *نقل [رقم] لـ [يوم]* — تأجيل مهمة
• أو ابعت صورة لربطها بعادة أو مهمة`,
  UNKNOWN_INTENT: 'مش فاهم قصدك. ممكن تقول: مهامي، ضيف مهمة، خلصت، أو ابعت صورة.',
  CONFIRMATION_PROMPT: (action: string) => `فهمت إنك عايز ${action}. صح؟`,

  // Errors
  ERROR_GENERIC: 'عذراً، حدث خطأ. حاول مرة أخرى.',
  TRANSCRIPTION_FAILED: 'لم أتمكن من فهم الرسالة الصوتية. حاول تاني أو ابعت نص.',

  // Time slots (Arabic names)
  TIME_SLOT_AFTER_FAJR: 'بعد الفجر',
  TIME_SLOT_BEFORE_DHUHR: 'قبل الظهر',
  TIME_SLOT_AFTER_DHUHR: 'بعد الظهر',
  TIME_SLOT_BEFORE_ASR: 'قبل العصر',
  TIME_SLOT_AFTER_ASR: 'بعد العصر',
  TIME_SLOT_BEFORE_MAGHRIB: 'قبل المغرب',
  TIME_SLOT_AFTER_MAGHRIB: 'بعد المغرب',
  TIME_SLOT_BEFORE_ISHA: 'قبل العشاء',
  TIME_SLOT_AFTER_ISHA: 'بعد العشاء',

  // Status emojis
  STATUS_DONE: '✅',
  STATUS_PENDING: '⬜',
  STATUS_SKIPPED: '⏭️',
  STATUS_SHIFTED: '➡️',
} as const;
