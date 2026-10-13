// Wellness NPCs and their quests.
// Each NPC stands somewhere in the plaza and offers a wellness task the player
// must complete. Task kinds:
//   - "action":  a single meaningful action (press & confirm)
//   - "hold":    hold the button for `seconds` (e.g. breathing / stretching)
//   - "count":   tap through `reps` repetitions (e.g. sips of water)

export const NPCS = [
  {
    id: "aling-nena",
    characterId: 5,
    x: 160, y: 230, // near the store
    name: "Aling Nena",
    task: {
      id: "drink-water",
      kind: "count",
      reps: 1,
      title: "Drink 1 glass of water",
      prompt:
        "You look a little parched, iho/iha! Grab a glass of water and take a sip. Hydration keeps your mind clear.",
      action: "Take a sip",
      done: "Ahh, refreshing! Stay hydrated today. 💧",
      emoji: "💧",
    },
  },
  {
    id: "mang-ben",
    characterId: 12,
    x: 400, y: 180,
    name: "Mang Ben",
    task: {
      id: "deep-breaths",
      kind: "hold",
      seconds: 5,
      title: "Take 5 deep breaths",
      prompt:
        "Hoy, slow down. Hold the button and breathe in slowly... then out. Let's calm that busy mind together.",
      action: "Hold to breathe",
      done: "Feel that? Your shoulders dropped a little. 🌬️",
      emoji: "🌬️",
    },
  },
  {
    id: "ate-lualhati",
    characterId: 20,
    x: 620, y: 300,
    name: "Ate Lualhati",
    task: {
      id: "stand-stretch",
      kind: "hold",
      seconds: 4,
      title: "Stand up & stretch",
      prompt:
        "Been sitting too long? Stand up, reach for the sky, and hold that stretch. Your spine will thank you.",
      action: "Hold to stretch",
      done: "Nice and tall! Movement is medicine. 🤸",
      emoji: "🤸",
    },
  },
  {
    id: "lolo-tasyo",
    characterId: 31,
    x: 300, y: 430,
    name: "Lolo Tasyo",
    task: {
      id: "gratitude",
      kind: "action",
      title: "Name one good thing",
      prompt:
        "At my age, apo, I've learned to notice the small blessings. Think of one good thing about today.",
      action: "I thought of one",
      done: "Hold onto that feeling. Gratitude is a quiet strength. 🌾",
      emoji: "🌾",
    },
  },
  {
    id: "nurse-divine",
    characterId: 8,
    x: 480, y: 450,
    name: "Nurse Divine",
    task: {
      id: "posture-check",
      kind: "action",
      title: "Posture check",
      prompt:
        "Quick check! Uncross your legs, plant both feet, and roll your shoulders back. Sit like royalty.",
      action: "Posture fixed",
      done: "Perfect alignment. Small habits, big difference. 🩺",
      emoji: "🩺",
    },
  },
];

export function npcById(id) {
  return NPCS.find((n) => n.id === id) || null;
}
