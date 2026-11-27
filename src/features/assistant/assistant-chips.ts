export const ASSISTANT_CHIP_IDS = [
  'whatCanYouDo',
  'suggestTheme',
  'pickTheme',
  'suggestLook',
  'themeFromPhoto',
  'remindMe',
  'myNotes',
  'timedStatus',
  'scheduleMessage',
] as const;

export type AssistantChipId = (typeof ASSISTANT_CHIP_IDS)[number];
