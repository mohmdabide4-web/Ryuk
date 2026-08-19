// index.js
const fs = require("fs");
const path = require("path");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");

// تحميل الكونفيج
require("./config");

// ==== رقم المالك ====
const OWNER = (global.owner && global.owner[0] && global.owner[0][0])
  ? global.owner[0][0] + "@s.whatsapp.net"
  : "212726590815@s.whatsapp.net";

// ==== رقم البوت (للـ Pairing Code) ====
const BOT_NUMBER = global.pairingNumber || "212781399940";

// ==== حفظ اللقب المتسالين ====
const CLAIMS_FILE = path.join(__dirname, "claims.json");
let claims = {};

function loadClaims() {
  try {
    if (fs.existsSync(CLAIMS_FILE)) {
      claims = JSON.parse(fs.readFileSync(CLAIMS_FILE, "utf8"));
    }
  } catch (err) {
    console.error("خطأ فقراءة claims.json:", err);
    claims = {};
  }
}

function saveClaims() {
  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(claims, null, 2), "utf8");
}

const userState = new Map();

// تنظيف النص
function normalizeText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/\s+/g, " ");
}

// ترجمة الأسماء العربية
function translateArabicToEnglish(text) {
  const map = {
    "ايساغي": "Isagi",
    "ايسامي": "Isagi",
    "ايساغي يويتشي": "Isagi Yoichi",
    "ريوك": "Ryuk",
    "ناروتو": "Naruto",
    "لوفي": "Luffy",
    "مونكي دي لوفي": "Monkey D Luffy",
    "غوكو": "Goku",
    "سون غوكو": "Son Goku",
    "سايتاما": "Saitama",
    "ايرين": "Eren",
    "ليفاي": "Levi",
    "غوجو": "Gojo",
    "ساتورو غوجو": "Satoru Gojo",
    "ايتادوري": "Itadori",
    "يوجي ايتادوري": "Yuji Itadori",
    "تانجيرو": "Tanjiro",
    "زينيتسو": "Zenitsu",
    "نيزوكو": "Nezuko",
    "سولو ليفلينغ": "Solo Leveling",
    "سون جين وو": "Sung Jinwoo",
    "ون بيس": "One Piece"
  };
  const cleaned = normalizeText(text);
  return map[cleaned] || text;
}

function findAnime(text) {
  const cleaned = normalizeText(text);
  const asNumber = parseInt(cleaned, 10);
  if (!isNaN(asNumber)) {
    return (global.animeList || []).find((a) => a.id === asNumber);
  }

  return (global.animeList || []).find((a) => {
    const nameNorm = normalizeText(a.name);
    const aliasesNorm = (a.aliases || []).map(al => normalizeText(al));

    if (nameNorm === cleaned || aliasesNorm.includes(cleaned)) return true;
    if (nameNorm.startsWith(cleaned) || cleaned.startsWith(nameNorm)) return true;
    if (aliasesNorm.some(al => al.startsWith(cleaned) || cleaned.startsWith(al))) return true;

    const nameParts = nameNorm.split(" ");
    const cleanedParts = cleaned.split(" ");
    if (nameParts.some(part => cleanedParts.includes(part))) return true;
    if (aliasesNorm.some(al => al.split(" ").some(part => cleanedParts.includes(part)))) return true;

    return false;
  });
}

async function isKnownAnimeOrCharacter(text) {
  const searchText = translateArabicToEnglish(text);
  const query = `
    query ($search: String) {
      anime: Media(search: $search, type: ANIME) { id title { romaji english } }
      character: Character(search: $search) { id name { full } }
    }
  `;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { search: searchText } }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.data?.anime || data?.data?.character);
  } catch (err) {
    console.error("خطأ فالتحقق من AniList:", err.message);
    return false;
  }
}

function randomDelay(minMs = 1200, maxMs = 3000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendNaturally(sock, jid, content, messageKey) {
  try {
    if (messageKey) await sock.readMessages([messageKey]);
    await sock.sendPresenceUpdate("composing", jid);
    await randomDelay();
    await sock.sendPresenceUpdate("paused", jid);
    return await sock.sendMessage(jid, content);
  } catch (err) {
    console.error("خطأ فالإرسال الطبيعي:", err);
  }
}

// استمارة الاستقبال
function buildWelcomeForm(nickname, number) {
  return `*╼━╍╾ •『☃️』• ╼╍━╾*
*⨳ الـلـقـب╎ 『 ${nickname} 』*
*⨳ مـن طـرف╎ 『 ريوك 』*
*⨳ إسـتـقـبـال╎ 『 ريوك 』*
*⨳ االـــــرقـــم. 『 ${number} 』*
*╼━╍╾ •『☃️』• ╼╍━╾*
*『𝑲𝑨𝑹𝑫𝑵⊰☃️⊱𝑾𝑶𝑹𝑲』*`;
}

async function startBot() {
  loadClaims();

  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" })
  });

  // Pairing Code تلقائي
  if (!sock.authState.creds.registered) {
    console.log("جاري طلب رمز الاقتران للرقم:", BOT_NUMBER);
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(BOT_NUMBER);
        console.log("=================================");
        console.log("رمز الاقتران ديالك هو: " + code);
        console.log("دخلو فواتساب: الأجهزة المرتبطة > ربط جهاز > ربط برقم الهاتف بدلاً من ذلك");
        console.log("=================================");
      } catch (err) {
        console.error("خطأ فطلب رمز الاقتران:", err);
      }
    }, 3000);
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
      console.log("✅ البوت متصل ومستعد!");
    }
  });

  // استماع لدخول الأعضاء
  sock.ev.on("group-participants.update", async (update) => {
    try {
      if (!global.mainGroupJid || update.id !== global.mainGroupJid) return;
      if (update.action !== "add") return;

      for (const participant of update.participants) {
        const found = Object.entries(claims).find(([id, num]) => num === participant);
        const animeId = found ? found[0] : null;
        const anime = animeId ? (global.animeList || []).find(a => a.id == animeId) : null;
        const displayName = anime ? anime.name : "عضو جديد";
        const number = participant.replace("@s.whatsapp.net", "");

        if (global.workGroupJid) {
          const form = buildWelcomeForm(displayName, number);
          await sock.sendMessage(global.workGroupJid, { text: form });
        }
      }
    } catch (err) {
      console.error("خطأ فاستماع الدخول للمجموعة:", err);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const messageAgeSeconds = Math.floor(Date.now() / 1000) - (msg.messageTimestamp || 0);
    if (messageAgeSeconds > 60) return;

    const from = msg.key.remoteJid;
    if (from === "status@broadcast") return;

    const sender = msg.key.participant || from;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    if (!text) return;

    // أوامر المالك
    if (sender === OWNER && !from.endsWith("@g.us")) {
      if (text === "الألقاب" || text === "الالقاب") {
        const list = Object.entries(claims)
          .map(([id, number]) => {
            const anime = (global.animeList || []).find(a => a.id == id);
            return `${anime ? anime.name : id} → ${number.replace("@s.whatsapp.net", "")}`;
          })
          .join("\n") || "ما كاين حتى لقب مسجل";
        await sock.sendMessage(from, { text: `الألقاب المسجلة:\n\n${list}` });
        return;
      }

      if (text === "رابط الأساسي" || text === "الرابط الأساسي") {
        await sock.sendMessage(from, { text: `🔗 الرابط الأساسي:\n${global.mainGroupLink}` });
        return;
      }

      if (text === "رابط الورك" || text === "الورك") {
        await sock.sendMessage(from, { text: `🔗 رابط الورك:\n${global.workGroupLink}` });
        return;
      }

      if (text.toLowerCase() === "jid") {
        await sock.sendMessage(from, { text: `JID ديال هاد الشات:\n${from}` });
        return;
      }
    }

    if (from.endsWith("@g.us")) return;

    await handleMessage(sock, from, text.trim(), msg.key);
  });
}

async function handleMessage(sock, from, text, messageKey) {
  const state = userState.get(from) || { greeted: false };

  if (!state.greeted) {
    await sendNaturally(sock, from, { text: global.welcomeMessage }, messageKey);
    userState.set(from, { greeted: true });
    return;
  }

  const anime = findAnime(text);

  if (anime) {
    const claimedBy = claims[anime.id];
    if (claimedBy && claimedBy !== from) {
      await sendNaturally(sock, from, { text: global.takenMessage }, messageKey);
      return;
    }

    claims[anime.id] = from;
    saveClaims();

    await sendNaturally(
      sock,
      from,
      { text: global.groupLinkMessage(anime.name, global.mainGroupLink) },
      messageKey
    );
    return;
  }

  const isReal = await isKnownAnimeOrCharacter(text);
  if (isReal) {
    await sendNaturally(sock, from, { text: global.knownButUnsupportedMessage }, messageKey);
  } else {
    await sendNaturally(sock, from, { text: global.invalidChoiceMessage }, messageKey);
  }
}

startBot().catch((err) => console.error("خطأ فتشغيل البوت:", err));
