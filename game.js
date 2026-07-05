// All In Ascent — browser game bundle.
//
// This file is the SINGLE SOURCE OF TRUTH for game data. The GAME DATA section
// below is extracted into engine/data.js by `node engine/build-data.js` (run
// automatically by the test/playtest npm scripts) so the Node engine, sim
// harness, and analysis tools read the same values without hand-syncing.
// Rules version is kept in step with the Node engine (engine/version.js).
const GAME_VERSION = '0.6.0';
if (typeof window !== 'undefined') window.GAME_VERSION = GAME_VERSION;

// ===== GAME DATA =====

const CHARACTERS = {
 technician: {
 name: "The Technician",
 archetype: "Precision Specialist",
 description: "A movement artist who reads sequences perfectly and wastes no energy on inefficient beta.",
 startingStats: { strength: 12, technique: 26, focus: 18, flexibility: 14 },
 startingEndurance: 100,
 growth: { strength: 1.5, technique: 4.5, focus: 2.5, flexibility: 2, endurance: 5 },
 specialAbility: {
 name: "Perfect Beta",
 description: "PASSIVE: Negate all nerf dice effects on every climb. All stat requirements reduced by 5. Add +1 time cost to every climb.",
 used: false
 }
 },
 sprinter: {
 name: "The Sprinter",
 archetype: "Speed Climber",
 description: "Climbs explosively with dynamic movements. Burns bright but fast.",
 startingStats: { strength: 22, technique: 14, focus: 12, flexibility: 16 },
 startingEndurance: 85,
 growth: { strength: 4, technique: 2, focus: 1.5, flexibility: 2.5, endurance: 3 },
 specialAbility: {
 name: "Flash Speed",
 description: "PASSIVE: Reduce time cost of every climb by 2 (min 1), but gain only half XP on success. Rolls an extra d6 nerf die applied to Focus on every climb.",
 used: false
 }
 },
 ironLung: {
 name: "The Iron Lung",
 archetype: "Endurance Athlete",
 description: "Tackles challenges head-on with determination.",
 startingStats: { strength: 16, technique: 17, focus: 19, flexibility: 14 },
 startingEndurance: 120,
 growth: { strength: 2.5, technique: 2.5, focus: 3, flexibility: 2, endurance: 8 },
 specialAbility: {
 name: "Relentless",
 description: "PASSIVE: On a failed climb, earn 50% more XP than the base fail XP. Also lose an extra 5 Endurance on failure.",
 used: false
 }
 },
 freeSolo: {
 name: "The Free Solo",
 archetype: "Risk Taker",
 description: "Dares to perform the impossible with no fear.",
 startingStats: { strength: 11, technique: 23, focus: 20, flexibility: 16 },
 startingEndurance: 100,
 growth: { strength: 1.5, technique: 4, focus: 3, flexibility: 2.5, endurance: 6 },
 specialAbility: {
 name: "Life or Die",
 description: "PASSIVE: Can access Top Rope and Lead routes without equipment. All dice roll effects are negated. Can only attempt climbs where your stats — base + training + permanent gear bonuses — meet every requirement (no luck swing allowed).",
 used: false
 }
 },
 routeReader: {
 name: "The Route Reader",
 archetype: "Problem Solver",
 description: "Studies routes meticulously before attempting. Knowledge is power.",
 startingStats: { strength: 15, technique: 19, focus: 22, flexibility: 14 },
 startingEndurance: 110,
 growth: { strength: 2, technique: 3.5, focus: 4, flexibility: 1.5, endurance: 7 },
 specialAbility: {
 name: "Versatility",
 description: "Resting grants a Beta Boost (+3 all stats) for your next climb. Only 3 of 4 stats need to pass to succeed a climb. Once per round, redistribute up to 10 stat points between two attributes.",
 used: false
 }
 }
};

const XP_TABLE = [
 { level: 1, cumulative: 0, needed: 100 },
 { level: 2, cumulative: 100, needed: 150 },
 { level: 3, cumulative: 250, needed: 200 },
 { level: 4, cumulative: 450, needed: 250 },
 { level: 5, cumulative: 700, needed: 300 },
 { level: 6, cumulative: 1000, needed: 350 },
 { level: 7, cumulative: 1350, needed: 400 },
 { level: 8, cumulative: 1750, needed: 450 },
 { level: 9, cumulative: 2200, needed: 500 },
 { level: 10, cumulative: 2700, needed: 550 },
 { level: 11, cumulative: 3250, needed: 600 },
 { level: 12, cumulative: 3850, needed: 650 },
 { level: 13, cumulative: 4500, needed: 700 },
 { level: 14, cumulative: 5200, needed: 800 },
 { level: 15, cumulative: 6000, needed: 0 }
];

const TRAINING_AREAS = [
 { name: "Grip Board", stat: "focus", bonus: 5, time: 2, endurance: 10, description: "+5 Focus" },
 { name: "Campus Board", stat: "strength", bonus: 5, time: 2, endurance: 15, description: "+5 Strength" },
 { name: "Continuous MoonBoard", stat: "technique", bonus: 5, time: 2, endurance: 12, description: "+5 Technique" },
 { name: "Balance and Core", stat: "flexibility", bonus: 5, time: 2, endurance: 8, description: "+5 Flexibility" }
];

// Comprehensive route data - simplified version with key routes
// rollEffect format: array of objects { stat: 'statName', modifier: 1 or -1 }
// modifier -1 means subtract die from requirement (buff), +1 means add die to requirement (nerf)
// gearModifiers: array of gear names that provide benefits on this route
const ROUTES = {
 bouldering: [
 { name: "Beginner's Fortune", grade: "V0", strength: 15, technique: 15, focus: 15, flexibility: 10, time: 2, endurance: 12, xpSuccess: 25, xpFail: 8, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Slab", holdFeatures: ["Jugs"], moveFeatures: [], tag: null },
 // ===== Strength-friendly starter routes (added engine v0.2.0) =====
 // Designed to give Strength-archetype characters (Sprinter, Powerhouse-archetype)
 // a viable entry path. All have low Tech/Focus requirements that any starting
 // character can clear, with Strength as the dominant stat.
 { name: "Power Pulley", grade: "V0", strength: 22, technique: 14, focus: 10, flexibility: 12, time: 2, endurance: 14, xpSuccess: 28, xpFail: 10, rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'technique', modifier: -1 }], gearModifiers: ["Chalk Bag"], routeType: "Vertical", holdFeatures: ["Jugs", "Pinch"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Open Door", grade: "V0", strength: 18, technique: 14, focus: 12, flexibility: 14, time: 2, endurance: 12, xpSuccess: 25, xpFail: 9, rollEffect: [], gearModifiers: [], routeType: "Slab", holdFeatures: ["Jugs"], moveFeatures: [], tag: null },
 { name: "Brute Start", grade: "V1", strength: 26, technique: 16, focus: 12, flexibility: 14, time: 2, endurance: 18, xpSuccess: 35, xpFail: 14, rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: ["Jugs"], moveFeatures: [], tag: "Dynamic" },
 // ===== End of v0.2.0 additions =====
 { name: "Warm-Up Wonder", grade: "V1", strength: 22, technique: 25, focus: 18, flexibility: 20, time: 2, endurance: 16, xpSuccess: 32, xpFail: 12, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }, { stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: ["Jugs"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Crimson Ladder", grade: "V2", strength: 30, technique: 28, focus: 25, flexibility: 22, time: 2, endurance: 22, xpSuccess: 42, xpFail: 16, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Toe Hook Traverse", grade: "V3", strength: 32, technique: 35, focus: 30, flexibility: 28, time: 3, endurance: 28, xpSuccess: 52, xpFail: 22, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Traverse", holdFeatures: [], moveFeatures: ["Toe Hook", "Heel Hook"], tag: "Toe/Heel Hook" },
 { name: "Crimper's Delight", grade: "V4", strength: 45, technique: 40, focus: 35, flexibility: 28, time: 4, endurance: 36, xpSuccess: 65, xpFail: 30, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: -1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Dyno Dilemma", grade: "V5", strength: 52, technique: 38, focus: 36, flexibility: 30, time: 4, endurance: 46, xpSuccess: 78, xpFail: 38, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic", "Dyno"], tag: "Dynamic" },
 { name: "Heel Hook Heaven", grade: "V6", strength: 48, technique: 50, focus: 44, flexibility: 42, time: 4, endurance: 56, xpSuccess: 90, xpFail: 46, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Heel Hook"], tag: "Toe/Heel Hook" },
 { name: "The Roof of Doom", grade: "V7", strength: 58, technique: 48, focus: 42, flexibility: 40, time: 5, endurance: 64, xpSuccess: 100, xpFail: 54, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: ["Jugs"], moveFeatures: ["Roof"], tag: "Roof/Sloper" },
 { name: "Shoulder Shredder", grade: "V8", strength: 65, technique: 48, focus: 44, flexibility: 40, time: 5, endurance: 72, xpSuccess: 100, xpFail: 62, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: -1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Roof"], tag: "Roof/Sloper" },
 { name: "Dyno Chain", grade: "V9", strength: 70, technique: 52, focus: 50, flexibility: 44, time: 5, endurance: 80, xpSuccess: 100, xpFail: 70, rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic", "Dyno"], tag: "Dynamic" },
 { name: "Precision Impossible", grade: "V10", strength: 58, technique: 70, focus: 68, flexibility: 58, time: 5, endurance: 88, xpSuccess: 100, xpFail: 78, rollEffect: [{ stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "The Impossible Pinch", grade: "V11", strength: 80, technique: 64, focus: 60, flexibility: 52, time: 5, endurance: 96, xpSuccess: 100, xpFail: 86, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: ["Pinch"], moveFeatures: ["Roof"], tag: "Pinch/Crimp" },
 { name: "Project Zero", grade: "V12", strength: 82, technique: 72, focus: 70, flexibility: 58, time: 6, endurance: 100, xpSuccess: 100, xpFail: 90, rollEffect: [{ stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Dynamic" },
 // --- Archetype A: Specialist (one stat dominates) ---
 { name: "Strength Silo", grade: "V3", strength: 55, technique: 18, focus: 20, flexibility: 15, time: 3, endurance: 28, xpSuccess: 52, xpFail: 22, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'strength', modifier: -1 }], gearModifiers: [], routeType: "Traverse", holdFeatures: ["Jugs"], moveFeatures: [], tag: null },
 { name: "Focus Gauntlet", grade: "V7", strength: 35, technique: 40, focus: 75, flexibility: 38, time: 5, endurance: 68, xpSuccess: 100, xpFail: 56, rollEffect: [{ stat: 'focus', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: null },
 // --- Archetype B: Triple Nerf (3 nerf dice — appears moderate, plays brutal) ---
 { name: "The Triple Down", grade: "V5", strength: 38, technique: 40, focus: 42, flexibility: 35, time: 4, endurance: 50, xpSuccess: 80, xpFail: 40, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Spray Wall Chaos", grade: "V6", strength: 42, technique: 42, focus: 45, flexibility: 38, time: 4, endurance: 60, xpSuccess: 92, xpFail: 48, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }, { stat: 'flexibility', modifier: 1 }], gearModifiers: [], routeType: "Traverse", holdFeatures: [], moveFeatures: [], tag: "Pinch/Crimp" },
 // --- Archetype C: Pure Skill (empty rollEffect — flat stat check, no luck) ---
 { name: "The Clean Line", grade: "V4", strength: 40, technique: 42, focus: 38, flexibility: 32, time: 3, endurance: 40, xpSuccess: 65, xpFail: 30, rollEffect: [], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "Static Control", grade: "V8", strength: 62, technique: 65, focus: 60, flexibility: 55, time: 5, endurance: 74, xpSuccess: 100, xpFail: 62, rollEffect: [], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 // --- Archetype D: High Risk / High Reward (xpFail close to xpSuccess) ---
 { name: "Redemption Arc", grade: "V6", strength: 52, technique: 48, focus: 44, flexibility: 42, time: 4, endurance: 58, xpSuccess: 90, xpFail: 85, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: "Toe/Heel Hook" },
 { name: "Hail Mary", grade: "V9", strength: 68, technique: 60, focus: 56, flexibility: 50, time: 5, endurance: 82, xpSuccess: 100, xpFail: 95, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dyno"], tag: "Dynamic" },
 // --- Archetype E: Speed Demon / Stamina Drain ---
 { name: "Speed Crimp", grade: "V7", strength: 55, technique: 58, focus: 48, flexibility: 44, time: 2, endurance: 65, xpSuccess: 100, xpFail: 55, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: -1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "The Gauntlet Opener", grade: "V2", strength: 28, technique: 30, focus: 25, flexibility: 22, time: 1, endurance: 50, xpSuccess: 42, xpFail: 16, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null }
 ],
 topRope: [
 { name: "First Timer's Friend", grade: "5.6", strength: 20, technique: 18, focus: 15, flexibility: 12, time: 3, endurance: 15, xpSuccess: 30, xpFail: 10, rollEffect: [{ stat: 'technique', modifier: -1 }], gearModifiers: ["Harness"], routeType: "Slab", holdFeatures: ["Jugs"], moveFeatures: [], tag: "Toe/Heel Hook" },
 { name: "Learning Curve", grade: "5.8", strength: 30, technique: 28, focus: 26, flexibility: 22, time: 4, endurance: 25, xpSuccess: 42, xpFail: 18, rollEffect: [{ stat: 'technique', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "The Standard", grade: "5.9", strength: 38, technique: 34, focus: 30, flexibility: 26, time: 4, endurance: 35, xpSuccess: 55, xpFail: 26, rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "Crimson Wall", grade: "5.10a", strength: 40, technique: 38, focus: 35, flexibility: 30, time: 5, endurance: 40, xpSuccess: 62, xpFail: 30, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Overhang Initiation", grade: "5.10b", strength: 45, technique: 38, focus: 34, flexibility: 30, time: 5, endurance: 48, xpSuccess: 70, xpFail: 36, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Dynamic" },
 { name: "Crimp Central", grade: "5.10d", strength: 50, technique: 46, focus: 42, flexibility: 36, time: 5, endurance: 56, xpSuccess: 80, xpFail: 44, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Power Climb", grade: "5.11b", strength: 56, technique: 48, focus: 44, flexibility: 38, time: 6, endurance: 66, xpSuccess: 92, xpFail: 54, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic"], tag: "Dynamic" },
 { name: "Sustained Difficulty", grade: "5.11c", strength: 58, technique: 52, focus: 50, flexibility: 44, time: 6, endurance: 70, xpSuccess: 98, xpFail: 58, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: ["Sloper"], moveFeatures: [], tag: "Roof/Sloper" },
 { name: "Dynamic Moves", grade: "5.12a", strength: 62, technique: 56, focus: 54, flexibility: 48, time: 6, endurance: 78, xpSuccess: 100, xpFail: 66, rollEffect: [{ stat: 'focus', modifier: 1 }, { stat: 'strength', modifier: -1 }, { stat: 'flexibility', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic"], tag: "Dynamic" },
 { name: "The Power Endurance", grade: "5.12b", strength: 68, technique: 60, focus: 58, flexibility: 54, time: 7, endurance: 84, xpSuccess: 100, xpFail: 72, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Dynamic" },
 { name: "Micro Hold Heaven", grade: "5.12d", strength: 66, technique: 66, focus: 64, flexibility: 58, time: 6, endurance: 90, xpSuccess: 100, xpFail: 78, rollEffect: [{ stat: 'technique', modifier: 1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "The Upper Echelon", grade: "5.13a", strength: 72, technique: 68, focus: 66, flexibility: 60, time: 7, endurance: 92, xpSuccess: 100, xpFail: 80, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Dynamic" },
 { name: "Professional Grade", grade: "5.13c", strength: 80, technique: 74, focus: 72, flexibility: 66, time: 7, endurance: 100, xpSuccess: 100, xpFail: 88, rollEffect: [{ stat: 'technique', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Dynamic" },
 // --- Archetype A: Specialist ---
 { name: "The Wall Flower", grade: "5.10a", strength: 25, technique: 60, focus: 30, flexibility: 28, time: 4, endurance: 42, xpSuccess: 62, xpFail: 30, rollEffect: [{ stat: 'technique', modifier: 1 }, { stat: 'technique', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: "Toe/Heel Hook" },
 { name: "Hip Opener", grade: "5.11c", strength: 40, technique: 45, focus: 44, flexibility: 72, time: 5, endurance: 68, xpSuccess: 98, xpFail: 58, rollEffect: [{ stat: 'flexibility', modifier: 1 }, { stat: 'strength', modifier: -1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 // --- Archetype B: Triple Nerf ---
 { name: "The Fear Factor", grade: "5.11a", strength: 40, technique: 42, focus: 44, flexibility: 38, time: 5, endurance: 65, xpSuccess: 88, xpFail: 50, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }, { stat: 'flexibility', modifier: 1 }], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: "Toe/Heel Hook" },
 { name: "The Punishment Wall", grade: "5.12b", strength: 62, technique: 65, focus: 64, flexibility: 58, time: 7, endurance: 82, xpSuccess: 100, xpFail: 70, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Traverse", holdFeatures: [], moveFeatures: [], tag: "Pinch/Crimp" },
 // --- Archetype C: Pure Skill ---
 { name: "The Sure Thing", grade: "5.10c", strength: 44, technique: 46, focus: 42, flexibility: 36, time: 4, endurance: 50, xpSuccess: 72, xpFail: 38, rollEffect: [], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "The Dialed Rope", grade: "5.12d", strength: 66, technique: 68, focus: 64, flexibility: 60, time: 6, endurance: 90, xpSuccess: 100, xpFail: 78, rollEffect: [], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: "Pinch/Crimp" },
 // --- Archetype D: High Risk / High Reward ---
 { name: "Win or Learn", grade: "5.11b", strength: 54, technique: 50, focus: 48, flexibility: 44, time: 5, endurance: 66, xpSuccess: 92, xpFail: 88, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: [], routeType: "Traverse", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "The Big Gamble", grade: "5.13b", strength: 78, technique: 72, focus: 70, flexibility: 65, time: 7, endurance: 96, xpSuccess: 100, xpFail: 97, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: "Toe/Heel Hook" },
 // --- Archetype E: Speed Demon / Stamina Drain ---
 { name: "Quick Clip", grade: "5.12b", strength: 65, technique: 62, focus: 58, flexibility: 56, time: 3, endurance: 82, xpSuccess: 100, xpFail: 70, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Dynamic" },
 { name: "The Grind", grade: "5.9", strength: 36, technique: 32, focus: 30, flexibility: 26, time: 2, endurance: 55, xpSuccess: 55, xpFail: 26, rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null }
 ],
 leadClimbing: [
 { name: "Lead Introduction", grade: "5.8", strength: 30, technique: 28, focus: 30, flexibility: 22, time: 4, endurance: 25, xpSuccess: 40, xpFail: 15, rollEffect: [{ stat: 'focus', modifier: -1 }, { stat: 'strength', modifier: 1 }], gearModifiers: ["Harness", "Lead Rope"], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "Clip and Climb", grade: "5.9", strength: 38, technique: 34, focus: 36, flexibility: 28, time: 4, endurance: 32, xpSuccess: 48, xpFail: 22, rollEffect: [{ stat: 'focus', modifier: -1 }], gearModifiers: ["Harness", "Belay Device"], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "First Overhang Lead", grade: "5.10a", strength: 42, technique: 38, focus: 40, flexibility: 30, time: 5, endurance: 35, xpSuccess: 52, xpFail: 24, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Roof/Sloper" },
 { name: "Pump Management", grade: "5.10b", strength: 45, technique: 44, focus: 46, flexibility: 34, time: 6, endurance: 40, xpSuccess: 58, xpFail: 28, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Roof/Sloper" },
 { name: "Power Lead", grade: "5.10d", strength: 52, technique: 48, focus: 50, flexibility: 38, time: 6, endurance: 50, xpSuccess: 70, xpFail: 36, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: "Roof/Sloper" },
 { name: "The Steep Lead", grade: "5.11a", strength: 54, technique: 50, focus: 52, flexibility: 44, time: 6, endurance: 55, xpSuccess: 75, xpFail: 40, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic"], tag: "Dynamic" },
 { name: "Runout Section", grade: "5.11b", strength: 56, technique: 52, focus: 58, flexibility: 48, time: 6, endurance: 60, xpSuccess: 80, xpFail: 44, rollEffect: [{ stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "Overhang Lead Challenge", grade: "5.11c", strength: 60, technique: 56, focus: 60, flexibility: 52, time: 7, endurance: 65, xpSuccess: 85, xpFail: 48, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness", "Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Roof"], tag: "Roof/Sloper" },
 { name: "Advanced Clipping", grade: "5.12a", strength: 66, technique: 64, focus: 66, flexibility: 58, time: 7, endurance: 75, xpSuccess: 95, xpFail: 56, rollEffect: [{ stat: 'focus', modifier: 1 }, { stat: 'technique', modifier: 1 }, { stat: 'strength', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "The Compression Lead", grade: "5.12b", strength: 72, technique: 66, focus: 66, flexibility: 60, time: 7, endurance: 82, xpSuccess: 100, xpFail: 62, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"], routeType: "Vertical", holdFeatures: ["Pinch"], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Endurance Lead", grade: "5.12d", strength: 72, technique: 72, focus: 72, flexibility: 66, time: 8, endurance: 88, xpSuccess: 100, xpFail: 68, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "The Elite Lead", grade: "5.13a", strength: 76, technique: 74, focus: 74, flexibility: 70, time: 8, endurance: 92, xpSuccess: 100, xpFail: 72, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "World Class Leading", grade: "5.14a", strength: 88, technique: 84, focus: 84, flexibility: 80, time: 8, endurance: 100, xpSuccess: 100, xpFail: 88, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: null },
 // --- Archetype A: Specialist ---
 { name: "Reach Specialist", grade: "5.10c", strength: 28, technique: 35, focus: 36, flexibility: 60, time: 5, endurance: 46, xpSuccess: 65, xpFail: 32, rollEffect: [{ stat: 'flexibility', modifier: 1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: "Pinch/Crimp" },
 { name: "Clench Mode", grade: "5.13a", strength: 50, technique: 58, focus: 90, flexibility: 52, time: 8, endurance: 94, xpSuccess: 100, xpFail: 72, rollEffect: [{ stat: 'focus', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: "Toe/Heel Hook" },
 // --- Archetype B: Triple Nerf ---
 { name: "The Runout Nightmare", grade: "5.11d", strength: 45, technique: 48, focus: 50, flexibility: 42, time: 6, endurance: 70, xpSuccess: 90, xpFail: 52, rollEffect: [{ stat: 'focus', modifier: 1 }, { stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "The Crux Gauntlet", grade: "5.12c", strength: 65, technique: 68, focus: 68, flexibility: 60, time: 7, endurance: 84, xpSuccess: 100, xpFail: 65, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Roof"], tag: "Roof/Sloper" },
 // --- Archetype C: Pure Skill ---
 { name: "The Dialed Lead", grade: "5.11b", strength: 55, technique: 54, focus: 56, flexibility: 48, time: 5, endurance: 62, xpSuccess: 80, xpFail: 44, rollEffect: [], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "The Known Route", grade: "5.13b", strength: 80, technique: 76, focus: 76, flexibility: 72, time: 8, endurance: 96, xpSuccess: 100, xpFail: 76, rollEffect: [], gearModifiers: [], routeType: "Traverse", holdFeatures: [], moveFeatures: [], tag: null },
 // --- Archetype D: High Risk / High Reward ---
 { name: "Gambler's Ascent", grade: "5.12b", strength: 70, technique: 66, focus: 66, flexibility: 62, time: 7, endurance: 84, xpSuccess: 100, xpFail: 95, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [], tag: "Toe/Heel Hook" },
 { name: "All In", grade: "5.13d", strength: 86, technique: 82, focus: 82, flexibility: 78, time: 8, endurance: 100, xpSuccess: 100, xpFail: 98, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic"], tag: "Dynamic" },
 // --- Archetype E: Speed Demon / Stamina Drain ---
 { name: "The Sprint Lead", grade: "5.12c", strength: 72, technique: 68, focus: 66, flexibility: 60, time: 3, endurance: 84, xpSuccess: 100, xpFail: 64, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [], tag: null },
 { name: "The Quick Send", grade: "5.10a", strength: 40, technique: 38, focus: 42, flexibility: 30, time: 2, endurance: 55, xpSuccess: 52, xpFail: 24, rollEffect: [{ stat: 'focus', modifier: -1 }, { stat: 'technique', modifier: -1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [], tag: null }
 ]
};

// As of engine v0.3.0: gear deck is the "Mixture 3 — New Tools, New Rules" set.
// 4 access cards (kept from v0.1.0 to gate Top Rope / Lead climbing) + 14 permission-style cards
// that grant permanent passive abilities. Most cards use the existing schema fields; the new
// permission-style cards add an `effectKind` string and an optional `tagFilter` (one of the
// 4 route categories: Pinch/Crimp, Toe/Heel Hook, Roof/Sloper, Dynamic) to indicate they
// trigger off route tags rather than route types or hold features.
//
// effectKind values handled by engine/helpers.js:
// rerollOnTag — re-roll one die on tagged climbs
// timeCostReduction — reduce time cost on tagged climbs by `value`
// enduranceHalvedOnTag — endurance cost halved (round up) on tagged climbs
// extraDieBestN — roll one extra die on tagged climbs, keep best N (`value`)
// ignoreFailPenalty — skip Iron Lung's −5 fail-endurance penalty AND general fail penalties
// treatOneDieAsValue — on every climb, may treat one die as `value` (typically 1)
// failBonusXp — every failed climb grants `value` extra XP
// successHealEndurance — every successful climb restores `value` endurance
// trainingBonusBoost — every training session grants `value` extra stat bonus
// milestoneDiceBonus — every die on milestone climbs is +`value`
// negateOneNerfDie — on every climb, treat one nerf die (modifier +1) as 0
const GEAR_SHOP = [
 // ===== ACCESS CARDS (gate Lead climbing area; Top Rope is open to all) =====
 // RuleModifications (2026-06-27): Harness removed — Top Rope requires no gear,
 // and Lead Climbing now needs only Belay Device + Locking Carabiner + Lead Rope.
 { name: "Belay Device", cost: 70, category: "Essential Safety Gear", statEffect: "strength", value: -2, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Managing a heavy rope builds arm strength", effectDisplay: "-2 Strength on Lead routes | Part of Lead system", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: "Lead", restBonus: 0 },
 { name: "Locking Carabiner", cost: 60, category: "Essential Safety Gear", statEffect: "endurance", value: 5, routeFilter: ["Lead"], holdFeatureFilter: [], description: "A secure system builds confidence, reducing mental fatigue", effectDisplay: "+5 Max Endurance | Part of Lead system", prerequisiteItems: ["Belay Device"], prerequisiteLevel: 1, accessRequirement: "Lead", restBonus: 0 },
 { name: "Lead Rope", cost: 120, category: "Essential Safety Gear", statEffect: "strength", value: -3, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Dynamic rope absorbs fall energy", effectDisplay: "-3 Strength on Lead routes | Unlocks Lead", prerequisiteItems: ["Belay Device", "Locking Carabiner"], prerequisiteLevel: 1, accessRequirement: "Lead", restBonus: 0 },

 // ===== SPECIALTY CARDS (S role; one per category, target tagged routes) =====
 { name: "Crimp Sequence Decoder", cost: 130, category: "Strategy Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], effectKind: "rerollOnTag", tagFilter: "Pinch/Crimp", description: "Decode the puzzle of small holds — re-rolls give you a second chance", effectDisplay: "On Pinch/Crimp climbs, re-roll one die of your choice", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Trick Foot Manual", cost: 110, category: "Strategy Gear", statEffect: "none", value: 1, routeFilter: [], holdFeatureFilter: [], effectKind: "timeCostReduction", tagFilter: "Toe/Heel Hook", description: "Footwork techniques shave seconds off every move", effectDisplay: "Toe/Heel Hook climbs cost 1 less time (min 1)", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Body Tension Belt", cost: 150, category: "Specialized Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], effectKind: "enduranceHalvedOnTag", tagFilter: "Roof/Sloper", description: "Core engagement on overhang and slopey holds", effectDisplay: "Roof/Sloper climbs cost half endurance (round up)", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Power Tap Belt", cost: 120, category: "Specialized Gear", statEffect: "none", value: 2, routeFilter: [], holdFeatureFilter: [], effectKind: "extraDieBestN", tagFilter: "Dynamic", description: "Explosive feedback for dynamic moves", effectDisplay: "On Dynamic climbs, roll an extra die and use the best 2", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },

 // ===== FIX + BOOST CARDS (F/B roles; permanent passives) =====
 { name: "Beta Reading Book", cost: 100, category: "Recovery Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], description: "Pre-climb visualization restores composure", effectDisplay: "Rest restores +10 endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 10 },
 { name: "Mental Anchor", cost: 130, category: "Recovery Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], effectKind: "ignoreFailPenalty", description: "Stay focused even after a fall — no extra cost when failing", effectDisplay: "Failed climbs no longer cost extra endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Pre-Climb Stretching", cost: 90, category: "Recovery Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], description: "Better flexibility means more bang per rest", effectDisplay: "Rest restores +12 endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 12 },
 { name: "Sequence Memorization", cost: 150, category: "Strategy Gear", statEffect: "none", value: 1, routeFilter: [], holdFeatureFilter: [], effectKind: "treatOneDieAsValue", description: "Plan your moves before they happen", effectDisplay: "On every climb, treat one die as a 1 (your choice after rolling)", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Confidence Building", cost: 110, category: "Strategy Gear", statEffect: "none", value: 10, routeFilter: [], holdFeatureFilter: [], effectKind: "failBonusXp", description: "Learn from every fall", effectDisplay: "Failed climbs give +10 bonus XP", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Power Spotting", cost: 90, category: "Recovery Gear", statEffect: "none", value: 5, routeFilter: [], holdFeatureFilter: [], effectKind: "successHealEndurance", description: "A spotter's encouragement returns energy", effectDisplay: "Successful climbs restore +5 endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Approach Shoes", cost: 55, category: "Comfort Gear", statEffect: "timePerRound", value: 1, routeFilter: ["All"], holdFeatureFilter: [], description: "Ergonomic footwear keeps you fresh", effectDisplay: "+1 Time at round start", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Old Climbing Journal", cost: 100, category: "Training Equipment", statEffect: "none", value: 1, routeFilter: [], holdFeatureFilter: [], effectKind: "trainingBonusBoost", description: "Track every session and pattern of progress", effectDisplay: "Training sessions give +6 instead of +5", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Climbing Coach", cost: 180, category: "Strategy Gear", statEffect: "none", value: 1, routeFilter: [], holdFeatureFilter: [], effectKind: "milestoneDiceBonus", description: "Expert guidance for the routes that matter most", effectDisplay: "On milestone climbs, every die is +1", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Mountain Mentor", cost: 200, category: "Strategy Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], effectKind: "negateOneNerfDie", description: "Years of wisdom in your ear", effectDisplay: "On every climb, treat one nerf die as 0", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
];

// ===== GAME STATE =====

let gameState = {
 round: 1,
 players: [],
 currentPlayerIndex: 0,
 routeClearingPosition: 0, // 0: between bouldering and lead, 1: between lead and top rope, 2: between top rope and bouldering
 availableRoutes: {
 bouldering: [],
 topRope: [],
 leadClimbing: []
 },
 // Top Rope belayer-station count = number of players − 1 (RuleModifications
 // 2026-06-27). Fixed for the whole game; set in startGame(). Each station
 // holds 2 routes and admits at most 1 climber.
 belayerCount: 1,
 gameLog: [],
 availableGear: [], // Randomized gear available in shop
 attemptedRoutes: {}, // Maps playerNum -> Set of route keys ("area:routeName") attempted this round
 milestoneRoutes: {
 beginner: null,
 intermediate: null,
 expert: null
 },
 gameEnded: false,
 winner: null,
 pendingLevelUp: null
};

// ===== SECTION CAPACITY SYSTEM =====

function formatLocationName(location) {
 // Convert location codes to display names
 const locationNames = {
 'lobby': 'Lobby',
 'bouldering': 'Bouldering Wall',
 'topRope': 'Top Rope',
 'leadClimbing': 'Lead Climbing',
 'gearShop': 'Gear Shop',
 'rest': 'Rest Area'
 };

 // Check if it's a training equipment location
 if (isTrainingEquipment(location)) {
 return `Training: ${location}`;
 }

 return locationNames[location] || location;
}

// Number of top-rope routes assigned to each belayer station.
const ROUTES_PER_BELAYER = 2;

function getSectionCapacity(section) {
 // Returns the maximum number of players allowed in a section
 switch(section) {
 case 'bouldering':
 return 10; // Unlimited for practical purposes
 case 'topRope':
 // Aggregate occupancy = belayer-station count (1 climber per station).
 // The real gate is per-station (see canClimbTopRopeStation).
 return Math.max(0, gameState.belayerCount);
 case 'leadClimbing':
 return 1; // A single lead belayer — one climber at a time
 case 'gearShop':
 return 10; // Unlimited for practical purposes
 case 'rest':
 return 10; // Unlimited for practical purposes
 case 'lobby':
 return 10; // Unlimited for practical purposes
 default:
 // Check if it's a training equipment location
 if (isTrainingEquipment(section)) {
 return 1; // Only one player per training equipment
 }
 return 10;
 }
}

function isTrainingEquipment(location) {
 // Check if location is a training equipment name
 const trainingEquipmentNames = TRAINING_AREAS.map(area => area.name);
 return trainingEquipmentNames.includes(location);
}

function getPlayersInSection(section) {
 // Returns array of players currently in a section
 return gameState.players.filter(p => p.character.location === section);
}

// ===== TOP ROPE BELAYER STATIONS (RuleModifications 2026-06-27) =====

// Draw the Top Rope rotation as belayerCount stations of ROUTES_PER_BELAYER
// routes each. Returns a FLAT array of 2×belayerCount routes, each tagged with
// a `belayer` index (0-based station). A 1-player game → 0 stations → empty.
function drawTopRopeStations() {
 const count = Math.max(0, gameState.belayerCount) * ROUTES_PER_BELAYER;
 const pool = [...ROUTES.topRope].sort(() => Math.random() - 0.5);
 return pool.slice(0, count).map((route, i) => ({
 ...route, belayer: Math.floor(i / ROUTES_PER_BELAYER),
 }));
}

// Belayer stations occupied by players OTHER than playerNum.
function getOccupiedBelayerStations(playerNum) {
 const occupied = new Set();
 gameState.players.forEach(p => {
 if (p.playerNum === playerNum) return;
 const c = p.character;
 if (c.location === 'topRope' && c.belayerStation !== null && c.belayerStation !== undefined) {
 occupied.add(c.belayerStation);
 }
 });
 return occupied;
}

// May playerNum occupy belayer station `stationIndex`? Free unless another
// player holds it (the asking player may already be parked there).
function canClimbTopRopeStation(stationIndex, playerNum) {
 if (stationIndex === null || stationIndex === undefined) return true;
 return !getOccupiedBelayerStations(playerNum).has(stationIndex);
}

// Pick a belayer station for a player who must occupy one but isn't tied to a
// specific route's station (e.g. a Top Rope milestone). Reuses their current
// station, else the lowest free one, else null.
function pickFreeBelayerStation(playerNum) {
 const me = gameState.players.find(p => p.playerNum === playerNum);
 if (me && me.character.location === 'topRope' &&
 me.character.belayerStation !== null && me.character.belayerStation !== undefined) {
 return me.character.belayerStation;
 }
 const occupied = getOccupiedBelayerStations(playerNum);
 for (let i = 0; i < gameState.belayerCount; i++) {
 if (!occupied.has(i)) return i;
 }
 return null;
}

function canEnterSection(section, playerNum) {
 // Check if a player can enter a section
 const capacity = getSectionCapacity(section);
 const currentPlayers = getPlayersInSection(section);
 const player = gameState.players.find(p => p.playerNum === playerNum);

 // If player is already in this section, they can stay
 if (player && player.character.location === section) {
 return { canEnter: true, reason: '' };
 }

 // Check if section is at capacity
 if (currentPlayers.length >= capacity) {
 const playerNames = currentPlayers.map(p => `Player ${p.playerNum}`).join(', ');

 // Special message for training equipment
 if (isTrainingEquipment(section)) {
 return {
 canEnter: false,
 reason: `This training equipment is currently in use by ${playerNames}.`
 };
 }

 return {
 canEnter: false,
 reason: `Section is at capacity (${currentPlayers.length}/${capacity}). Currently occupied by: ${playerNames}`
 };
 }

 return { canEnter: true, reason: '' };
}

function movePlayerToSection(playerNum, section) {
 // Move a player to a section if space is available
 const check = canEnterSection(section, playerNum);
 if (!check.canEnter) {
 return { success: false, message: check.reason };
 }

 const player = gameState.players.find(p => p.playerNum === playerNum);
 if (player) {
 const oldLocation = player.character.location;
 player.character.location = section;
 return { success: true, message: `Moved from ${oldLocation} to ${section}` };
 }

 return { success: false, message: 'Player not found' };
}

// ===== AREA ACCESS CHECKING =====

function checkAreaAccess(area) {
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 // Free Solo bypasses all equipment requirements
 if (char.key === 'freeSolo') return { hasAccess: true, missingItems: [] };

 // Bouldering and Top Rope are OPEN — no gear required (RuleModifications).
 if (area === 'bouldering' || area === 'topRope') {
 return { hasAccess: true, missingItems: [] };
 }

 // Lead Climbing requires Belay Device + Locking Carabiner + Lead Rope
 // (Harness was removed from the game).
 if (area === 'leadClimbing') {
 const needs = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
 const missing = needs.filter(n => !char.equipment.includes(n));
 return { hasAccess: missing.length === 0, missingItems: missing };
 }

 return { hasAccess: true, missingItems: [] };
}

// ===== GEAR BONUS CALCULATION =====

function calculateGearBonuses(route, area) {
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 const bonuses = {
 strength: 0,
 technique: 0,
 focus: 0,
 flexibility: 0
 };

 // Check if this route has been attempted before (for Repeated filter)
 const routeKey = `${area}:${route.name}`;
 const isRepeated = gameState.attemptedRoutes[currentPlayer.playerNum] &&
 gameState.attemptedRoutes[currentPlayer.playerNum].has(routeKey);

 // Iterate through owned equipment
 char.equipment.forEach(gearName => {
 const gear = GEAR_SHOP.find(g => g.name === gearName);
 if (!gear) return;

 // Skip gear that doesn't apply to routes (time/endurance only)
 if (gear.statEffect === 'endurance' || gear.statEffect === 'time' || gear.statEffect === 'special') {
 return;
 }

 // Check for "Repeated" route filter
 if (gear.routeFilter && gear.routeFilter.includes("Repeated")) {
 if (!isRepeated) return; // Only applies to repeated routes
 }

 // Check route and feature filters.
 // When BOTH routeFilter and holdFeatureFilter are present, use OR logic (either match qualifies).
 // When only one is present, that filter must pass.
 const hasRouteFilter = gear.routeFilter && gear.routeFilter.length > 0 &&
 !gear.routeFilter.includes("All") && !gear.routeFilter.includes("Repeated");
 const hasFeatureFilter = gear.holdFeatureFilter && gear.holdFeatureFilter.length > 0;

 if (hasRouteFilter || hasFeatureFilter) {
 let routeFilterPasses = false;
 let featureFilterPasses = false;

 if (hasRouteFilter) {
 if (area === 'bouldering' && gear.routeFilter.includes('Bouldering')) routeFilterPasses = true;
 if (area === 'topRope' && gear.routeFilter.includes('Top Rope')) routeFilterPasses = true;
 if (area === 'leadClimbing' && gear.routeFilter.includes('Lead')) routeFilterPasses = true;
 if (route.routeType && gear.routeFilter.includes(route.routeType)) routeFilterPasses = true;
 }

 if (hasFeatureFilter) {
 if (route.holdFeatures) {
 route.holdFeatures.forEach(feature => {
 if (gear.holdFeatureFilter.includes(feature)) featureFilterPasses = true;
 });
 }
 if (route.moveFeatures) {
 route.moveFeatures.forEach(feature => {
 if (gear.holdFeatureFilter.includes(feature)) featureFilterPasses = true;
 });
 }
 }

 // OR logic when both filters specified; AND logic when only one is specified
 if (hasRouteFilter && hasFeatureFilter) {
 if (!routeFilterPasses && !featureFilterPasses) return;
 } else {
 if (hasRouteFilter && !routeFilterPasses) return;
 if (hasFeatureFilter && !featureFilterPasses) return;
 }
 }

 // Apply gear effect (negative values reduce requirements, which is a bonus)
 if (gear.statEffect === 'all') {
 bonuses.strength += Math.abs(gear.value);
 bonuses.technique += Math.abs(gear.value);
 bonuses.focus += Math.abs(gear.value);
 bonuses.flexibility += Math.abs(gear.value);
 } else if (gear.statEffect === 'strength') {
 bonuses.strength += Math.abs(gear.value);
 } else if (gear.statEffect === 'technique') {
 bonuses.technique += Math.abs(gear.value);
 } else if (gear.statEffect === 'focus') {
 bonuses.focus += Math.abs(gear.value);
 } else if (gear.statEffect === 'flexibility') {
 bonuses.flexibility += Math.abs(gear.value);
 }
 });

 return bonuses;
}

// ===== MILESTONE ROUTES SYSTEM =====

function selectMilestoneRoutes() {
 // Define difficulty ranges based on grade
 const beginnerRoutes = [];
 const intermediateRoutes = [];
 const expertRoutes = [];

 // Categorize all routes by difficulty
 Object.keys(ROUTES).forEach(area => {
 ROUTES[area].forEach(route => {
 const grade = route.grade;

 // Bouldering grades
 if (grade === 'V0' || grade === 'V1' || grade === 'V2') {
 beginnerRoutes.push({ area, route });
 } else if (grade === 'V3' || grade === 'V4' || grade === 'V5' || grade === 'V6' || grade === 'V7') {
 intermediateRoutes.push({ area, route });
 } else if (grade === 'V8' || grade === 'V9' || grade === 'V10' || grade === 'V11' || grade === 'V12') {
 expertRoutes.push({ area, route });
 }
 // Top Rope grades
 else if (grade === '5.6' || grade === '5.7' || grade === '5.8') {
 beginnerRoutes.push({ area, route });
 } else if (grade === '5.9' || grade === '5.10a' || grade === '5.10b' || grade === '5.10d' || grade === '5.11b' || grade === '5.11c') {
 intermediateRoutes.push({ area, route });
 } else if (grade === '5.12a' || grade === '5.12b' || grade === '5.12d' || grade === '5.13a' || grade === '5.13c') {
 expertRoutes.push({ area, route });
 }
 // Lead grades (5.8 and 5.9 are beginner for lead)
 else if (area === 'leadClimbing' && (grade === '5.8' || grade === '5.9')) {
 beginnerRoutes.push({ area, route });
 } else if (area === 'leadClimbing' && (grade === '5.10a' || grade === '5.10b' || grade === '5.10d' || grade === '5.11a' || grade === '5.11b' || grade === '5.11c')) {
 intermediateRoutes.push({ area, route });
 } else if (area === 'leadClimbing' && (grade === '5.12a' || grade === '5.12b' || grade === '5.12d' || grade === '5.13a' || grade === '5.14a')) {
 expertRoutes.push({ area, route });
 }
 });
 });

 // Scenario 2C: sequential area-exclusion sampling (v0.4.0).
 // The three milestones must span three DIFFERENT climbing areas. Mirrors
 // engine/state.js pickMilestoneRoutes so local play matches online play.
 const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

 // 1. Beginner — free pick from any area.
 const beginner = pick(beginnerRoutes);

 // 2. Intermediate — only from a different area than the beginner pick.
 let intermediatePool = intermediateRoutes.filter(r => r.area !== beginner.area);
 if (intermediatePool.length === 0) intermediatePool = intermediateRoutes; // safety fallback
 const intermediate = pick(intermediatePool);

 // 3. Expert — only from a third area, different from both prior picks.
 let expertPool = expertRoutes.filter(r => r.area !== beginner.area && r.area !== intermediate.area);
 if (expertPool.length === 0) expertPool = expertRoutes; // safety fallback
 const expert = pick(expertPool);

 gameState.milestoneRoutes.beginner = beginner;
 gameState.milestoneRoutes.intermediate = intermediate;
 gameState.milestoneRoutes.expert = expert;
}

function renderMilestonePanel() {
 const container = document.getElementById('milestonePanel');
 if (!container) return;

 let html = `
 <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px 14px 12px; border-radius: 12px; margin-bottom: 14px; box-shadow: 0 4px 10px rgba(102, 126, 234, 0.25);">
 <h2 style="margin: 0 0 8px 0; font-size: 1.05em; text-align: center; letter-spacing: 0.02em;">
 MILESTONE ROUTES — First to Complete All 3 Wins
 </h2>
 <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px;">
 `;

 const difficulties = ['beginner', 'intermediate', 'expert'];
 const colors = { beginner: '#4ade80', intermediate: '#fbbf24', expert: '#ef4444' };

 difficulties.forEach(difficulty => {
 const milestone = gameState.milestoneRoutes[difficulty];
 if (!milestone) return;

 const route = milestone.route;
 const area = milestone.area;
 const areaLabel = area === 'bouldering' ? 'Bouldering'
                  : area === 'topRope'    ? 'Top Rope'
                                          : 'Lead Climbing';
 const areaColors = { bouldering: '#ff6845', topRope: '#1fb8a6', leadClimbing: '#d8347d' };
 const areaColor = areaColors[area] || '#6c757d';
 const milestoneRouteTypeColors = { Slab: '#17a2b8', Vertical: '#28a745', Overhang: '#fd7e14', Traverse: '#6f42c1' };
 const milestoneRouteTypeColor = milestoneRouteTypeColors[route.routeType] || '#6c757d';

 html += `
 <div style="background: white; color: #2c3e50; padding: 8px 11px 9px; border-radius: 8px; border-left: 4px solid ${colors[difficulty]};">
 <div style="display: flex; justify-content: flex-start; align-items: center; margin-bottom: 5px; gap: 4px; flex-wrap: wrap;">
 <span style="font-weight: bold; font-size: 0.78em; letter-spacing: 0.04em;">${difficulty.toUpperCase()}</span>
 <span style="display: inline-block; background: ${areaColor}; color: white; padding: 1px 8px; border-radius: 10px; font-size: 0.65em; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase;">${areaLabel}</span>
 <span style="display: inline-block; background: ${milestoneRouteTypeColor}; color: white; padding: 1px 8px; border-radius: 10px; font-size: 0.65em; font-weight: bold;">${route.routeType || 'Unknown'}</span>
 </div>
 <div style="font-size: 0.98em; font-weight: bold; color: #667eea; margin-bottom: 3px; line-height: 1.15;">
 ${route.name}
 </div>
 <div style="font-size: 0.78em; color: #666; margin-bottom: 4px; font-family: 'Geist Mono', monospace;">
 ${route.grade} · Ti ${route.time} · E ${route.endurance}
 </div>
 <div style="font-size: 0.78em; margin-bottom: 6px; font-family: 'Geist Mono', monospace;">
 S ${route.strength} · T ${route.technique} · F ${route.focus} · X ${route.flexibility}
 </div>
 <div style="border-top: 1px solid #ddd; padding-top: 5px; margin-top: 4px;">
 `;

 gameState.players.forEach(player => {
 const completed = player.character.milestonesCompleted[difficulty];
 const statusText = completed ? 'COMPLETE': 'Not Complete';
 const statusColor = completed ? '#22c55e': '#6b7280';

 html += `
 <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0; font-size: 0.74em; font-family: 'Geist Mono', monospace;">
 <span>${player.character.name}</span>
 <span style="color: ${statusColor}; font-weight: bold;">${statusText.toUpperCase()}</span>
 </div>
 `;
 });

 html += `
 </div>
 <button class="btn" onclick="attemptMilestoneRoute('${difficulty}')" style="width: 100%; margin-top: 6px; font-size: 0.78em; padding: 6px 10px;">
 Attempt ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Route
 </button>
 </div>
 `;
 });

 html += `
 </div>
 </div>
 `;

 container.innerHTML = html;
}

// ===== GAME INITIALIZATION =====

function startCharacterSelect() {
 const numPlayersInput = document.getElementById('numPlayers');
 if (!numPlayersInput) return;

 const numPlayers = parseInt(numPlayersInput.value);
 if (numPlayers < 1 || numPlayers > 4 || isNaN(numPlayers)) {
 alert('Please select 1-4 players');
 return;
 }

 gameState.players = [];
 for (let i = 0; i < numPlayers; i++) {
 gameState.players.push({ playerNum: i + 1, character: null });
 }

 const charSelectionDiv = document.getElementById('characterSelection');
 if (!charSelectionDiv) return;

 // Lock the Continue button + player-count input so we can't re-trigger this
 // flow mid-selection. Re-running this function with characters already
 // chosen would reset gameState.players to empty while leaving the Start
 // Game button enabled — that's how bug #3 ("start without character") used
 // to fire. Both controls re-enable themselves only after the game ends
 // (via the page reload that happens on "New Game" / win screen close).
 const continueBtn = document.getElementById('continueBtn');
 if (continueBtn) continueBtn.disabled = true;
 numPlayersInput.disabled = true;

 charSelectionDiv.style.display = 'block';
 renderCharacterSelect();
}

function renderCharacterSelect() {
 const container = document.getElementById('characterSelect');
 if (!container) return;
 container.innerHTML = '';
 // Defense in depth: any re-entry into this render path must NOT inherit a
 // previously-enabled Start Game button. The button only re-enables once
 // every player slot has a character (see selectCharacter()).
 const startBtn = document.getElementById('startGameBtn');
 if (startBtn) startBtn.disabled = true;

 Object.keys(CHARACTERS).forEach(charKey => {
 const char = CHARACTERS[charKey];
 const card = document.createElement('div');
 card.className = 'character-card';
 card.onclick = () => selectCharacter(charKey);

 card.innerHTML = `
 <div class="character-name">${char.name}</div>
 <div class="character-archetype">${char.archetype}</div>
 <div class="character-description">${char.description}</div>
 <div class="stats-grid">
 <div class="stat-item">
 <div class="stat-label">Strength</div>
 <div class="stat-value">${char.startingStats.strength}</div>
 </div>
 <div class="stat-item">
 <div class="stat-label">Technique</div>
 <div class="stat-value">${char.startingStats.technique}</div>
 </div>
 <div class="stat-item">
 <div class="stat-label">Focus</div>
 <div class="stat-value">${char.startingStats.focus}</div>
 </div>
 <div class="stat-item">
 <div class="stat-label">Flexibility</div>
 <div class="stat-value">${char.startingStats.flexibility}</div>
 </div>
 </div>
 <div class="stat-item" style="margin-top: 10px;">
 <div class="stat-label">Endurance</div>
 <div class="stat-value">${char.startingEndurance}</div>
 </div>
 <div class="special-ability">
 <div class="ability-name"> ${char.specialAbility.name}</div>
 <div class="ability-desc">${char.specialAbility.description}</div>
 </div>
 `;

 container.appendChild(card);
 });
}

function selectCharacter(charKey) {
 const nextPlayer = gameState.players.find(p => !p.character);
 if (!nextPlayer) return;

 const char = CHARACTERS[charKey];
 nextPlayer.character = {
 key: charKey,
 ...JSON.parse(JSON.stringify(char)),
 level: 1,
 xp: 0,
 currentEndurance: char.startingEndurance,
 maxEndurance: char.startingEndurance,
 stats: { ...char.startingStats },
 equipment: [],
 trainingBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
 gearBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
 timeRemaining: 10,
 abilityUsed: false,
 betaBoostActive: false, // Route Reader: set to true after resting, consumed on next climb
 location: 'lobby', // Track which section of the gym the player is at
 belayerStation: null, // Which Top Rope belayer station (0-based) the player occupies, or null
 milestonesCompleted: { beginner: false, intermediate: false, expert: false }
 };

 // Mark character as selected
 document.querySelectorAll('.character-card').forEach((card, idx) => {
 if (Object.keys(CHARACTERS)[idx] === charKey) {
 card.classList.add('selected');
 card.style.opacity = '0.5';
 card.onclick = null;
 }
 });

 // Check if all players have selected
 if (gameState.players.every(p => p.character)) {
 document.getElementById('startGameBtn').disabled = false;
 }
}

function startGame() {
 // Defense in depth: if the Start Game button somehow gets clicked while a
 // player slot is still missing a character (bug #3 escape hatch), bail out
 // loudly instead of crashing on .character.name later.
 if (!Array.isArray(gameState.players) || gameState.players.length === 0
     || gameState.players.some(p => !p || !p.character)) {
  alert('Each player must select a character before starting the game.');
  return;
 }

 document.getElementById('gameSetup').style.display = 'none';
 document.getElementById('gameBoard').style.display = 'block';

 // Flag for the CSS compact-density rules — the hero header collapses, the
 // game-board sections tighten padding/font/gaps. Setup screen retains its
 // original hero treatment.
 document.body.classList.add('playing');

 // Initialize attempted routes tracking
 gameState.attemptedRoutes = {};

 // Top Rope belayer stations: N − 1 for N players, fixed for the whole game.
 gameState.belayerCount = gameState.players.length - 1;

 // Select milestone routes FIRST (before initializing regular routes)
 selectMilestoneRoutes();

 initializeRoutes();
 initializeGearShop();
 renderGameBoard();
 addLog("Game started! Round 1 begins.");
 addLog(" Milestone routes have been set! First player to complete all 3 wins the game!");

 // EFFECTS: opening round transition + first turn log.
 if (window.Effects) {
 const first = gameState.players[0];
 if (first) window.Effects.beginTurn(first.playerNum, first.character.name);
 window.Effects.roundTransition(1);
 }
}

function initializeRoutes() {
 // Shuffle and select 5 bouldering routes
 const boulderingPool = [...ROUTES.bouldering].sort(() => Math.random() - 0.5);
 gameState.availableRoutes.bouldering = boulderingPool.slice(0, 5);

 // Lead climbing starts with 5 routes
 const leadPool = [...ROUTES.leadClimbing].sort(() => Math.random() - 0.5);
 gameState.availableRoutes.leadClimbing = leadPool.slice(0, 5);

 // Top rope is split into belayerCount stations of 2 routes each.
 gameState.availableRoutes.topRope = drawTopRopeStations();
}

function initializeGearShop() {
 // Define access card names that should never be in random rotation
 const accessCardNames = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];

 // Filter out access cards from the pool
 const nonAccessGear = GEAR_SHOP.filter(gear => !accessCardNames.includes(gear.name));

 // Shuffle and select 3 random gear items (excluding access cards)
 const gearPool = [...nonAccessGear].sort(() => Math.random() - 0.5);
 gameState.availableGear = gearPool.slice(0, 3);
}

function replaceGearInShop(purchasedGearName) {
 // Define access card names
 const accessCardNames = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];

 // Access cards should not be replaced - they stay visible
 if (accessCardNames.includes(purchasedGearName)) {
 return; // Don't replace access cards
 }

 // Remove purchased gear and add a new random one
 const purchasedIndex = gameState.availableGear.findIndex(g => g.name === purchasedGearName);

 if (purchasedIndex !== -1) {
 // Get all gear currently in shop or owned by any player
 const ownedGearNames = new Set();
 gameState.players.forEach(player => {
 player.character.equipment.forEach(name => ownedGearNames.add(name));
 });

 const unavailableGearNames = new Set([
 ...gameState.availableGear.map(g => g.name),
 ...ownedGearNames,
 ...accessCardNames // Also exclude access cards from pool
 ]);

 const availablePool = GEAR_SHOP.filter(gear =>
 !unavailableGearNames.has(gear.name)
);

 if (availablePool.length > 0) {
 // Replace with random new gear
 const randomGear = availablePool[Math.floor(Math.random() * availablePool.length)];
 gameState.availableGear[purchasedIndex] = randomGear;
 } else {
 // No more gear available, remove the slot
 gameState.availableGear.splice(purchasedIndex, 1);
 }
 }
}

function addLog(message) {
 gameState.gameLog.unshift({ time: new Date().toLocaleTimeString(), message });
 if (gameState.gameLog.length > 20) gameState.gameLog.pop();
 renderLog();
}

function renderLog() {
 const logEntries = document.getElementById('logEntries');
 logEntries.innerHTML = gameState.gameLog.map(entry => `
 <div class="log-entry">
 <div class="log-time">${entry.time}</div>
 <div>${entry.message}</div>
 </div>
 `).join('');
}

// ===== GAME RENDERING =====

function renderGameBoard() {
 renderMilestonePanel();
 renderGameInfo();
 renderPlayers();
 renderRoutes();
 renderTraining();
 renderStore();
 renderSectionStatusPills();
 updateTurnIndicator();
}

// Player state is rendered into #playersContainer by renderPlayers().
// The sticky strip / collapse toggle / show-full-details pill were removed
// during a UI cleanup pass; full panels are now always visible.

function renderGameInfo() {
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];

 // B2: dropped the redundant "Current Player" info-box.
 // B3: belayers info-box shows the fixed Top Rope belayer-station count.
 // C3: Rest is an inline button here, not its own panel.
 // The route-clearing token is now rendered as a pill on the area-title
 // of the climbing area that will be cleared next (see renderSectionStatusPills).
 const char = currentPlayer.character;
 const canRest = !gameState.gameEnded && char.timeRemaining >= 1;
 const restBtn = `<button class="info-rest-btn" onclick="restAction()" ${canRest ? '' : 'disabled'}>Rest (Ti 1)</button>`;

 document.getElementById('gameInfo').innerHTML = `
 <div class="info-box">
 <div class="info-label">Round</div>
 <div class="info-value">${gameState.round}</div>
 </div>
 ${gameState.belayerCount >= 1 ? `
 <div class="info-box">
 <div class="info-label">Belayers</div>
 <div class="info-value">${gameState.belayerCount}</div>
 </div>
 ` : ''}
 <div class="info-rest-wrap">${restBtn}</div>
 `;
}

// Update the area-title pills: occupancy chip + (where applicable) "Clearing
// Next" chip. Called from renderGameBoard after the info row renders.
function renderSectionStatusPills() {
 // Route clearing — which area gets cleared at end of round.
 // Mapping is identical to clearRoutes() in game flow.
 const clearingNextArea = ['leadClimbing', 'topRope', 'bouldering'][gameState.routeClearingPosition];

 const sections = ['bouldering', 'topRope', 'leadClimbing', 'gearShop'];
 sections.forEach(section => {
  const host = document.getElementById(`pills-${section}`);
  if (!host) return;
  host.innerHTML = '';

  // Occupancy pill — current section occupants / capacity.
  const occupants = getPlayersInSection(section);
  const capacity = getSectionCapacity(section);
  const occPill = document.createElement('span');
  occPill.className = 'at-pill occupancy';
  if (occupants.length >= capacity) occPill.classList.add('full');
  const occLabel = occupants.length === 0
   ? `${occupants.length}/${capacity}`
   : `${occupants.length}/${capacity} · ${occupants.map(p => `P${p.playerNum}`).join(' ')}`;
  occPill.textContent = occLabel;
  occPill.title = occupants.length > 0
   ? `Occupants: ${occupants.map(p => 'P' + p.playerNum + ' ' + p.character.name).join(', ')}`
   : `Capacity ${capacity}`;
  host.appendChild(occPill);

  // Clearing-next pill — only for the climbing area scheduled to clear.
  if (section === clearingNextArea) {
   const clrPill = document.createElement('span');
   clrPill.className = 'at-pill clearing';
   clrPill.textContent = 'Clearing Next';
   host.appendChild(clrPill);
  }
 });
}

function updateTurnIndicator() {
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;
 let timeDisplay;
 if (char.timeRemaining <= 0) {
 timeDisplay = `<span class="time-out"> OUT OF TIME</span>`;
 } else if (char.timeRemaining === 1) {
 timeDisplay = `<span class="time-warning"> ${char.timeRemaining} unit remaining — Last action!</span>`;
 } else {
 timeDisplay = `${char.timeRemaining} units remaining`;
 }
 document.getElementById('turnIndicator').innerHTML = `
 Player ${currentPlayer.playerNum}'s Turn — ${char.name}
 <br> Time: ${timeDisplay}
 `;
}

// CLIMBER TOKEN renderer — design #1: one horizontal row per player.
// Compact at-a-glance state; click anywhere on a row to expand the detail
// drawer with equipment, ability, archetype, training bonuses.
//
// Keeps the same data hooks (data-player, data-endurance-bar, data-xp-bar,
// data-inventory) so effects.js's chalk puffs / floating numbers / inventory
// fly-in animations all still anchor correctly.
function renderPlayers() {
 const container = document.getElementById('playersContainer');
 if (!container) return;
 container.innerHTML = '';

 gameState.players.forEach((player, idx) => {
  const char = player.character;
  if (!char.gearBonuses) char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };

  const isCurrent = idx === gameState.currentPlayerIndex;
  const exhausted = char.timeRemaining <= 0;
  const lowTime = char.timeRemaining === 1;
  const endPct = Math.max(0, Math.min(100, (char.currentEndurance / char.maxEndurance) * 100));
  const xpForLevel = XP_TABLE[char.level - 1];
  const xpPct = char.level < 15
   ? Math.max(0, Math.min(100, ((char.xp - xpForLevel.cumulative) / xpForLevel.needed) * 100))
   : 100;
  const spendableXP = getSpendableXP(char);
  const xpToGo = getXPToNextLevel(char);

  const trBonus = (s) => (char.trainingBonuses[s] || 0) + (char.gearBonuses[s] || 0);
  const statCell = (key, glyph) => {
   const bonus = trBonus(key);
   const beta  = char.betaBoostActive ? 3 : 0;
   const extra = bonus + beta;
   return `<span class="tok-stat ${key}">
            <span class="glyph">${glyph}</span>&nbsp;<b>${char.stats[key]}</b>${extra > 0 ? `<span class="bonus">+${extra}</span>` : ''}
           </span>`;
  };

  const ms = char.milestonesCompleted;
  const milestoneDots = `
   <span class="dot ${ms.beginner    ? 'filled beg' : ''}" title="Beginner"></span>
   <span class="dot ${ms.intermediate? 'filled int' : ''}" title="Intermediate"></span>
   <span class="dot ${ms.expert      ? 'filled exp' : ''}" title="Expert"></span>`;

  // State indicator — a colored dot (no glyph) communicates ability/turn state.
  // Hover title carries the meaning for accessibility.
  const stateClass = exhausted ? 'out'
                   : char.betaBoostActive ? 'beta'
                   : char.abilityUsed ? 'used'
                   : 'ready';
  const stateTitle = exhausted ? 'Out of time'
                   : char.betaBoostActive ? 'Beta Boost active'
                   : char.abilityUsed ? 'Ability used'
                   : 'Ability available';
  const stateIcon = `<span class="tok-state ${stateClass}" title="${stateTitle}"></span>`;

  const token = document.createElement('div');
  token.className = 'climber-token' + (isCurrent ? ' active' : '') + (exhausted ? ' exhausted' : '') + (lowTime ? ' low-time' : '');
  token.setAttribute('data-player', player.playerNum);
  token.id = `player-${player.playerNum}-panel`;

  token.innerHTML = `
   <div class="tok-id">
    <div class="num">P${player.playerNum}</div>
    <div class="name">${char.name}</div>
    <div class="level">L${char.level}</div>
   </div>
   <div class="tok-stats">
    ${statCell('strength','S')}
    ${statCell('technique','T')}
    ${statCell('focus','F')}
    ${statCell('flexibility','X')}
   </div>
   <div class="tok-end">
    <span class="label">END</span>
    <div class="bar">
     <div class="fill" data-endurance-bar="${player.playerNum}" id="endurance-bar-${player.playerNum}" style="width: ${endPct}%;"></div>
    </div>
    <span class="nums">${char.currentEndurance}/${char.maxEndurance}</span>
   </div>
   <div class="tok-xp">
    <span class="label">XP</span>
    <div class="bar">
     <div class="fill" data-xp-bar="${player.playerNum}" id="xp-bar-${player.playerNum}" style="width: ${xpPct}%;"></div>
    </div>
    <span class="nums">${spendableXP}</span>
   </div>
   <div class="tok-time">Ti&nbsp;<b>${char.timeRemaining}</b></div>
   <div class="tok-ms">${milestoneDots}</div>
   <div class="tok-loc">${formatLocationName(char.location)}</div>
   ${stateIcon}
   <button class="tok-expand" aria-label="Expand details" title="Show full details">+</button>
   <!-- Hidden anchor for inventory animation destination -->
   <div class="equipment-list" data-inventory="${player.playerNum}" id="inventory-${player.playerNum}" style="display:none;"></div>
  `;

  // Detail drawer — hidden by default, opens on click.
  const drawer = document.createElement('div');
  drawer.className = 'climber-drawer';
  drawer.id = `player-${player.playerNum}-drawer`;
  drawer.innerHTML = `
   <div class="drawer-grid">
    <div class="drawer-section">
     <h5>${char.archetype}</h5>
     <div class="drawer-line">
      <strong>${char.specialAbility.name}</strong>
      <span class="ability-status ${char.abilityUsed ? 'used' : 'avail'}">${char.abilityUsed ? 'Used' : 'Available'}</span>
     </div>
     <div class="drawer-desc">${char.specialAbility.description}</div>
     ${char.betaBoostActive ? `<div class="beta-note">Beta Boost active — +3 to all stats on next climb</div>` : ''}
    </div>
    <div class="drawer-section">
     <h5>Bonuses</h5>
     <div class="drawer-bonuses">
      ${['strength','technique','focus','flexibility'].map(s => {
       const tr = char.trainingBonuses[s] || 0;
       const gr = char.gearBonuses[s] || 0;
       if (tr === 0 && gr === 0) return '';
       return `<div class="bonus-row"><span>${s}</span><span>${tr > 0 ? `+${tr} train` : ''}${tr > 0 && gr > 0 ? ' · ' : ''}${gr > 0 ? `+${gr} gear` : ''}</span></div>`;
      }).join('') || '<div class="muted">No training or gear bonuses yet.</div>'}
     </div>
     <div class="drawer-line muted">Total XP ${char.xp} · ${char.level < 15 ? `${xpToGo} to L${char.level+1}` : 'MAX'}</div>
    </div>
    <div class="drawer-section">
     <h5>Equipment <span class="muted">(${char.equipment.length})</span></h5>
     <div class="drawer-equipment">
      ${char.equipment.length ? char.equipment.map(e => `<span class="badge">${e}</span>`).join('') : '<span class="muted">None yet.</span>'}
     </div>
    </div>
   </div>
  `;
  drawer.style.display = 'none';

  // Click anywhere on the row toggles the drawer. Update the expand-button
  // glyph to `+` (collapsed) / `−` (expanded) so the affordance is obvious
  // without relying on a chevron Unicode that reads as an emoji to some
  // browsers.
  token.addEventListener('click', () => {
   const isOpen = drawer.style.display !== 'none';
   drawer.style.display = isOpen ? 'none' : 'block';
   token.classList.toggle('expanded', !isOpen);
   const expandBtn = token.querySelector('.tok-expand');
   if (expandBtn) expandBtn.textContent = isOpen ? '+' : '−'; // − minus sign
  });

  container.appendChild(token);
  container.appendChild(drawer);
 });
}

function renderRoutes() {
 renderBoulderingRoutes();
 renderTopRopeRoutes();
 renderLeadClimbingRoutes();
}

function renderBoulderingRoutes() {
 const container = document.getElementById('boulderingRoutes');
 container.innerHTML = '';
 // Occupancy and "clearing next" are surfaced as pills on the area title
 // by renderSectionStatusPills() — no inline duplicate.
 gameState.availableRoutes.bouldering.forEach((route, idx) => {
 container.appendChild(createRouteCard(route, 'bouldering', idx));
 });
}

function renderTopRopeRoutes() {
 const container = document.getElementById('topRopeRoutes');
 container.innerHTML = '';

 // Top Rope is OPEN (no gear gate). It is split into belayerCount stations of
 // 2 routes each; each station holds ONE climber. A station an opponent holds
 // blocks both its routes until routes clear (RuleModifications).
 if (gameState.belayerCount <= 0) {
 container.innerHTML = '<p style="color: #666;">Top Rope needs at least 2 players (no belayers in a solo game).</p>';
 return;
 }

 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const routes = gameState.availableRoutes.topRope;

 // Group routes by belayer-station index.
 const stations = [];
 routes.forEach((route) => {
 const b = route.belayer ?? 0;
 (stations[b] = stations[b] || []).push(route);
 });

 const occupied = getOccupiedBelayerStations(currentPlayer.playerNum);

 stations.forEach((stationRoutes, b) => {
 if (!stationRoutes) return;
 const holder = gameState.players.find(p =>
 p.playerNum !== currentPlayer.playerNum &&
 p.character.location === 'topRope' && p.character.belayerStation === b);
 const youHere = currentPlayer.character.location === 'topRope' &&
 currentPlayer.character.belayerStation === b;
 const blocked = occupied.has(b);

 // Station header spans the full width of the 2-column route grid.
 const header = document.createElement('div');
 header.className = 'belayer-station-header'
 + (blocked ? ' blocked' : '') + (youHere ? ' you' : '');
 const status = blocked
 ? `occupied by Player ${holder ? holder.playerNum : '?'}`
 : (youHere ? 'you are here' : 'open');
 header.innerHTML = `<span class="bsh-name">Belayer ${b + 1}</span>`
 + `<span class="bsh-status">${status}</span>`;
 container.appendChild(header);

 stationRoutes.forEach((route) => {
 const idx = routes.indexOf(route);
 const card = createRouteCard(route, 'topRope', idx);
 if (blocked) {
 card.style.opacity = '0.3';
 card.style.pointerEvents = 'none';
 card.style.filter = 'grayscale(80%)';
 }
 container.appendChild(card);
 });
 });
}

function renderLeadClimbingRoutes() {
 const container = document.getElementById('leadClimbingRoutes');
 container.innerHTML = '';

 // Check if player has access to this area
 const accessCheck = checkAreaAccess('leadClimbing');

 if (!accessCheck.hasAccess) {
 const lockedDiv = document.createElement('div');
 lockedDiv.className = 'area-locked-banner';
 lockedDiv.innerHTML = `<strong>Area Locked.</strong> Required gear: ${accessCheck.missingItems.join(', ')}`;
 container.appendChild(lockedDiv);
 }
 // Occupancy + "clearing next" surfaced as title pills — no inline duplicate.

 // Always show routes, but disable if locked
 const isLocked = !accessCheck.hasAccess;
 gameState.availableRoutes.leadClimbing.forEach((route, idx) => {
 const card = createRouteCard(route, 'leadClimbing', idx);
 if (isLocked) {
 card.style.opacity = '0.3';
 card.style.pointerEvents = 'none';
 card.style.filter = 'grayscale(80%)';
 }
 container.appendChild(card);
 });
}

function createRouteCard(route, area, idx) {
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 // Ensure gearBonuses exists
 if (!char.gearBonuses) {
 char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
 }

 const totalStats = {
 strength: char.stats.strength + char.trainingBonuses.strength + char.gearBonuses.strength,
 technique: char.stats.technique + char.trainingBonuses.technique + char.gearBonuses.technique,
 focus: char.stats.focus + char.trainingBonuses.focus + char.gearBonuses.focus,
 flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility
 };

 // Check if route already attempted
 const routeKey = `${area}:${route.name}`;
 const alreadyAttempted = gameState.attemptedRoutes[currentPlayer.playerNum]?.has(routeKey) || false;

 const canAttempt = char.timeRemaining >= route.time &&
 char.currentEndurance >= route.endurance &&
 !alreadyAttempted;

 // Check if player has any applicable gear
 const playerHasGear = route.gearModifiers && route.gearModifiers.length > 0
 ? route.gearModifiers.filter(gear => char.equipment.includes(gear))
: [];

 // Build dice roll effects display
 const statNames = {
 strength: 'Str',
 technique: 'Tech',
 focus: 'Focus',
 flexibility: 'Flex'
 };

 const routeTypeColors = { Slab: '#17a2b8', Vertical: '#28a745', Overhang: '#fd7e14', Traverse: '#6f42c1' };
 const routeTypeColor = routeTypeColors[route.routeType] || '#6c757d';

 // Compact 2-row card layout (B1).
 // Row 1: name + grade + type + cost(Ti/E) + (optional) gear-bonus chip
 // Row 2: 4 requirement chips + XP outcomes
 // Mini line: dice-effects breakdown, if present (full info, not collapsed)
 let diceEffectsHTML = '';
 if (route.rollEffect && route.rollEffect.length > 0) {
 const parts = route.rollEffect.map((effect, index) => {
  const statName = statNames[effect.stat];
  const isBuff = effect.modifier === -1;
  const sign = isBuff ? '-' : '+';
  const label = isBuff ? 'easier' : 'harder';
  const color = isBuff ? '#28a745' : '#dc3545';
  return `<span style="color:${color};font-weight:700;">d${index + 1}: ${sign}1d6 ${statName} ${label}</span>`;
 }).join('  •  ');
 diceEffectsHTML = `<div class="rc-dice">Dice: ${parts}</div>`;
 }

 const card = document.createElement('div');
 card.className = 'route-card';
 card.style.position = 'relative';
 if (!canAttempt) card.style.opacity = '0.5';
 if (alreadyAttempted) {
 card.style.border = '2px solid #ffc107';
 card.style.background = '#fff3cd';
 }

 card.onclick = () => canAttempt && attemptClimb(route, area);

 const gearBonusChip = playerHasGear.length > 0
  ? `<span class="rc-gearbonus" title="Gear bonus: ${playerHasGear.join(', ')}">+GEAR</span>`
  : '';

 const attemptedBadge = alreadyAttempted ? `<span class="rc-attempted-badge">Attempted</span>` : '';

 card.innerHTML = `
  ${attemptedBadge}
  <div class="rc-row-top">
   <span class="route-name">${route.name}</span>
   <span class="route-grade">${route.grade}</span>
   <span class="rc-type" style="background:${routeTypeColor};">${route.routeType || 'Unknown'}</span>
   <span class="rc-cost">Ti ${route.time} · E ${route.endurance}</span>
   ${gearBonusChip}
  </div>
  <div class="rc-row-bottom">
   <div class="route-requirements">
    <div class="requirement ${totalStats.strength    >= route.strength    ? 'met': 'unmet'}">S ${route.strength}</div>
    <div class="requirement ${totalStats.technique   >= route.technique   ? 'met': 'unmet'}">T ${route.technique}</div>
    <div class="requirement ${totalStats.focus       >= route.focus       ? 'met': 'unmet'}">F ${route.focus}</div>
    <div class="requirement ${totalStats.flexibility >= route.flexibility ? 'met': 'unmet'}">X ${route.flexibility}</div>
   </div>
   <div class="rc-xp"><span class="succ">+${route.xpSuccess}</span><span class="fail">/${route.xpFail}</span></div>
  </div>
  ${diceEffectsHTML}
 `;

 return card;
}

function renderTraining() {
 const container = document.getElementById('trainingAreas');
 container.innerHTML = '';

 // Stat -> chip color, mirroring the climber-token stat-pill palette.
 const statChipColor = {
  strength:    '#ff6845', // coral
  technique:   '#1fb8a6', // teal
  focus:       '#8857d4', // violet
  flexibility: '#b6d62d', // lime
 };
 const statShort = {
  strength: 'STR', technique: 'TEC', focus: 'FOC', flexibility: 'FLX',
 };

 TRAINING_AREAS.forEach(area => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const char = currentPlayer.character;
  const playersHere = getPlayersInSection(area.name);
  const isOccupied = playersHere.length > 0;
  const occupyingPlayer = isOccupied ? playersHere[0] : null;
  const isMine = isOccupied && occupyingPlayer.playerNum === currentPlayer.playerNum;
  const canTrain = char.timeRemaining >= area.time
                && char.currentEndurance >= area.endurance
                && (!isOccupied || isMine);

  const card = document.createElement('div');
  card.className = 'training-area compact-card';
  if (!canTrain) card.style.opacity = '0.5';
  if (isOccupied && !isMine) card.classList.add('locked-station');

  card.onclick = () => canTrain && trainAction(area);

  const occChip = isMine
   ? `<span class="rc-gearbonus" style="background:#28a745;">YOU</span>`
   : (isOccupied
      ? `<span class="rc-type" style="background:#dc3545;">P${occupyingPlayer.playerNum}</span>`
      : '');

  const bonusChip = `<span class="rc-type" style="background:${statChipColor[area.stat] || '#6c757d'};">+${area.bonus} ${statShort[area.stat] || area.stat.toUpperCase()}</span>`;

  card.innerHTML = `
    <div class="rc-row-top">
     <span class="route-name">${area.name}</span>
     ${bonusChip}
     <span class="rc-cost">Ti ${area.time} · E ${area.endurance}</span>
     ${occChip}
    </div>
    ${area.description ? `<div class="rc-row-bottom training-desc">${area.description}</div>` : ''}
  `;

  container.appendChild(card);
 });
}

// Compact gear-card template — same row-pattern as the climbing route cards
// and training stations. Preserves all info: name, cost, category, effect,
// description, access-grant (when applicable), and prerequisite hints.
function buildCompactGearCardHTML(gear, owned, prerequisiteText) {
 const ownedTag = owned
  ? `<span class="rc-gearbonus" style="background:#28a745;">OWNED</span>`
  : '';
 const costChip = `<span class="rc-cost">${gear.cost} XP</span>`;
 const categoryChip = gear.category
  ? `<span class="rc-type" style="background:#5a4530;">${gear.category}</span>`
  : '';
 const accessChip = gear.accessRequirement
  ? `<span class="rc-gearbonus" style="background:#155724;">+${gear.accessRequirement} ACCESS</span>`
  : '';
 return `
  <div class="rc-row-top">
   <span class="route-name">${gear.name}</span>
   ${categoryChip}
   ${costChip}
   ${accessChip}
   ${ownedTag}
  </div>
  <div class="rc-row-bottom gear-detail-row">
   <div class="gear-effect-line">${gear.effectDisplay}</div>
   <div class="gear-desc-line">${gear.description}</div>
   ${prerequisiteText}
  </div>
 `;
}

function renderStore() {
 const container = document.getElementById('gearShop');
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;
 const spendableXP = getSpendableXP(char);
 const xpToGo = getXPToNextLevel(char);

 // Affordability badge on the area-title (no longer collapses the panel).
 syncShopCollapseState(char, spendableXP);

 // Occupancy is on the area-title pill — no inline duplicate. Header line
 // keeps the spendable / XP-to-next info that drives buy decisions.
 container.innerHTML = `<p class="store-xp-info">
 <strong style="color: #28a745;">Spendable: ${spendableXP} XP</strong> ·
 <strong style="color: #ff9800;">${xpToGo} XP to next level</strong>
 </p>`;

 const hasGearBag = char.equipment.includes('Gear Bag');
 const canVisitStore = hasGearBag || char.timeRemaining >= 1;

 // Two-column wrapper: essential gear on the left, rotating gear on the right.
 const columnsWrapper = document.createElement('div');
 columnsWrapper.className = 'gear-shop-columns';

 // ===== LEFT COLUMN: ESSENTIAL ACCESS GEAR =====
 const accessGearSection = document.createElement('div');
 accessGearSection.className = 'essential-col';
 accessGearSection.innerHTML = `
   <h3 class="column-header">Required Equipment</h3>
   <div class="column-subhead">Gates access to Lead Climbing (Top Rope is open)</div>
 `;

 // Define the 3 essential access cards (Harness removed in RuleModifications)
 const accessCardNames = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
 const accessCards = GEAR_SHOP.filter(g => accessCardNames.includes(g.name));

 accessCards.forEach(gear => {
 const owned = char.equipment.includes(gear.name);
 const canAfford = !owned && canVisitStore && spendableXP >= gear.cost;

 // Check prerequisites
 let prerequisitesMet = true;
 let prerequisiteText = '';

 if (gear.prerequisiteLevel && char.level < gear.prerequisiteLevel) {
 prerequisitesMet = false;
 prerequisiteText += `<div style="color: #dc3545; font-size: 0.85em; margin-top: 5px;"> Requires Level ${gear.prerequisiteLevel}</div>`;
 }

 if (gear.prerequisiteItems && gear.prerequisiteItems.length > 0) {
 const missingItems = gear.prerequisiteItems.filter(item => !char.equipment.includes(item));
 if (missingItems.length > 0) {
 prerequisitesMet = false;
 prerequisiteText += `<div style="color: #dc3545; font-size: 0.85em; margin-top: 5px;"> Requires: ${missingItems.join(', ')}</div>`;
 }
 }

 const card = document.createElement('div');
 card.className = 'gear-card access-gear-card' + (owned ? ' owned': '') + (!prerequisitesMet ? ' locked': '');
 card.setAttribute('data-gear-slot', gear.name);
 if (!owned && (!canAfford || !prerequisitesMet)) card.style.opacity = '0.5';

 card.onclick = () => !owned && canAfford && prerequisitesMet && purchaseGear(gear);

 card.classList.add('compact-card');
 card.innerHTML = buildCompactGearCardHTML(gear, owned, prerequisiteText);

 accessGearSection.appendChild(card);
 });

 columnsWrapper.appendChild(accessGearSection);

 // ===== RIGHT COLUMN: AVAILABLE GEAR (Rotating selection) =====
 const availableGearSection = document.createElement('div');
 availableGearSection.className = 'available-col';
 availableGearSection.innerHTML = `
   <h3 class="column-header">Available Gear</h3>
   <div class="column-subhead">Rotating selection — refills when purchased</div>
 `;

 gameState.availableGear.forEach(gear => {
 const owned = char.equipment.includes(gear.name);
 const canAfford = !owned && canVisitStore && spendableXP >= gear.cost;

 // Check prerequisites
 let prerequisitesMet = true;
 let prerequisiteText = '';

 if (gear.prerequisiteLevel && char.level < gear.prerequisiteLevel) {
 prerequisitesMet = false;
 prerequisiteText += `<div style="color: #dc3545; font-size: 0.85em; margin-top: 5px;"> Requires Level ${gear.prerequisiteLevel}</div>`;
 }

 if (gear.prerequisiteItems && gear.prerequisiteItems.length > 0) {
 const missingItems = gear.prerequisiteItems.filter(item => !char.equipment.includes(item));
 if (missingItems.length > 0) {
 prerequisitesMet = false;
 prerequisiteText += `<div style="color: #dc3545; font-size: 0.85em; margin-top: 5px;"> Requires: ${missingItems.join(', ')}</div>`;
 }
 }

 const card = document.createElement('div');
 card.className = 'gear-card' + (owned ? ' owned': '') + (!prerequisitesMet ? ' locked': '');
 card.setAttribute('data-gear-slot', gear.name);
 if (!owned && (!canAfford || !prerequisitesMet)) card.style.opacity = '0.5';

 card.onclick = () => !owned && canAfford && prerequisitesMet && purchaseGear(gear);

 card.classList.add('compact-card');
 card.innerHTML = buildCompactGearCardHTML(gear, owned, prerequisiteText);

 availableGearSection.appendChild(card);
 });

 columnsWrapper.appendChild(availableGearSection);
 container.appendChild(columnsWrapper);
}

// ===== CHARACTER ABILITY SYSTEM =====

function canUseAbility(char, route, area) {
 if (char.abilityUsed) return false;

 const abilityName = CHARACTERS[char.key].specialAbility.name;

 // Only Versatility has a user-activated component (stat redistribution once per round)
 // All other abilities are fully passive
 if (abilityName !== 'Versatility') return false;

 return true;
}

function promptAbilityUse(char, route, area) {
 const abilityName = CHARACTERS[char.key].specialAbility.name;

 // Only Versatility prompts the user (for stat redistribution)
 const preClimbAbilities = ['Versatility'];

 if (preClimbAbilities.includes(abilityName)) {
 const use = confirm(` Use Versatility – Stat Redistribution?\n\nMove up to 10 points between any two stats for this climb.\n\nThis can only be used once per round.`);
 if (use) {
 char.abilityUsed = true;
 return abilityName;
 }
 }

 return null;
}

function applyAbilityToStats(char, abilityName, totalStats) {
 let modified = { ...totalStats };

 // Route Reader: Beta Boost passive (set after resting, consumed here)
 if (char.key === 'routeReader' && char.betaBoostActive) {
 modified.strength += 3;
 modified.technique += 3;
 modified.focus += 3;
 modified.flexibility += 3;
 char.betaBoostActive = false; // consume the boost
 addLog(`Beta Boost: +3 to all stats this climb!`);
 }

 // Versatility: stat redistribution (activated once per round)
 if (abilityName === 'Versatility') {
 const result = promptStatRedistribution(char, modified);
 if (result) {
 return result;
 }
 }

 return modified;
}

function applyAbilityToRequirements(char, abilityName, effectiveRequirements, route) {
 const modified = {...effectiveRequirements};

 // Perfect Beta: passive -5 to all stat requirements (min 0)
 if (char.key === 'technician') {
 modified.strength = Math.max(0, modified.strength - 5);
 modified.technique = Math.max(0, modified.technique - 5);
 modified.focus = Math.max(0, modified.focus - 5);
 modified.flexibility = Math.max(0, modified.flexibility - 5);
 }

 return modified;
}

function applyAbilityToDice(char, abilityName, route, diceEffects, area) {
 let modified = [...diceEffects];

 // Perfect Beta: negate ALL nerf dice (passive for Technician)
 if (char.key === 'technician') {
 modified = modified.map(e =>
 e.modifier === 1 ? {...e, modifier: 0, abilityNeutralized: true}: e
);
 }

 return modified;
}

function promptStatRedistribution(char, totalStats) {
 // Simplified implementation - could be expanded with a dialog
 const statNames = ['strength', 'technique', 'focus', 'flexibility'];
 const fromStat = prompt(`Versatility: Take points FROM which stat?\n\nOptions: strength, technique, focus, flexibility\n\nYou can move up to 10 points.`);

 if (!fromStat || !statNames.includes(fromStat.toLowerCase())) return null;

 const toStat = prompt(`Take points from ${fromStat} and move TO which stat?\n\nOptions: strength, technique, focus, flexibility`);

 if (!toStat || !statNames.includes(toStat.toLowerCase()) || toStat.toLowerCase() === fromStat.toLowerCase()) return null;

 const amount = parseInt(prompt(`How many points to move? (1-10)`, '5'));

 if (isNaN(amount) || amount < 1 || amount > 10) return null;

 const modified = {...totalStats};
 modified[fromStat.toLowerCase()] -= amount;
 modified[toStat.toLowerCase()] += amount;

 return modified;
}

function applyAbilityToTimeAndXP(char, abilityName, route) {
 let timeCost = route.time;
 let xpMultiplier = 1.0;

 // Sprinter: Flash Speed is always passive — reduce time by 2, half XP on success
 if (char.key === 'sprinter') {
 timeCost = Math.max(1, timeCost - 2);
 xpMultiplier = 0.5;
 }

 // Technician: Perfect Beta always adds +1 time cost
 if (char.key === 'technician') {
 timeCost += 1;
 }

 return { timeCost, xpMultiplier };
}

// ===== GAME ACTIONS =====

function attemptClimb(route, area) {
 // Online mode short-circuit: send the matching action to the server
 // instead of mutating local state. Server broadcasts the new state and
 // the renderer updates itself.
 if (window.OnlineMode && window.OnlineMode.active) {
  return window.OnlineMode.sendAction({ type: 'climb', area, routeName: route.name });
 }
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 // Check if player can enter this section. Top Rope is gated per belayer
 // station (1 climber each); other areas use the section-capacity check.
 if (area === 'topRope') {
 if (!canClimbTopRopeStation(route.belayer, currentPlayer.playerNum)) {
 alert(`Belayer ${route.belayer + 1} is occupied by another climber.\n\nWait until routes clear or pick a route at a free belayer.`);
 return;
 }
 } else {
 const locationCheck = canEnterSection(area, currentPlayer.playerNum);
 if (!locationCheck.canEnter) {
 alert(`Cannot climb here!\n\n${locationCheck.reason}`);
 return;
 }
 }

 // Initialize player's attempted routes set if needed
 if (!gameState.attemptedRoutes[currentPlayer.playerNum]) {
 gameState.attemptedRoutes[currentPlayer.playerNum] = new Set();
 }

 // Check if route already attempted this round
 const routeKey = `${area}:${route.name}`;
 if (gameState.attemptedRoutes[currentPlayer.playerNum].has(routeKey)) {
 alert('You have already attempted this route this round!\n\nYou must wait until next round to try again.');
 return;
 }

 // ABILITY: Prompt for ability use before climb (Versatility only)
 let activatedAbility = null;
 if (canUseAbility(char, route, area)) {
 activatedAbility = promptAbilityUse(char, route, area);
 }

 // ABILITY: Apply passive time/XP modifications (Sprinter Flash Speed, Technician Perfect Beta)
 const { timeCost, xpMultiplier } = applyAbilityToTimeAndXP(char, activatedAbility, route);

 // Check requirements (with modified time cost)
 if (char.timeRemaining < timeCost || char.currentEndurance < route.endurance) {
 alert('Not enough time or endurance!');
 return;
 }

 // Move player to this section and (for Top Rope) occupy the route's belayer
 // station; any other area clears the belayer-station assignment.
 movePlayerToSection(currentPlayer.playerNum, area);
 char.belayerStation = (area === 'topRope') ? route.belayer : null;

 // Ensure gearBonuses exists
 if (!char.gearBonuses) {
 char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
 }

 // Calculate gear bonuses for this specific route
 const routeGearBonuses = calculateGearBonuses(route, area);

 // Calculate total stats (including route-specific gear bonuses)
 let totalStats = {
 strength: char.stats.strength + char.trainingBonuses.strength + char.gearBonuses.strength + routeGearBonuses.strength,
 technique: char.stats.technique + char.trainingBonuses.technique + char.gearBonuses.technique + routeGearBonuses.technique,
 focus: char.stats.focus + char.trainingBonuses.focus + char.gearBonuses.focus + routeGearBonuses.focus,
 flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility + routeGearBonuses.flexibility
 };

 // ABILITY: Free Solo — guarantee check against base requirements (no dice since Life or Die negates them)
 if (char.key === 'freeSolo') {
 if (totalStats.strength < route.strength || totalStats.technique < route.technique ||
 totalStats.focus < route.focus || totalStats.flexibility < route.flexibility) {
 alert(' Life or Die: You can only attempt routes you are guaranteed to complete!\n\nYour stats must meet all base requirements.');
 return;
 }
 }

 // ABILITY: Apply stat modifications (beta boost passive + Versatility redistribution)
 totalStats = applyAbilityToStats(char, activatedAbility, totalStats);

 // Build local roll effect array (allows Sprinter to add extra Focus nerf without mutating route data)
 let effectRollArray = route.rollEffect ? [...route.rollEffect]: [];

 // ABILITY: Sprinter Flash Speed — always add an extra d6 nerf die applied to Focus
 if (char.key === 'sprinter') {
 effectRollArray.push({ stat: 'focus', modifier: 1 });
 }

 // Roll all required dice
 const numDice = effectRollArray.length || 2;
 const rolls = [];
 for (let i = 0; i < numDice; i++) {
 rolls.push(Math.floor(Math.random() * 6) + 1);
 }
 const diceToUse = rolls;

 // Apply dice to specific stats based on effectRollArray
 let effectiveRequirements = {
 strength: route.strength,
 technique: route.technique,
 focus: route.focus,
 flexibility: route.flexibility
 };

 // Track which die affected which stat for display
 let diceEffects = [];

 effectRollArray.forEach((effect, index) => {
 const die = diceToUse[index];
 const stat = effect.stat;
 const modifier = effect.modifier;

 // modifier -1 means subtract die (buff), +1 means add die (nerf)
 if (modifier === -1) {
 effectiveRequirements[stat] -= die;
 } else {
 effectiveRequirements[stat] += die;
 }

 diceEffects.push({ die, stat, modifier });
 });

 // ABILITY: Life or Die — negate ALL dice effects
 if (char.key === 'freeSolo') {
 diceEffects = diceEffects.map(e => ({...e, modifier: 0, abilityNeutralized: true}));
 }

 // ABILITY: Apply dice modifications (Perfect Beta passively negates all nerfs for Technician)
 diceEffects = applyAbilityToDice(char, activatedAbility, route, diceEffects, area);

 // Recalculate effective requirements from final diceEffects
 effectiveRequirements = {
 strength: route.strength,
 technique: route.technique,
 focus: route.focus,
 flexibility: route.flexibility
 };
 diceEffects.forEach(effect => {
 if (effect.modifier === -1) {
 effectiveRequirements[effect.stat] -= effect.die;
 } else if (effect.modifier === 1) {
 effectiveRequirements[effect.stat] += effect.die;
 }
 // modifier 0 means neutralized — don't apply
 });

 // ABILITY: Apply requirement modifications (Perfect Beta -5 to all reqs for Technician)
 effectiveRequirements = applyAbilityToRequirements(char, activatedAbility, effectiveRequirements, route);

 // Check success against effective requirements
 const strengthCheck = totalStats.strength >= effectiveRequirements.strength;
 const techniqueCheck = totalStats.technique >= effectiveRequirements.technique;
 const focusCheck = totalStats.focus >= effectiveRequirements.focus;
 const flexibilityCheck = totalStats.flexibility >= effectiveRequirements.flexibility;

 // ABILITY: Route Reader Versatility — only 3 of 4 stats need to pass
 let success;
 if (char.key === 'routeReader') {
 const numPassing = [strengthCheck, techniqueCheck, focusCheck, flexibilityCheck].filter(Boolean).length;
 success = numPassing >= 3;
 } else {
 success = strengthCheck && techniqueCheck && focusCheck && flexibilityCheck;
 }

 // Apply costs (use modified time cost)
 char.timeRemaining -= timeCost;
 char.currentEndurance -= route.endurance;

 // Mark route as attempted
 gameState.attemptedRoutes[currentPlayer.playerNum].add(routeKey);

 // Award XP (with multiplier for Flash Speed)
 let xpGained = success ? route.xpSuccess: route.xpFail;
 xpGained = Math.floor(xpGained * xpMultiplier);

 // ABILITY: Relentless (Iron Lung) — on failure, earn 50% more XP and lose extra 5 endurance
 if (!success && char.key === 'ironLung') {
 const relentlessBonus = Math.floor(xpGained * 0.5);
 xpGained += relentlessBonus;
 char.currentEndurance = Math.max(0, char.currentEndurance - 5);
 addLog(`Relentless: +${relentlessBonus} bonus XP for failing, -5 extra Endurance`);
 }

 char.xp += xpGained;

 // Check for level up
 checkLevelUp(char);

 // EFFECTS: floating numbers + chalk puff + dice anticipation + turn log.
 const fxPlayer = currentPlayer.playerNum;
 if (window.Effects) {
 const enduranceBar = window.Effects.locateEnduranceBar(fxPlayer);
 const xpBar = window.Effects.locateXpBar(fxPlayer);
 if (enduranceBar) {
 window.Effects.chalkPuff(enduranceBar, 'coral');
 window.Effects.floatNumber(enduranceBar, `−${route.endurance} END`, 'endurance-loss');
 }
 if (xpBar && xpGained > 0) {
 setTimeout(() => window.Effects.floatNumber(xpBar, `+${xpGained} XP`, 'xp'), 220);
 }
 window.Effects.recordTurnAction({
 kind: success ? 'climb✓' : 'climb✗',
 desc: `${route.name} (${route.grade})`,
 delta: `${xpGained > 0 ? '+' : ''}${xpGained} XP`,
 });
 }

 // Add log with ability notation
 const abilityLog = activatedAbility ? ` (${activatedAbility})`: '';
 addLog(`Player ${currentPlayer.playerNum} ${success ? 'completed': 'failed'} ${route.name} (${route.grade})${abilityLog} - ${xpGained} XP gained`);

 // Show result modal — turn advance happens when modal is closed via closeClimbModal().
 // Brief anticipation pause so the dice "settle" before reveal.
 if (window.Effects && typeof window.Effects.diceAnticipation === 'function') {
 window.Effects.diceAnticipation(420).then(() => {
 showClimbResult(route, rolls, diceToUse, totalStats, effectiveRequirements, diceEffects, success, xpGained, activatedAbility);
 });
 } else {
 showClimbResult(route, rolls, diceToUse, totalStats, effectiveRequirements, diceEffects, success, xpGained, activatedAbility);
 }
}

function showClimbResult(route, rolls, diceUsed, stats, effectiveReqs, diceEffects, success, xpGained, activatedAbility) {
 const modal = document.getElementById('climbModal');
 const title = document.getElementById('modalTitle');
 const body = document.getElementById('modalBody');

 title.textContent = route.name + ' - ' + route.grade;

 const statIcons = {
 strength: '',
 technique: '',
 focus: '',
 flexibility: ''
 };

 const statNames = {
 strength: 'Strength',
 technique: 'Technique',
 focus: 'Focus',
 flexibility: 'Flexibility'
 };

 // Build dice effects display
 let diceEffectsHTML = '';
 if (diceEffects && diceEffects.length > 0) {
 diceEffectsHTML = diceEffects.map((effect, index) => {
 const icon = statIcons[effect.stat];
 const statName = statNames[effect.stat];
 let sign = effect.modifier === -1 ? '-': '+';
 let color = effect.modifier === -1 ? '#28a745': '#dc3545';

 // Handle neutralized dice
 if (effect.modifier === 0 && effect.abilityNeutralized) {
 sign = '~';
 color = '#6c757d';
 } else if (effect.modifier === 0) {
 sign = '±';
 color = '#6c757d';
 }

 const neutralizedText = effect.abilityNeutralized ? ' <span style="color: #ffc107;">(Neutralized by Ability)</span>': '';
 return `<div style="margin: 5px 0; color: ${color}; font-weight: bold;">
 Die ${index + 1}: ${effect.die} → ${sign}${effect.die} ${icon} ${statName}${neutralizedText}
 </div>`;
 }).join('');
 }

 body.innerHTML = `
 <div class="result-box ${success ? 'result-success': 'result-failure'}">
 <div class="result-text">
 ${success ? ' CLIMB SUCCESSFUL!': ' CLIMB FAILED'}
 </div>
 <div class="result-details">
 <strong>XP Gained: ${xpGained}</strong>
 </div>
 </div>

 <h3>Dice Rolls:</h3>
 <div class="dice-container">
 ${rolls.map((r, i) => `
 <div class="die" style="${diceUsed.includes(r) ? '': 'opacity: 0.3;'}">
 ${r}
 </div>
 `).join('')}
 </div>
 ${rolls.length > diceUsed.length ? `<p style="text-align: center; margin-top: 10px; font-size: 0.9em; color: #666;">
 (Rolled ${rolls.length} dice, used best ${diceUsed.length})
 </p>`: ''}

 <h3 style="margin-top: 20px;">Dice Effects:</h3>
 <div style="display: grid; gap: 10px; margin-bottom: 20px;">
 ${diceEffectsHTML}
 </div>

 <h3 style="margin-top: 20px;">Requirements Check:</h3>
 <div class="route-requirements">
 <div class="requirement ${stats.strength >= effectiveReqs.strength ? 'met': 'unmet'}">
 Strength: ${stats.strength} vs ${effectiveReqs.strength} required
 </div>
 <div class="requirement ${stats.technique >= effectiveReqs.technique ? 'met': 'unmet'}">
 Technique: ${stats.technique} vs ${effectiveReqs.technique} required
 </div>
 <div class="requirement ${stats.focus >= effectiveReqs.focus ? 'met': 'unmet'}">
 Focus: ${stats.focus} vs ${effectiveReqs.focus} required
 </div>
 <div class="requirement ${stats.flexibility >= effectiveReqs.flexibility ? 'met': 'unmet'}">
 Flexibility: ${stats.flexibility} vs ${effectiveReqs.flexibility} required
 </div>
 </div>
 `;

 modal.classList.add('show');
}

function trainAction(area) {
 if (window.OnlineMode && window.OnlineMode.active) {
  return window.OnlineMode.sendAction({ type: 'train', areaName: area.name });
 }
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 // Check if player can enter this specific training equipment
 const locationCheck = canEnterSection(area.name, currentPlayer.playerNum);
 if (!locationCheck.canEnter) {
 alert(`Cannot train here!\n\n${locationCheck.reason}`);
 return;
 }

 if (char.timeRemaining < area.time || char.currentEndurance < area.endurance) {
 alert('Not enough time or endurance!');
 return;
 }

 // Move player to this specific training equipment
 movePlayerToSection(currentPlayer.playerNum, area.name);

 char.timeRemaining -= area.time;
 char.currentEndurance -= area.endurance;
 char.trainingBonuses[area.stat] += area.bonus;

 const statIcons = {
 strength: '',
 technique: '',
 focus: '',
 flexibility: ''
 };

 const newTotal = char.trainingBonuses[area.stat];
 addLog(`Player ${currentPlayer.playerNum} trained at ${area.name} - gained +${area.bonus} ${statIcons[area.stat]} ${area.stat} (total training bonus: +${newTotal})`);

 // EFFECTS: stat boost + endurance puff + turn log.
 if (window.Effects) {
 const fxPlayer = currentPlayer.playerNum;
 const panel = window.Effects.locatePlayerPanel(fxPlayer);
 const enduranceBar = window.Effects.locateEnduranceBar(fxPlayer);
 if (panel) window.Effects.floatNumber(panel, `+${area.bonus} ${area.stat.slice(0, 3).toUpperCase()}`, 'stat');
 if (enduranceBar && area.endurance > 0) {
 window.Effects.chalkPuff(enduranceBar, 'cobalt');
 setTimeout(() => window.Effects.floatNumber(enduranceBar, `−${area.endurance} END`, 'endurance-loss'), 180);
 }
 window.Effects.recordTurnAction({
 kind: 'train',
 desc: `${area.name} (+${area.bonus} ${area.stat})`,
 delta: area.endurance > 0 ? `−${area.endurance} END` : null,
 });
 }

 checkTurnEnd();
 renderGameBoard();
}

function restAction() {
 if (window.OnlineMode && window.OnlineMode.active) {
  return window.OnlineMode.sendAction({ type: 'rest' });
 }
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 // Check if player can enter rest area
 const locationCheck = canEnterSection('rest', currentPlayer.playerNum);
 if (!locationCheck.canEnter) {
 alert(`Cannot rest here!\n\n${locationCheck.reason}`);
 return;
 }

 if (char.timeRemaining < 1) {
 alert('Not enough time to rest!');
 return;
 }

 // Move player to rest area
 movePlayerToSection(currentPlayer.playerNum, 'rest');

 char.timeRemaining -= 1;

 let recovery = char.maxEndurance;

 // Calculate rest bonuses from gear
 let restBonus = 0;
 char.equipment.forEach(gearName => {
 const gear = GEAR_SHOP.find(g => g.name === gearName);
 if (gear && gear.restBonus > 0) {
 restBonus += gear.restBonus;
 }
 });

 char.currentEndurance = Math.min(char.maxEndurance + restBonus, char.currentEndurance + recovery);

 if (restBonus > 0) {
 addLog(`Player ${currentPlayer.playerNum} rested and recovered endurance to ${char.currentEndurance} (+${restBonus} gear bonus)`);
 } else {
 addLog(`Player ${currentPlayer.playerNum} rested and recovered endurance to ${char.currentEndurance}`);
 }

 // ABILITY: Route Reader Versatility — resting activates Beta Boost for next climb
 if (char.key === 'routeReader') {
 char.betaBoostActive = true;
 addLog(`Player ${currentPlayer.playerNum}: Beta Boost active — +3 to all stats on next climb!`);
 }

 // EFFECTS: endurance gain (positive chalk) + turn log.
 if (window.Effects) {
 const fxPlayer = currentPlayer.playerNum;
 const enduranceBar = window.Effects.locateEnduranceBar(fxPlayer);
 if (enduranceBar) {
 window.Effects.chalkPuff(enduranceBar, 'lime');
 window.Effects.floatNumber(enduranceBar, `+${recovery + restBonus} END`, 'endurance-gain');
 }
 window.Effects.recordTurnAction({
 kind: 'rest',
 desc: `Rested${restBonus > 0 ? ` (+${restBonus} gear)` : ''}`,
 delta: `+${recovery + restBonus} END`,
 });
 }

 checkTurnEnd();
 renderGameBoard();
}

// ===== MILESTONE ROUTE ATTEMPTS =====

function attemptMilestoneRoute(difficulty) {
 if (window.OnlineMode && window.OnlineMode.active) {
  return window.OnlineMode.sendAction({ type: 'milestone', difficulty });
 }
 if (gameState.gameEnded) {
 alert('Game has ended!');
 return;
 }

 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 // Check if already completed
 if (char.milestonesCompleted[difficulty]) {
 alert(`You have already completed the ${difficulty} milestone!`);
 return;
 }

 const milestone = gameState.milestoneRoutes[difficulty];
 if (!milestone) {
 alert('Milestone route not found!');
 return;
 }

 const route = milestone.route;
 const area = milestone.area;

 // Check if player can enter this section. Top Rope needs a free belayer
 // station; Lead/others use the section-capacity check.
 if (area === 'topRope') {
 if (pickFreeBelayerStation(currentPlayer.playerNum) === null) {
 alert('All belayers are occupied right now.\n\nWait until routes clear to attempt this milestone.');
 return;
 }
 } else {
 const locationCheck = canEnterSection(area, currentPlayer.playerNum);
 if (!locationCheck.canEnter) {
 alert(`Cannot attempt this milestone route!\n\n${locationCheck.reason}`);
 return;
 }
 }

 // Check area access (Free Solo bypasses; Top Rope is open; Lead needs the
 // three access cards).
 const milestoneAccess = checkAreaAccess(area);
 if (!milestoneAccess.hasAccess) {
 alert(`You need ${milestoneAccess.missingItems.join(', ')} to attempt ${area === 'leadClimbing' ? 'Lead Climbing' : 'Top Rope'} routes!`);
 return;
 }

 // Calculate effective time cost (passive abilities may modify it)
 const { timeCost: effectiveTimeCost } = applyAbilityToTimeAndXP(char, null, route);

 // Check time and endurance
 if (char.timeRemaining < effectiveTimeCost) {
 alert(`Not enough time! This route requires ${effectiveTimeCost} time units, you have ${char.timeRemaining}.`);
 return;
 }

 if (char.currentEndurance < route.endurance) {
 alert(`Not enough endurance! This route requires ${route.endurance} endurance, you have ${char.currentEndurance}.`);
 return;
 }

 // ABILITY: Free Solo guarantee check — must be able to meet all base requirements
 if (char.key === 'freeSolo') {
 if (!char.gearBonuses) char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
 const routeGearBonuses = calculateGearBonuses(route, area);
 const tempStats = {
 strength: char.stats.strength + char.trainingBonuses.strength + char.gearBonuses.strength + routeGearBonuses.strength,
 technique: char.stats.technique + char.trainingBonuses.technique + char.gearBonuses.technique + routeGearBonuses.technique,
 focus: char.stats.focus + char.trainingBonuses.focus + char.gearBonuses.focus + routeGearBonuses.focus,
 flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility + routeGearBonuses.flexibility,
 };
 if (tempStats.strength < route.strength || tempStats.technique < route.technique ||
 tempStats.focus < route.focus || tempStats.flexibility < route.flexibility) {
 alert(' Life or Die: You can only attempt routes you are guaranteed to complete!\n\nYour stats must meet all base requirements.');
 return;
 }
 }

 // Move player to this section (important for capacity tracking) and, for Top
 // Rope, occupy a free belayer station.
 movePlayerToSection(currentPlayer.playerNum, area);
 char.belayerStation = (area === 'topRope') ? pickFreeBelayerStation(currentPlayer.playerNum) : null;

 // Use the climb function with milestone tracking
 attemptClimbWithMilestone(route, area, difficulty);
}

function attemptClimbWithMilestone(route, area, difficulty) {
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 // Apply passive time/XP modifications
 const { timeCost, xpMultiplier } = applyAbilityToTimeAndXP(char, null, route);

 // Deduct costs (using passive-modified time cost)
 char.timeRemaining -= timeCost;
 char.currentEndurance -= route.endurance;

 // Ensure gearBonuses exists
 if (!char.gearBonuses) {
 char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
 }

 // Calculate gear bonuses for this specific route (includes route-specific modifiers)
 const routeGearBonuses = calculateGearBonuses(route, area);

 // Calculate total stats with bonuses (including route-specific gear bonuses)
 let stats = {
 strength: char.stats.strength + char.trainingBonuses.strength + char.gearBonuses.strength + routeGearBonuses.strength,
 technique: char.stats.technique + char.trainingBonuses.technique + char.gearBonuses.technique + routeGearBonuses.technique,
 focus: char.stats.focus + char.trainingBonuses.focus + char.gearBonuses.focus + routeGearBonuses.focus,
 flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility + routeGearBonuses.flexibility
 };

 // ABILITY: Free Solo guarantee check (must pass before deducting costs — already deducted above,
 // but this function is called after the gate in attemptMilestoneRoute so guarantee was already checked)

 // ABILITY: Apply stat modifications (beta boost + no redistribution for milestone routes)
 stats = applyAbilityToStats(char, null, stats);

 // Build local roll effect array (allows Sprinter extra Focus nerf without mutating route)
 let effectRollArray = route.rollEffect ? [...route.rollEffect]: [];

 // ABILITY: Sprinter Flash Speed — always add extra d6 nerf die on Focus
 if (char.key === 'sprinter') {
 effectRollArray.push({ stat: 'focus', modifier: 1 });
 }

 // Roll all required dice
 const numDice = effectRollArray.length || 2;
 const rolls = [];
 for (let i = 0; i < numDice; i++) {
 rolls.push(Math.floor(Math.random() * 6) + 1);
 }
 const diceUsed = rolls;

 // Build initial diceEffects
 let diceEffects = [];
 effectRollArray.forEach((effect, index) => {
 diceEffects.push({
 die: diceUsed[index],
 stat: effect.stat,
 modifier: effect.modifier,
 abilityNeutralized: false
 });
 });

 // ABILITY: Life or Die — negate ALL dice effects
 if (char.key === 'freeSolo') {
 diceEffects = diceEffects.map(e => ({...e, modifier: 0, abilityNeutralized: true}));
 }

 // ABILITY: Perfect Beta passively negates all nerf dice for Technician
 diceEffects = applyAbilityToDice(char, null, route, diceEffects, area);

 // Calculate effective requirements from final diceEffects
 let effectiveReqs = {
 strength: route.strength,
 technique: route.technique,
 focus: route.focus,
 flexibility: route.flexibility
 };
 diceEffects.forEach(effect => {
 if (effect.modifier === -1) {
 effectiveReqs[effect.stat] -= effect.die;
 } else if (effect.modifier === 1) {
 effectiveReqs[effect.stat] += effect.die;
 }
 });

 // ABILITY: Technician Perfect Beta — passive -5 to all stat requirements
 effectiveReqs = applyAbilityToRequirements(char, null, effectiveReqs, route);

 // Check success
 const strengthCheck = stats.strength >= effectiveReqs.strength;
 const techniqueCheck = stats.technique >= effectiveReqs.technique;
 const focusCheck = stats.focus >= effectiveReqs.focus;
 const flexibilityCheck = stats.flexibility >= effectiveReqs.flexibility;

 // ABILITY: Route Reader Versatility — only 3 of 4 stats need to pass
 let success;
 if (char.key === 'routeReader') {
 const numPassing = [strengthCheck, techniqueCheck, focusCheck, flexibilityCheck].filter(Boolean).length;
 success = numPassing >= 3;
 } else {
 success = strengthCheck && techniqueCheck && focusCheck && flexibilityCheck;
 }

 // Award XP (with Sprinter xpMultiplier)
 let xpGained = success ? route.xpSuccess: route.xpFail;
 xpGained = Math.floor(xpGained * xpMultiplier);

 // ABILITY: Relentless (Iron Lung) — on failure, earn 50% more XP and lose extra 5 endurance
 if (!success && char.key === 'ironLung') {
 const relentlessBonus = Math.floor(xpGained * 0.5);
 xpGained += relentlessBonus;
 char.currentEndurance = Math.max(0, char.currentEndurance - 5);
 addLog(`Relentless: +${relentlessBonus} bonus XP for failing, -5 extra Endurance`);
 }

 char.xp += xpGained;

 // Check for level up
 checkLevelUp(char);

 // If successful, mark milestone complete
 const areaLogLabel = area === 'bouldering' ? 'Bouldering'
                     : area === 'topRope'    ? 'Top Rope'
                                             : 'Lead Climbing';
 if (success) {
 char.milestonesCompleted[difficulty] = true;
 addLog(` Player ${currentPlayer.playerNum} completed the ${difficulty.toUpperCase()} milestone: ${route.name} (${areaLogLabel})!`);

 // Check for victory
 checkVictory(currentPlayer);
 } else {
 addLog(`Player ${currentPlayer.playerNum} attempted ${difficulty} milestone "${route.name}" (${areaLogLabel}) but failed. Gained ${xpGained} XP.`);
 }

 // EFFECTS: floating numbers, chalk puff, dice anticipation, turn log.
 const fxPlayer = currentPlayer.playerNum;
 if (window.Effects) {
 const enduranceBar = window.Effects.locateEnduranceBar(fxPlayer);
 const xpBar = window.Effects.locateXpBar(fxPlayer);
 const panel = window.Effects.locatePlayerPanel(fxPlayer);
 if (enduranceBar) {
 window.Effects.chalkPuff(enduranceBar, 'coral');
 window.Effects.floatNumber(enduranceBar, `−${route.endurance} END`, 'endurance-loss');
 }
 if (xpBar && xpGained > 0) {
 setTimeout(() => window.Effects.floatNumber(xpBar, `+${xpGained} XP`, 'xp'), 220);
 }
 if (success && panel) {
 setTimeout(() => window.Effects.floatNumber(panel, `MILESTONE ${difficulty.toUpperCase()}!`, 'stat'), 480);
 }
 window.Effects.recordTurnAction({
 kind: success ? 'milestone✓' : 'milestone✗',
 desc: `${difficulty} — ${route.name}`,
 delta: `${xpGained > 0 ? '+' : ''}${xpGained} XP`,
 });
 }

 // Show result modal — turn advance happens when modal is closed via closeClimbModal().
 if (window.Effects && typeof window.Effects.diceAnticipation === 'function') {
 window.Effects.diceAnticipation(540).then(() => {
 showClimbResult(route, rolls, diceUsed, stats, effectiveReqs, diceEffects, success, xpGained, null);
 });
 } else {
 showClimbResult(route, rolls, diceUsed, stats, effectiveReqs, diceEffects, success, xpGained, null);
 }
}

function checkVictory(player) {
 const milestones = player.character.milestonesCompleted;

 if (milestones.beginner && milestones.intermediate && milestones.expert) {
 gameState.gameEnded = true;
 gameState.winner = player;

 addLog(` GAME OVER! Player ${player.playerNum} (${player.character.name}) has completed all milestone routes and WINS THE GAME! `);

 // Show victory screen after a short delay
 setTimeout(() => {
 showVictoryScreen(player);
 }, 500);
 }
}

function showVictoryScreen(winner) {
 const modal = document.getElementById('victoryModal');
 const modalBody = document.getElementById('victoryModalBody');

 let html = `
 <div style="text-align: center;">
 <h1 style="font-size: 3em; margin-bottom: 20px;"> GAME OVER! </h1>
 <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; border-radius: 15px; margin-bottom: 30px;">
 <h2 style="font-size: 2.5em; margin: 0 0 10px 0;"> WINNER </h2>
 <h3 style="font-size: 2em; margin: 0;">Player ${winner.playerNum}</h3>
 <p style="font-size: 1.5em; margin: 10px 0 0 0;">${winner.character.name}</p>
 </div>

 <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
 <h3 style="margin-top: 0;">Final Stats</h3>
 <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; text-align: left;">
 <div><strong> Milestones:</strong> 3/3 Complete</div>
 <div><strong> Level:</strong> ${winner.character.level}</div>
 <div><strong> Total XP:</strong> ${winner.character.xp}</div>
 <div><strong> Strength:</strong> ${winner.character.stats.strength}</div>
 <div><strong> Technique:</strong> ${winner.character.stats.technique}</div>
 <div><strong> Focus:</strong> ${winner.character.stats.focus}</div>
 <div><strong> Flexibility:</strong> ${winner.character.stats.flexibility}</div>
 <div><strong> Endurance:</strong> ${winner.character.maxEndurance}</div>
 </div>
 </div>

 <div style="background: #fff3cd; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
 <h4 style="margin-top: 0;">All Players - Final Standings</h4>
 `;

 gameState.players.forEach(player => {
 const milestonesCount = Object.values(player.character.milestonesCompleted).filter(Boolean).length;
 html += `
 <div style="padding: 10px; margin: 5px 0; background: white; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
 <span><strong>Player ${player.playerNum}:</strong> ${player.character.name}</span>
 <span> ${milestonesCount}/3 | Level ${player.character.level} | ${player.character.xp} XP</span>
 </div>
 `;
 });

 html += `
 </div>

 <button class="btn btn-success" onclick="location.reload()" style="font-size: 1.2em; padding: 15px 40px;">
 Play Again
 </button>
 </div>
 `;

 modalBody.innerHTML = html;
 modal.classList.add('show');
}

function purchaseGear(gear) {
 if (window.OnlineMode && window.OnlineMode.active) {
  return window.OnlineMode.sendAction({ type: 'buyGear', gearName: gear.name });
 }
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 const char = currentPlayer.character;

 // Check if player can enter gear shop
 const locationCheck = canEnterSection('gearShop', currentPlayer.playerNum);
 if (!locationCheck.canEnter) {
 alert(`Cannot access gear shop!\n\n${locationCheck.reason}`);
 return;
 }

 if (char.timeRemaining < 1) {
 alert('Not enough time!');
 return;
 }

 // Check prerequisites
 if (gear.prerequisiteLevel && char.level < gear.prerequisiteLevel) {
 alert(`This gear requires Level ${gear.prerequisiteLevel}!\n\nYou are currently Level ${char.level}.`);
 return;
 }

 if (gear.prerequisiteItems && gear.prerequisiteItems.length > 0) {
 const missingItems = gear.prerequisiteItems.filter(item => !char.equipment.includes(item));
 if (missingItems.length > 0) {
 alert(`This gear requires the following items:\n\n${missingItems.map(i => ` ${i}`).join('\n')}\n\nPurchase these items first.`);
 return;
 }
 }

 // Move player to gear shop
 movePlayerToSection(currentPlayer.playerNum, 'gearShop');

 // Apply Non-Locking Carabiner discount on Lead gear purchases
 const leadDiscountItems = ['Locking Carabiner', 'Quickdraws Set'];
 const hasNonLockingCarabiner = char.equipment.includes('Non-Locking Carabiner');
 const carabinerDiscount = (hasNonLockingCarabiner && leadDiscountItems.includes(gear.name)) ? 20: 0;
 const effectiveCost = Math.max(0, gear.cost - carabinerDiscount);

 const spendableXP = getSpendableXP(char);
 const xpToGo = getXPToNextLevel(char);

 if (spendableXP < effectiveCost) {
 const costDisplay = carabinerDiscount > 0 ? `${effectiveCost} XP (${gear.cost} - 20 Carabiner discount)`: `${effectiveCost} XP`;
 alert(`Not enough spendable XP!\n\nYou have ${spendableXP} XP earned in Level ${char.level}.\nYou need ${costDisplay} to purchase this item.\n\nCurrently ${xpToGo} XP away from Level ${char.level + 1}.`);
 return;
 }

 // Check if has Gear Bag for free shop visit
 const hasGearBag = char.equipment.includes('Gear Bag');
 const timeCost = hasGearBag ? 0: 1;

 // EFFECTS: capture the source card position BEFORE the re-render destroys it.
 const fxSrcCard = document.querySelector(`[data-gear-slot="${gear.name.replace(/"/g, '\\"')}"]`);
 const fxSrcRect = fxSrcCard && fxSrcCard.getBoundingClientRect();
 const fxSrcGhost = fxSrcRect ? { left: fxSrcRect.left + fxSrcRect.width / 2, top: fxSrcRect.top + fxSrcRect.height / 2 } : null;
 const fxPlayerNum = currentPlayer.playerNum;
 const fxNewlyReplacedSlot = !['Belay Device', 'Locking Carabiner', 'Lead Rope'].includes(gear.name) ? gear.name : null;

 char.timeRemaining -= timeCost;
 char.xp -= effectiveCost;

 const newXpToGo = getXPToNextLevel(char);

 char.equipment.push(gear.name);

 // Apply permanent stat bonuses
 if (gear.statEffect === 'endurance') {
 char.maxEndurance += gear.value;
 } else if (gear.statEffect === 'strength' && (gear.name === 'Grip Strength Trainer')) {
 char.gearBonuses.strength += gear.value;
 } else if (gear.statEffect === 'technique' && (gear.name === 'Technique Training System')) {
 char.gearBonuses.technique += gear.value;
 } else if (gear.statEffect === 'focus' && (gear.name === 'Meditation App')) {
 char.gearBonuses.focus += gear.value;
 } else if (gear.statEffect === 'flexibility' && (gear.name === 'Resistance Bands')) {
 char.gearBonuses.flexibility += gear.value;
 } else if (gear.statEffect === 'strengthTech') {
 char.gearBonuses.strength += 2;
 char.gearBonuses.technique += 2;
 } else if (gear.statEffect === 'strengthTechMixed') {
 // Campus Board Training Program: +3 Str, -1 Tech
 char.gearBonuses.strength += 3;
 char.gearBonuses.technique -= 1;
 }

 // Handle enduranceBonus property for items like Comfortable Climbing Apparel and Compression Sleeves
 if (gear.enduranceBonus) {
 char.maxEndurance += gear.enduranceBonus;
 }

 const discountNote = carabinerDiscount > 0 ? ` (-${carabinerDiscount} Carabiner discount)`: '';
 addLog(`Player ${currentPlayer.playerNum} purchased ${gear.name} for ${effectiveCost} XP${discountNote}${timeCost === 0 ? ' (Gear Bag: free visit)': ''} (now ${newXpToGo} XP to Level ${char.level + 1})`);

 // Replace purchased gear with new one
 replaceGearInShop(gear.name);

 // EFFECTS: record the purchase for the turn summary.
 if (window.Effects) {
 window.Effects.recordTurnAction({
 kind: 'gear',
 desc: `Bought ${gear.name}`,
 delta: `−${effectiveCost} XP`,
 });
 }

 checkTurnEnd();
 renderGameBoard();

 // EFFECTS: post-render — fly the gear from shop to inventory, flip the
 // replacement card in the shop, and chalk-puff the player's XP bar.
 if (window.Effects) {
 requestAnimationFrame(() => {
 const destInv = document.getElementById(`inventory-${fxPlayerNum}`);
 // Use the original captured source center so the animation flows from
 // where the shop card USED to be, before the re-render moved it.
 const srcStub = fxSrcGhost ? { getBoundingClientRect: () => ({ left: fxSrcGhost.left - 60, top: fxSrcGhost.top - 16, width: 120, height: 32, right: 0, bottom: 0 }) } : null;
 if (srcStub && destInv) window.Effects.flyToInventory(srcStub, destInv, gear.name);
 const xpBar = window.Effects.locateXpBar(fxPlayerNum);
 if (xpBar) window.Effects.floatNumber(xpBar, `−${effectiveCost} XP`, 'xp');
 // Flip the newly drawn replacement card in the shop, if any.
 if (fxNewlyReplacedSlot) {
 // After replaceGearInShop, the new card occupies the slot. Find the
 // newest gear card that wasn't previously rendered. Simplest: flip
 // any card whose data-gear-slot matches the newly available pool.
 const allShop = document.querySelectorAll('.gear-card');
 allShop.forEach(c => {
 const slot = c.getAttribute('data-gear-slot');
 if (slot && slot !== gear.name && gameState.availableGear.find(g => g.name === slot)) {
 // No surgical way to distinguish "new" from "still there"; flip
 // them all briefly is cheaper and reads as "shop refreshed".
 }
 });
 // Cheap honest version: flip every card in the rotating-gear section.
 const rotating = Array.from(document.querySelectorAll('.gear-card:not(.access-gear-card)'));
 rotating.forEach((c, i) => setTimeout(() => window.Effects.cardFlip(c), i * 60));
 }
 });
 }
}

function checkLevelUp(char) {
 const currentLevel = char.level;
 if (currentLevel >= 15) return;

 const nextLevelXP = XP_TABLE[currentLevel].cumulative;
 if (char.xp >= nextLevelXP) {
 // Store old stats before leveling up
 const oldStats = {
 strength: char.stats.strength,
 technique: char.stats.technique,
 focus: char.stats.focus,
 flexibility: char.stats.flexibility,
 maxEndurance: char.maxEndurance
 };

 char.level++;

 // Update stats based on growth
 updateCharacterStatsForLevel(char);

 // Store for animated level-up popup
 const playerNum = gameState.players.find(p => p.character === char).playerNum;
 gameState.pendingLevelUp = { char, oldStats, newLevel: char.level, playerNum };

 // Log level up with stat changes
 addLog(` Player ${playerNum} leveled up to Level ${char.level}!`);
 addLog(` Strength: ${oldStats.strength} → ${char.stats.strength} (+${char.stats.strength - oldStats.strength})`);
 addLog(` Technique: ${oldStats.technique} → ${char.stats.technique} (+${char.stats.technique - oldStats.technique})`);
 addLog(` Focus: ${oldStats.focus} → ${char.stats.focus} (+${char.stats.focus - oldStats.focus})`);
 addLog(` Flexibility: ${oldStats.flexibility} → ${char.stats.flexibility} (+${char.stats.flexibility - oldStats.flexibility})`);
 addLog(` Max Endurance: ${oldStats.maxEndurance} → ${char.maxEndurance} (+${char.maxEndurance - oldStats.maxEndurance})`);
 }
}

function updateCharacterStatsForLevel(char) {
 // Update stats based on growth for current level
 const charTemplate = CHARACTERS[char.key];
 char.stats.strength = Math.round(charTemplate.startingStats.strength + charTemplate.growth.strength * (char.level - 1));
 char.stats.technique = Math.round(charTemplate.startingStats.technique + charTemplate.growth.technique * (char.level - 1));
 char.stats.focus = Math.round(charTemplate.startingStats.focus + charTemplate.growth.focus * (char.level - 1));
 char.stats.flexibility = Math.round(charTemplate.startingStats.flexibility + charTemplate.growth.flexibility * (char.level - 1));
 char.maxEndurance = Math.round(charTemplate.startingEndurance + charTemplate.growth.endurance * (char.level - 1));
}

function getSpendableXP(char) {
 // Returns XP available to spend within current level (without leveling down)
 // This is all XP earned within the current level
 const currentLevelThreshold = XP_TABLE[char.level - 1].cumulative;
 const xpInCurrentLevel = char.xp - currentLevelThreshold;
 return xpInCurrentLevel;
}

function getXPToNextLevel(char) {
 // Returns how much more XP is needed to reach the next level
 if (char.level >= 15) return 0;
 const nextLevelThreshold = XP_TABLE[char.level].cumulative;
 return nextLevelThreshold - char.xp;
}

function checkTurnEnd() {
 // After any action, determine which player has the most time remaining
 determineNextPlayer();
}

function determineNextPlayer() {
 // Find the maximum time remaining among all players
 let maxTime = -1;
 gameState.players.forEach((player) => {
 if (player.character.timeRemaining > maxTime) {
 maxTime = player.character.timeRemaining;
 }
 });

 // If all players have 0 or less time, end the round
 if (maxTime <= 0) {
 endRound();
 return;
 }

 // Check if current player still has the most time (handles ties by keeping current player)
 const currentPlayer = gameState.players[gameState.currentPlayerIndex];
 if (currentPlayer.character.timeRemaining === maxTime) {
 // Current player keeps their turn
 renderGameBoard();
 return;
 }

 // Find the next player with the most time remaining
 let nextPlayerIndex = -1;
 for (let i = 0; i < gameState.players.length; i++) {
 if (gameState.players[i].character.timeRemaining === maxTime) {
 nextPlayerIndex = i;
 break;
 }
 }

 // Set the current player to the one with the most time
 if (nextPlayerIndex !== -1 && nextPlayerIndex !== gameState.currentPlayerIndex) {
 // EFFECTS: show the prior player's turn-end summary, then reset for the new player.
 if (window.Effects) {
 window.Effects.turnSummaryCard();
 const nextPlayer = gameState.players[nextPlayerIndex];
 window.Effects.beginTurn(nextPlayer.playerNum, nextPlayer.character.name);
 }
 gameState.currentPlayerIndex = nextPlayerIndex;
 addLog(`Turn passes to Player ${gameState.players[nextPlayerIndex].playerNum} (${maxTime} time remaining)`);
 renderGameBoard();
 return;
 }

 renderGameBoard();
}

function endRound() {
 addLog(`Round ${gameState.round} ended!`);

 // Route clearing
 clearRoutes();

 // Reset player time, abilities, and locations (training bonuses are permanent
 // and not reset). The route-clearing rotation moves every player back to the
 // Lobby automatically and frees their belayer station (RuleModifications).
 gameState.players.forEach(player => {
 const hasApproachShoes = player.character.equipment.includes('Approach Shoes');
 player.character.timeRemaining = 10 + (hasApproachShoes ? 1: 0);
 player.character.abilityUsed = false;
 player.character.location = 'lobby'; // Return all players to lobby
 player.character.belayerStation = null;
 });

 // Clear all attempted routes for new round
 gameState.attemptedRoutes = {};

 // RuleModifications: belayer count is fixed at N − 1 from round 1 — no
 // time-based unlock ramp.

 gameState.round++;
 gameState.currentPlayerIndex = 0;

 addLog(`Round ${gameState.round} begins!`);

 // EFFECTS: round transition wipe + turn log reset for new player.
 if (window.Effects) {
 // Flush whatever turn log was pending for the previous player.
 window.Effects.turnSummaryCard();
 window.Effects.roundTransition(gameState.round);
 const firstPlayer = gameState.players[gameState.currentPlayerIndex];
 if (firstPlayer) window.Effects.beginTurn(firstPlayer.playerNum, firstPlayer.character.name);
 }

 renderGameBoard();
}

function clearRoutes() {
 // Route clearing mechanic:
 // Position 0: between bouldering and lead → clear lead climbing (next clockwise)
 // Position 1: between lead and top rope → clear top rope (next clockwise)
 // Position 2: between top rope and bouldering → clear bouldering (next clockwise)

 const positionNames = ['Bouldering ↔ Lead Climbing', 'Lead Climbing ↔ Top Rope', 'Top Rope ↔ Bouldering'];
 addLog(` Route Clearing: Token is at ${positionNames[gameState.routeClearingPosition]}`);

 // Clear the next area in clockwise rotation
 if (gameState.routeClearingPosition === 0) {
 // Token between bouldering and lead → clear lead climbing
 const leadPool = [...ROUTES.leadClimbing].sort(() => Math.random() - 0.5);
 gameState.availableRoutes.leadClimbing = leadPool.slice(0, 5);
 addLog(' Lead climbing routes refreshed and reset');
 } else if (gameState.routeClearingPosition === 1) {
 // Token between lead and top rope → clear top rope (all belayer stations
 // refresh together: 2 routes × belayerCount).
 gameState.availableRoutes.topRope = drawTopRopeStations();
 addLog(' Top rope routes refreshed and reset');
 } else {
 // Token between top rope and bouldering → clear bouldering
 const boulderingPool = [...ROUTES.bouldering].sort(() => Math.random() - 0.5);
 gameState.availableRoutes.bouldering = boulderingPool.slice(0, 5);
 addLog(' Bouldering routes refreshed and reset');
 }

 // Move the token clockwise to the next position
 gameState.routeClearingPosition = (gameState.routeClearingPosition + 1) % 3;
 addLog(` Route clearing token moves to ${positionNames[gameState.routeClearingPosition]}`);
}

function closeModal() {
 document.getElementById('climbModal').classList.remove('show');
}

function closeClimbModal() {
 document.getElementById('climbModal').classList.remove('show');
 if (gameState.gameEnded) return; // Victory screen handles itself
 if (gameState.pendingLevelUp) {
 showLevelUpPopup();
 } else {
 advanceTurn();
 }
}

function advanceTurn() {
 checkTurnEnd();
 renderGameBoard();
}

function showLevelUpPopup() {
 const { char, oldStats, newLevel, playerNum } = gameState.pendingLevelUp;

 const statRows = [
 { icon: '', name: 'Strength', old: oldStats.strength, now: char.stats.strength },
 { icon: '', name: 'Technique', old: oldStats.technique, now: char.stats.technique },
 { icon: '', name: 'Focus', old: oldStats.focus, now: char.stats.focus },
 { icon: '', name: 'Flexibility', old: oldStats.flexibility, now: char.stats.flexibility },
 { icon: '', name: 'Max Endurance',old: oldStats.maxEndurance,now: char.maxEndurance }
 ].map(row => {
 const diff = row.now - row.old;
 const diffStr = diff > 0 ? `<span class="stat-up">+${diff}</span>`: `<span>${diff}</span>`;
 return `<tr>
 <td>${row.icon} ${row.name}</td>
 <td>${row.old}</td>
 <td>${row.now}</td>
 <td>${diffStr}</td>
 </tr>`;
 }).join('');

 document.getElementById('levelUpBody').innerHTML = `
 <div class="level-up-headline"> LEVEL UP! </div>
 <div style="font-size: 1.1em; color: #2c3e50; margin-bottom: 5px;">
 Player ${playerNum} — ${char.name}
 </div>
 <div class="level-badge">${newLevel}</div>
 <table class="stat-table">
 <thead>
 <tr>
 <th>Stat</th>
 <th>Before</th>
 <th>After</th>
 <th>Change</th>
 </tr>
 </thead>
 <tbody>${statRows}</tbody>
 </table>
 `;

 // Force animation restart on the modal content
 const content = document.querySelector('#levelUpModal .level-up-modal-content');
 content.style.animation = 'none';
 content.offsetHeight; // reflow
 content.style.animation = '';

 document.getElementById('levelUpModal').classList.add('show');
}

function closeLevelUpModal() {
 document.getElementById('levelUpModal').classList.remove('show');
 gameState.pendingLevelUp = null;
 advanceTurn();
}

// ---------------------------------------------------------------------------
// Collapsible panels (Stack 2 — A3 log, C1 gear shop with auto-open).
// ---------------------------------------------------------------------------

function toggleLogPanel() {
 const panel = document.getElementById('gameLog');
 if (!panel) return;
 const collapsed = panel.classList.toggle('collapsed');
 const btn = panel.querySelector('.log-toggle-btn');
 if (btn) btn.textContent = collapsed ? '+' : '−';
}

// The shop is always-visible per the latest design pass — the previous
// toggle / auto-open behavior was removed. We keep the affordability badge
// as a passive signal on the title row, but never collapse the panel.
function syncShopCollapseState(char, spendableXP) {
 const panel = document.querySelector('.store-panel');
 if (!panel) return;
 panel.classList.remove('collapsed');

 // Lazily create the affordable-hint badge inside the gear-shop area-title.
 const title = panel.querySelector('.area-title .at-pills') || panel.querySelector('.area-title');
 if (!title) return;
 let hint = panel.querySelector('.shop-affordable-hint');
 if (!hint) {
  hint = document.createElement('span');
  hint.className = 'shop-affordable-hint';
  title.appendChild(hint);
 }

 // Compute affordability across BOTH access cards and the rotating selection.
 const owned = new Set(char.equipment);
 const hasGearBag = owned.has('Gear Bag');
 const canVisit = hasGearBag || char.timeRemaining >= 1;
 const accessNames = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
 const candidates = [
  ...GEAR_SHOP.filter(g => accessNames.includes(g.name)),
  ...gameState.availableGear,
 ];
 const affordable = candidates.some(gear => {
  if (owned.has(gear.name)) return false;
  if (!canVisit) return false;
  if (gear.cost > spendableXP) return false;
  if (gear.prerequisiteLevel && char.level < gear.prerequisiteLevel) return false;
  if (gear.prerequisiteItems && gear.prerequisiteItems.some(i => !owned.has(i))) return false;
  return true;
 });

 hint.textContent = 'AFFORDABLE';
 hint.style.display = affordable ? 'inline-block' : 'none';
}

// Make sure functions are globally accessible
window.startCharacterSelect = startCharacterSelect;
window.startGame = startGame;
window.closeModal = closeModal;
window.closeClimbModal = closeClimbModal;
window.closeLevelUpModal = closeLevelUpModal;
window.restAction = restAction;
window.attemptMilestoneRoute = attemptMilestoneRoute;
window.toggleLogPanel = toggleLogPanel;

// External setter for `gameState`. `let gameState = {...}` is module-scoped
// (regular <script> tags don't put `let` bindings on window) so an outside
// module like online-mode.js cannot reassign it directly. This helper
// lets the online client swap in server-driven state per broadcast.
// Also expose the renderer + a getter so it can drive a full render after
// each state update.
window.setGameState = function(s) { gameState = s; };
window.getGameState = function() { return gameState; };
window.renderGameBoard = renderGameBoard;
