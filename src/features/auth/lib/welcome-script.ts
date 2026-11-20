export type WelcomeBubbleKind = 'incoming' | 'outgoing' | 'typing' | 'reaction';
export type WelcomeAvatar = 'ghost' | 'cat' | 'rocket';
export type WelcomeSide = 'left' | 'right';
export type WelcomeBand = 'top' | 'bottom';
export type WelcomeLineGroup =
  | 'coffee'
  | 'reserved'
  | 'when'
  | 'location'
  | 'arrived'
  | 'onMyWay'
  | 'pickAvatar'
  | 'goCat'
  | 'letsTalk'
  | 'arrivedHappy'
  | 'backSoFast'
  | 'imBack'
  | 'goodToSee'
  | 'longTime';
export type WelcomeSceneId = 'choose' | 'register' | 'login';
export type WelcomeLineIndex = 0 | 1 | 2;
export type WelcomeLineKey = `auth.welcome.bubbles.${WelcomeLineGroup}.${WelcomeLineIndex}`;

export interface WelcomeBubbleSpec {
  id: string;
  side: WelcomeSide;
  kind: WelcomeBubbleKind;
  avatar?: WelcomeAvatar;
  lineKeys: readonly WelcomeLineKey[];
  x: number;
  y: number;
  float: number;
  compact?: { band: WelcomeBand; align: WelcomeSide; y: number };
}

export type WelcomeBubblePhase = 'hidden' | 'typing' | 'shown';

export interface WelcomeBubbleState {
  phase: WelcomeBubblePhase;
  line: number;
  sends: number;
}

export interface WelcomeConversationState {
  bubbles: Record<string, WelcomeBubbleState>;
  reactions: number;
}

export interface WelcomeTimingOptions {
  startMs: number;
  stepMs: number;
  typingMs: number;
}

export interface WelcomeEntranceStep {
  id: string;
  appearAt: number;
  revealAt: number;
}

function lineKeysFor(group: WelcomeLineGroup): WelcomeLineKey[] {
  return [`auth.welcome.bubbles.${group}.0`, `auth.welcome.bubbles.${group}.1`, `auth.welcome.bubbles.${group}.2`];
}

export const WELCOME_REACTION_MIN = 3;
export const WELCOME_REACTION_MAX = 9;

export const WELCOME_BUBBLES: readonly WelcomeBubbleSpec[] = [
  {
    id: 'coffee',
    side: 'left',
    kind: 'incoming',
    avatar: 'ghost',
    lineKeys: lineKeysFor('coffee'),
    x: 0.06,
    y: 0.22,
    float: 0,
    compact: { band: 'top', align: 'left', y: 0.28 },
  },
  {
    id: 'reserved',
    side: 'right',
    kind: 'outgoing',
    lineKeys: lineKeysFor('reserved'),
    x: 0.12,
    y: 0.19,
    float: 1,
  },
  {
    id: 'when',
    side: 'left',
    kind: 'outgoing',
    lineKeys: lineKeysFor('when'),
    x: 0.5,
    y: 0.3,
    float: 2,
    compact: { band: 'top', align: 'right', y: 0.68 },
  },
  {
    id: 'location',
    side: 'right',
    kind: 'incoming',
    avatar: 'rocket',
    lineKeys: lineKeysFor('location'),
    x: 0.2,
    y: 0.28,
    float: 3,
  },
  {
    id: 'typing',
    side: 'left',
    kind: 'typing',
    avatar: 'cat',
    lineKeys: [],
    x: 0.06,
    y: 0.39,
    float: 4,
  },
  {
    id: 'reaction',
    side: 'right',
    kind: 'reaction',
    lineKeys: [],
    x: 0.31,
    y: 0.36,
    float: 5,
  },
  {
    id: 'arrived',
    side: 'left',
    kind: 'incoming',
    avatar: 'cat',
    lineKeys: lineKeysFor('arrived'),
    x: 0.2,
    y: 0.74,
    float: 6,
    compact: { band: 'bottom', align: 'left', y: 0.3 },
  },
  {
    id: 'onMyWay',
    side: 'right',
    kind: 'outgoing',
    lineKeys: lineKeysFor('onMyWay'),
    x: 0.42,
    y: 0.74,
    float: 7,
    compact: { band: 'bottom', align: 'right', y: 0.7 },
  },
];

export const WELCOME_LIVE_ORDER: readonly string[] = ['reaction', 'coffee', 'when', 'reaction', 'location', 'reserved', 'arrived', 'reaction', 'onMyWay'];

export const REGISTER_BUBBLES: readonly WelcomeBubbleSpec[] = [
  {
    id: 'pickAvatar',
    side: 'left',
    kind: 'incoming',
    avatar: 'ghost',
    lineKeys: lineKeysFor('pickAvatar'),
    x: 0.08,
    y: 0.2,
    float: 0,
    compact: { band: 'top', align: 'left', y: 0.3 },
  },
  {
    id: 'goCat',
    side: 'left',
    kind: 'outgoing',
    lineKeys: lineKeysFor('goCat'),
    x: 0.3,
    y: 0.29,
    float: 2,
    compact: { band: 'top', align: 'right', y: 0.7 },
  },
  {
    id: 'letsTalk',
    side: 'right',
    kind: 'outgoing',
    lineKeys: lineKeysFor('letsTalk'),
    x: 0.03,
    y: 0.64,
    float: 1,
    compact: { band: 'bottom', align: 'right', y: 0.3 },
  },
  {
    id: 'arrivedHappy',
    side: 'right',
    kind: 'incoming',
    avatar: 'rocket',
    lineKeys: lineKeysFor('arrivedHappy'),
    x: 0.08,
    y: 0.74,
    float: 3,
    compact: { band: 'bottom', align: 'left', y: 0.7 },
  },
];

export const LOGIN_BUBBLES: readonly WelcomeBubbleSpec[] = [
  {
    id: 'backSoFast',
    side: 'left',
    kind: 'incoming',
    avatar: 'ghost',
    lineKeys: lineKeysFor('backSoFast'),
    x: 0.06,
    y: 0.26,
    float: 0,
    compact: { band: 'top', align: 'left', y: 0.3 },
  },
  {
    id: 'imBack',
    side: 'left',
    kind: 'outgoing',
    lineKeys: lineKeysFor('imBack'),
    x: 0.26,
    y: 0.35,
    float: 2,
    compact: { band: 'top', align: 'right', y: 0.7 },
  },
  {
    id: 'goodToSee',
    side: 'right',
    kind: 'outgoing',
    lineKeys: lineKeysFor('goodToSee'),
    x: 0.04,
    y: 0.62,
    float: 1,
    compact: { band: 'bottom', align: 'right', y: 0.3 },
  },
  {
    id: 'longTime',
    side: 'right',
    kind: 'incoming',
    avatar: 'cat',
    lineKeys: lineKeysFor('longTime'),
    x: 0.08,
    y: 0.72,
    float: 3,
    compact: { band: 'bottom', align: 'left', y: 0.7 },
  },
];

export interface WelcomeScene {
  bubbles: readonly WelcomeBubbleSpec[];
  liveOrder: readonly string[];
}

export const WELCOME_SCENES: Record<WelcomeSceneId, WelcomeScene> = {
  choose: { bubbles: WELCOME_BUBBLES, liveOrder: WELCOME_LIVE_ORDER },
  register: { bubbles: REGISTER_BUBBLES, liveOrder: ['pickAvatar', 'goCat', 'arrivedHappy', 'letsTalk'] },
  login: { bubbles: LOGIN_BUBBLES, liveOrder: ['backSoFast', 'imBack', 'longTime', 'goodToSee'] },
};

export function initialConversation(specs: readonly WelcomeBubbleSpec[], revealed: boolean): WelcomeConversationState {
  const bubbles: Record<string, WelcomeBubbleState> = {};
  for (const spec of specs) {
    bubbles[spec.id] = { phase: revealed ? (spec.kind === 'typing' ? 'typing' : 'shown') : 'hidden', line: 0, sends: 0 };
  }
  return { bubbles, reactions: WELCOME_REACTION_MIN };
}

export function entranceSchedule(specs: readonly WelcomeBubbleSpec[], { startMs, stepMs, typingMs }: WelcomeTimingOptions): WelcomeEntranceStep[] {
  return specs.map((spec, index) => {
    const appearAt = startMs + index * stepMs;
    const revealAt = spec.kind === 'incoming' ? appearAt + typingMs : appearAt;
    return { id: spec.id, appearAt, revealAt };
  });
}

export function nextReactionCount(current: number): number {
  return current >= WELCOME_REACTION_MAX ? WELCOME_REACTION_MIN : current + 1;
}

export function nextLine(spec: WelcomeBubbleSpec, current: number): number {
  if (spec.lineKeys.length === 0) {
    return 0;
  }
  return (current + 1) % spec.lineKeys.length;
}

export function setPhase(state: WelcomeConversationState, id: string, phase: WelcomeBubblePhase): WelcomeConversationState {
  const bubble = state.bubbles[id];
  if (!bubble || bubble.phase === phase) {
    return state;
  }
  return { ...state, bubbles: { ...state.bubbles, [id]: { ...bubble, phase } } };
}

export function advanceLine(state: WelcomeConversationState, spec: WelcomeBubbleSpec): WelcomeConversationState {
  const bubble = state.bubbles[spec.id];
  if (!bubble) {
    return state;
  }
  return {
    ...state,
    bubbles: {
      ...state.bubbles,
      [spec.id]: { phase: 'shown', line: nextLine(spec, bubble.line), sends: bubble.sends + 1 },
    },
  };
}

export function bumpReaction(state: WelcomeConversationState): WelcomeConversationState {
  return { ...state, reactions: nextReactionCount(state.reactions) };
}
