// يوحّد شكل النص العربي عشان مطابقة الإجابات ما تفشل بسبب
// اختلافات بسيطة (همزة، تشكيل، ة/ه، مسافات زايدة...)
function normalizeArabic(text) {
  return text
    .replace(/[\u064B-\u0652]/g, "") // إزالة التشكيل
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, "") // إبقاء الحروف العربية والمسافات بس
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// يشيل "ال" التعريف من بداية الكلمة عشان "المغرب" تطابق "مغرب"
function stripDefiniteArticle(text) {
  return text.replace(/^ال/, "");
}

// يتحقق هل جواب المستخدم يطابق اسم الدولة الصحيح
function isCorrectAnswer(userText, correctName) {
  const normalizedUser = stripDefiniteArticle(normalizeArabic(userText));
  const normalizedCorrect = stripDefiniteArticle(normalizeArabic(correctName));

  if (!normalizedUser || !normalizedCorrect) return false;

  if (normalizedUser === normalizedCorrect) return true;

  // يسمح لو المستخدم كتب جملة فيها اسم الدولة كـ"كلمة" مستقلة
  // (تجنبًا لتطابقات عشوائية لأسماء قصيرة جدًا)
  if (normalizedCorrect.length >= 3) {
    const words = normalizedUser.split(" ").map(stripDefiniteArticle);
    if (words.includes(normalizedCorrect)) return true;
  }

  return false;
}

module.exports = { normalizeArabic, stripDefiniteArticle, isCorrectAnswer };
