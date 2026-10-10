export const CHALLENGES = [
  {
    id: "send-snap",
    title: "Send Snap 📸",
    description: "Send your daily photo on Snapchat, then tap the button here to mark it as sent."
  },
  {
    id: "drink-water",
    title: "Drink Water 💧",
    description: "Track your glasses of water. Your daily goal is 8 glasses each."
  },
  {
    id: "love-you-today",
    title: "Send Something - Love You Today ❤️",
    description: "Share a little photo or love note. It stays a secret until you both upload today."
  }
];

export function challengeForDay(dayKey) {
  const dayNumber = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86400000);
  return CHALLENGES[((dayNumber % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
}

export function challengeDays(startDayKey, count = 7) {
  const firstDay = Date.parse(`${startDayKey}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const dayKey = new Date(firstDay + index * 86400000).toISOString().slice(0, 10);
    return CHALLENGES.map(challenge => ({ ...challenge, dayKey, challengeId: challenge.id, id: `${dayKey}-${challenge.id}` }));
  }).flat();
}
