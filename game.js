// All In Ascent — browser game: game data + UI.
//
// This file is the SINGLE SOURCE OF TRUTH for game data. The GAME DATA section
// below is extracted into engine/data.js by `node engine/build-data.js` (run
// automatically by the test/playtest npm scripts) so the Node engine, sim
// harness, and analysis tools read the same values without hand-syncing.
//
// It holds NO game rules: local and online play both run the engine in
// engine/ (loaded in the browser as engine/engine.browser.js). See the RULES
// ENGINE BRIDGE section below and CLAUDE.md.
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

// The engine's game state (engine/state.js createGame shape): built by
// AscentEngine.createGame for local play, or the server's state online. null
// until a game starts.
let gameState = null;

// UI-only state, kept out of the engine state.
let gameLog = []; // newest first, max 20 entries
let setupPlayerCount = 0; // chosen on the setup screen
let setupCharacterKeys = []; // character picked by each player, in seat order

// ===== BOARD QUERIES (engine rules, for the renderers) =====

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
 if (AscentEngine.isTrainingEquipment(location)) {
 return `Training: ${location}`;
 }

 return locationNames[location] || location;
}

function getSectionCapacity(section) {
 return AscentEngine.getSectionCapacity(section, gameState.belayerCount);
}

function getPlayersInSection(section) {
 return AscentEngine.getPlayersInSection(gameState.players, section);
}

// Belayer stations occupied by players OTHER than playerNum.
function getOccupiedBelayerStations(playerNum) {
 return AscentEngine.getOccupiedBelayerStations(gameState, playerNum);
}

// Does the current player have the gear to climb in `area`?
function checkAreaAccess(area) {
 return AscentEngine.checkAreaAccess(gameState.players[gameState.currentPlayerIndex].character, area);
}

// ===== MILESTONE ROUTES =====

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

 setupPlayerCount = numPlayers;
 setupCharacterKeys = [];

 const charSelectionDiv = document.getElementById('characterSelection');
 if (!charSelectionDiv) return;

 // Lock the Continue button + player-count input so we can't re-trigger this
 // flow mid-selection. Re-running this function with characters already
 // chosen would reset the picks while leaving the Start Game button enabled
 // — that's how bug #3 ("start without character") used to fire. Both
 // controls re-enable themselves only after the game ends (via the page
 // reload that happens on "New Game" / win screen close).
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
 if (setupCharacterKeys.length >= setupPlayerCount || setupCharacterKeys.includes(charKey)) return;
 setupCharacterKeys.push(charKey);

 // Mark character as selected
 document.querySelectorAll('.character-card').forEach((card, idx) => {
 if (Object.keys(CHARACTERS)[idx] === charKey) {
 card.classList.add('selected');
 card.style.opacity = '0.5';
 card.onclick = null;
 }
 });

 // Check if all players have selected
 if (setupCharacterKeys.length === setupPlayerCount) {
 document.getElementById('startGameBtn').disabled = false;
 }
}

function startGame() {
 // Defense in depth: if the Start Game button somehow gets clicked while a
 // player slot is still missing a character (bug #3 escape hatch), bail out
 // loudly instead of crashing later.
 if (setupPlayerCount < 1 || setupCharacterKeys.length !== setupPlayerCount) {
  alert('Each player must select a character before starting the game.');
  return;
 }

 document.getElementById('gameSetup').style.display = 'none';
 document.getElementById('gameBoard').style.display = 'block';

 // Flag for the CSS compact-density rules — the hero header collapses, the
 // game-board sections tighten padding/font/gaps. Setup screen retains its
 // original hero treatment.
 document.body.classList.add('playing');

 // The engine deals the milestones, walls and shop from a random seed. The
 // seed is logged so a local game can be replayed exactly.
 const seed = Math.floor(Math.random() * 2 ** 32);
 gameState = AscentEngine.createGame({ seed, characterKeys: setupCharacterKeys }).state;

 renderGameBoard();
 addLog(`Game started! Round 1 begins. (seed ${seed})`);
 addLog(" Milestone routes have been set! First player to complete all 3 wins the game!");

 // EFFECTS: opening round transition + first turn log.
 if (window.Effects) {
 const first = gameState.players[0];
 if (first) window.Effects.beginTurn(first.playerNum, first.character.name);
 window.Effects.roundTransition(1);
 }
}

function addLog(message) {
 gameLog.unshift({ time: new Date().toLocaleTimeString(), message });
 if (gameLog.length > 20) gameLog.pop();
 renderLog();
}

function renderLog() {
 const logEntries = document.getElementById('logEntries');
 logEntries.innerHTML = gameLog.map(entry => `
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

 // B2: dropped the redundant "Current Player" info-box.
 // B3: belayers info-box shows the fixed Top Rope belayer-station count.
 // C3: Rest is an inline button here, not its own panel.
 // The route-clearing token is now rendered as a pill on the area-title
 // of the climbing area that will be cleared next (see renderSectionStatusPills).
 const canRest = isLegalNow({ type: 'rest' });
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
  const spendableXP = AscentEngine.getSpendableXp(char);
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
 const alreadyAttempted = !!gameState.attemptedRoutes[currentPlayer.playerNum]?.[routeKey];

 const costs = getClimbCosts(char, route);
 const canAttempt = isLegalNow({ type: 'climb', area, routeName: route.name });

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
   <span class="rc-cost">Ti ${costs.time} · E ${costs.endurance}</span>
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
  const playersHere = getPlayersInSection(area.name);
  const isOccupied = playersHere.length > 0;
  const occupyingPlayer = isOccupied ? playersHere[0] : null;
  const isMine = isOccupied && occupyingPlayer.playerNum === currentPlayer.playerNum;
  const canTrain = isLegalNow({ type: 'train', areaName: area.name });

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
 const spendableXP = AscentEngine.getSpendableXp(char);
 const xpToGo = getXPToNextLevel(char);

 // Affordability badge on the area-title (no longer collapses the panel).
 syncShopCollapseState();

 // Occupancy is on the area-title pill — no inline duplicate. Header line
 // keeps the spendable / XP-to-next info that drives buy decisions.
 container.innerHTML = `<p class="store-xp-info">
 <strong style="color: #28a745;">Spendable: ${spendableXP} XP</strong> ·
 <strong style="color: #ff9800;">${xpToGo} XP to next level</strong>
 </p>`;

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

 // The 3 essential access cards (Harness removed in RuleModifications)
 const accessCards = GEAR_SHOP.filter(g => AscentEngine.ACCESS_CARDS.includes(g.name));

 accessCards.forEach(gear => {
 const owned = char.equipment.includes(gear.name);
 const canAfford = isLegalNow({ type: 'buyGear', gearName: gear.name });

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
 const canAfford = isLegalNow({ type: 'buyGear', gearName: gear.name });

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

// ===== RULES ENGINE BRIDGE =====
//
// game.js holds no game rules. Every rule lives in the engine (engine/*.js),
// which index.html loads after this file as one classic script
// (engine/engine.browser.js, generated by engine/build-browser.js) exposing
// window.AscentEngine. Local play applies the player's choices with
// AscentEngine.applyAction; online play sends them to the PartyKit server,
// which runs the same engine. game.js only renders state, turns clicks into
// engine actions, and presents the events the engine emits.

const STAT_KEYS = ['strength', 'technique', 'focus', 'flexibility'];
const STAT_LABELS = { strength: 'Strength', technique: 'Technique', focus: 'Focus', flexibility: 'Flexibility' };
const AREA_LABELS = { bouldering: 'Bouldering', topRope: 'Top Rope', leadClimbing: 'Lead Climbing' };

function isOnline() {
 return !!(window.OnlineMode && window.OnlineMode.active);
}

function currentPlayer() {
 return gameState.players[gameState.currentPlayerIndex];
}

// The current player's legal actions: the server's menu online, the engine's
// locally (the same getLegalActions either way).
function legalActionsNow() {
 if (isOnline()) return window.OnlineMode.legalActions || [];
 return gameState.gameEnded ? [] : AscentEngine.getLegalActions(gameState);
}

function isLegalNow(wanted) {
 return !!AscentEngine.findLegalAction(legalActionsNow(), wanted);
}

// Time and endurance a climb costs this character (character passives and gear).
function getClimbCosts(char, route) {
 return {
 time: AscentEngine.getEffectiveClimbTimeCost(char, route.time, route),
 endurance: AscentEngine.getEffectiveClimbEnduranceCost(char, route, route.endurance),
 };
}

// What the last local action did that is still waiting on the climb-result
// modal or level-up popups: { levelUps, turnEvents, afterRender }.
let pendingPresentation = null;

// Hand a player's choice (a partial action, e.g. { type: 'train', areaName })
// to the rules. Online it goes to the server. Locally it must match one of the
// engine's legal actions; the engine applies it and we present the events.
function dispatchAction(wanted, afterRender = null) {
 if (isOnline()) return window.OnlineMode.sendAction(wanted);
 if (pendingPresentation || gameState.gameEnded) return;
 const match = AscentEngine.findLegalAction(AscentEngine.getLegalActions(gameState), wanted);
 if (!match) {
 alert(AscentEngine.explainIllegalAction(gameState, wanted) || 'That action is not available right now.');
 return;
 }
 const action = wanted.shift ? { ...match, shift: wanted.shift } : match;
 const before = gameState;
 const { state, events } = AscentEngine.applyAction(before, action);
 gameState = state;
 presentEvents(before, events, afterRender);
}

// ===== CHARACTER ABILITY: ROUTE READER STAT SHIFT =====

// Show the Versatility dialog. `stats` are the climber's stats for this climb
// (including any Beta Boost); `suggested` pre-fills the controls. Resolves
// { shift } to climb with a shift, { shift: null } to climb without one, or
// null if the player cancels the climb.
function chooseStatShift(route, stats, suggested) {
 return new Promise(resolve => {
 const modal = document.getElementById('statShiftModal');
 const body = document.getElementById('statShiftBody');
 const label = (k) => k.charAt(0).toUpperCase() + k.slice(1);
 const options = STAT_KEYS.map(k => `<option value="${k}">${label(k)}</option>`).join('');
 body.innerHTML = `
 <p class="shift-intro">Once per round, move up to ${AscentEngine.MAX_STAT_SHIFT} points from one stat to another for <strong>this climb only</strong>. You send if 3 of your 4 stats meet their requirement.</p>
 <div class="shift-controls">
 <label>Move <input type="number" id="shiftAmount" min="1" max="${AscentEngine.MAX_STAT_SHIFT}" step="1"></label>
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
 const initial = suggested || { from: 'flexibility', to: 'strength', amount: AscentEngine.MAX_STAT_SHIFT };
 fromSel.value = initial.from;
 toSel.value = initial.to;
 amountIn.value = initial.amount;

 const readShift = () => {
 const amount = parseInt(amountIn.value, 10);
 if (fromSel.value === toSel.value || !Number.isInteger(amount) || amount < 1 || amount > AscentEngine.MAX_STAT_SHIFT) return null;
 return { from: fromSel.value, to: toSel.value, amount };
 };
 const refresh = () => {
 const shift = readShift();
 const after = shift ? AscentEngine.applyStatShiftToStats(stats, shift) : stats;
 const cell = (v, need) => `<td class="${v >= need ? 'shift-pass' : 'shift-fail'}">${v}</td>`;
 document.getElementById('shiftRows').innerHTML = STAT_KEYS.map(k =>
 `<tr><td>${label(k)}</td><td>${route[k]}</td>${cell(stats[k], route[k])}${cell(after[k], route[k])}</tr>`).join('');
 const passing = (st) => STAT_KEYS.filter(k => st[k] >= route[k]).length;
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
 if (!AscentEngine.canUseStatShift(char, false)) return { shift: null };
 const attempted = gameState.attemptedRoutes[currentPlayer().playerNum];
 const suggested = AscentEngine.bestRouteReaderShift(char, route, area, attempted);
 if (!suggested) return { shift: null };
 // Stats as the climb will see them, including an unspent Beta Boost (applied
 // to a copy so the real flag is untouched).
 const base = AscentEngine.computeEffectiveStats(char, route, area, attempted);
 const { stats } = AscentEngine.applyBetaBoostIfActive({ ...char }, base);
 return chooseStatShift(route, stats, suggested);
}

// ===== GAME ACTIONS =====

async function attemptClimb(route, area) {
 const wanted = { type: 'climb', area, routeName: route.name };
 // Not legal: let dispatchAction explain why (an alert locally, a toast online).
 if (!isLegalNow(wanted)) return dispatchAction(wanted);
 // A Route Reader picks a stat shift first. Cancelling costs nothing.
 const choice = await maybeChooseStatShift(currentPlayer().character, route, area);
 if (!choice) return;
 dispatchAction(choice.shift ? { ...wanted, shift: choice.shift } : wanted);
}

function attemptMilestoneRoute(difficulty) {
 dispatchAction({ type: 'milestone', difficulty });
}

function trainAction(area) {
 dispatchAction({ type: 'train', areaName: area.name });
}

function restAction() {
 dispatchAction({ type: 'rest' });
}

function purchaseGear(gear) {
 // EFFECTS: capture the source card position BEFORE the re-render destroys it.
 const srcCard = document.querySelector(`[data-gear-slot="${gear.name.replace(/"/g, '\\"')}"]`);
 const srcRect = srcCard && srcCard.getBoundingClientRect();
 const srcGhost = srcRect ? { left: srcRect.left + srcRect.width / 2, top: srcRect.top + srcRect.height / 2 } : null;
 dispatchAction({ type: 'buyGear', gearName: gear.name }, (events) => gearPurchaseEffects(events, srcGhost));
}

// ===== PRESENTING ENGINE EVENTS (local play) =====

// Events that change whose turn it is or end the game. They are presented
// after the climb-result modal and any level-up popups close.
const TURN_EVENT_TYPES = ['turn_end', 'round_end', 'round_start', 'turn_start', 'game_end'];

function presentEvents(before, events, afterRender) {
 events.forEach(e => logEvent(before, e));
 actionEffects(before, events);
 pendingPresentation = {
 levelUps: events.filter(e => e.type === 'level_up'),
 turnEvents: events.filter(e => TURN_EVENT_TYPES.includes(e.type)),
 afterRender: afterRender ? () => afterRender(events) : null,
 };
 if (events.some(e => e.type === 'climb_resolved')) {
 // Brief anticipation pause so the dice "settle" before the reveal; the
 // rest is presented when the result modal closes (closeClimbModal).
 const isMilestone = events.find(e => e.type === 'climb_resolved').payload.isMilestone;
 const show = () => showClimbResultFromEvents(before, events);
 if (window.Effects && typeof window.Effects.diceAnticipation === 'function') {
 window.Effects.diceAnticipation(isMilestone ? 540 : 420).then(show);
 } else {
 show();
 }
 } else {
 finishPresentation();
 }
}

// Level-up popups one at a time, then the turn/round change and a re-render.
function finishPresentation() {
 const p = pendingPresentation;
 if (!p) return;
 if (p.levelUps.length) {
 showLevelUpPopup(p.levelUps.shift());
 return;
 }
 pendingPresentation = null;
 p.turnEvents.forEach(turnEffect);
 renderGameBoard();
 if (p.afterRender) requestAnimationFrame(p.afterRender);
 const end = p.turnEvents.find(e => e.type === 'game_end');
 if (end) {
 const winner = gameState.players.find(pl => pl.playerNum === end.payload.winner);
 setTimeout(() => showVictoryScreen(winner), 500);
 }
}

function playerName(state, playerNum) {
 const p = state.players.find(pl => pl.playerNum === playerNum);
 return p ? p.character.name : `Player ${playerNum}`;
}

// The route a climb_resolved event refers to, looked up in the state the climb
// started from (a round end may already have cleared it from the wall).
function routeForClimb(before, c) {
 if (c.isMilestone) return before.milestoneRoutes[c.difficulty].route;
 return (before.availableRoutes[c.area] || []).find(r => r.name === c.routeName);
}

// Game-log line(s) for one engine event.
function logEvent(before, e) {
 const p = e.payload;
 switch (e.type) {
 case 'ability_activated':
 addLog(p.ability === 'Beta Boost' ? 'Beta Boost: +3 to all stats this climb!' : `${p.ability}: ${p.effect}`);
 break;
 case 'climb_resolved': {
 if (!p.success && before.players.find(pl => pl.playerNum === p.playerNum)?.character.key === 'ironLung') {
 addLog(`Relentless: +50% XP for failing${p.failPenalty > 0 ? `, -${p.failPenalty} extra Endurance` : ''}`);
 }
 const area = AREA_LABELS[p.area] || p.area;
 if (p.isMilestone) {
 addLog(p.success
 ? ` Player ${p.playerNum} completed the ${p.difficulty.toUpperCase()} milestone: ${p.routeName} (${area})!`
 : `Player ${p.playerNum} attempted ${p.difficulty} milestone "${p.routeName}" (${area}) but failed. Gained ${p.xpGained} XP.`);
 } else {
 addLog(`Player ${p.playerNum} ${p.success ? 'completed' : 'failed'} ${p.routeName} (${p.grade}) - ${p.xpGained} XP gained`);
 }
 break;
 }
 case 'train_action': {
 const station = TRAINING_AREAS.find(a => a.name === p.areaName);
 const boost = station ? p.bonus - station.bonus : 0;
 const char = gameState.players.find(pl => pl.playerNum === p.playerNum).character;
 const journal = boost > 0 ? ` (+${boost} from ${char.equipment.filter(n => GEAR_SHOP.find(g => g.name === n)?.effectKind === 'trainingBonusBoost').join(', ')})` : '';
 addLog(`Player ${p.playerNum} trained at ${p.areaName} - gained +${p.bonus} ${p.stat}${journal} (total training bonus: +${p.totalTrainingBonusAfter[p.stat]})`);
 break;
 }
 case 'rest_action':
 addLog(`Player ${p.playerNum} rested and recovered endurance to ${p.newEndurance}${p.restBonusApplied > 0 ? ` (+${p.restBonusApplied} gear bonus)` : ''}`);
 if (p.betaBoostActivated) addLog(`Player ${p.playerNum}: Beta Boost active — +3 to all stats on next climb!`);
 break;
 case 'gear_purchased': {
 const char = gameState.players.find(pl => pl.playerNum === p.playerNum).character;
 const discount = p.nominalCost - p.cost;
 addLog(`Player ${p.playerNum} purchased ${p.gearName} for ${p.cost} XP${discount > 0 ? ` (-${discount} discount)` : ''}${p.timeCost === 0 ? ' (free visit)' : ''} (now ${getXPToNextLevel(char)} XP to Level ${char.level + 1})`);
 break;
 }
 case 'level_up': {
 const o = p.oldStats;
 const n = p.newStats;
 addLog(` Player ${p.playerNum} leveled up to Level ${p.newLevel}!`);
 STAT_KEYS.forEach(k => addLog(` ${STAT_LABELS[k]}: ${o[k]} → ${n[k]} (+${n[k] - o[k]})`));
 addLog(` Max Endurance: ${p.oldMaxEndurance} → ${p.newMaxEndurance} (+${p.newMaxEndurance - p.oldMaxEndurance})`);
 break;
 }
 case 'turn_start':
 if (p.round === before.round) addLog(`Turn passes to Player ${p.playerNum} (${p.timeRemaining} time remaining)`);
 break;
 case 'round_end':
 addLog(`Round ${p.round} ended!`);
 addLog(` Route Clearing: ${AREA_LABELS[p.routesCleared]} routes refreshed and reset`);
 break;
 case 'round_start':
 addLog(`Round ${p.round} begins!`);
 break;
 case 'game_end':
 addLog(` GAME OVER! Player ${p.winner} (${playerName(gameState, p.winner)}) has completed all milestone routes and WINS THE GAME! `);
 break;
 }
}

// Floating "−N END" / "+N END" text for an endurance change.
function formatEnduranceDelta(delta) {
 return `${delta < 0 ? '−' : '+'}${Math.abs(delta)} END`;
}

// Immediate effects for the action itself (before any re-render).
function actionEffects(before, events) {
 if (!window.Effects) return;
 const fx = window.Effects;
 events.forEach(e => {
 const p = e.payload;
 const enduranceBar = p.playerNum ? fx.locateEnduranceBar(p.playerNum) : null;
 switch (e.type) {
 case 'climb_resolved': {
 const xpBar = fx.locateXpBar(p.playerNum);
 const panel = fx.locatePlayerPanel(p.playerNum);
 if (enduranceBar) {
 fx.chalkPuff(enduranceBar, 'coral');
 fx.floatNumber(enduranceBar, formatEnduranceDelta(p.resourcesDelta.endurance.delta), 'endurance-loss');
 }
 if (xpBar && p.xpGained > 0) setTimeout(() => fx.floatNumber(xpBar, `+${p.xpGained} XP`, 'xp'), 220);
 if (p.isMilestone && p.success && panel) {
 setTimeout(() => fx.floatNumber(panel, `MILESTONE ${p.difficulty.toUpperCase()}!`, 'stat'), 480);
 }
 fx.recordTurnAction(p.isMilestone
 ? { kind: p.success ? 'milestone✓' : 'milestone✗', desc: `${p.difficulty} — ${p.routeName}`, delta: `${p.xpGained > 0 ? '+' : ''}${p.xpGained} XP` }
 : { kind: p.success ? 'climb✓' : 'climb✗', desc: `${p.routeName} (${p.grade})`, delta: `${p.xpGained > 0 ? '+' : ''}${p.xpGained} XP` });
 break;
 }
 case 'train_action': {
 const panel = fx.locatePlayerPanel(p.playerNum);
 const cost = -p.resourcesDelta.endurance.delta;
 if (panel) fx.floatNumber(panel, `+${p.bonus} ${p.stat.slice(0, 3).toUpperCase()}`, 'stat');
 if (enduranceBar && cost > 0) {
 fx.chalkPuff(enduranceBar, 'cobalt');
 setTimeout(() => fx.floatNumber(enduranceBar, `−${cost} END`, 'endurance-loss'), 180);
 }
 fx.recordTurnAction({ kind: 'train', desc: `${p.areaName} (+${p.bonus} ${p.stat})`, delta: cost > 0 ? `−${cost} END` : null });
 break;
 }
 case 'rest_action':
 if (enduranceBar) {
 fx.chalkPuff(enduranceBar, 'lime');
 fx.floatNumber(enduranceBar, formatEnduranceDelta(p.enduranceRecovered), 'endurance-gain');
 }
 fx.recordTurnAction({
 kind: 'rest',
 desc: `Rested${p.restBonusApplied > 0 ? ` (+${p.restBonusApplied} gear)` : ''}`,
 delta: formatEnduranceDelta(p.enduranceRecovered),
 });
 break;
 case 'gear_purchased':
 fx.recordTurnAction({ kind: 'gear', desc: `Bought ${p.gearName}`, delta: `−${p.cost} XP` });
 break;
 }
 });
}

// Turn / round transitions, presented once the board re-renders.
function turnEffect(e) {
 if (!window.Effects) return;
 if (e.type === 'turn_end') window.Effects.turnSummaryCard();
 if (e.type === 'round_start') window.Effects.roundTransition(e.payload.round);
 if (e.type === 'turn_start') window.Effects.beginTurn(e.payload.playerNum, playerName(gameState, e.payload.playerNum));
}

// Post-render purchase effects: fly the gear from shop to inventory, flip the
// rotating shop cards, and float the XP cost.
function gearPurchaseEffects(events, srcGhost) {
 const bought = events.find(e => e.type === 'gear_purchased');
 if (!bought || !window.Effects) return;
 const { playerNum, gearName, cost } = bought.payload;
 const destInv = document.getElementById(`inventory-${playerNum}`);
 const srcStub = srcGhost ? { getBoundingClientRect: () => ({ left: srcGhost.left - 60, top: srcGhost.top - 16, width: 120, height: 32, right: 0, bottom: 0 }) } : null;
 if (srcStub && destInv) window.Effects.flyToInventory(srcStub, destInv, gearName);
 const xpBar = window.Effects.locateXpBar(playerNum);
 if (xpBar) window.Effects.floatNumber(xpBar, `−${cost} XP`, 'xp');
 if (!AscentEngine.ACCESS_CARDS.includes(gearName)) {
 const rotating = Array.from(document.querySelectorAll('.gear-card:not(.access-gear-card)'));
 rotating.forEach((c, i) => setTimeout(() => window.Effects.cardFlip(c), i * 60));
 }
}

// Plain-language line for one entry of climb_resolved.gearEffects.
function formatGearEffect(g) {
 const die = `Die ${g.die + 1}`;
 switch (g.effectKind) {
 case 'timeCostReduction': return `${g.gear}: time cost ${g.from} → ${g.to}`;
 case 'enduranceHalvedOnTag': return `${g.gear}: endurance cost ${g.from} → ${g.to}`;
 case 'rerollOnTag': return `${g.gear}: re-rolled ${die} (${g.from} → ${g.to})`;
 case 'extraDieDiscardOne':
 return g.die === -1
 ? `${g.gear}: rolled an extra ${g.extra}, discarded it (no die to improve)`
 : `${g.gear}: rolled an extra ${g.extra}, swapped it in for ${die} (discarded ${g.from})`;
 case 'treatOneDieAsValue': return `${g.gear}: ${die} treated as ${g.to} (rolled ${g.from})`;
 case 'milestoneBuffDiceBonus': return `${g.gear}: buff ${die} +${g.to - g.from} (${g.from} → ${g.to})`;
 case 'negateOneNerfDie': return `${g.gear}: ignored nerf ${die} (+${g.value} ${STAT_LABELS[g.stat]})`;
 case 'failBonusXp': return `${g.gear}: +${g.xp} XP for the fall`;
 case 'ignoreFailPenalty': return `${g.gear}: no extra endurance lost for failing`;
 case 'successHealEndurance': return `${g.gear}: +${g.endurance} endurance`;
 default: return `${g.gear}: ${g.effectKind}`;
 }
}

// Build the climb-result modal from a climb's dice_rolled + climb_resolved events.
function showClimbResultFromEvents(before, events) {
 const rolled = events.find(e => e.type === 'dice_rolled').payload;
 const c = events.find(e => e.type === 'climb_resolved').payload;
 const char = before.players.find(pl => pl.playerNum === c.playerNum).character;
 const route = routeForClimb(before, c);
 // A die whose modifier the rules zeroed was negated by Mountain Mentor (listed
 // in gearEffects) or else by a character passive (Free Solo, Technician).
 const mentor = new Map(c.gearEffects.filter(g => g.effectKind === 'negateOneNerfDie').map(g => [g.die, g.gear]));
 const diceEffects = AscentEngine.buildEffectRollArray(char, route).map((effect, i) => {
 const applied = rolled.modifiers[i];
 const negated = effect.modifier !== 0 && applied.modifier === 0;
 return {
 die: applied.die, stat: effect.stat, modifier: applied.modifier,
 abilityNeutralized: negated && !mentor.has(i),
 gearNeutralized: mentor.get(i) || null,
 };
 });
 const versatility = events.some(e => e.type === 'ability_activated' && e.payload.ability === 'Versatility');
 showClimbResult(route, [...rolled.dice, ...rolled.discardedDice], rolled.dice, c.effectiveStats, c.requirements,
 diceEffects, c.success, c.xpGained, versatility ? 'Versatility' : null, c.gearEffects.map(formatGearEffect));
}

// `rolls` lists every die rolled; the first diceUsed.length are the ones
// applied (any extras, e.g. a Power Tap Belt discard, are shown dimmed).
// `gearNotes` describes each gear effect that changed this climb.
function showClimbResult(route, rolls, diceUsed, stats, effectiveReqs, diceEffects, success, xpGained, activatedAbility, gearNotes = []) {
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
 if (effect.modifier === 0 && (effect.abilityNeutralized || effect.gearNeutralized)) {
 sign = '~';
 color = '#6c757d';
 } else if (effect.modifier === 0) {
 sign = '±';
 color = '#6c757d';
 }

 const neutralizedText = effect.abilityNeutralized ? ' <span style="color: #ffc107;">(Neutralized by Ability)</span>'
 : effect.gearNeutralized ? ` <span style="color: #ffc107;">(Neutralized by ${effect.gearNeutralized})</span>` : '';
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
 <div class="die" style="${i < diceUsed.length ? '': 'opacity: 0.3;'}">
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
 ${gearNotes.length ? `
 <h3 style="margin-top: 20px;">Gear Effects:</h3>
 <ul class="gear-effects" style="margin: 0 0 20px; padding-left: 20px;">
 ${gearNotes.map(note => `<li style="margin: 4px 0; color: #6f42c1; font-weight: bold;">${note}</li>`).join('')}
 </ul>` : ''}

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

function getXPToNextLevel(char) {
 // Returns how much more XP is needed to reach the next level
 if (char.level >= 15) return 0;
 const nextLevelThreshold = XP_TABLE[char.level].cumulative;
 return nextLevelThreshold - char.xp;
}

function closeModal() {
 document.getElementById('climbModal').classList.remove('show');
}

function closeClimbModal() {
 document.getElementById('climbModal').classList.remove('show');
 finishPresentation();
}

// Level-up popup for one level_up event.
function showLevelUpPopup(levelUp) {
 const p = levelUp.payload;
 const statRows = [
 ...STAT_KEYS.map(k => ({ name: STAT_LABELS[k], old: p.oldStats[k], now: p.newStats[k] })),
 { name: 'Max Endurance', old: p.oldMaxEndurance, now: p.newMaxEndurance },
 ].map(row => {
 const diff = row.now - row.old;
 const diffStr = diff > 0 ? `<span class="stat-up">+${diff}</span>`: `<span>${diff}</span>`;
 return `<tr>
 <td> ${row.name}</td>
 <td>${row.old}</td>
 <td>${row.now}</td>
 <td>${diffStr}</td>
 </tr>`;
 }).join('');

 document.getElementById('levelUpBody').innerHTML = `
 <div class="level-up-headline"> LEVEL UP! </div>
 <div style="font-size: 1.1em; color: #2c3e50; margin-bottom: 5px;">
 Player ${p.playerNum} — ${playerName(gameState, p.playerNum)}
 </div>
 <div class="level-badge">${p.newLevel}</div>
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
 finishPresentation();
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
function syncShopCollapseState() {
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

 // Affordable = the engine would let the current player buy something now.
 const affordable = legalActionsNow().some(a => a.type === 'buyGear');
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
