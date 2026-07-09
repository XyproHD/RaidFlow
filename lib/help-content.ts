export const FIRST_STEPS_GUEST_CHAPTER_ID = 'first-steps-guest';

export type HelpScreenshotStep = {
  file: string;
  titleKey: `step${1 | 2 | 3 | 4 | 5 | 6}Title`;
  textKey: `step${1 | 2 | 3 | 4 | 5 | 6}Text`;
};

export const FIRST_STEPS_GUEST_SCREENSHOTS: HelpScreenshotStep[] = [
  { file: '01_LoginwithDiscord.png', titleKey: 'step1Title', textKey: 'step1Text' },
  { file: '02_authorize.png', titleKey: 'step2Title', textKey: 'step2Text' },
  { file: '03_1_Add_Character.png', titleKey: 'step3Title', textKey: 'step3Text' },
  { file: '04_1_SelectWoWServer.png', titleKey: 'step4Title', textKey: 'step4Text' },
  { file: '04_1_SelectCharAndSync.png', titleKey: 'step5Title', textKey: 'step5Text' },
  { file: '04_3_SlectClassandspecs.png', titleKey: 'step6Title', textKey: 'step6Text' },
];

export const HELP_SCREENSHOT_BASE = '/help/first-steps-guest';
