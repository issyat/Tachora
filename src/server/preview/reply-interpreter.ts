/**
 * Reply Interpreter
 * 
 * Deterministic + multilingual interpretation of short user replies.
 * Maps "yes", "oui", "sí", "morning", "1", etc. to structured intents.
 */

import type { TurnMemory, ShiftOption, TimeOfDay } from './turn-memory';
import { findOption, getSingleFittingOption } from './turn-memory';

// ============================================================================
// Types
// ============================================================================

export type ReplyIntent = 'confirm' | 'select' | 'reject' | 'unknown';

export interface InterpretedReply {
  intent: ReplyIntent;
  confidence: number; // 0-1
  optionId?: string; // If select intent
  selectedOption?: ShiftOption;
  reasoning: string; // For debugging
  autoApply?: boolean; // Whether to apply preview immediately after creation
}

// ============================================================================
// Multilingual Libraries
// ============================================================================

/**
 * Affirmative words across languages
 * Normalized to lowercase, no diacritics needed (we'll normalize input)
 */
const AFFIRMATIVES: Record<string, string[]> = {
  en: ['yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'correct', 'right', 'absolutely', 'definitely'],
  fr: ['oui', 'ouais', 'd\'accord', 'dac', 'ok', 'bien', 'exactement', 'tout a fait', 'absolument'],
  es: ['si', 'sí', 'vale', 'ok', 'claro', 'exacto', 'por supuesto', 'correcto', 'cierto'],
  de: ['ja', 'ok', 'gut', 'genau', 'richtig', 'klar', 'stimmt', 'absolut'],
  it: ['si', 'sì', 'ok', 'va bene', 'esatto', 'giusto', 'certo', 'assolutamente'],
  pt: ['sim', 'ok', 'claro', 'exato', 'certo', 'correto', 'com certeza'],
  nl: ['ja', 'oke', 'oké', 'goed', 'juist', 'precies', 'zeker'],
  sv: ['ja', 'okej', 'ok', 'bra', 'precis', 'ratt', 'saker'],
  no: ['ja', 'ok', 'greit', 'bra', 'riktig', 'sikkert'],
  da: ['ja', 'okay', 'ok', 'fint', 'rigtigt', 'sikkert'],
  ru: ['da', 'да', 'horosho', 'хорошо', 'ladno', 'ладно', 'tochno', 'точно'],
  pl: ['tak', 'ok', 'dobrze', 'zgadza', 'sie', 'pewnie'],
  tr: ['evet', 'tamam', 'olur', 'dogru', 'kesin'],
  ar: ['naam', 'نعم', 'hasanan', 'حسنا', 'sahih', 'صحيح', 'ok'],
  ja: ['hai', 'はい', 'ee', 'ええ', 'un', 'うん', 'oke', 'オーケー', 'hai hai', 'はいはい'],
  zh: ['shi', '是', 'hao', '好', 'dui', '对', 'xing', '行', 'keyi', '可以'],
  ko: ['ye', '예', 'ne', '네', 'geure', '그래', 'joayo', '좋아요'],
};

/**
 * Negative words across languages
 */
const NEGATIVES: Record<string, string[]> = {
  en: ['no', 'nope', 'nah', 'cancel', 'stop', 'nevermind', 'abort', 'wrong'],
  fr: ['non', 'nan', 'annuler', 'arreter', 'stop', 'pas', 'jamais'],
  es: ['no', 'nada', 'cancelar', 'parar', 'stop', 'nunca'],
  de: ['nein', 'ne', 'abbrechen', 'stopp', 'falsch', 'niemals'],
  it: ['no', 'annulla', 'ferma', 'stop', 'mai', 'sbagliato'],
  pt: ['nao', 'não', 'cancelar', 'parar', 'stop', 'nunca', 'errado'],
  nl: ['nee', 'annuleren', 'stop', 'nooit', 'fout'],
  sv: ['nej', 'avbryt', 'stopp', 'aldrig', 'fel'],
  no: ['nei', 'avbryt', 'stopp', 'aldri', 'feil'],
  da: ['nej', 'annuller', 'stop', 'aldrig', 'forkert'],
  ru: ['net', 'нет', 'otmenit', 'отменить', 'stop', 'стоп', 'nikogda', 'никогда'],
  pl: ['nie', 'anuluj', 'stop', 'nigdy', 'zle'],
  tr: ['hayir', 'iptal', 'dur', 'yanlis', 'asla'],
  ar: ['la', 'لا', 'ilghaa', 'إلغاء', 'tawaqaf', 'توقف'],
  ja: ['iie', 'いいえ', 'iya', 'いや', 'dame', 'だめ', 'chigau', '違う'],
  zh: ['bu', '不', 'bu yao', '不要', 'qu xiao', '取消', 'ting', '停'],
  ko: ['anio', '아니오', 'aniyo', '아니요', 'chiso', '취소'],
};

/**
 * Time of day keywords across languages
 */
const TIME_OF_DAY_KEYWORDS: Record<TimeOfDay, Record<string, string[]>> = {
  morning: {
    en: ['morning', 'am', 'early'],
    fr: ['matin', 'matinee', 'tot'],
    es: ['manana', 'mañana', 'temprano'],
    de: ['morgen', 'vormittag', 'fruh', 'früh'],
    it: ['mattina', 'mattino', 'presto'],
    pt: ['manha', 'manhã', 'cedo'],
    nl: ['ochtend', 'morgen', 'vroeg'],
    sv: ['morgon', 'formiddag', 'tidig'],
    no: ['morgen', 'formiddag', 'tidlig'],
    da: ['morgen', 'formiddag', 'tidlig'],
    ru: ['utro', 'утро', 'rano', 'рано'],
    pl: ['rano', 'poranek', 'wczesnie'],
    tr: ['sabah', 'erken'],
    ar: ['sabah', 'صباح', 'bakir', 'باكر'],
    ja: ['asa', '朝', 'gozen', '午前'],
    zh: ['zaoshang', '早上', 'shangwu', '上午'],
    ko: ['achim', '아침', 'ojeon', '오전'],
  },
  afternoon: {
    en: ['afternoon', 'pm', 'midday', 'noon'],
    fr: ['apres-midi', 'apres midi', 'midi'],
    es: ['tarde', 'mediodia', 'pm'],
    de: ['nachmittag', 'mittag', 'pm'],
    it: ['pomeriggio', 'mezzogiorno', 'pm'],
    pt: ['tarde', 'meio-dia', 'pm'],
    nl: ['middag', 'namiddag', 'pm'],
    sv: ['eftermiddag', 'middag', 'pm'],
    no: ['ettermiddag', 'middag', 'pm'],
    da: ['eftermiddag', 'middag', 'pm'],
    ru: ['den', 'день', 'posle obeda', 'после обеда'],
    pl: ['poludnie', 'popoludnie', 'pm'],
    tr: ['ogleden sonra', 'ogle', 'pm'],
    ar: ['baad al dhuhr', 'بعد الظهر', 'dhuhr', 'ظهر'],
    ja: ['gogo', '午後', 'hiru', '昼'],
    zh: ['xiawu', '下午', 'zhongwu', '中午'],
    ko: ['ohu', '오후', 'jeom', '점심'],
  },
  evening: {
    en: ['evening', 'night', 'late'],
    fr: ['soir', 'soiree', 'nuit', 'tard'],
    es: ['noche', 'tarde', 'tardia'],
    de: ['abend', 'nacht', 'spat', 'spät'],
    it: ['sera', 'notte', 'tardi'],
    pt: ['noite', 'tarde', 'tardio'],
    nl: ['avond', 'nacht', 'laat'],
    sv: ['kvall', 'kväll', 'natt', 'sen'],
    no: ['kveld', 'natt', 'sen'],
    da: ['aften', 'nat', 'sen'],
    ru: ['vecher', 'вечер', 'noch', 'ночь', 'pozdno', 'поздно'],
    pl: ['wieczor', 'noc', 'pozno'],
    tr: ['aksam', 'gece', 'gec'],
    ar: ['masaa', 'مساء', 'layl', 'ليل'],
    ja: ['yoru', '夜', 'ban', '晩'],
    zh: ['wanshang', '晚上', 'ye', '夜'],
    ko: ['jeonyeok', '저녁', 'bam', '밤'],
  },
};

/**
 * Ordinal keywords across languages
 */
const ORDINALS: Record<number, Record<string, string[]>> = {
  0: { // First
    en: ['first', '1st'],
    fr: ['premier', 'premiere', '1er', '1ere'],
    es: ['primero', 'primera', '1º', '1ª'],
    de: ['erste', 'ersten', 'erstes', '1.'],
    it: ['primo', 'prima', '1º', '1ª'],
    pt: ['primeiro', 'primeira', '1º', '1ª'],
    nl: ['eerste', '1e'],
    sv: ['forsta', 'första', '1:a'],
    no: ['forste', 'første', '1.'],
    da: ['forste', 'første', '1.'],
    ru: ['pervyy', 'первый', 'pervaya', 'первая'],
    pl: ['pierwszy', 'pierwsza', '1.'],
    tr: ['ilk', 'birinci', '1.'],
    ar: ['awal', 'أول', 'awla', 'أولى'],
    ja: ['saisho', '最初', 'ichiban', '一番', 'dai ichi', '第一'],
    zh: ['diyi', '第一', 'touming', '头名'],
    ko: ['cheot', '첫', 'cheotbeonjjae', '첫번째'],
  },
  1: { // Second
    en: ['second', '2nd'],
    fr: ['deuxieme', 'deuxième', 'second', '2eme', '2ème'],
    es: ['segundo', 'segunda', '2º', '2ª'],
    de: ['zweite', 'zweiten', 'zweites', '2.'],
    it: ['secondo', 'seconda', '2º', '2ª'],
    pt: ['segundo', 'segunda', '2º', '2ª'],
    nl: ['tweede', '2e'],
    sv: ['andra', '2:a'],
    no: ['andre', '2.'],
    da: ['anden', '2.'],
    ru: ['vtoroy', 'второй', 'vtoraya', 'вторая'],
    pl: ['drugi', 'druga', '2.'],
    tr: ['ikinci', '2.'],
    ar: ['thani', 'ثاني', 'thaniya', 'ثانية'],
    ja: ['niban', '二番', 'dai ni', '第二'],
    zh: ['dier', '第二'],
    ko: ['dubeonjjae', '두번째', 'dului', '둘째'],
  },
  2: { // Third
    en: ['third', '3rd'],
    fr: ['troisieme', 'troisième', '3eme', '3ème'],
    es: ['tercero', 'tercera', '3º', '3ª'],
    de: ['dritte', 'dritten', 'drittes', '3.'],
    it: ['terzo', 'terza', '3º', '3ª'],
    pt: ['terceiro', 'terceira', '3º', '3ª'],
    nl: ['derde', '3e'],
    sv: ['tredje', '3:e'],
    no: ['tredje', '3.'],
    da: ['tredje', '3.'],
    ru: ['tretiy', 'третий', 'tretya', 'третья'],
    pl: ['trzeci', 'trzecia', '3.'],
    tr: ['ucuncu', 'üçüncü', '3.'],
    ar: ['thalith', 'ثالث', 'thalitha', 'ثالثة'],
    ja: ['sanban', '三番', 'dai san', '第三'],
    zh: ['disan', '第三'],
    ko: ['sebeonjjae', '세번째', 'setjjae', '셋째'],
  },
};

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize text for matching
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD') // Decompose diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/['']/g, '\'') // Normalize quotes
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Check if input matches any word in a list
 */
function matchesAny(input: string, wordLists: string[][]): boolean {
  const normalized = normalize(input);
  return wordLists.some(list => 
    list.some(word => {
      const normalizedWord = normalize(word);
      // Must be exact match or input must contain the word as a complete token
      return normalized === normalizedWord || 
             normalized.split(/\s+/).includes(normalizedWord);
    })
  );
}

// ============================================================================
// Interpretation Logic
// ============================================================================

/**
 * Interpret user's short reply in context of turn memory
 */
export function interpretReply(
  text: string,
  turnMemory: TurnMemory | null,
  locale?: string
): InterpretedReply {
  const normalized = normalize(text);
  
  // No turn memory = unknown
  if (!turnMemory) {
    return {
      intent: 'unknown',
      confidence: 0,
      reasoning: 'No turn memory found',
    };
  }
  
  // Empty input = unknown
  if (!normalized) {
    return {
      intent: 'unknown',
      confidence: 0,
      reasoning: 'Empty input',
    };
  }
  
  // Strategy 1: Numeric index (1, 2, 3, ...)
  const numMatch = normalized.match(/^(\d+)$/);
  console.log('[DEBUG interpretReply] Numeric matching:', {
    normalized,
    numMatch,
    hasMatch: !!numMatch,
    optionsAvailable: turnMemory.options?.length || 0,
  });
  
  if (numMatch) {
    const index = parseInt(numMatch[1], 10) - 1; // Convert to 0-based
    console.log('[DEBUG interpretReply] Looking for option at index:', {
      userInput: numMatch[1],
      zeroBasedIndex: index,
      totalOptions: turnMemory.options?.length || 0,
    });
    
    const option = findOption(turnMemory, { index });
    console.log('[DEBUG interpretReply] findOption result:', {
      index,
      foundOption: !!option,
      option: option ? { optionId: option.optionId, label: option.label, index: option.index } : null,
    });
    
    if (option) {
      return {
        intent: 'select',
        confidence: 1.0,
        optionId: option.optionId,
        selectedOption: option,
        reasoning: `Numeric selection: "${text}" → option ${index + 1}`,
      };
    }
  }
  
  // Strategy 2: Ordinal keywords (first, premier, primero, ...)
  for (const [index, languages] of Object.entries(ORDINALS)) {
    const allOrdinals = Object.values(languages).flat();
    if (matchesAny(normalized, [allOrdinals])) {
      const option = findOption(turnMemory, { index: parseInt(index) });
      if (option) {
        return {
          intent: 'select',
          confidence: 0.95,
          optionId: option.optionId,
          selectedOption: option,
          reasoning: `Ordinal selection: "${text}" → index ${index}`,
        };
      }
    }
  }
  
  // Strategy 3: Affirmative (yes, oui, sí, ...) - Check BEFORE time of day to avoid false positives
  const allAffirmatives = Object.values(AFFIRMATIVES).flat();
  if (matchesAny(normalized, [allAffirmatives])) {
    // If only one fitting option, select it
    const singleOption = getSingleFittingOption(turnMemory);
    if (singleOption) {
      return {
        intent: 'select',
        confidence: 0.95,
        optionId: singleOption.optionId,
        selectedOption: singleOption,
        reasoning: `Affirmative confirmation: "${text}" → single fitting option`,
      };
    }
    // Otherwise, it's a general confirmation (apply preview, etc.)
    return {
      intent: 'confirm',
      confidence: 0.95,
      reasoning: `Affirmative: "${text}"`,
    };
  }
  
  // Strategy 4: Negative (no, non, nein, ...) - Check BEFORE time of day to avoid false positives
  const allNegatives = Object.values(NEGATIVES).flat();
  if (matchesAny(normalized, [allNegatives])) {
    return {
      intent: 'reject',
      confidence: 0.95,
      reasoning: `Negative: "${text}"`,
    };
  }

  // Strategy 5: Explicit assignment confirmation ("assign him", "assign Bob") when only one option fits
  if (normalized.includes('assign')) {
    const singleOption = getSingleFittingOption(turnMemory);
    if (singleOption) {
      const pronouns = ['him', 'her', 'them', 'it', 'this', 'that', 'himself', 'herself', 'the shift', 'this shift'];
      const mentionsPronoun = pronouns.some(pronoun => normalized.includes(pronoun));

      const employeeName = turnMemory.entities.employeeName ? normalize(turnMemory.entities.employeeName) : '';
      const employeeTokens = employeeName ? employeeName.split(/\s+/).filter(token => token.length > 2) : [];
      const mentionsEmployee = employeeTokens.some(token => normalized.includes(token));

      if (mentionsPronoun || mentionsEmployee) {
        return {
          intent: 'select',
          confidence: 0.9,
          optionId: singleOption.optionId,
          selectedOption: singleOption,
          reasoning: `Assignment confirmation detected: "${text}"`,
          autoApply: true,
        };
      }
    }
  }

  // Strategy 6: Time of day keywords (morning, matin, mañana, ...)
  for (const [timeOfDay, languages] of Object.entries(TIME_OF_DAY_KEYWORDS)) {
    const allKeywords = Object.values(languages).flat();
    if (matchesAny(normalized, [allKeywords])) {
      const option = findOption(turnMemory, { timeOfDay: timeOfDay as TimeOfDay });
      if (option) {
        return {
          intent: 'select',
          confidence: 0.9,
          optionId: option.optionId,
          selectedOption: option,
          reasoning: `Time of day selection: "${text}" → ${timeOfDay}`,
        };
      }
      // Matched time of day but no single fitting option
      return {
        intent: 'unknown',
        confidence: 0.3,
        reasoning: `Matched "${timeOfDay}" but multiple or no options available`,
      };
    }
  }
  
  // Strategy 7: Exact time match (09:00, 9am, 15:00, 3pm)
  const timeMatch = normalized.match(/(\d{1,2})[:h]?(\d{2})?\s*(am|pm)?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const meridiem = timeMatch[3];
    
    // Convert 12-hour to 24-hour
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const option = findOption(turnMemory, { startTime: timeStr });
    if (option) {
      return {
        intent: 'select',
        confidence: 1.0,
        optionId: option.optionId,
        selectedOption: option,
        reasoning: `Time match: "${text}" → ${timeStr}`,
      };
    }
  }
  
  // Strategy 8: Employee name match (e.g., "assign Bob", "use Alice")
  if (turnMemory.options && turnMemory.options.length > 0) {
    const nameMatch = turnMemory.options.find(opt => {
      if (!opt.employeeName) return false;
      const normalizedName = normalize(opt.employeeName);
      if (normalized.includes(normalizedName)) return opt.fits;
      const nameParts = normalizedName.split(/\s+/).filter(part => part.length > 2);
      return nameParts.some(part => normalized.includes(part));
    });
    if (nameMatch) {
      return {
        intent: 'select',
        confidence: 0.9,
        optionId: nameMatch.optionId,
        selectedOption: nameMatch,
      reasoning: `Employee name match: "${text}" → ${nameMatch.employeeName}`,
    };
    }
  }
  
  // Strategy 9: Label substring match (last resort)
  if (turnMemory.options && turnMemory.options.length > 0) {
    const labelMatch = turnMemory.options.find(opt => 
      normalize(opt.label).includes(normalized) && opt.fits
    );
    if (labelMatch) {
      return {
        intent: 'select',
        confidence: 0.7,
        optionId: labelMatch.optionId,
        selectedOption: labelMatch,
        reasoning: `Label substring match: "${text}" in "${labelMatch.label}"`,
      };
    }
  }
  
  // No match found
  return {
    intent: 'unknown',
    confidence: 0,
    reasoning: `No interpretation found for: "${text}"`,
  };
}

/**
 * Get all affirmative words for locale (for display)
 */
export function getAffirmativesForLocale(locale: string): string[] {
  return AFFIRMATIVES[locale] || AFFIRMATIVES.en;
}

/**
 * Get all negative words for locale (for display)
 */
export function getNegativesForLocale(locale: string): string[] {
  return NEGATIVES[locale] || NEGATIVES.en;
}
