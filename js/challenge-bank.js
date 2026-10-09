export const CHALLENGES = [
  {
    id: "kind-message",
    title: "Send a kind message",
    description: "Share one thoughtful message to brighten each other's day."
  },
  {
    id: "cook-together",
    title: "Cook something together",
    description: "Choose a recipe, make it side by side, and enjoy it together."
  },
  {
    id: "little-adventure",
    title: "Plan a little adventure",
    description: "Pick a nearby place and plan a small outing for the two of you."
  },
  {
    id: "gratitude",
    title: "Share what you appreciate",
    description: "Tell each other one little thing you are grateful for today."
  },
  {
    id: "memory-photo",
    title: "Capture a favorite moment",
    description: "Take a photo of something that reminds you of your story together."
  },
  {
    id: "draw-something",
    title: "Draw something silly together",
    description: "Make a quick drawing together and give it a funny title."
  },
  {
    id: "dream-date",
    title: "Dream up your next date",
    description: "Each suggest one idea and choose a date to look forward to."
  },
  {
    id: "walk-together",
    title: "Take a little walk",
    description: "Enjoy a short walk and notice something new along the way."
  },
  {
    id: "favorite-song",
    title: "Share a song",
    description: "Send each other a song that brings a happy memory to mind."
  },
  {
    id: "screen-free",
    title: "Have a screen-free moment",
    description: "Put devices aside for a little while and enjoy each other's company."
  },
  {
    id: "try-something-new",
    title: "Try something new",
    description: "Pick a new snack, game, or activity and give it a try together."
  },
  {
    id: "future-note",
    title: "Write a note for the future",
    description: "Write a short note about something you are excited to do together."
  },
  {
    id: "favorite-memory",
    title: "Tell a favorite memory",
    description: "Share one favorite memory and what made it special."
  },
  {
    id: "cozy-break",
    title: "Plan a cozy break",
    description: "Make a warm drink, get comfortable, and take a peaceful break together."
  },
  {
    id: "send-snap",
    title: "Send a Snap",
    description: "Take a photo, apply a filter, and share it!"
  },
  {
    id: "drink-water",
    title: "Drink Water Together",
    description: "Take a hydration break together."
  }
];

export function challengeForDay(dayKey) {
  const dayNumber = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86400000);
  const cutoffDate = Math.floor(Date.parse("2026-10-09T00:00:00Z") / 86400000);

  const length = dayNumber < cutoffDate ? 14 : CHALLENGES.length;
  const index = ((dayNumber % length) + length) % length;
  return CHALLENGES[index];
}

export function challengeDays(startDayKey, count = 7) {
  const firstDay = Date.parse(`${startDayKey}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const dayKey = new Date(firstDay + index * 86400000).toISOString().slice(0, 10);
    const challenge = challengeForDay(dayKey);
    return { ...challenge, dayKey, challengeId: challenge.id, id: `${dayKey}-${challenge.id}` };
  });
}
