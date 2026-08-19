// يستخرج كود الدعوة من رابط واتساب (مثال: https://chat.whatsapp.com/ABCD1234)
function extractInviteCode(input) {
  const match = input.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

// يرجع آيدي الجروب (xxxx@g.us) سواء المدخل رابط دعوة أو آيدي جاهز
// لو رابط دعوة، يحاول ينضم للجروب تلقائيًا لو البوت مو منضم فيه بعد
async function resolveGroupId(sock, rawInput) {
  const input = rawInput.trim();

  // المدخل آيدي جروب جاهز
  if (input.endsWith("@g.us")) {
    return input;
  }

  const code = extractInviteCode(input);
  if (!code) {
    throw new Error(
      "ما قدرت أفهم الرابط أو الآيدي. أرسل رابط دعوة الجروب (chat.whatsapp.com/...) أو آيدي الجروب."
    );
  }

  // يحاول ينضم للجروب (لو مو منضم أصلاً)
  try {
    const groupId = await sock.groupAcceptInvite(code);
    return groupId;
  } catch (err) {
    // لو البوت منضم بالفعل بالجروب، groupAcceptInvite ممكن يفشل
    // نجرب نجيب معلومات الجروب بدل الانضمام
    try {
      const info = await sock.groupGetInviteInfo(code);
      return info.id;
    } catch (err2) {
      throw new Error("ما قدرت أتعرف على الجروب من الرابط. تأكد إن الرابط صحيح وما انتهت صلاحيته.");
    }
  }
}

module.exports = { resolveGroupId, extractInviteCode };
