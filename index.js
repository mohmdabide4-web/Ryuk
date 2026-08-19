const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const readline = require("readline");
const http = require("http");

// سيرفر بسيط بس عشان Railway يعتبر التطبيق "شغال وصحي" وما يوقفه
// (Railway بمشاريع الويب يحتاج التطبيق يرد على منفذ، حتى لو البوت نفسه ما يحتاج سيرفر)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("البوت شغال ✅");
}).listen(PORT, () => {
  console.log(`🌐 سيرفر الحماية شغال على المنفذ ${PORT}`);
});

const config = require("./config");
const alam = require("./alam");
const game = require("./game");
const { parseFlagsFromText } = require("./flags");
const { isCorrectAnswer } = require("./arabic");
const { resolveGroupId } = require("./groupResolver");

// خلك حر تكتب رقمك هنا مباشرة (مع رمز الدولة، بدون + أو مسافات) إذا ما تبي تستخدم متغير بيئة
// مثال: const HARDCODED_PHONE_NUMBER = "966501234567";
// خليه فاضي "" إذا تفضّل PAIRING_NUMBER من متغيرات البيئة
const HARDCODED_PHONE_NUMBER = "212781399940";
// خلي هذا true عشان يستخدم كود الاقتران (Pairing Code) بدل QR
const USE_PAIRING_CODE = true;

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (answer) => { rl.close(); resolve(answer); }));
}

// لإضافة فعالية جديدة لاحقًا (مثل "النسخ")، سوّي ملف جديد بنفس شكل alam.js
// وضيفه هنا بالمصفوفة، مثال: const EVENTS = [alam, nask];
const EVENTS = [alam];

// حالة كل أدمن وهو بمنتصف تجهيز فعالية
// key: رقم الأدمن | value: { stage, event, queue }
// stage: "awaiting_content" | "awaiting_group"
const adminState = new Map();

const CANCEL_WORD = "الغاء";
const STOP_GAME_WORD = "انهاء الفعالية";

function isAdmin(senderNumber) {
  return config.ADMIN_NUMBERS.includes(senderNumber);
}

function findEventByTrigger(text) {
  const normalized = text.trim();
  return EVENTS.find((ev) => ev.triggers.includes(normalized));
}

function getAlamEvent() {
  return EVENTS.find((ev) => ev.eventTitle === "فعالية الاعلام");
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: !USE_PAIRING_CODE,
    browser: Browsers.macOS("Safari"), // هوية أكثر توافقًا مع كود الاقتران عند بعض الحسابات
  });

  // لو ما كاين تسجيل سابق ومفعّل وضع كود الاقتران، نطلب الكود
  if (USE_PAIRING_CODE && !sock.authState.creds.registered) {
    let phoneNumber = HARDCODED_PHONE_NUMBER || process.env.PAIRING_NUMBER;

    if (!phoneNumber) {
      if (process.stdin.isTTY) {
        phoneNumber = await askQuestion(
          "أدخل رقم الهاتف مع رمز الدولة بدون + أو مسافات (مثال: 966501234567): "
        );
      } else {
        console.log("❌ ما فيه متغير PAIRING_NUMBER مضبوط، وما فيه إدخال تفاعلي متاح (يعني سيرفر سحابي).");
        console.log("روح لإعدادات Railway → Variables → ضيف PAIRING_NUMBER برقمك (مثال: 966501234567) وأعد النشر.");
        return;
      }
    }

    phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log("=========================================");
        console.log("📱 كود الاقتران ديالك:", code);
        console.log("افتح واتساب → الأجهزة المرتبطة → ربط جهاز → ربط برقم الهاتف");
        console.log("=========================================");
      } catch (err) {
        console.error("خطأ فطلب كود الاقتران:", err.message);
      }
    }, 3000);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !USE_PAIRING_CODE) {
      console.log("امسح رمز QR هذا من تطبيق واتساب (أجهزة مرتبطة):");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("انقطع الاتصال. إعادة المحاولة:", shouldReconnect);
      if (shouldReconnect) {
        startBot();
      } else {
        console.log(
          "تم تسجيل الخروج. احذف مجلد",
          config.AUTH_FOLDER,
          "وشغّل من جديد لعمل ربط جديد."
        );
      }
    } else if (connection === "open") {
      console.log("✅ البوت متصل بنجاح بواتساب.");
    }
  });

  // يبني ملخص النتائج النهائية ويرسله للأدمن بالخاص، وينهي الفعالية
  async function finishGameAndSendResults() {
    const snapshot = game.getSnapshotForResults();
    if (!snapshot) return;

    const lines = snapshot.results.map((r, i) => {
      const winner = r.winnerName ? r.winnerName : "بدون فائز";
      return `${i + 1}. ${r.emoji} ${r.name} — الفائز: ${winner}`;
    });

    const summary =
      `🏁 *انتهت فعالية الأعلام*\n` +
      `عدد الأعلام: ${snapshot.total}\n\n` +
      (lines.length ? lines.join("\n") : "ما فيه نتائج مسجلة.");

    await sock.sendMessage(snapshot.adminChatId, { text: summary });
    game.reset();
  }

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;
    const isGroupChat = chatId.endsWith("@g.us");

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (!text) return;

    // ============================================
    //   رسائل جاية من جروب — نتحقق منها بس لو فيه
    //   فعالية أعلام شغالة بنفس هذا الجروب بالضبط
    // ============================================
    if (isGroupChat) {
      if (!game.isActive()) return;

      const flag = game.currentFlag();
      if (!flag) return;

      const activeGroupId = game.getGroupId ? game.getGroupId() : null;
      if (activeGroupId && chatId !== activeGroupId) return;

      if (!isCorrectAnswer(text, flag.name)) return;

      const winnerName = msg.pushName || "مجهول";
      const winnerNumber = msg.key.participant
        ? msg.key.participant.split("@")[0]
        : chatId.split("@")[0];

      const advance = game.recordWinAndAdvance(winnerName, winnerNumber);

      if (advance.finished) {
        await finishGameAndSendResults();
      } else {
        const alamEvent = getAlamEvent();
        const nextMessage = alamEvent.buildMessage(advance.nextFlag.emoji);
        await sock.sendMessage(chatId, { text: nextMessage });
      }

      return;
    }

    // ============================================
    //   رسائل خاصة — بس من الأدمن
    // ============================================
    const senderNumber = chatId.split("@")[0];
    if (!isAdmin(senderNumber)) return;

    // أمر إيقاف فعالية شغالة
    if (text.trim() === STOP_GAME_WORD) {
      if (game.isActive()) {
        await finishGameAndSendResults();
        await sock.sendMessage(chatId, { text: "تم إيقاف الفعالية وإرسال النتائج ⬆️" });
      } else {
        await sock.sendMessage(chatId, { text: "ما فيه فعالية شغالة حالياً." });
      }
      return;
    }

    // لو الأدمن بمنتصف تجهيز فعالية
    if (adminState.has(senderNumber)) {
      const st = adminState.get(senderNumber);

      if (text.trim() === CANCEL_WORD) {
        adminState.delete(senderNumber);
        await sock.sendMessage(chatId, { text: "تم إلغاء التقديم ❌" });
        return;
      }

      // مرحلة استلام قائمة الأعلام
      if (st.stage === "awaiting_content") {
        const queue = parseFlagsFromText(text);

        if (queue.length === 0) {
          await sock.sendMessage(chatId, {
            text: "ما لقيت أي علم بالرسالة. أرسل رسالة فيها إيموجيات أعلام دول 🏳️",
          });
          return;
        }

        st.queue = queue;
        st.stage = "awaiting_group";
        adminState.set(senderNumber, st);

        await sock.sendMessage(chatId, {
          text: `تم ✅ (${queue.length} علم)\nأرسل رابط دعوة الجروب أو آيدي الجروب عشان أبدأ أنشر فيه.`,
        });
        return;
      }

      // مرحلة استلام رابط/آيدي الجروب
      if (st.stage === "awaiting_group") {
        if (game.isActive()) {
          await sock.sendMessage(chatId, {
            text:
              'فيه فعالية شغالة حالياً. انتظر لين تخلص، أو أرسل "' +
              STOP_GAME_WORD +
              '" لإيقافها.',
          });
          return;
        }

        let groupId;
        try {
          groupId = await resolveGroupId(sock, text.trim());
        } catch (err) {
          await sock.sendMessage(chatId, { text: err.message });
          return;
        }

        game.start({
          adminChatId: chatId,
          groupId,
          queue: st.queue,
        });

        adminState.delete(senderNumber);

        const alamEvent = getAlamEvent();
        const firstFlag = game.currentFlag();
        const firstMessage = alamEvent.buildMessage(firstFlag.emoji);

        await sock.sendMessage(groupId, { text: firstMessage });
        await sock.sendMessage(chatId, { text: "بدأت الفعالية بالجروب ✅" });
        return;
      }

      return;
    }

    // مو بمنتصف تجهيز شي — تحقق هل الرسالة أمر بدء فعالية
    const matchedEvent = findEventByTrigger(text);

    if (matchedEvent) {
      if (game.isActive()) {
        await sock.sendMessage(chatId, {
          text:
            'فيه فعالية شغالة حالياً. انتظر لين تخلص، أو أرسل "' +
            STOP_GAME_WORD +
            '" لإيقافها.',
        });
        return;
      }

      adminState.set(senderNumber, {
        stage: "awaiting_content",
        event: matchedEvent,
        queue: null,
      });

      await sock.sendMessage(chatId, {
        text: "أرسل قائمة الأعلام (إيموجيات الدول) اللي تبي البوت ينشرها بالفعالية 🏁",
      });
    }
  });
}

startBot().catch((err) => {
  console.error("خطأ بتشغيل البوت:", err);
});
