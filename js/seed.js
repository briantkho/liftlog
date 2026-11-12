// Starter exercise library and plans. Users can add their own in the app.
// kind: 'weight' = load x reps, 'reps' = bodyweight reps (optional added load)
// equipment: decides what weight math applies (plates for barbells, per-hand for dumbbells, etc.)

const ex = (name, muscle, kind = 'weight', extra = {}) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  name, muscle, kind, ...extra,
});

export const SEED_EXERCISES = [
  // Chest
  ex('Bench press', 'Chest'),
  ex('Incline bench press', 'Chest'),
  ex('Dumbbell bench press', 'Chest'),
  ex('Incline dumbbell press', 'Chest'),
  ex('Cable fly', 'Chest', 'weight', { repMin: 10, repMax: 15 }),
  ex('Pec deck', 'Chest', 'weight', { repMin: 10, repMax: 15 }),
  ex('Machine chest press', 'Chest'),
  ex('Push-up', 'Chest', 'reps'),
  ex('Dip', 'Chest', 'reps'),
  // Back
  ex('Deadlift', 'Back', 'weight', { repMin: 3, repMax: 6 }),
  ex('Barbell row', 'Back'),
  ex('Dumbbell row', 'Back'),
  ex('Lat pulldown', 'Back'),
  ex('Seated cable row', 'Back'),
  ex('Chest-supported row', 'Back'),
  ex('Pull-up', 'Back', 'reps', { repMin: 5, repMax: 10 }),
  ex('Chin-up', 'Back', 'reps', { repMin: 5, repMax: 10 }),
  ex('Face pull', 'Shoulders', 'weight', { repMin: 12, repMax: 20 }),
  // Shoulders
  ex('Overhead press', 'Shoulders', 'weight', { repMin: 5, repMax: 8 }),
  ex('Dumbbell shoulder press', 'Shoulders'),
  ex('Lateral raise', 'Shoulders', 'weight', { repMin: 12, repMax: 20 }),
  ex('Rear delt fly', 'Shoulders', 'weight', { repMin: 12, repMax: 20 }),
  ex('Reverse pec deck', 'Shoulders', 'weight', { repMin: 12, repMax: 20 }),
  // Legs
  ex('Back squat', 'Legs', 'weight', { repMin: 5, repMax: 8 }),
  ex('Front squat', 'Legs', 'weight', { repMin: 5, repMax: 8 }),
  ex('Romanian deadlift', 'Legs'),
  ex('Leg press', 'Legs', 'weight', { repMin: 10, repMax: 15 }),
  ex('Bulgarian split squat', 'Legs'),
  ex('Walking lunge', 'Legs'),
  ex('Leg extension', 'Legs', 'weight', { repMin: 10, repMax: 15 }),
  ex('Leg curl', 'Legs', 'weight', { repMin: 10, repMax: 15 }),
  ex('Hip thrust', 'Glutes'),
  ex('Calf raise', 'Legs', 'weight', { repMin: 10, repMax: 15 }),
  // Arms
  ex('Barbell curl', 'Arms'),
  ex('Dumbbell curl', 'Arms'),
  ex('Hammer curl', 'Arms'),
  ex('Triceps pushdown', 'Arms', 'weight', { repMin: 10, repMax: 15 }),
  ex('Overhead triceps extension', 'Arms', 'weight', { repMin: 10, repMax: 15 }),
  ex('Skull crusher', 'Arms'),
  // Core
  ex('Hanging leg raise', 'Core', 'reps', { repMin: 8, repMax: 15 }),
  ex('Cable crunch', 'Core', 'weight', { repMin: 10, repMax: 15 }),
  ex('Ab wheel', 'Core', 'reps', { repMin: 8, repMax: 15 }),
];

const EQUIPMENT_BY_ID = {
  barbell: ['bench-press', 'incline-bench-press', 'deadlift', 'barbell-row', 'overhead-press', 'back-squat', 'front-squat', 'romanian-deadlift', 'hip-thrust', 'barbell-curl', 'skull-crusher'],
  dumbbell: ['dumbbell-bench-press', 'incline-dumbbell-press', 'dumbbell-row', 'dumbbell-shoulder-press', 'lateral-raise', 'rear-delt-fly', 'bulgarian-split-squat', 'walking-lunge', 'dumbbell-curl', 'hammer-curl', 'overhead-triceps-extension'],
  cable: ['cable-fly', 'seated-cable-row', 'lat-pulldown', 'face-pull', 'triceps-pushdown', 'cable-crunch'],
  machine: ['machine-chest-press', 'pec-deck', 'reverse-pec-deck', 'chest-supported-row', 'leg-extension', 'leg-curl', 'calf-raise'],
  plate: ['leg-press'],
  bodyweight: ['push-up', 'dip', 'pull-up', 'chin-up', 'hanging-leg-raise', 'ab-wheel'],
};
for (const [equipment, ids] of Object.entries(EQUIPMENT_BY_ID)) {
  for (const id of ids) { const e = SEED_EXERCISES.find((x) => x.id === id); if (e) e.equipment = equipment; }
}
// Skull crushers are usually done with an EZ bar.
SEED_EXERCISES.find((x) => x.id === 'skull-crusher').bar = { lb: 25, kg: 10 };

export const EQUIPMENT = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', machine: 'Machine',
  plate: 'Plate-loaded', bodyweight: 'Bodyweight', other: 'Other',
};
// Equipment loaded with plates on a bar or sleeve (plate math applies).
export const PLATE_LOADED = ['barbell', 'plate'];

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Legs', 'Glutes', 'Arms', 'Core', 'Other'];

const item = (exerciseId, sets = 3) => ({ exerciseId, sets });

export const STARTER_PLANS = [
  {
    name: 'Full body (2 to 3 days)',
    blurb: 'Two alternating days. Good if you are getting back into it.',
    routines: [
      { name: 'Full body A', items: [item('back-squat'), item('bench-press'), item('barbell-row'), item('lateral-raise'), item('hanging-leg-raise', 2)] },
      { name: 'Full body B', items: [item('romanian-deadlift'), item('overhead-press'), item('lat-pulldown'), item('dumbbell-curl'), item('triceps-pushdown')] },
    ],
  },
  {
    name: 'Upper / lower (4 days)',
    blurb: 'Four sessions a week, each muscle hit twice.',
    routines: [
      { name: 'Upper 1', items: [item('bench-press'), item('barbell-row'), item('overhead-press'), item('lat-pulldown'), item('dumbbell-curl'), item('triceps-pushdown')] },
      { name: 'Lower 1', items: [item('back-squat'), item('romanian-deadlift'), item('leg-press'), item('leg-curl'), item('calf-raise')] },
      { name: 'Upper 2', items: [item('incline-dumbbell-press'), item('seated-cable-row'), item('dumbbell-shoulder-press'), item('pull-up'), item('hammer-curl'), item('overhead-triceps-extension')] },
      { name: 'Lower 2', items: [item('deadlift'), item('bulgarian-split-squat'), item('leg-extension'), item('leg-curl'), item('hanging-leg-raise')] },
    ],
  },
  {
    name: 'Push / pull / legs (3 or 6 days)',
    blurb: 'Classic split. Run it once or twice a week.',
    routines: [
      { name: 'Push', items: [item('bench-press'), item('overhead-press'), item('incline-dumbbell-press'), item('lateral-raise'), item('triceps-pushdown')] },
      { name: 'Pull', items: [item('deadlift'), item('pull-up'), item('barbell-row'), item('face-pull'), item('barbell-curl')] },
      { name: 'Legs', items: [item('back-squat'), item('romanian-deadlift'), item('leg-press'), item('leg-curl'), item('calf-raise')] },
    ],
  },
];
