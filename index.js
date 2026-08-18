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
const OWNER_ACTIVATION_PHRASE = "تفعيل مالك اعلام 2025";

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

// ==== إحصائية بسيطة لعدد الأعلام لي جاوبنا عليهم فهاد الجلسة ====
let answeredCount = 0;

async function startBot() {
  loadOwner();

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

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("الاتصال انقطع، إعادة المحاولة:", shouldReconnect);
      if (shouldReconnect) startBot();
      else console.log("تم تسجيل الخروج. امسح مجلد session وأعد التشغيل.");
    } else if (connection === "open") {
      console.log("✅ Bot Al A3lam متصل ومستعد!");
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

    // ===== أمر إحصائية بسيط للمالك (فالخاص) =====
    if (isOwner(sender) && !from.endsWith("@g.us") && text.trim() === "احصائيات") {
      await sock.sendMessage(from, { text: `📊 عدد الأعلام لي تم الرد عليها فهاد الجلسة: ${answeredCount}` });
      return;
    }

    // البوت كيخدم غير فالمجموعات (فعالية الأعلام كتوقع فالمجموعات)
    if (!from.endsWith("@g.us")) return;

    // ===== استخراج العلم من الرسالة =====
    const flag = extractFlag(text);
    if (!flag) return;

    const countryName = getCountryName(flag);
    if (!countryName) return; // علم مستخرج بس ماشي فالقاموس ديالنا

    const messageId = msg.key.id;
    if (alreadyReplied(messageId)) return; // سبق جاوبنا على هاد الرسالة
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
