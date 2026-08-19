// utils.js
const { flagsDict, easyFlags, mediumFlags } = require("./flags");

// ==== أزمنة الرد ====
// ملاحظة مهمة: هاد الأزمنة ثابتة ومعروفة مسبقا (ماشي عشوائية وماشي كتحاول
// تقلد رد فعل بشري). البوت شفاف فسرعته - كل مستوى صعوبة عندو زمن رد ثابت.
// المالك يقدر يبدلها من الخاص (شوف index.js)، وهادي القيم الافتراضية.
const DELAYS = {
  easy: 200,   // 0.2 ثانية - أعلام سهلة
  medium: 500, // 0.5 ثانية - أعلام متوسطة
  hard: 800    // 0.8 ثانية - أعلام صعيبة
};

// كيبدل زمن الرد ديال مستوى معين (يستعملها المالك عن طريق أوامر الخاص)
function setDelay(tier, ms) {
  if (["easy", "medium", "hard"].includes(tier) && Number.isFinite(ms) && ms >= 0) {
    DELAYS[tier] = ms;
    return true;
  }
  return false;
}

// كيرجع نسخة من الأزمنة الحالية (باش نعرضوها للمالك)
function getDelays() {
  return { ...DELAYS };
}

// ==== زمن الرد ديال فعالية النسخ (ثابت وحد للجميع) ====
let copyDelay = 500; // 0.5 ثانية افتراضيا

function setCopyDelay(ms) {
  if (Number.isFinite(ms) && ms >= 0) {
    copyDelay = ms;
    return true;
  }
  return false;
}

function getCopyDelay() {
  return copyDelay;
}

// كيقرا النص وكيرجع أيا كان موجود بين 〘 و 〙 كيفما هو (بلا فلترة) - لفعالية النسخ
function extractBracketContent(text) {
  if (!text) return null;
  const match = text.match(/〘\s*(.+?)\s*〙/u);
  if (!match) return null;
  const inner = match[1].trim();
  return inner || null;
}

// كيقرا النص وكيرجع الإيموجي ديال العلم إلا كان موجود بين 〘 و 〙
function extractFlag(text) {
  const inner = extractBracketContent(text);
  if (!inner) return null;

  // كنقلبو على أي إيموجي علم معروف داخل النص المستخرج
  for (const flag of Object.keys(flagsDict)) {
    if (inner.includes(flag)) return flag;
  }
  return null;
}

// كيرجع اسم الدولة بالعربية على حساب الإيموجي، أو null إلا ماكانش معروف
function getCountryName(flag) {
  return flagsDict[flag] || null;
}

// كيرجع زمن الرد الثابت على حساب مستوى صعوبة العلم
function getDelay(flag) {
  if (easyFlags.has(flag)) return DELAYS.easy;
  if (mediumFlags.has(flag)) return DELAYS.medium;
  return DELAYS.hard;
}

// ==== أدوات التقديم (البوت كمقدم للفعاليات) ====

// كيختار علم عشوائي من القاموس (لفعالية الأعلام)
function getRandomFlag() {
  const keys = Object.keys(flagsDict);
  return keys[Math.floor(Math.random() * keys.length)];
}

// كيولد محتوى عشوائي (لفعالية النسخ) - سلسلة قصيرة من حروف وأرقام
function generateCopyContent() {
  const pool = "أبتثجحخدذرزسشصضطظعغفقكلمنهويABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = 4 + Math.floor(Math.random() * 5); // بين 4 و 8 حروف
  let result = "";
  for (let i = 0; i < length; i++) {
    result += pool[Math.floor(Math.random() * pool.length)];
  }
  return result;
}

// كيبني رسالة تحدي فعالية الأعلام بنفس التنسيق المتفق عليه
function buildFlagChallengeMessage(flag, presenterName) {
  return `*فعالية الاعلام
*𖣔━ ═━━❮⛄❯━━═ ━𖣔*
العلم〘${flag}〙*
                             *الصنف ⟬C⟭*
*المقدم ⟬${presenterName}⟭*
*𖣔━ ═━━❮⛄❯━━═ ━𖣔*`;
}

// كيبني رسالة تحدي فعالية النسخ بنفس التنسيق المتفق عليه
function buildCopyChallengeMessage(content, presenterName) {
  return `*فعالية النسخ
*𖣔━ ═━━❮☃️❯━━═ ━𖣔*
اللقب〘 ${content} 〙*
                             *الصنف ⟬C⟭*
*المقدم ⟬${presenterName}⟭*
*𖣔━ ═━━☃️❯━━═ ━𖣔*`;
}

// ==== تتبع الرسائل لي تجاوب عليهم البوت (باش ما يعاودش يرد على نفس الرسالة) ====
const repliedMessages = new Set();

function alreadyReplied(messageId) {
  return repliedMessages.has(messageId);
}

function markReplied(messageId) {
  repliedMessages.add(messageId);
  // تنظيف: نخليو غير آخر 500 معرف باش الذاكرة ما تكبرش بلا حدود
  if (repliedMessages.size > 500) {
    const first = repliedMessages.values().next().value;
    repliedMessages.delete(first);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  DELAYS,
  setDelay,
  getDelays,
  setCopyDelay,
  getCopyDelay,
  extractBracketContent,
  extractFlag,
  getCountryName,
  getDelay,
  getRandomFlag,
  generateCopyContent,
  buildFlagChallengeMessage,
  buildCopyChallengeMessage,
  alreadyReplied,
  markReplied,
  sleep
};
