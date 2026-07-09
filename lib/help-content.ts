export const FIRST_STEPS_CHAPTER_ID = 'first-steps-guest';
/** @deprecated Alias für bestehende Anker-URLs */
export const FIRST_STEPS_GUEST_CHAPTER_ID = FIRST_STEPS_CHAPTER_ID;

export const BOT_SETUP_CHAPTER_ID = 'bot-setup';
export const RAID_SIGNUP_CHAPTER_ID = 'raid-signup';
export const RAIDLEADER_TODO_CHAPTER_ID = 'raidleader-todo';
export const GUILDMASTER_TODO_CHAPTER_ID = 'guildmaster-todo';

export type HelpChapterId =
  | typeof FIRST_STEPS_CHAPTER_ID
  | typeof BOT_SETUP_CHAPTER_ID
  | typeof RAID_SIGNUP_CHAPTER_ID
  | typeof RAIDLEADER_TODO_CHAPTER_ID
  | typeof GUILDMASTER_TODO_CHAPTER_ID;

export type HelpCategoryId = 'setup' | 'guest-member' | 'raidleader' | 'guildmaster';

export type HelpChapterMeta = {
  id: HelpChapterId;
  titleKey:
    | 'firstStepsTitle'
    | 'botSetupTitle'
    | 'raidSignupTitle'
    | 'raidleaderTodoTitle'
    | 'guildmasterTodoTitle';
};

export type HelpCategoryMeta = {
  id: HelpCategoryId;
  titleKey:
    | 'categorySetup'
    | 'categoryGuestMember'
    | 'categoryRaidleader'
    | 'categoryGuildmaster';
  chapters: HelpChapterMeta[];
};

export const HELP_CATEGORIES: HelpCategoryMeta[] = [
  {
    id: 'setup',
    titleKey: 'categorySetup',
    chapters: [{ id: BOT_SETUP_CHAPTER_ID, titleKey: 'botSetupTitle' }],
  },
  {
    id: 'guest-member',
    titleKey: 'categoryGuestMember',
    chapters: [
      { id: FIRST_STEPS_CHAPTER_ID, titleKey: 'firstStepsTitle' },
      { id: RAID_SIGNUP_CHAPTER_ID, titleKey: 'raidSignupTitle' },
    ],
  },
  {
    id: 'raidleader',
    titleKey: 'categoryRaidleader',
    chapters: [{ id: RAIDLEADER_TODO_CHAPTER_ID, titleKey: 'raidleaderTodoTitle' }],
  },
  {
    id: 'guildmaster',
    titleKey: 'categoryGuildmaster',
    chapters: [{ id: GUILDMASTER_TODO_CHAPTER_ID, titleKey: 'guildmasterTodoTitle' }],
  },
];

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
