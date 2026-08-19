// ============================================
//   حالة فعالية الأعلام الجارية بالجروب
// ============================================
// فعالية وحدة تشتغل بنفس الوقت (ما يصير تشتغل فعاليتين أعلام سوا)

let game = null;

function isActive() {
  return game !== null && game.active;
}

function start({ adminChatId, groupId, queue }) {
  game = {
    active: true,
    adminChatId,
    groupId,
    queue, // [{ emoji, iso, name }, ...]
    currentIndex: 0,
    results: [], // [{ emoji, name, winnerName, winnerNumber }]
  };
  return game;
}

function currentFlag() {
  if (!game || !game.active) return null;
  return game.queue[game.currentIndex] || null;
}

function getGroupId() {
  if (!game || !game.active) return null;
  return game.groupId;
}

function recordWinAndAdvance(winnerName, winnerNumber) {
  if (!game || !game.active) return null;

  const flag = game.queue[game.currentIndex];
  game.results.push({
    emoji: flag.emoji,
    name: flag.name,
    winnerName,
    winnerNumber,
  });

  game.currentIndex += 1;

  return {
    finished: game.currentIndex >= game.queue.length,
    nextFlag: game.queue[game.currentIndex] || null,
  };
}

function getSnapshotForResults() {
  if (!game) return null;
  return {
    adminChatId: game.adminChatId,
    results: game.results,
    total: game.queue.length,
  };
}

function reset() {
  game = null;
}

module.exports = {
  isActive,
  start,
  currentFlag,
  getGroupId,
  recordWinAndAdvance,
  getSnapshotForResults,
  reset,
};
