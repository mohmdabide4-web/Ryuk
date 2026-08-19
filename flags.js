const countries = require("../data/countries");

// كل إيموجي علم مبني من رمزين (Regional Indicator Symbols)
// كل رمز يمثل حرف من A إلى Z. مثال: 🇲🇦 = M + A = "MA" = المغرب
const REGIONAL_INDICATOR_BASE = 0x1f1e6; // يمثل حرف A

function decodeFlagToISO(flagEmoji) {
  const codePoints = Array.from(flagEmoji).map((ch) => ch.codePointAt(0));

  if (codePoints.length !== 2) return null;

  const isRegionalIndicator = (cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
  if (!codePoints.every(isRegionalIndicator)) return null;

  const letters = codePoints.map((cp) =>
    String.fromCharCode(cp - REGIONAL_INDICATOR_BASE + "A".charCodeAt(0))
  );

  return letters.join("");
}

// يفصل نص طويل فيه عدة إيموجيات أعلام إلى مصفوفة إيموجيات مفردة
function extractFlags(text) {
  // كل إيموجي علم = رمزين متتاليين ضمن مدى Regional Indicator
  const flagRegex = /(\p{Regional_Indicator}{2})/gu;
  const matches = text.match(flagRegex) || [];
  return matches;
}

// يرجع قائمة { emoji, iso, name } لكل علم معروف بالنص، بترتيب ظهوره
// ويتجاهل أي إيموجي علم غير معروف بقاعدة البيانات
function parseFlagsFromText(text) {
  const flags = extractFlags(text);
  const result = [];

  for (const emoji of flags) {
    const iso = decodeFlagToISO(emoji);
    if (!iso) continue;

    const name = countries[iso];
    if (!name) continue; // علم غير موجود بقاعدة بياناتنا، نتجاهله

    result.push({ emoji, iso, name });
  }

  return result;
}

module.exports = {
  decodeFlagToISO,
  extractFlags,
  parseFlagsFromText,
};
