import type { AvailabilityQuery } from "./types";

export type AdvisorIntent =
  | { type: "scope:all-managed" }
  | { type: "scope:home-only" }
  | { type: "availability"; query: AvailabilityQuery; daypartLabel?: string; needsDay: boolean }
  | { type: "hours:employee"; employeeName: string }
  | { type: "hours:under-target" }
  | { type: "hours:over-target" }
  | { type: "hours:top-workers" }
  | { type: "hours:all-employees" }
  | { type: "coverage:gaps"; day?: AvailabilityQuery["day"] }
  | { type: "suggest:cover"; day?: AvailabilityQuery["day"] }
  | { type: "assignments:week" }
  | { type: "assignments:day"; day?: AvailabilityQuery["day"] }
  | { type: "noop" };

const DAY_KEYWORDS: Record<string, AvailabilityQuery["day"]> = {
  monday: "MON",
  mon: "MON",
  tuesday: "TUE",
  tue: "TUE",
  wednesday: "WED",
  wed: "WED",
  thursday: "THU",
  thu: "THU",
  friday: "FRI",
  fri: "FRI",
  saturday: "SAT",
  sat: "SAT",
  sunday: "SUN",
  sun: "SUN",
  martes: "TUE",
  mardi: "TUE",
  miercoles: "WED",
  mercredi: "WED",
  jueves: "THU",
  jeudi: "THU",
  viernes: "FRI",
  vendredi: "FRI",
  sabado: "SAT",
  samedi: "SAT",
  domingo: "SUN",
  dimanche: "SUN",
  lunes: "MON",
  lundi: "MON",
  sab: "SAT",
  dom: "SUN",
};

const DAYPARTS: Array<{ keyword: RegExp; start: string; end: string; label: string }> = [
  { keyword: /\bmorning\b/, start: "08:00", end: "12:00", label: "morning" },
  { keyword: /\bafternoon\b/, start: "12:00", end: "16:00", label: "afternoon" },
  { keyword: /\bevening\b/, start: "16:00", end: "20:00", label: "evening" },
  { keyword: /\bnight\b/, start: "20:00", end: "23:00", label: "night" },
];

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(text: string): string {
  return stripAccents(text).toLowerCase();
}

function extractDay(text: string): AvailabilityQuery["day"] | undefined {
  for (const [keyword, day] of Object.entries(DAY_KEYWORDS)) {
    if (text.includes(keyword)) {
      return day;
    }
  }
  return undefined;
}

interface TimeRangeResult {
  start?: string;
  end?: string;
  label?: string;
}

function extractTimeRange(text: string): TimeRangeResult {
  const explicitRange = text.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );

  if (explicitRange) {
    const [, startHourRaw, startMinuteRaw, startMeridiem, endHourRaw, endMinuteRaw, endMeridiem] =
      explicitRange;

    const build = (hourString: string, minuteString: string | undefined, meridiem: string | undefined) => {
      let hour = Number(hourString);
      const minute = Number(minuteString ?? "0");
      if (meridiem) {
        const meridiemLower = meridiem.toLowerCase();
        if (meridiemLower === "pm" && hour < 12) {
          hour += 12;
        }
        if (meridiemLower === "am" && hour === 12) {
          hour = 0;
        }
      }
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    };

    return {
      start: build(startHourRaw, startMinuteRaw, startMeridiem ?? undefined),
      end: build(endHourRaw, endMinuteRaw, endMeridiem ?? undefined),
    };
  }

  for (const part of DAYPARTS) {
    if (part.keyword.test(text)) {
      return { start: part.start, end: part.end, label: part.label };
    }
  }

  return {};
}

function extractEmployeeName(message: string): string | undefined {
  const match = message.match(
    /hours(?:\s+(?:did|for))?\s+([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?)(?:\s+(?:work|works|worked))?/i,
  );

  if (!match) {
    return undefined;
  }

  let candidate = match[1].trim();
  candidate = candidate.replace(/\b(work|works|worked)$/i, "").trim();

  return candidate.length > 0 ? candidate : undefined;
}

function extractWorkType(message: string): string | undefined {
  // Common work type patterns - must be very precise to avoid matching too much
  const patterns = [
    // Pattern 1: "as [a] <WorkType>" - most reliable
    /\b(?:as|for)\s+(?:a\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)(?:\s+on\b|\s+shift\b|$)/i,
    
    // Pattern 2: "<WorkType> shift/role"
    /\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:shift|role)\b/i,
    
    // Pattern 3: "work/cover/need <WorkType>" - look ahead for "on" or end
    /\b(?:work|cover|need)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:on\b)/i,
    
    // Pattern 4: "<WorkType> on <day>" - ONE or TWO words before "on <day>"
    /\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const workType = match[1].trim();
      const normalized = workType.toLowerCase();
      
      // Filter out common false positives
      const falsePositives = [
        // Days
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", 
        "mon", "tue", "wed", "thu", "fri", "sat", "sun",
        // Dayparts
        "morning", "evening", "afternoon", "night", "midday",
        // Time words
        "today", "tomorrow", "week", "day", "this", "that",
        // Availability words
        "available", "availability", "free", "work", "working",
        // Question words
        "who", "what", "when", "where", "why", "how",
        // Common verbs/phrases
        "can work", "who can", "can", "work", "need", "cover"
      ];
      
      // Additional check: if it contains question/verb words, skip it
      if (normalized.includes("who") || normalized.includes("can") || normalized.includes("need")) {
        continue;
      }
      
      if (!falsePositives.includes(normalized) && workType.length >= 3) {
        // Capitalize first letter of each word for consistency
        return workType
          .split(/\s+/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
      }
    }
  }

  return undefined;
}

export function interpretIntent(message: string): AdvisorIntent {
  const normalized = normalize(message);

  // Scope is always AllManaged - don't allow users to change it
  // Remove these checks so "include" and "home" don't trigger scope changes

  // Check if asking about employees in general (NOT about specific shifts/schedule)
  const asksAboutEmployees =
    /\bwho(?:'s|\s+is)?\s+working\b/.test(normalized) &&
    !/\bschedule[d]?\b/.test(normalized) &&
    !/\bshift[s]?\b/.test(normalized) &&
    !/\bassignment[s]?\b/.test(normalized);

  // Check if asking about the schedule/shifts specifically
  const asksAboutSchedule =
    /\bschedule[d]?\s+this\s+week\b/.test(normalized) ||
    /\bshift[s]?\s+this\s+week\b/.test(normalized) ||
    /\bassignment[s]?\b/.test(normalized) ||
    /\bwhat\s+shift[s]?\b/.test(normalized);

  if (asksAboutEmployees && !asksAboutSchedule) {
    // "who's working?" or "who's working this week?" → list all employees
    return { type: "hours:all-employees" };
  }

  // Working/assignments queries (specific schedule/shifts)
  if (asksAboutSchedule) {
    const day = extractDay(normalized);
    if (day) {
      return { type: "assignments:day", day };
    }
    return { type: "assignments:week" };
  }

  // Availability queries
  const mentionsAvailability =
    normalized.includes("availability") ||
    normalized.includes("available") ||
    normalized.includes("free") ||
    /\bcan\s+work\b/.test(normalized) ||
    /\bwho\s+can\s+work\b/.test(normalized);

  if (mentionsAvailability) {
    const day = extractDay(normalized);
    const timeRange = extractTimeRange(message);
    const workType = extractWorkType(message);
    
    // If they say "this week" or "available", don't require specific day
    const needsDay = !day && !(/\bthis\s+week\b/.test(normalized) || /\bavailable\b/.test(normalized));
    
    return {
      type: "availability",
      query: {
        day,
        startTime: timeRange.start,
        endTime: timeRange.end,
        workType,
      },
      daypartLabel: timeRange.label,
      needsDay,
    };
  }

  // Hours/overwork queries  
  if (
    normalized.includes("overwork") ||
    normalized.includes("over target") ||
    normalized.includes("too many hours") ||
    normalized.includes("overtime")
  ) {
    return { type: "hours:over-target" };
  }

  if (normalized.includes("under target") || normalized.includes("underwork")) {
    return { type: "hours:under-target" };
  }

  if (normalized.includes("top worker") || normalized.includes("top performer") || normalized.includes("top people")) {
    return { type: "hours:top-workers" };
  }

  // General employee/hours query
  if (
    /\bwho\b/.test(normalized) ||
    /\bemployees?\b/.test(normalized) ||
    /\bstaff\b/.test(normalized) ||
    /\bpeople\b/.test(normalized) ||
    /\bteam\b/.test(normalized)
  ) {
    // Check if asking about specific employee hours
    const employeeName = extractEmployeeName(message);
    if (employeeName) {
      return { type: "hours:employee", employeeName };
    }
    
    // General "who's" question → show all employees
    return { type: "hours:all-employees" };
  }

  // Coverage/gaps
  if (normalized.includes("understaffed") || normalized.includes("gaps") || normalized.includes("coverage gaps")) {
    return { type: "coverage:gaps", day: extractDay(normalized) };
  }

  // Suggestions
  if (normalized.includes("suggest") || normalized.includes("cover") || normalized.includes("recommend")) {
    return { type: "suggest:cover", day: extractDay(normalized) };
  }

  // Hours with specific employee name
  if (normalized.includes("hours")) {
    const employeeName = extractEmployeeName(message);
    if (employeeName) {
      return { type: "hours:employee", employeeName };
    }
  }

  return { type: "noop" };
}
