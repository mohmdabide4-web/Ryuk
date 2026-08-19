// index.js - Bot Al A3lam
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");

const {
  extractFlag,
  getCountryName,
  getDelay,
  setDelay,
  getDelays,
  extractBracketContent,
  setCopyDelay,
  getCopyDelay,
  getRandomFlag,
  generateCopyContent,
  buildFlagChallengeMessage,
  buildCopyChallengeMessage,
  alreadyReplied,
  markReplied,
  sleep
} = require("./utils");

// رقم هاتف البوت: كنجربو نقراوه من متغير بيئة أول (خاص السيرفرات البعيدة
// اللي ماعندهاش تيرمينال تفاعلي)، وإلا ماكانش نرجعو نسولو فالتيرمينال (محلي)
async function getPhoneNumber() {
  if (process.env.BOT_PHONE_NUMBER) {
    return process.env.BOT_PHONE_NUMBER.trim();
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(
      "أدخل رقم هاتف البوت مع كود الدولة بلا + ولا مسافات (مثال: 212612345678): ",
      resolve
    );
  });
  rl.close();
  return answer.trim();
}

// ==== الجملة السرية لتفعيل صلاحية المالك (بدلها قبل التشغيل) ====
const OWNER_ACTIVATION_PHRASE = "ريوك المز";

// ==== JID المالك، كيتسجل أوتوماتيكيا أول مرة كيبعت الجملة السرية ====
const OWNER_FILE = path.join(__dirname, "owner.json");
let ownerJid = null;

function loadOwner() {
  try {
    if (fs.existsSync(OWNER_FILE)) {
      const saved = JSON.parse(fs.readFileSync(OWNER_FILE, "utf8"));
      if (saved?.jid) ownerJid = saved.jid;
    }
  } catch (err) {
    console.error("خطأ فقراءة owner.json:", err);
  }
}

function saveOwner(jid) {
  ownerJid = jid;
  fs.writeFileSync(OWNER_FILE, JSON.stringify({ jid }, null, 2), "utf8");
}

function isOwner(sender) {
  return ownerJid && sender === ownerJid;
}

// ==== اسم المقدم لي كيبان فرسائل التحدي ====
const PRESENTER_NAME = "ريوك";

// ==== حالة انتظار استمارة الفعالية (ملي المالك دار "ابدا فعالية") ====
let awaitingEventForm = false;

// كيقرا استمارة الفعالية لي كيبعتها المالك ويرجع {type, link, items} أو null إلا ماكانتش مفهومة
// الصيغة المتوقعة (كل سطر يحتوي على واحد من هاد المفاتيح):
//   النوع: اعلام (أو نسخ)
//   الرابط: https://chat.whatsapp.com/xxxxx  (اختياري، إلا كانت مجموعة محددة من قبل)
//   المحتوى: 🇲🇦 🇱🇧 🇸🇴   (أو كلمات مفصولة بمسافة/فاصلة، لفعالية النسخ)
function parseEventForm(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let rawType = null;
  let link = null;
  let itemsRaw = null;

  for (const line of lines) {
    if (/^النوع\s*[:：]/.test(line)) rawType = line.split(/[:：]/).slice(1).join(":").trim();
    else if (/^الرابط\s*[:：]/.test(line)) link = line.split(/[:：]/).slice(1).join(":").trim();
    else if (/^المحتوى\s*[:：]/.test(line)) itemsRaw = line.split(/[:：]/).slice(1).join(":").trim();
  }

  if (!rawType || !itemsRaw) return null;

  let type = null;
  if (rawType.includes("اعلام") || rawType.includes("أعلام") || rawType.includes("علم")) type = "flag";
  else if (rawType.includes("نسخ") || rawType.includes("لقب")) type = "copy";
  if (!type) return null;

  // فعالية الأعلام: الإيموجيات مفصولة بمسافات (بلا فواصل)
  // فعالية النسخ: الكلمات/الأسماء ممكن تحتوي مسافات، فكنفصلو بالفاصلة فقط
  const items =
    type === "flag"
      ? itemsRaw.split(/\s+/).filter(Boolean)
      : itemsRaw.split(/[,،]+/).map((s) => s.trim()).filter(Boolean);

  if (items.length === 0) return null;

  return { type, link, items };
}

// ==== إعدادات قابلة للتحكم من الخاص (تتحفظ فملف باش تبقى بعد إعادة التشغيل) ====
const SETTINGS_FILE = path.join(__dirname, "settings.json");
let botEnabled = true;
let groupLink = "";
let groupJid = null;

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
      if (typeof saved.enabled === "boolean") botEnabled = saved.enabled;
      if (saved.groupLink) groupLink = saved.groupLink;
      if (saved.groupJid) groupJid = saved.groupJid;
      if (saved.delays) {
        for (const tier of ["easy", "medium", "hard"]) {
          if (Number.isFinite(saved.delays[tier])) setDelay(tier, saved.delays[tier]);
        }
      }
      if (Number.isFinite(saved.copyDelay)) setCopyDelay(saved.copyDelay);
    }
  } catch (err) {
    console.error("خطأ فقراءة settings.json:", err);
  }
}

function saveSettings() {
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify({ enabled: botEnabled, groupLink, groupJid, delays: getDelays(), copyDelay: getCopyDelay() }, null, 2),
    "utf8"
  );
}

// كيستخرج كود الدعوة من رابط المجموعة
function extractInviteCode(link) {
  const match = link && link.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

// كيحدد الـ JID ديال المجموعة انطلاقا من الرابط
async function resolveGroupJid(sock) {
  if (!groupLink) return;
  try {
    const code = extractInviteCode(groupLink);
    if (!code) return;
    const info = await sock.groupGetInviteInfo(code);
    groupJid = info.id;
    saveSettings();
    console.log("✅ تم تحديد JID مجموعة الفعالية:", groupJid);
  } catch (err) {
    console.error("⚠️ خطأ أثناء تحديد JID المجموعة (تأكد إن البوت عضو فيها):", err.message);
  }
}

// ==== إحصائية بسيطة لعدد الأعلام لي جاوبنا عليهم فهاد الجلسة ====
let answeredCount = 0;

async function startBot() {
  loadOwner();
  loadSettings();

  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" })
  });

  if (!sock.authState.creds.registered) {
    const phoneNumber = await getPhoneNumber();
    await sleep(3000);
    try {
      const code = await sock.requestPairingCode(phoneNumber);
      console.log("=================================");
      console.log("رمز الاقتران ديالك هو: " + code);
      console.log("دخلو فواتساب: الأجهزة المرتبطة > ربط جهاز > ربط برقم الهاتف بدلاً من ذلك");
      console.log("=================================");
    } catch (err) {
      console.error("خطأ فطلب رمز الاقتران:", err);
    }
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("الاتصال انقطع، إعادة المحاولة:", shouldReconnect);
      if (shouldReconnect) startBot();
      else console.log("تم تسجيل الخروج. امسح مجلد session وأعد التشغيل.");
    } else if (connection === "open") {
      console.log("✅ Bot Al A3lam متصل ومستعد!");
      await resolveGroupJid(sock);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    if (from === "status@broadcast") return;

    const sender = msg.key.participant || from;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    if (!text) return;

    // ===== تفعيل المالك بالجملة السرية (فالخاص فقط، مرة وحدة) =====
    if (!ownerJid && !from.endsWith("@g.us") && text.trim() === OWNER_ACTIVATION_PHRASE) {
      saveOwner(sender);
      await sock.sendMessage(from, { text: `✅ تم تفعيلك كمالك لبوت الأعلام.\nJID: ${sender}` });
      return;
    }

    // ===== أوامر المالك (فالخاص فقط) =====
    if (isOwner(sender) && !from.endsWith("@g.us")) {
      const t = text.trim();

      // ملي كنا فانتظار استمارة الفعالية، أي رسالة جاية كتعتبر هي الاستمارة
      if (awaitingEventForm) {
        if (t === "الغاء" || t === "إلغاء") {
          awaitingEventForm = false;
          await sock.sendMessage(from, { text: "تم إلغاء التقديم." });
          return;
        }

        const form = parseEventForm(text);
        if (!form) {
          await sock.sendMessage(from, {
            text: `⚠️ الاستمارة ماشي مفهومة. الصيغة المطلوبة:\n\nالنوع: اعلام (أو نسخ)\nالرابط: https://chat.whatsapp.com/xxxxx (اختياري إلا كانت المجموعة محددة من قبل)\nالمحتوى: 🇲🇦 🇱🇧 🇸🇴 (أو كلمات لفعالية النسخ)\n\nأو اكتب "الغاء" باش توقف.`
          });
          return;
        }

        let targetJid = groupJid;
        if (form.link) {
          groupLink = form.link;
          groupJid = null;
          saveSettings();
          await resolveGroupJid(sock);
          targetJid = groupJid;
        }

        if (!targetJid) {
          await sock.sendMessage(from, { text: "⚠️ ماعندكش مجموعة محددة. زيد سطر 'الرابط: ...' فالاستمارة وعاود صيفطها." });
          return;
        }

        awaitingEventForm = false;
        try {
          for (const item of form.items) {
            const challengeText =
              form.type === "flag"
                ? buildFlagChallengeMessage(item, PRESENTER_NAME)
                : buildCopyChallengeMessage(item, PRESENTER_NAME);
            await sock.sendMessage(targetJid, { text: challengeText });
            await sleep(2500); // فاصل صغير بين كل تحدي والي بعدو
          }
          await sock.sendMessage(from, {
            text: `✅ تم تقديم ${form.items.length} تحدي (${form.type === "flag" ? "أعلام" : "نسخ"}) فالمجموعة.`
          });
        } catch (err) {
          console.error("خطأ فتقديم الفعالية:", err);
          await sock.sendMessage(from, { text: "⚠️ وقع خطأ ملي كنت كنصيفط. تأكد البوت عضو فالمجموعة." });
        }
        return;
      }

      if (t === "احصائيات") {
        await sock.sendMessage(from, { text: `📊 عدد الأعلام لي تم الرد عليها فهاد الجلسة: ${answeredCount}` });
        return;
      }

      if (t === "تفعيل") {
        botEnabled = true;
        saveSettings();
        await sock.sendMessage(from, { text: "✅ البوت مفعّل دابا، غايشارك فالفعاليات." });
        return;
      }

      if (t === "ايقاف" || t === "إيقاف") {
        botEnabled = false;
        saveSettings();
        await sock.sendMessage(from, { text: "⏸️ البوت متوقف دابا، ماغايشاركش فالفعاليات حتى تفعلو." });
        return;
      }

      const groupLinkMatch = t.match(/^رابط المجموعة\s+(https:\/\/chat\.whatsapp\.com\/\S+)$/);
      if (groupLinkMatch) {
        groupLink = groupLinkMatch[1];
        groupJid = null;
        saveSettings();
        await resolveGroupJid(sock);
        if (groupJid) {
          await sock.sendMessage(from, { text: `✅ تم تحديد مجموعة الفعالية.\nغايشارك غير فهاد المجموعة.` });
        } else {
          await sock.sendMessage(from, { text: `⚠️ تسجل الرابط، بصح ما قدرتش نتأكد من المجموعة. تأكد إن البوت عضو فيها.` });
        }
        return;
      }

      if (t === "الحالة") {
        const d = getDelays();
        await sock.sendMessage(from, {
          text: `📍 حالة البوت: ${botEnabled ? "🟢 مفعّل" : "🔴 متوقف"}\n🔗 مجموعة الفعالية: ${groupJid ? "✅ محددة" : "❌ ماشي محددة"}\n\n⏱️ أزمنة فعالية الأعلام:\nسهل: ${d.easy}ms\nمتوسط: ${d.medium}ms\nصعيب: ${d.hard}ms\n\n⏱️ زمن فعالية النسخ: ${getCopyDelay()}ms`
        });
        return;
      }

      const delayMatch = t.match(/^تحديد\s+(سهل|متوسط|صعيب)\s+(\d+)$/);
      if (delayMatch) {
        const tierMap = { "سهل": "easy", "متوسط": "medium", "صعيب": "hard" };
        const tier = tierMap[delayMatch[1]];
        const ms = parseInt(delayMatch[2], 10);
        setDelay(tier, ms);
        saveSettings();
        await sock.sendMessage(from, { text: `✅ تم تحديث زمن الرد (${delayMatch[1]}) إلى ${ms}ms.` });
        return;
      }

      const copyDelayMatch = t.match(/^تحديد نسخ\s+(\d+)$/);
      if (copyDelayMatch) {
        const ms = parseInt(copyDelayMatch[1], 10);
        setCopyDelay(ms);
        saveSettings();
        await sock.sendMessage(from, { text: `✅ تم تحديث زمن فعالية النسخ إلى ${ms}ms.` });
        return;
      }

      if (t === "ابدا فعالية" || t === "ابدأ فعالية") {
        awaitingEventForm = true;
        await sock.sendMessage(from, {
          text: `📝 صيفط ليا استمارة الفعالية بهاد الصيغة:\n\nالنوع: اعلام (أو نسخ)\nالرابط: https://chat.whatsapp.com/xxxxx (اختياري إلا كانت المجموعة محددة من قبل)\nالمحتوى: 🇲🇦 🇱🇧 🇸🇴 (الأعلام لي بغيتي نقدمها، أو كلمات لفعالية النسخ)\n\nأو اكتب "الغاء" فأي وقت باش توقف.`
        });
        return;
      }

      if (t === "الغاء تفعيل المالك" || t === "إلغاء تفعيل المالك") {
        if (fs.existsSync(OWNER_FILE)) fs.unlinkSync(OWNER_FILE);
        ownerJid = null;
        await sock.sendMessage(from, { text: "🔓 تم إلغاء تفعيل المالك. باش تعاود تفعل، بعت الجملة السرية من جديد." });
        return;
      }

      if (t === "مساعدة" || t === "الاوامر" || t === "الأوامر") {
        await sock.sendMessage(from, {
          text: `📋 أوامر المالك:\n\n• احصائيات\n• تفعيل\n• ايقاف\n• رابط المجموعة <رابط>\n• الحالة\n• ابدا فعالية (كيطلب منك استمارة: النوع/الرابط/المحتوى)\n• تحديد سهل/متوسط/صعيب <رقم بالميلي ثانية> (فعالية الأعلام)\n• تحديد نسخ <رقم بالميلي ثانية> (فعالية النسخ)\n• الغاء تفعيل المالك\n• مساعدة`
        });
        return;
      }
    }

    // البوت كيخدم غير فالمجموعات (فعالية الأعلام كتوقع فالمجموعات)
    if (!from.endsWith("@g.us")) return;

    // إلا كان البوت متوقف من طرف المالك، ما كيردش
    if (!botEnabled) return;

    // إلا كانت مجموعة الفعالية محددة، البوت كيرد غير فيها وبس
    if (groupJid && from !== groupJid) return;

    const messageId = msg.key.id;
    if (alreadyReplied(messageId)) return; // سبق جاوبنا على هاد الرسالة

    // ===== فعالية النسخ: كيعاود يكتب أيا كان بين 〘 〙 بالضبط =====
    if (text.includes("فعالية النسخ")) {
      const content = extractBracketContent(text);
      if (!content) return; // مافيهاش والو نكتبوه (مازال ما تصيفط الحاجة)
      markReplied(messageId);

      try {
        await sock.sendPresenceUpdate("composing", from);
        await sleep(getCopyDelay());
        await sock.sendPresenceUpdate("paused", from);

        await sock.sendMessage(from, { text: content });
        answeredCount++;
      } catch (err) {
        console.error("خطأ فالرد على فعالية النسخ:", err);
      }
      return;
    }

    // ===== فعالية الأعلام: كيستخرج العلم ويرد بإسم الدولة =====
    const flag = extractFlag(text);
    if (!flag) return;

    const countryName = getCountryName(flag);
    if (!countryName) return; // علم مستخرج بس ماشي فالقاموس ديالنا

    markReplied(messageId);

    try {
      // زمن الرد ثابت ومعروف مسبقا على حسب صعوبة العلم (شفاف، ماشي تمويه)
      const delay = getDelay(flag);

      await sock.sendPresenceUpdate("composing", from);
      await sleep(delay);
      await sock.sendPresenceUpdate("paused", from);

      await sock.sendMessage(from, { text: countryName });
      answeredCount++;
    } catch (err) {
      console.error("خطأ فالرد على العلم:", err);
    }
  });
}

startBot().catch((err) => console.error("خطأ فتشغيل البوت:", err));
