// All In Ascent — browser game bundle.
//
// This file is the SINGLE SOURCE OF TRUTH for game data. The GAME DATA section
// below is extracted into engine/data.js by `node engine/build-data.js` (run
// automatically by the test/playtest npm scripts) so the Node engine, sim
// harness, and analysis tools read the same values without hand-syncing.
// Rules version is kept in step with the Node engine (engine/version.js).
const GAME_VERSION = '0.7.0';
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
// extraDieDiscardOne — roll `value` extra die on tagged climbs, then discard one (N dice → roll N+1, keep N)
// ignoreFailPenalty — skip Iron Lung's −5 fail-endurance penalty AND general fail penalties
// treatOneDieAsValue — on every climb, may treat one die as `value` (typically 1)
// failBonusXp — every failed climb grants `value` extra XP
// successHealEndurance — every successful climb restores `value` endurance
// trainingBonusBoost — every training session grants `value` extra stat bonus
// milestoneBuffDiceBonus — every buff die (modifier −1) on milestone climbs is +`value` (max 6)
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
 { name: "Power Tap Belt", cost: 120, category: "Specialized Gear", statEffect: "none", value: 1, routeFilter: [], holdFeatureFilter: [], effectKind: "extraDieDiscardOne", tagFilter: "Dynamic", description: "Explosive feedback for dynamic moves", effectDisplay: "On Dynamic climbs, roll 1 extra die, then discard any one die", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },

 // ===== FIX + BOOST CARDS (F/B roles; permanent passives) =====
 { name: "Beta Reading Book", cost: 100, category: "Recovery Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], description: "Pre-climb visualization restores composure", effectDisplay: "Rest restores +10 endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 10 },
 { name: "Mental Anchor", cost: 130, category: "Recovery Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], effectKind: "ignoreFailPenalty", description: "Stay focused even after a fall — no extra cost when failing", effectDisplay: "Failed climbs no longer cost extra endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Pre-Climb Stretching", cost: 90, category: "Recovery Gear", statEffect: "none", value: 0, routeFilter: [], holdFeatureFilter: [], description: "Better flexibility means more bang per rest", effectDisplay: "Rest restores +12 endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 12 },
 { name: "Sequence Memorization", cost: 150, category: "Strategy Gear", statEffect: "none", value: 1, routeFilter: [], holdFeatureFilter: [], effectKind: "treatOneDieAsValue", description: "Plan your moves before they happen", effectDisplay: "On every climb, treat one die as a 1 (your choice after rolling)", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Confidence Building", cost: 110, category: "Strategy Gear", statEffect: "none", value: 10, routeFilter: [], holdFeatureFilter: [], effectKind: "failBonusXp", description: "Learn from every fall", effectDisplay: "Failed climbs give +10 bonus XP", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Power Spotting", cost: 90, category: "Recovery Gear", statEffect: "none", value: 5, routeFilter: [], holdFeatureFilter: [], effectKind: "successHealEndurance", description: "A spotter's encouragement returns energy", effectDisplay: "Successful climbs restore +5 endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Approach Shoes", cost: 55, category: "Comfort Gear", statEffect: "timePerRound", value: 1, routeFilter: ["All"], holdFeatureFilter: [], description: "Ergonomic footwear keeps you fresh", effectDisplay: "+1 Time at round start", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Old Climbing Journal", cost: 100, category: "Training Equipment", statEffect: "none", value: 1, routeFilter: [], holdFeatureFilter: [], effectKind: "trainingBonusBoost", description: "Track every session and pattern of progress", effectDisplay: "Training sessions give +6 instead of +5", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
 { name: "Climbing Coach", cost: 180, category: "Strategy Gear", statEffect: "none", value: 1, routeFilter: [], holdFeatureFilter: [], effectKind: "milestoneBuffDiceBonus", description: "Expert guidance for the routes that matter most", effectDisplay: "On milestone climbs, every buff die is +1 (max 6)", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
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

// The routes of `area` that may be dealt to the wall: the area's deck minus
// this game's milestone routes (milestones stay on the milestone board and
// never also appear as regular routes). Mirrors engine/state.js regularRoutePool.
function regularRoutePool(area) {
 const milestoneNames = new Set(
 Object.values(gameState.milestoneRoutes || {})
 .filter(m => m && m.area === area)
 .map(m => m.route.name)
 );
 return ROUTES[area].filter(r => !milestoneNames.has(r.name));
}

// Draw the Top Rope rotation as belayerCount stations of ROUTES_PER_BELAYER
// routes each. Returns a FLAT array of 2×belayerCount routes, each tagged with
// a `belayer` index (0-based station).
function drawTopRopeStations() {
 const count = Math.max(0, gameState.belayerCount) * ROUTES_PER_BELAYER;
 const pool = [...regularRoutePool('topRope')].sort(() => Math.random() - 0.5);
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

// ===== UI HELPERS (Grit & Holds v2 design system) =====
// Rendering goes through design/cards.js (AIACards) and design/card-art.js
// (AIAArt). These helpers compute what each card should say — including the
// plain-language reason a card can't be played right now — so the board never
// relies on colour or opacity alone to signal state.

const UI_STATS = [
 { key: 'strength', short: 'STR', name: 'Strength' },
 { key: 'technique', short: 'TEC', name: 'Technique' },
 { key: 'focus', short: 'FOC', name: 'Focus' },
 { key: 'flexibility', short: 'FLX', name: 'Flexibility' },
];
const UI_PLAYER_COLORS = ['coral', 'teal', 'violet', 'marigold'];
// Climber-rail <details> open state survives re-renders.
const uiOpenDetails = new Set();

function uiEsc(s) {
 return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function uiIcon(name) {
 return window.AIAArt ? window.AIAArt.icon(name) : '';
}
function uiPlayerColor(playerNum) {
 return UI_PLAYER_COLORS[(playerNum - 1) % UI_PLAYER_COLORS.length];
}
function uiCurrent() {
 return gameState.players[gameState.currentPlayerIndex];
}

// Why the current player can't climb `route` right now ('' when they can).
// Mirrors the checks attemptClimb / attemptMilestoneRoute run on click.
function uiClimbBlocker(route, area, opts = {}) {
 const player = uiCurrent();
 const char = player.character;
 if (gameState.gameEnded) return 'The game is over';
 if (!opts.milestone) {
  const key = `${area}:${route.name}`;
  if (gameState.attemptedRoutes[player.playerNum]?.has(key)) return 'Already attempted this round';
 }
 const access = checkAreaAccess(area);
 if (!access.hasAccess) return `Locked · needs ${access.missingItems.join(', ')}`;
 if (area === 'topRope') {
  if (opts.milestone) {
   if (pickFreeBelayerStation(player.playerNum) === null) return 'Every belayer is busy';
  } else if (!canClimbTopRopeStation(route.belayer, player.playerNum)) {
   return `Belayer ${route.belayer + 1} is taken`;
  }
 } else {
  const check = canEnterSection(area, player.playerNum);
  if (!check.canEnter) {
   const who = getPlayersInSection(area).map(p => `P${p.playerNum}`).join(', ');
   return `Wall is full (${who})`;
  }
 }
 // Costs with character passives and gear, exactly as attemptClimb checks them.
 const costs = getClimbCosts(char, route);
 if (char.timeRemaining < costs.time) return `Needs ${costs.time} time · you have ${char.timeRemaining}`;
 if (char.currentEndurance < costs.endurance) return `Needs ${costs.endurance} END · you have ${char.currentEndurance}`;
 if (char.key === 'freeSolo') {
  const stats = computeClimbStats(char, route, area);
  if (UI_STATS.some(s => stats[s.key] < route[s.key])) return 'Life or Die · stats must meet every requirement';
 }
 return '';
}

function renderMilestonePanel() {
 const container = document.getElementById('milestonePanel');
 if (!container || !window.AIACards) return;
 container.innerHTML = '';
 const char = uiCurrent().character;

 ['beginner', 'intermediate', 'expert'].forEach(difficulty => {
  const milestone = gameState.milestoneRoutes[difficulty];
  if (!milestone) return;
  const sent = char.milestonesCompleted[difficulty];
  const roster = gameState.players.map(p => {
   const done = p.character.milestonesCompleted[difficulty];
   return `<li class="${done ? 'done' : ''}">P${p.playerNum}${done ? ' ✓' : ''}<span class="sr-only">${done ? ' has sent it' : ' has not sent it'}</span></li>`;
  }).join('');
  const reason = sent ? 'You already sent this project' : uiClimbBlocker(milestone.route, milestone.area, { milestone: true });
  const card = AIACards.route(milestone.route, {
   area: milestone.area,
   costs: getClimbCosts(char, milestone.route),
   milestone: difficulty,
   stats: computeClimbStats(char, milestone.route, milestone.area),
   status: sent ? 'Sent' : null,
   tone: sent ? 'done' : null,
   extra: `<ul class="ps-projects ms-roster" aria-label="Sent by">${roster}</ul>`,
   action: {
    label: sent ? 'Sent' : 'Attempt',
    disabled: !!reason,
    reason,
    reasonIcon: sent ? 'check' : 'lock',
    onClick: () => attemptMilestoneRoute(difficulty),
   },
  });
  card.classList.add('milestone-card');
  container.appendChild(card);
 });
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

 // Move focus to the new step so keyboard and screen-reader users follow along.
 const title = document.getElementById('pickTitle');
 if (title) {
  title.setAttribute('tabindex', '-1');
  title.focus({ preventScroll: true });
  charSelectionDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
 }
}

function renderCharacterSelect() {
 const container = document.getElementById('characterSelect');
 if (!container || !window.AIACards) return;
 container.innerHTML = '';
 // Defense in depth: the Start button is only enabled when every player slot
 // has a character — never inherited from a previous render.
 const allChosen = gameState.players.length > 0 && gameState.players.every(p => p.character);
 const startBtn = document.getElementById('startGameBtn');
 if (startBtn) startBtn.disabled = !allChosen;

 const takenBy = new Map(gameState.players.filter(p => p.character).map(p => [p.character.key, p.playerNum]));
 const next = gameState.players.find(p => !p.character);

 Object.keys(CHARACTERS).forEach(charKey => {
  const char = CHARACTERS[charKey];
  const by = takenBy.get(charKey);
  const card = AIACards.climber(charKey, char, {
   status: by ? `Player ${by}` : null,
   tone: by ? 'done' : null,
   action: {
    label: by ? `Player ${by}` : 'Choose',
    disabled: !!by || !next,
    reason: by ? `Chosen by Player ${by}` : (!next ? 'Every player has a climber' : ''),
    reasonIcon: 'check',
    ariaLabel: !by && next ? `Choose ${char.name} for Player ${next.playerNum}` : undefined,
    onClick: () => selectCharacter(charKey),
   },
  });
  card.classList.add('character-card');
  card.dataset.charKey = charKey;
  container.appendChild(card);
 });

 // Step status + roster of picks so far.
 const status = document.getElementById('pickStatus');
 if (status) {
  status.textContent = next
   ? `Player ${next.playerNum} of ${gameState.players.length}, choose your climber.`
   : 'Everyone is roped in. Start climbing when ready.';
 }
 const roster = document.getElementById('pickRoster');
 if (roster) {
  roster.innerHTML = gameState.players.filter(p => p.character).map(p =>
   `<li><span class="aia-chip" style="background: var(--${uiPlayerColor(p.playerNum)}); color: var(--on-${uiPlayerColor(p.playerNum)});">P${p.playerNum}</span>${uiEsc(p.character.name)}</li>`).join('');
 }
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

 // Re-render the picker (chosen cards become disabled with the player's
 // name), then keep keyboard focus somewhere sensible.
 renderCharacterSelect();
 const allChosen = gameState.players.every(p => p.character);
 const focusTarget = allChosen
  ? document.getElementById('startGameBtn')
  : document.querySelector('#characterSelect .aia-card__action:not([aria-disabled="true"])');
 if (focusTarget) focusTarget.focus();
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

 // Top Rope belayer stations: N − 1 for N players, minimum 1 (the solo
 // Auto-Belay). Fixed for the whole game. Mirrors engine/state.js belayerCountFor.
 gameState.belayerCount = Math.max(1, gameState.players.length - 1);

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
 // Shuffle and select 5 bouldering routes (milestone routes excluded)
 const boulderingPool = [...regularRoutePool('bouldering')].sort(() => Math.random() - 0.5);
 gameState.availableRoutes.bouldering = boulderingPool.slice(0, 5);

 // Lead climbing starts with 5 routes
 const leadPool = [...regularRoutePool('leadClimbing')].sort(() => Math.random() - 0.5);
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
 // Pills first: renderStore() adds the "affordable" hint into the gear-shop
 // pill host, which renderSectionStatusPills() would otherwise wipe.
 renderSectionStatusPills();
 renderStore();
 updateTurnIndicator();
}

// Player state is rendered into #playersContainer by renderPlayers().
// The sticky strip / collapse toggle / show-full-details pill were removed
// during a UI cleanup pass; full panels are now always visible.

function renderGameInfo() {
 const currentPlayer = uiCurrent();

 // Round tape, fixed Top Rope belayer count, and Rest as an inline action.
 // The route-clearing token is a pill on the area that clears next (see
 // renderSectionStatusPills).
 const char = currentPlayer.character;
 const canRest = !gameState.gameEnded && char.timeRemaining >= 1;
 const belayerLabel = gameState.players.length === 1 ? 'Auto-Belay' : 'Belayers';

 document.getElementById('gameInfo').innerHTML = `
 <span class="tape tape--marigold tape--straight info-round">Round ${gameState.round}</span>
 <span class="info-box"><span class="info-label">${belayerLabel}</span><span class="info-value">${gameState.belayerCount}</span></span>
 <button class="btn btn--lime btn--sm info-rest-btn" type="button" onclick="restAction()" ${canRest ? '' : 'disabled'}>
  ${uiIcon('rest')}Rest<span aria-hidden="true"> · 1 time</span><span class="sr-only"> (costs 1 time, refills endurance)</span>
 </button>
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
  // Sections with effectively unlimited room (capacity 10) read as "Open".
  const who = occupants.map(p => `P${p.playerNum}`).join(' ');
  const occLabel = capacity >= 10
   ? (occupants.length ? `Here: ${who}` : 'Open')
   : (occupants.length ? `${occupants.length}/${capacity} · ${who}` : `${occupants.length}/${capacity} open`);
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
 const currentPlayer = uiCurrent();
 const char = currentPlayer.character;
 const n = currentPlayer.playerNum;
 const t = char.timeRemaining;
 const pips = Array.from({ length: Math.max(10, t) }, (_, i) => `<i class="${i < t ? 'on' : ''}"></i>`).join('');
 const timeText = t <= 0
  ? '<span class="ti-warn">Out of time</span>'
  : t === 1 ? '<span class="ti-warn">1 time left · last action</span>' : `${t} time left`;
 document.getElementById('turnIndicator').innerHTML = `
  <span class="hold hold--label hold--${uiPlayerColor(n)} ti-token" aria-hidden="true">P${n}</span>
  <div class="ti-text">
   <div class="ti-who">Player ${n}'s turn · ${uiEsc(char.name)}</div>
   <div class="ti-time"><span class="aia-pips${t <= 1 ? ' aia-pips--warn' : ''}" aria-hidden="true">${pips}</span><span>${timeText}</span></div>
  </div>`;
}

// Player sheets in the climber rail. Keeps the data hooks effects.js anchors
// to (data-player, data-endurance-bar, data-xp-bar, data-inventory) — the
// inventory is now the visible gear-chip row, so purchased gear flies there.
function renderPlayers() {
 const container = document.getElementById('playersContainer');
 if (!container) return;
 container.innerHTML = '';

 gameState.players.forEach((player, idx) => {
  const char = player.character;
  if (!char.gearBonuses) char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  const n = player.playerNum;
  const color = uiPlayerColor(n);
  const isCurrent = idx === gameState.currentPlayerIndex;
  const exhausted = char.timeRemaining <= 0;
  const endPct = Math.max(0, Math.min(100, (char.currentEndurance / char.maxEndurance) * 100));
  const xpForLevel = XP_TABLE[char.level - 1];
  const xpPct = char.level < 15
   ? Math.max(0, Math.min(100, ((char.xp - xpForLevel.cumulative) / xpForLevel.needed) * 100))
   : 100;
  const spendableXP = getSpendableXP(char);
  const xpToGo = getXPToNextLevel(char);
  const beta = char.betaBoostActive ? 3 : 0;

  const stats = UI_STATS.map(s => {
   const extra = (char.trainingBonuses[s.key] || 0) + (char.gearBonuses[s.key] || 0) + beta;
   const extraTxt = extra ? `${extra > 0 ? '+' : ''}${extra}` : '';
   return `<div class="aia-req aia-req--${s.key}">
    <dt>${uiIcon(s.key)}<span class="aia-req__label">${s.short}</span><span class="sr-only">${s.name}</span></dt>
    <dd>${char.stats[s.key]}${extra ? `<span class="bonus" aria-hidden="true">${extraTxt}</span><span class="sr-only"> ${extraTxt} bonus</span>` : ''}</dd>
   </div>`;
  }).join('');

  const t = char.timeRemaining;
  const pips = Array.from({ length: Math.max(10, t) }, (_, i) => `<i class="${i < t ? 'on' : ''}"></i>`).join('');
  const ms = char.milestonesCompleted;
  const project = (key, cls, label) => `<li class="${ms[key] ? `done ${cls}` : ''}">${label}${ms[key] ? ' ✓' : ''}<span class="sr-only">${ms[key] ? ' sent' : ' not yet'}</span></li>`;
  const stateClass = exhausted ? 'out' : char.betaBoostActive ? 'beta' : char.abilityUsed ? 'used' : 'ready';
  const stateText = exhausted ? 'Out of time' : char.betaBoostActive ? 'Beta Boost active' : char.abilityUsed ? 'Ability used' : 'Ability ready';
  const bonuses = UI_STATS.map(s => {
   const tr = char.trainingBonuses[s.key] || 0, gr = char.gearBonuses[s.key] || 0;
   if (!tr && !gr) return '';
   return `<li>${s.name}: ${[tr ? `+${tr} training` : '', gr ? `${gr > 0 ? '+' : ''}${gr} gear` : ''].filter(Boolean).join(' · ')}</li>`;
  }).join('');

  const sheet = document.createElement('article');
  sheet.className = 'player-sheet' + (isCurrent ? ' active' : '') + (exhausted ? ' exhausted' : '');
  sheet.setAttribute('data-player', n);
  sheet.id = `player-${n}-panel`;
  sheet.setAttribute('aria-labelledby', `ps-name-${n}`);
  sheet.innerHTML = `
   ${isCurrent ? '<span class="tape ps-now" aria-hidden="true">On the wall</span>' : ''}
   <div class="ps-head">
    <div class="ps-portrait">${window.AIAArt ? AIAArt.climber(char.key) : ''}</div>
    <div>
     <h3 class="ps-name" id="ps-name-${n}"><span class="ps-num">P${n}</span>${uiEsc(char.name)}${isCurrent ? '<span class="sr-only"> (current turn)</span>' : ''}</h3>
     <div class="ps-meta"><span>${uiEsc(char.archetype)}</span><span>${uiIcon('location')} ${uiEsc(formatLocationName(char.location))}</span></div>
    </div>
    <span class="hold hold--label hold--${color} ps-level"><span class="sr-only">Level </span>${char.level}<small aria-hidden="true">LVL</small></span>
   </div>
   <dl class="aia-reqs ps-stats">${stats}</dl>
   <div class="ps-meter">
    <span class="label">${uiIcon('endurance')}END</span>
    <div class="aia-meter aia-meter--endurance" role="meter" aria-label="Endurance" aria-valuemin="0" aria-valuemax="${char.maxEndurance}" aria-valuenow="${char.currentEndurance}" aria-valuetext="${char.currentEndurance} of ${char.maxEndurance}">
     <div class="aia-meter__fill" data-endurance-bar="${n}" id="endurance-bar-${n}" style="--w: ${endPct}%;"></div>
    </div>
    <span class="nums">${char.currentEndurance}<small>/${char.maxEndurance}</small></span>
   </div>
   <div class="ps-meter">
    <span class="label">${uiIcon('xp')}XP</span>
    <div class="aia-meter aia-meter--xp" role="meter" aria-label="Progress to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(xpPct)}" aria-valuetext="${spendableXP} XP to spend, ${char.level < 15 ? `${xpToGo} to level ${char.level + 1}` : 'max level'}">
     <div class="aia-meter__fill" data-xp-bar="${n}" id="xp-bar-${n}" style="--w: ${xpPct}%;"></div>
    </div>
    <span class="nums">${spendableXP}<small> xp</small></span>
   </div>
   <div class="ps-meter">
    <span class="label">${uiIcon('time')}Time</span>
    <span class="aia-pips${t <= 1 ? ' aia-pips--warn' : ''}" aria-hidden="true">${pips}</span>
    <span class="nums">${t}<span class="sr-only"> time left</span></span>
   </div>
   <div class="ps-row">
    <ul class="ps-projects" aria-label="Milestone projects">${project('beginner', 'beg', 'Beg')}${project('intermediate', 'int', 'Int')}${project('expert', 'exp', 'Exp')}</ul>
    <span class="ps-state ${stateClass}">${stateText}</span>
   </div>
   <div class="ps-gear equipment-list" data-inventory="${n}" id="inventory-${n}" aria-label="Gear owned">
    ${char.equipment.length ? char.equipment.map(e => `<span class="aia-chip">${uiEsc(e)}</span>`).join('') : '<span class="muted">No gear yet</span>'}
   </div>
   <details class="ps-details"${uiOpenDetails.has(n) ? ' open' : ''}>
    <summary>${uiEsc(char.specialAbility.name)} · ability &amp; bonuses</summary>
    <div class="drawer">
     <p>${uiEsc(char.specialAbility.description)}</p>
     ${char.betaBoostActive ? '<p class="beta-note">Beta Boost active · +3 to all stats on your next climb</p>' : ''}
     ${bonuses ? `<ul>${bonuses}</ul>` : '<p>No training or gear bonuses yet.</p>'}
     <p>Total XP ${char.xp} · ${char.level < 15 ? `${xpToGo} to level ${char.level + 1}` : 'max level'}</p>
    </div>
   </details>`;
  sheet.querySelector('details').addEventListener('toggle', (e) => {
   if (e.target.open) uiOpenDetails.add(n); else uiOpenDetails.delete(n);
  });
  container.appendChild(sheet);
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
 container.dataset.empty = 'No routes set on the wall right now.';
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
 container.innerHTML = '<p class="area-sub">Top Rope needs a belayer station this game.</p>';
 return;
 }

 const currentPlayer = uiCurrent();
 const routes = gameState.availableRoutes.topRope;
 const solo = gameState.players.length === 1;

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
 const label = solo ? 'Auto-Belay' : `Belayer ${b + 1}`;
 const status = blocked
 ? `Taken by Player ${holder ? holder.playerNum : '?'}`
 : (youHere ? 'You are here' : 'Open');

 const station = document.createElement('div');
 station.className = 'station' + (blocked ? ' blocked' : '') + (youHere ? ' you' : '');
 station.setAttribute('role', 'group');
 station.setAttribute('aria-labelledby', `station-${b}`);
 station.innerHTML = `<div class="station-head">
  <span class="bsh-name" id="station-${b}">${uiIcon('topRope')}${label}</span>
  <span class="at-pill${blocked ? ' full' : ''}">${status}</span>
 </div>`;
 const row = document.createElement('div');
 row.className = 'card-row';
 stationRoutes.forEach((route) => {
 const idx = routes.indexOf(route);
 row.appendChild(createRouteCard(route, 'topRope', idx, {
  blockedReason: blocked ? `${label} is taken by P${holder ? holder.playerNum : '?'}` : '',
 }));
 });
 station.appendChild(row);
 container.appendChild(station);
 });
}

function renderLeadClimbingRoutes() {
 const container = document.getElementById('leadClimbingRoutes');
 container.innerHTML = '';

 // Lead needs the full Lead system (Free Solo bypasses). When locked, say
 // exactly which gear is missing; the cards stay visible but unplayable.
 const accessCheck = checkAreaAccess('leadClimbing');
 if (!accessCheck.hasAccess) {
 const lockedDiv = document.createElement('div');
 lockedDiv.className = 'area-locked-banner';
 lockedDiv.setAttribute('role', 'note');
 lockedDiv.innerHTML = `${uiIcon('lock')}<strong>Lead is locked.</strong><span>Buy the Lead system in the Gear Shop:</span>
  ${accessCheck.missingItems.map(i => `<span class="aia-chip">${uiEsc(i)}</span>`).join('')}`;
 container.appendChild(lockedDiv);
 }

 const row = document.createElement('div');
 row.className = 'card-row';
 row.dataset.empty = 'No lead routes set right now.';
 gameState.availableRoutes.leadClimbing.forEach((route, idx) => {
 row.appendChild(createRouteCard(route, 'leadClimbing', idx, { locked: !accessCheck.hasAccess }));
 });
 container.appendChild(row);
}

function createRouteCard(route, area, idx, opts = {}) {
 const currentPlayer = uiCurrent();
 const char = currentPlayer.character;
 if (!char.gearBonuses) {
 char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
 }

 const routeKey = `${area}:${route.name}`;
 const alreadyAttempted = gameState.attemptedRoutes[currentPlayer.playerNum]?.has(routeKey) || false;
 const reason = opts.blockedReason || uiClimbBlocker(route, area);
 const ownedGear = (route.gearModifiers || []).filter(g => char.equipment.includes(g));

 const card = AIACards.route(route, {
 area,
 costs: getClimbCosts(char, route),
 stats: computeClimbStats(char, route, area),
 status: alreadyAttempted ? 'Attempted' : (ownedGear.length ? '+Gear' : null),
 tone: alreadyAttempted ? 'done' : (opts.locked ? 'locked' : null),
 action: {
  label: 'Climb',
  disabled: !!reason,
  reason,
  reasonIcon: alreadyAttempted ? 'check' : 'lock',
  onClick: () => attemptClimb(route, area),
 },
 });
 card.classList.add('route-card');
 card.dataset.route = route.name;
 return card;
}

function renderTraining() {
 const container = document.getElementById('trainingAreas');
 container.innerHTML = '';
 const currentPlayer = uiCurrent();
 const char = currentPlayer.character;

 TRAINING_AREAS.forEach(area => {
  const playersHere = getPlayersInSection(area.name);
  const occupant = playersHere[0] || null;
  const isMine = !!occupant && occupant.playerNum === currentPlayer.playerNum;
  let reason = '';
  if (gameState.gameEnded) reason = 'The game is over';
  else if (occupant && !isMine) reason = `In use by Player ${occupant.playerNum}`;
  else if (char.timeRemaining < area.time) reason = `Needs ${area.time} time · you have ${char.timeRemaining}`;
  else if (char.currentEndurance < area.endurance) reason = `Needs ${area.endurance} END · you have ${char.currentEndurance}`;

  const card = AIACards.training(area, {
   status: isMine ? 'You' : (occupant ? `P${occupant.playerNum}` : null),
   action: { label: 'Train', disabled: !!reason, reason, onClick: () => trainAction(area) },
  });
  card.classList.add('training-area');
  container.appendChild(card);
 });
}

// Gear-card state for the current player: status badge + why it can't be
// bought right now ('' when it can). Mirrors purchaseGear()'s checks.
function uiGearState(gear, char, spendableXP) {
 const owned = char.equipment.includes(gear.name);
 if (owned) return { owned, reason: 'Already owned' };
 const missing = (gear.prerequisiteItems || []).filter(i => !char.equipment.includes(i));
 if (missing.length) return { owned, reason: `Needs ${missing.join(' + ')} first` };
 if (gear.prerequisiteLevel && char.level < gear.prerequisiteLevel) return { owned, reason: `Requires level ${gear.prerequisiteLevel}` };
 if (gameState.gameEnded) return { owned, reason: 'The game is over' };
 const canVisit = char.equipment.includes('Gear Bag') || char.timeRemaining >= 1;
 if (!canVisit) return { owned, reason: 'Needs 1 time to visit the shop' };
 if (spendableXP < gear.cost) return { owned, reason: `Need ${gear.cost} XP · you have ${spendableXP}` };
 return { owned, reason: '' };
}

function renderStore() {
 const container = document.getElementById('gearShop');
 const char = uiCurrent().character;
 const spendableXP = getSpendableXP(char);
 const xpToGo = getXPToNextLevel(char);

 // Affordability badge on the area title.
 syncShopCollapseState(char, spendableXP);

 container.innerHTML = `<div class="shop-head">
  <p class="store-xp-info">
   <span class="aia-chip aia-chip--ok">${uiIcon('xp')}${spendableXP} XP to spend</span>
   <span class="aia-chip">${char.level < 15 ? `${xpToGo} XP to level ${char.level + 1}` : 'Max level'}</span>
  </p>
  <p class="area-sub" style="margin:0">Gear costs XP earned this level and 1 time.</p>
 </div>`;

 const gearCard = (gear) => {
  const { owned, reason } = uiGearState(gear, char, spendableXP);
  const card = AIACards.gear(gear, {
   status: owned ? 'Owned' : null,
   tone: owned ? 'done' : null,
   action: { label: owned ? 'Owned' : 'Buy', disabled: !!reason, reason, reasonIcon: owned ? 'check' : 'lock', onClick: () => purchaseGear(gear) },
  });
  card.classList.add('gear-card');
  card.setAttribute('data-gear-slot', gear.name);
  return card;
 };
 const group = (title, sub, gears, id) => {
  const section = document.createElement('section');
  section.className = 'shop-group';
  section.setAttribute('aria-labelledby', id);
  section.innerHTML = `<h3 id="${id}">${title}</h3><p>${sub}</p>`;
  const row = document.createElement('div');
  row.className = 'card-row';
  row.dataset.empty = 'Sold out.';
  gears.forEach(g => row.appendChild(gearCard(g)));
  section.appendChild(row);
  return section;
 };

 // The 3 Lead-system access cards (Harness removed in RuleModifications) are
 // always on the shelf; the rest of the shop is a rotating selection.
 const accessCardNames = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
 container.appendChild(group('Lead system', 'All three unlock Lead Climbing (Top Rope is open to everyone).',
  GEAR_SHOP.filter(g => accessCardNames.includes(g.name)), 'shop-lead'));
 container.appendChild(group('On the shelf', 'Rotating stock — a new card is drawn when one sells.',
  gameState.availableGear, 'shop-rotating'));
}

// ===== CHARACTER ABILITY SYSTEM =====

// Route Reader "Versatility" stat shift: once per round, before a regular
// (non-milestone) climb, move up to MAX_STAT_SHIFT points from one stat to
// another for that climb only. All other abilities are fully passive.
const SHIFT_STATS = ['strength', 'technique', 'focus', 'flexibility'];
const MAX_STAT_SHIFT = 10;

function canUseStatShift(char) {
 return char.key === 'routeReader' && !char.abilityUsed;
}

// Total stats for a climb attempt by the current player (base + training +
// permanent gear + route-specific gear). No ability effects.
function computeClimbStats(char, route, area) {
 if (!char.gearBonuses) {
 char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
 }
 const routeGearBonuses = calculateGearBonuses(route, area);
 const stats = {};
 SHIFT_STATS.forEach(k => {
 stats[k] = char.stats[k] + char.trainingBonuses[k] + char.gearBonuses[k] + routeGearBonuses[k];
 });
 return stats;
}

function shiftStats(stats, shift) {
 return { ...stats, [shift.from]: stats[shift.from] - shift.amount, [shift.to]: stats[shift.to] + shift.amount };
}

// Suggest the most useful shift before the dice are rolled, or null if none
// helps. A Route Reader sends with 3 of 4 stats, so the deciding stat is the
// one with the 3rd-largest margin over its base requirement; maximise it.
// Not offered when that margin is already 6+ (one die's swing). Mirrors
// engine/helpers.js bestRouteReaderShift.
function suggestStatShift(stats, route) {
 const deciding = (st) => SHIFT_STATS.map(k => st[k] - route[k]).sort((a, b) => b - a)[2];
 const baseline = deciding(stats);
 if (baseline >= 6) return null;
 let best = null;
 let bestScore = baseline;
 SHIFT_STATS.forEach(from => SHIFT_STATS.forEach(to => {
 if (from === to) return;
 for (let amount = 1; amount <= MAX_STAT_SHIFT; amount++) {
 const score = deciding(shiftStats(stats, { from, to, amount }));
 if (score > bestScore) { bestScore = score; best = { from, to, amount }; }
 }
 }));
 return best;
}

// Show the Versatility dialog. `stats` are the climber's stats for this climb
// (including any Beta Boost); `suggested` pre-fills the controls. Resolves
// { shift } to climb with a shift, { shift: null } to climb without one, or
// null if the player cancels the climb.
function chooseStatShift(route, stats, suggested) {
 return new Promise(resolve => {
 const modal = document.getElementById('statShiftModal');
 const body = document.getElementById('statShiftBody');
 const label = (k) => k.charAt(0).toUpperCase() + k.slice(1);
 const options = SHIFT_STATS.map(k => `<option value="${k}">${label(k)}</option>`).join('');
 body.innerHTML = `
 <p class="shift-intro">Once per round, move up to ${MAX_STAT_SHIFT} points from one stat to another for <strong>this climb only</strong>. You send if 3 of your 4 stats meet their requirement.</p>
 <div class="shift-controls">
 <label>Move <input type="number" id="shiftAmount" min="1" max="${MAX_STAT_SHIFT}" step="1"></label>
 <label>from <select id="shiftFrom">${options}</select></label>
 <label>to <select id="shiftTo">${options}</select></label>
 </div>
 <table class="shift-table">
 <thead><tr><th>Stat</th><th>Needs</th><th>You</th><th>After shift</th></tr></thead>
 <tbody id="shiftRows"></tbody>
 </table>
 <p class="shift-summary" id="shiftSummary"></p>
 <p class="shift-note">Requirements shown before dice. ${route.name} (${route.grade}).</p>`;

 const fromSel = document.getElementById('shiftFrom');
 const toSel = document.getElementById('shiftTo');
 const amountIn = document.getElementById('shiftAmount');
 const applyBtn = document.getElementById('statShiftApply');
 const initial = suggested || { from: 'flexibility', to: 'strength', amount: MAX_STAT_SHIFT };
 fromSel.value = initial.from;
 toSel.value = initial.to;
 amountIn.value = initial.amount;

 const readShift = () => {
 const amount = parseInt(amountIn.value, 10);
 if (fromSel.value === toSel.value || !Number.isInteger(amount) || amount < 1 || amount > MAX_STAT_SHIFT) return null;
 return { from: fromSel.value, to: toSel.value, amount };
 };
 const refresh = () => {
 const shift = readShift();
 const after = shift ? shiftStats(stats, shift) : stats;
 const cell = (v, need) => `<td class="${v >= need ? 'shift-pass' : 'shift-fail'}">${v}</td>`;
 document.getElementById('shiftRows').innerHTML = SHIFT_STATS.map(k =>
 `<tr><td>${label(k)}</td><td>${route[k]}</td>${cell(stats[k], route[k])}${cell(after[k], route[k])}</tr>`).join('');
 const passing = (st) => SHIFT_STATS.filter(k => st[k] >= route[k]).length;
 document.getElementById('shiftSummary').textContent = shift
 ? `Before the dice: ${passing(stats)} of 4 pass now, ${passing(after)} of 4 with this shift.`
 : 'Pick two different stats and an amount from 1 to 10.';
 applyBtn.disabled = !shift;
 };
 [fromSel, toSel, amountIn].forEach(el => el.addEventListener('input', refresh));
 refresh();

 const finish = (result) => {
 modal.classList.remove('show');
 document.getElementById('statShiftApply').onclick = null;
 document.getElementById('statShiftSkip').onclick = null;
 document.getElementById('statShiftCancel').onclick = null;
 resolve(result);
 };
 applyBtn.onclick = () => { const shift = readShift(); if (shift) finish({ shift }); };
 document.getElementById('statShiftSkip').onclick = () => finish({ shift: null });
 document.getElementById('statShiftCancel').onclick = () => finish(null);
 modal.classList.add('show');
 });
}

// Offer the Route Reader a stat shift for this climb when one would help.
// Resolves { shift } (possibly null) or null if the player cancelled.
async function maybeChooseStatShift(char, route, area) {
 if (!canUseStatShift(char)) return { shift: null };
 let stats = computeClimbStats(char, route, area);
 if (char.betaBoostActive) stats = Object.fromEntries(SHIFT_STATS.map(k => [k, stats[k] + 3]));
 const suggested = suggestStatShift(stats, route);
 if (!suggested) return { shift: null };
 return chooseStatShift(route, stats, suggested);
}

function applyAbilityToStats(char, shift, totalStats) {
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

 // Versatility: stat shift chosen before the climb (regular routes only)
 if (shift) {
 modified = shiftStats(modified, shift);
 addLog(`Versatility: moved ${shift.amount} ${shift.from} → ${shift.to} for this climb`);
 }

 return modified;
}

// ===== CLIMB RESOLUTION (shared with the engine) =====
//
// Local play resolves climbs with the engine's own rules: engine/helpers.js,
// loaded as a classic script (engine/helpers.browser.js, generated by
// engine/build-browser-helpers.js) that exposes window.EngineHelpers. Costs,
// dice, character passives and every gear effectKind therefore behave exactly
// as they do online and for the bots.
const Engine = window.EngineHelpers;

const DIE_STAT_LABELS = { strength: 'Strength', technique: 'Technique', focus: 'Focus', flexibility: 'Flexibility' };

// Owned gear cards with the given effectKind.
function ownedGearWithEffect(char, effectKind) {
 return char.equipment
 .map(name => GEAR_SHOP.find(g => g.name === name))
 .filter(g => g && g.effectKind === effectKind);
}

// Time and endurance a climb costs this character (Sprinter / Technician
// passives, Trick Foot Manual, Body Tension Belt).
function getClimbCosts(char, route) {
 return {
 time: Engine.getEffectiveClimbTimeCost(char, route.time, route),
 endurance: Engine.getEffectiveClimbEnduranceCost(char, route, route.endurance),
 };
}

// Pay for and resolve a climb the player has committed to: deduct costs, roll
// and modify dice, check stats against requirements, award XP, then apply the
// failure penalty or success heal. Same steps as resolveClimbShared in
// engine/engine.js. `stats` already include Beta Boost and any stat shift.
// Mutates char; returns everything the result modal and effects need.
function resolveLocalClimb(char, route, stats, isMilestone) {
 const costs = getClimbCosts(char, route);
 const enduranceBefore = char.currentEndurance;
 char.timeRemaining -= costs.time;
 char.currentEndurance -= costs.endurance;

 const effectRollArray = Engine.buildEffectRollArray(char, route);
 const rng = { rollDie: (sides = 6) => Math.floor(Math.random() * sides) + 1 };
 const diceTrace = [];
 // Gear "your choice" dice picks are made against this climb's stats, the same
 // way the engine resolves climbs (resolveClimbShared in engine/engine.js).
 const { dice, mentorIndex } = Engine.resolveClimbDice(() => rng.rollDie(6), effectRollArray, char, route, isMilestone, stats, diceTrace);
 const { requirements, appliedModifiers } = Engine.applyDiceToRequirements(char, route, effectRollArray, dice, { mentorIndex });
 const { success } = Engine.resolveClimbOutcome(char, stats, requirements);
 const xpGained = Engine.computeClimbXp(char, route, success);
 char.xp += xpGained;

 let failPenalty = 0;
 let healed = 0;
 if (!success) {
 failPenalty = Engine.getFailureEnduranceExtra(char);
 char.currentEndurance -= failPenalty;
 } else {
 const heal = Engine.getSuccessEnduranceHeal(char);
 if (heal > 0) {
 const beforeHeal = char.currentEndurance;
 // Healed endurance is capped at maxEndurance, as in the engine.
 char.currentEndurance = Math.min(char.maxEndurance, char.currentEndurance + heal);
 healed = char.currentEndurance - beforeHeal;
 }
 }
 if (char.currentEndurance < 0) char.currentEndurance = 0;

 if (!success && char.key === 'ironLung') {
 const relentlessBonus = Math.floor(route.xpFail * Engine.getXpMultiplier(char) * 0.5);
 addLog(`Relentless: +${relentlessBonus} bonus XP for failing${failPenalty ? `, -${failPenalty} extra Endurance` : ''}`);
 }

 // Per-die display rows. A die whose modifier the rules zeroed was negated by
 // a character passive (Free Solo, Technician on nerf dice) or Mountain Mentor.
 const mentor = ownedGearWithEffect(char, 'negateOneNerfDie')[0];
 const diceEffects = effectRollArray.map((effect, i) => {
 const modifier = appliedModifiers[i].modifier;
 const negated = effect.modifier !== 0 && modifier === 0;
 const byAbility = negated && (char.key === 'freeSolo' || (char.key === 'technician' && effect.modifier === 1));
 return {
 die: dice[i], stat: effect.stat, modifier,
 abilityNeutralized: byAbility,
 gearNeutralized: negated && !byAbility && mentor ? mentor.name : null,
 };
 });

 // Plain-language notes for every gear effect that changed this climb.
 const gearNotes = [];
 const discardedDice = [];
 const charOnlyTime = Engine.getEffectiveClimbTimeCost(char, route.time);
 if (costs.time < charOnlyTime) {
 const names = ownedGearWithEffect(char, 'timeCostReduction').map(g => g.name).join(', ');
 gearNotes.push(`${names}: time cost ${charOnlyTime} → ${costs.time}`);
 }
 if (costs.endurance < route.endurance) {
 const names = ownedGearWithEffect(char, 'enduranceHalvedOnTag').map(g => g.name).join(', ');
 gearNotes.push(`${names}: endurance cost ${route.endurance} → ${costs.endurance}`);
 }
 diceTrace.forEach(t => {
 const dieLabel = `Die ${t.die + 1}`;
 if (t.effectKind === 'rerollOnTag') {
 gearNotes.push(`${t.gear}: re-rolled ${dieLabel} (${t.from} → ${t.to})`);
 } else if (t.effectKind === 'extraDieDiscardOne') {
 discardedDice.push(t.from);
 gearNotes.push(t.die === -1
 ? `${t.gear}: rolled an extra ${t.extra}, discarded it (no die to improve)`
 : `${t.gear}: rolled an extra ${t.extra}, swapped it in for ${dieLabel} (discarded ${t.from})`);
 } else if (t.effectKind === 'treatOneDieAsValue') {
 gearNotes.push(`${t.gear}: ${dieLabel} treated as ${t.to} (rolled ${t.from})`);
 } else if (t.effectKind === 'milestoneBuffDiceBonus' && t.to !== t.from) {
 gearNotes.push(`${t.gear}: buff ${dieLabel} +${t.to - t.from} (${t.from} → ${t.to})`);
 }
 });
 diceEffects.forEach((e, i) => {
 if (e.gearNeutralized) {
 gearNotes.push(`${e.gearNeutralized}: ignored nerf Die ${i + 1} (+${e.die} ${DIE_STAT_LABELS[e.stat]})`);
 }
 });
 if (!success) {
 ownedGearWithEffect(char, 'failBonusXp').forEach(g => gearNotes.push(`${g.name}: +${g.value} XP for the fall`));
 if (char.key === 'ironLung') {
 ownedGearWithEffect(char, 'ignoreFailPenalty').forEach(g => gearNotes.push(`${g.name}: no extra endurance lost for failing`));
 }
 } else if (healed > 0) {
 const names = ownedGearWithEffect(char, 'successHealEndurance').map(g => g.name).join(', ');
 gearNotes.push(`${names}: +${healed} endurance`);
 }

 return {
 success, xpGained, requirements, diceEffects, gearNotes,
 dice, discardedDice,
 enduranceDelta: char.currentEndurance - enduranceBefore,
 };
}

// Floating "−N END" / "+N END" text for an endurance change.
function formatEnduranceDelta(delta) {
 return `${delta < 0 ? '−' : '+'}${Math.abs(delta)} END`;
}

// ===== GAME ACTIONS =====

async function attemptClimb(route, area) {
 // Online mode short-circuit: send the matching action to the server
 // instead of mutating local state. Server broadcasts the new state and
 // the renderer updates itself. A Route Reader picks a stat shift first.
 if (window.OnlineMode && window.OnlineMode.active) {
  const onlinePlayer = gameState.players[gameState.currentPlayerIndex];
  const choice = onlinePlayer ? await maybeChooseStatShift(onlinePlayer.character, route, area) : { shift: null };
  if (!choice) return;
  const action = { type: 'climb', area, routeName: route.name };
  if (choice.shift) action.shift = choice.shift;
  return window.OnlineMode.sendAction(action);
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

 // Costs with character passives and gear (Sprinter, Technician, Trick Foot
 // Manual, Body Tension Belt).
 const costs = getClimbCosts(char, route);
 if (char.timeRemaining < costs.time || char.currentEndurance < costs.endurance) {
 alert('Not enough time or endurance!');
 return;
 }

 // Calculate total stats (including route-specific gear bonuses)
 let totalStats = computeClimbStats(char, route, area);

 // ABILITY: Free Solo — guarantee check against base requirements (no dice since Life or Die negates them)
 if (char.key === 'freeSolo') {
 if (totalStats.strength < route.strength || totalStats.technique < route.technique ||
 totalStats.focus < route.focus || totalStats.flexibility < route.flexibility) {
 alert(' Life or Die: You can only attempt routes you are guaranteed to complete!\n\nYour stats must meet all base requirements.');
 return;
 }
 }

 // ABILITY: Route Reader Versatility — choose a stat shift before paying.
 // Cancelling here costs nothing; the once-per-round use is only spent when
 // the climb goes ahead with a shift.
 const shiftChoice = await maybeChooseStatShift(char, route, area);
 if (!shiftChoice) return;
 const shift = shiftChoice.shift;
 if (shift) char.abilityUsed = true;
 const activatedAbility = shift ? 'Versatility' : null;

 // Move player to this section and (for Top Rope) occupy the route's belayer
 // station; any other area clears the belayer-station assignment.
 movePlayerToSection(currentPlayer.playerNum, area);
 char.belayerStation = (area === 'topRope') ? route.belayer : null;

 // ABILITY: Apply stat modifications (beta boost passive + Versatility shift)
 totalStats = applyAbilityToStats(char, shift, totalStats);

 // Mark route as attempted
 gameState.attemptedRoutes[currentPlayer.playerNum].add(routeKey);

 // Pay costs, roll dice, resolve and award XP / endurance with the engine's
 // rules (character passives and every gear effect).
 const climb = resolveLocalClimb(char, route, totalStats, false);
 const { success, xpGained } = climb;

 // Check for level up
 checkLevelUp(char);

 // EFFECTS: floating numbers + chalk puff + dice anticipation + turn log.
 const fxPlayer = currentPlayer.playerNum;
 if (window.Effects) {
 const enduranceBar = window.Effects.locateEnduranceBar(fxPlayer);
 const xpBar = window.Effects.locateXpBar(fxPlayer);
 if (enduranceBar) {
 window.Effects.chalkPuff(enduranceBar, 'coral');
 window.Effects.floatNumber(enduranceBar, formatEnduranceDelta(climb.enduranceDelta), 'endurance-loss');
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
 const showResult = () => showClimbResult(route, [...climb.dice, ...climb.discardedDice], climb.dice,
 totalStats, climb.requirements, climb.diceEffects, success, xpGained, activatedAbility, climb.gearNotes);
 if (window.Effects && typeof window.Effects.diceAnticipation === 'function') {
 window.Effects.diceAnticipation(420).then(showResult);
 } else {
 showResult();
 }
}

// `rolls` lists every die rolled; the first diceUsed.length are the ones
// applied (any extras, e.g. a Power Tap Belt discard, are shown dimmed).
// `gearNotes` describes each gear effect that changed this climb.
function showClimbResult(route, rolls, diceUsed, stats, effectiveReqs, diceEffects, success, xpGained, activatedAbility, gearNotes = []) {
 const modal = document.getElementById('climbModal');
 const title = document.getElementById('modalTitle');
 const body = document.getElementById('modalBody');

 title.textContent = `${route.name} · ${route.grade}`;

 const statNames = { strength: 'Strength', technique: 'Technique', focus: 'Focus', flexibility: 'Flexibility' };
 const statShort = { strength: 'STR', technique: 'TEC', focus: 'FOC', flexibility: 'FLX' };

 let effectsHTML = '';
 if (diceEffects && diceEffects.length > 0) {
 effectsHTML = diceEffects.map((effect, index) => {
  const name = statNames[effect.stat];
  let chip, text;
  if (effect.modifier === 0) {
   chip = `<span class="aia-die-chip" style="background: var(--paper-deep);">${uiIcon('die')}±${statShort[effect.stat]}</span>`;
   text = effect.abilityNeutralized ? `Die ${index + 1} rolled ${effect.die} — neutralised by an ability`
    : effect.gearNeutralized ? `Die ${index + 1} rolled ${effect.die} — neutralised by ${uiEsc(effect.gearNeutralized)}`
    : `Die ${index + 1} rolled ${effect.die} — no effect`;
  } else {
   const buff = effect.modifier === -1;
   chip = `<span class="aia-die-chip ${buff ? 'is-buff' : 'is-nerf'}">${uiIcon('die')}${buff ? '−' : '+'}${effect.die} ${statShort[effect.stat]}</span>`;
   text = `Die ${index + 1} rolled ${effect.die}: ${name} requirement ${buff ? 'lowered' : 'raised'} by ${effect.die}`;
  }
  return `<li>${chip}<span>${text}</span></li>`;
 }).join('');
 }

 const reqRows = UI_STATS.map(s => {
  const met = stats[s.key] >= effectiveReqs[s.key];
  return `<tr>
   <th scope="row">${s.name}</th>
   <td>${effectiveReqs[s.key]}</td>
   <td>${stats[s.key]}</td>
   <td class="res ${met ? 'met' : 'unmet'}">${uiIcon(met ? 'check' : 'cross')} ${met ? 'Met' : `Short by ${effectiveReqs[s.key] - stats[s.key]}`}</td>
  </tr>`;
 }).join('');

 body.innerHTML = `
 <div class="result-box ${success ? 'result-success' : 'result-failure'}">
  <p class="result-text">${uiIcon(success ? 'check' : 'cross')}${success ? 'Sent it!' : 'Fell off'}</p>
  <p class="result-details">+${xpGained} XP</p>
 </div>

 <section class="result-section" aria-labelledby="res-dice">
  <h3 id="res-dice">Dice</h3>
  <div class="dice-container">
  ${rolls.map((r, i) => `<span class="die${i < diceUsed.length ? '' : ' unused'}" role="img" aria-label="Rolled ${r}${i < diceUsed.length ? '' : ', discarded'}">${r}</span>`).join('')}
  </div>
  ${rolls.length > diceUsed.length ? `<p class="dice-note">Rolled ${rolls.length} dice, kept the best ${diceUsed.length}.</p>` : ''}
 </section>

 ${effectsHTML ? `<section class="result-section" aria-labelledby="res-fx"><h3 id="res-fx">Dice effects</h3><ul class="effect-list">${effectsHTML}</ul></section>` : ''}
 ${gearNotes.length ? `<section class="result-section" aria-labelledby="res-gear"><h3 id="res-gear">Gear effects</h3><ul class="effect-list gear-effects">${gearNotes.map(n => `<li>${uiIcon('gear')}<span>${uiEsc(n)}</span></li>`).join('')}</ul></section>` : ''}

 <section class="result-section" aria-labelledby="res-req">
  <h3 id="res-req">Requirements check</h3>
  <table class="req-table">
   <thead><tr><th scope="col">Stat</th><th scope="col">Needed</th><th scope="col">You</th><th scope="col">Result</th></tr></thead>
   <tbody>${reqRows}</tbody>
  </table>
 </section>
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
 // Old Climbing Journal (gear) boosts every training session.
 const trainingBoost = Engine.getTrainingBonusBoost(char);
 const trainingBonus = area.bonus + trainingBoost;
 char.trainingBonuses[area.stat] += trainingBonus;

 const statIcons = {
 strength: '',
 technique: '',
 focus: '',
 flexibility: ''
 };

 const newTotal = char.trainingBonuses[area.stat];
 addLog(`Player ${currentPlayer.playerNum} trained at ${area.name} - gained +${trainingBonus} ${statIcons[area.stat]} ${area.stat}${trainingBoost ? ` (+${trainingBoost} from ${ownedGearWithEffect(char, 'trainingBonusBoost').map(g => g.name).join(', ')})` : ''} (total training bonus: +${newTotal})`);

 // EFFECTS: stat boost + endurance puff + turn log.
 if (window.Effects) {
 const fxPlayer = currentPlayer.playerNum;
 const panel = window.Effects.locatePlayerPanel(fxPlayer);
 const enduranceBar = window.Effects.locateEnduranceBar(fxPlayer);
 if (panel) window.Effects.floatNumber(panel, `+${trainingBonus} ${area.stat.slice(0, 3).toUpperCase()}`, 'stat');
 if (enduranceBar && area.endurance > 0) {
 window.Effects.chalkPuff(enduranceBar, 'cobalt');
 setTimeout(() => window.Effects.floatNumber(enduranceBar, `−${area.endurance} END`, 'endurance-loss'), 180);
 }
 window.Effects.recordTurnAction({
 kind: 'train',
 desc: `${area.name} (+${trainingBonus} ${area.stat})`,
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

 // Costs with character passives and gear (Trick Foot Manual, Body Tension Belt)
 const costs = getClimbCosts(char, route);
 if (char.timeRemaining < costs.time) {
 alert(`Not enough time! This route requires ${costs.time} time units, you have ${char.timeRemaining}.`);
 return;
 }

 if (char.currentEndurance < costs.endurance) {
 alert(`Not enough endurance! This route requires ${costs.endurance} endurance, you have ${char.currentEndurance}.`);
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

 // Total stats (base + training + gear), then Beta Boost. No stat shift on
 // milestone routes. The Free Solo guarantee was checked in attemptMilestoneRoute.
 const stats = applyAbilityToStats(char, null, computeClimbStats(char, route, area));

 // Pay costs, roll dice, resolve and award XP / endurance with the engine's
 // rules (character passives and every gear effect, incl. Climbing Coach).
 const climb = resolveLocalClimb(char, route, stats, true);
 const { success, xpGained } = climb;

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
 window.Effects.floatNumber(enduranceBar, formatEnduranceDelta(climb.enduranceDelta), 'endurance-loss');
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
 const showResult = () => showClimbResult(route, [...climb.dice, ...climb.discardedDice], climb.dice,
 stats, climb.requirements, climb.diceEffects, success, xpGained, null, climb.gearNotes);
 if (window.Effects && typeof window.Effects.diceAnticipation === 'function') {
 window.Effects.diceAnticipation(540).then(showResult);
 } else {
 showResult();
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
 const c = winner.character;
 const color = uiPlayerColor(winner.playerNum);

 const standings = gameState.players.map(player => {
  const count = Object.values(player.character.milestonesCompleted).filter(Boolean).length;
  return `<li><span><strong>Player ${player.playerNum}</strong> · ${uiEsc(player.character.name)}</span><span>${count}/3 projects · Level ${player.character.level} · ${player.character.xp} XP</span></li>`;
 }).join('');

 modalBody.innerHTML = `
 <div class="victory">
  <p class="eyebrow">Game over</p>
  <h2 id="victoryTitle">Top out!</h2>
  <div class="victory-banner" style="background: var(--${color}); color: var(--on-${color});">
   <p class="who">Player ${winner.playerNum} · ${uiEsc(c.name)}</p>
   <p>Sent all three milestone projects.</p>
  </div>
  <div class="final-stats">
   <div><span>Level</span><strong>${c.level}</strong></div>
   <div><span>Total XP</span><strong>${c.xp}</strong></div>
   ${UI_STATS.map(s => `<div><span>${s.name}</span><strong>${c.stats[s.key]}</strong></div>`).join('')}
   <div><span>Endurance</span><strong>${c.maxEndurance}</strong></div>
  </div>
  <h3>Final standings</h3>
  <ol class="final-standings">${standings}</ol>
  <button class="btn btn--lime" type="button" data-autofocus onclick="location.reload()">Play again ▸</button>
 </div>
 `;
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
 // Permanent gear max-endurance (e.g. Locking Carabiner +5) is added back so it
 // survives the level-up recompute. Mirrors engine/helpers.js getGearMaxEnduranceBonus.
 char.maxEndurance = Math.round(charTemplate.startingEndurance + charTemplate.growth.endurance * (char.level - 1))
 + getGearMaxEnduranceBonus(char);
}

function getGearMaxEnduranceBonus(char) {
 let bonus = 0;
 for (const name of char.equipment || []) {
 const gear = GEAR_SHOP.find(g => g.name === name);
 if (!gear) continue;
 if (gear.statEffect === 'endurance') bonus += gear.value;
 if (typeof gear.enduranceBonus === 'number') bonus += gear.enduranceBonus;
 }
 return bonus;
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
 const leadPool = [...regularRoutePool('leadClimbing')].sort(() => Math.random() - 0.5);
 gameState.availableRoutes.leadClimbing = leadPool.slice(0, 5);
 addLog(' Lead climbing routes refreshed and reset');
 } else if (gameState.routeClearingPosition === 1) {
 // Token between lead and top rope → clear top rope (all belayer stations
 // refresh together: 2 routes × belayerCount).
 gameState.availableRoutes.topRope = drawTopRopeStations();
 addLog(' Top rope routes refreshed and reset');
 } else {
 // Token between top rope and bouldering → clear bouldering
 const boulderingPool = [...regularRoutePool('bouldering')].sort(() => Math.random() - 0.5);
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
 { name: 'Strength', old: oldStats.strength, now: char.stats.strength },
 { name: 'Technique', old: oldStats.technique, now: char.stats.technique },
 { name: 'Focus', old: oldStats.focus, now: char.stats.focus },
 { name: 'Flexibility', old: oldStats.flexibility, now: char.stats.flexibility },
 { name: 'Max Endurance', old: oldStats.maxEndurance, now: char.maxEndurance }
 ].map(row => {
 const diff = row.now - row.old;
 const diffStr = diff > 0 ? `<span class="stat-up">+${diff}</span>` : `<span>${diff}</span>`;
 return `<tr>
 <th scope="row">${row.name}</th>
 <td>${row.old}</td>
 <td>${row.now}</td>
 <td>${diffStr}</td>
 </tr>`;
 }).join('');

 document.getElementById('levelUpBody').innerHTML = `
 <h2 class="level-up-headline" id="levelUpTitle">Level up!</h2>
 <p>Player ${playerNum} · ${uiEsc(char.name)}</p>
 <span class="hold hold--label hold--marigold level-badge"><span class="sr-only">Now level </span>${newLevel}</span>
 <table class="stat-table">
 <thead>
 <tr><th scope="col">Stat</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change</th></tr>
 </thead>
 <tbody>${statRows}</tbody>
 </table>
 `;

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

function toggleLogPanel(forceOpen) {
 const panel = document.getElementById('gameLog');
 if (!panel) return;
 const collapsed = forceOpen === true ? false : !panel.classList.contains('collapsed');
 panel.classList.toggle('collapsed', collapsed);
 const header = panel.querySelector('.log-header');
 if (header) header.setAttribute('aria-expanded', String(!collapsed));
 const glyph = panel.querySelector('.log-toggle-btn');
 if (glyph) glyph.textContent = collapsed ? '+' : '−';
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
