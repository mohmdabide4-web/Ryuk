// utils.js
const { flagsDict, easyFlags, mediumFlags } = require("./flags");

// ==== أزمنة الرد ====
// ملاحظة مهمة: هاد الأزمنة ثابتة ومعروفة مسبقا (ماشي عشوائية وماشي كتحاول
// تقلد رد فعل بشري). البوت شفاف فسرعته - كل مستوى صعوبة عندو زمن رد ثابت.
const DELAYS = {
  easy: 1000,   // 1 ثانية - أعلام سهلة
  medium: 2500, // 2.5 ثانية - أعلام متوسطة
  hard: 4000    // 4 ثواني - أعلام صعيبة
};

// كيقرا النص وكيرجع الإيموجي ديال العلم إلا كان موجود بين 〘 و 〙
function extractFlag(text) {
  if (!text) return null;
  const match = text.match(/〘\s*(.+?)\s*〙/u);
  if (!match) return null;

  const inner = match[1];
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
  extractFlag,
  getCountryName,
  getDelay,
  alreadyReplied,
  markReplied,
  sleep
};
