export const ASSISTANT_CHIP_IDS = [
  'suggestTheme',
  'pickTheme',
  'suggestLook',
  'themeFromPhoto',
  'remindMe',
  'myNotes',
  'timedStatus',
  'scheduleMessage',
  'whatCanYouDo',
] as const;

export type AssistantChipId = (typeof ASSISTANT_CHIP_IDS)[number];
