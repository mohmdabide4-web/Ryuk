// config.js

module.exports = {
  // رسالة الترحيب
  welcomeMessage: `نورتني 🤭

اختر لقب انمي الي تحب تناديك به 🤝`,

  // رسالة اللقب مستعمل
  takenMessage: `هذا اللقب مستخدم حاليا ❌
اختر غيره 🔥`,

  // رسالة اللقب ماشي معروف
  invalidChoiceMessage: `❌ هذا ماشي اسم أنمي أو شخصية معروفة، حاول لقب آخر`,

  // رسالة الاسم معروف لكن ماعندناش مجموعة ليه
  knownButUnsupportedMessage: `😅 هذا الاسم معروف، لكن ماعندناش مجموعة مخصصة ليه حالياً
جرب لقب آخر`,

  // رسالة مع رابط المجموعة
  groupLinkMessage: (animeName, link) =>
    `اهلا وسهلا بك ${animeName} 🤭
${link}`,

  // ===== الروابط =====
  mainGroupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ",
  workGroupLink: "https://chat.whatsapp.com/EE5ZjqbGs782Aa6YwP9pLp",

  // ===== JID ديال المجموعات (عمرهم من بعد) =====
  mainGroupJid: "",
  workGroupJid: "",

  // قائمة الأنميات والشخصيات
  animeList: [
    {
      id: 1,
      name: "ناروتو",
      aliases: ["naruto", "ناروتو"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 2,
      name: "ريوك",
      aliases: ["ryuk", "ريوك"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 3,
      name: "ون بيس",
      aliases: ["one piece", "ون بيس", "وان بيس", "لوفي", "luffy"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 4,
      name: "سولو ليفلينغ",
      aliases: ["solo leveling", "سولو ليفلينغ", "سون جين وو", "جين وو"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 5,
      name: "ايساغي",
      aliases: ["isagi", "ايساغي", "ايسامي", "ايساغي يويتشي", "يويتشي"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 6,
      name: "غوجو",
      aliases: ["gojo", "غوجو", "ساتورو غوجو", "ساتورو", "gojo satoru"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 7,
      name: "ايتادوري",
      aliases: ["itadori", "ايتادوري", "يوجي", "يوجي ايتادوري"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 8,
      name: "ايرين",
      aliases: ["eren", "ايرين", "إيرين", "ايرين ييغر"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 9,
      name: "ليفاي",
      aliases: ["levi", "ليفاي", "ليفاي أكرمان"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 10,
      name: "غوكو",
      aliases: ["goku", "غوكو", "سون غوكو"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 11,
      name: "سايتاما",
      aliases: ["saitama", "سايتاما"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    },
    {
      id: 12,
      name: "تانجيرو",
      aliases: ["tanjiro", "تانجيرو", "تانجيرو كامادو"],
      groupLink: "https://chat.whatsapp.com/JNzW856HJsNIP3MdG4DEsZ"
    }
  ]
};
