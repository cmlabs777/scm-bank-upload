export type FortuneSlot = "me" | "partner";
export type CalendarType = "solar" | "lunar";
export type Gender = "male" | "female" | "unspecified";

export interface FortuneProfile {
  slot: FortuneSlot;
  display_name: string;
  birth_date: string | null;
  birth_time: string | null;
  calendar_type: CalendarType;
  gender: Gender;
  enabled: boolean;
  updated_at?: string;
}

export interface DailyFortune {
  score: number;
  headline: string;
  summary: string;
  advice: string;
  lucky_color: string;
  lucky_item: string;
}

const HEADLINES = [
  "작은 정리가 큰 흐름을 바꾸는 날",
  "말보다 타이밍이 더 중요한 날",
  "익숙한 선택 안에서 답이 보이는 날",
  "기분 좋은 속도로 일이 풀리는 날",
  "무리하지 않을수록 운이 붙는 날",
  "사람 사이의 온도가 좋아지는 날",
  "돈과 시간을 차분히 다루기 좋은 날",
  "한 번 쉬어가면 더 선명해지는 날",
];

const SUMMARIES = [
  "오늘은 빠른 결정보다 확인과 정돈이 유리합니다. 미뤄둔 일을 하나만 끝내도 하루의 리듬이 좋아집니다.",
  "주변의 작은 신호를 잘 읽으면 불필요한 오해를 줄일 수 있습니다. 먼저 부드럽게 말하는 쪽이 이깁니다.",
  "새로운 것을 크게 벌이기보다는 하던 일의 완성도를 올리기에 좋습니다. 결과보다 과정의 안정감이 중요합니다.",
  "컨디션은 천천히 올라오는 흐름입니다. 오전보다 오후에 집중력이 붙을 가능성이 큽니다.",
  "돈을 쓰는 일에는 명분보다 실제 만족도를 따져보는 게 좋습니다. 작은 절약이 기분을 가볍게 합니다.",
  "관계운은 무난합니다. 짧은 안부나 고마움 표현 하나가 생각보다 오래 남을 수 있습니다.",
  "오늘의 운은 급하게 잡으려 하면 흩어지고, 차분히 다루면 모입니다. 한 번에 하나씩 처리하세요.",
  "예상 밖의 변수가 있어도 크게 나쁜 흐름은 아닙니다. 계획을 조금 조정하면 오히려 더 편해집니다.",
];

const ADVICES = [
  "중요한 선택은 한 번 더 적어보고 결정하세요.",
  "오늘은 먼저 듣고 짧게 답하는 쪽이 좋습니다.",
  "지출 전에는 내일도 필요한지 한 번만 확인하세요.",
  "몸이 보내는 피로 신호를 가볍게 넘기지 마세요.",
  "작은 약속일수록 시간을 정확히 지키면 좋습니다.",
  "정리할 물건이나 문서 하나를 끝내보세요.",
  "기분이 흔들리면 산책이나 따뜻한 음료가 도움이 됩니다.",
  "완벽하게 하려는 마음보다 시작하는 쪽을 택하세요.",
];

const COLORS = ["살구색", "하늘색", "초록색", "아이보리", "남색", "연보라", "회색", "흰색"];
const ITEMS = ["작은 노트", "따뜻한 커피", "편한 신발", "손목시계", "깔끔한 가방", "물 한 잔", "향 좋은 비누", "이어폰"];

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: T[], hash: number, salt: number) {
  return items[(hash + salt * 131) % items.length];
}

export function todayInKorea(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const d = parts.find(p => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function makeDailyFortune(profile: FortuneProfile, today = todayInKorea()): DailyFortune | null {
  if (!profile.enabled || !profile.birth_date) return null;

  const seed = [
    profile.slot,
    profile.display_name,
    profile.birth_date,
    profile.birth_time ?? "",
    profile.calendar_type,
    profile.gender,
    today,
  ].join("|");

  const hash = hashSeed(seed);
  return {
    score: 62 + (hash % 35),
    headline: pick(HEADLINES, hash, 1),
    summary: pick(SUMMARIES, hash, 2),
    advice: pick(ADVICES, hash, 3),
    lucky_color: pick(COLORS, hash, 4),
    lucky_item: pick(ITEMS, hash, 5),
  };
}
