// AUTO-GENERATED FROM game.js — DO NOT EDIT BY HAND.
//
// Regenerate with: node engine/build-data.js
// game.js is the single source of truth for game data; this module mirrors
// its GAME DATA section so the Node engine, simulation harness, and analysis
// scripts can import the values. Edits here will be overwritten.
//
// Exports: CHARACTERS, XP_TABLE, TRAINING_AREAS, ROUTES, GEAR_SHOP.

export const CHARACTERS = {
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

export const XP_TABLE = [
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

export const TRAINING_AREAS = [
 { name: "Grip Board", stat: "focus", bonus: 5, time: 2, endurance: 10, description: "+5 Focus" },
 { name: "Campus Board", stat: "strength", bonus: 5, time: 2, endurance: 15, description: "+5 Strength" },
 { name: "Continuous MoonBoard", stat: "technique", bonus: 5, time: 2, endurance: 12, description: "+5 Technique" },
 { name: "Balance and Core", stat: "flexibility", bonus: 5, time: 2, endurance: 8, description: "+5 Flexibility" }
];

// Comprehensive route data - simplified version with key routes
// rollEffect format: array of objects { stat: 'statName', modifier: 1 or -1 }
// modifier -1 means subtract die from requirement (buff), +1 means add die to requirement (nerf)
// gearModifiers: array of gear names that provide benefits on this route
export const ROUTES = {
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
export const GEAR_SHOP = [
 // ===== ACCESS CARDS (gate Top Rope / Lead climbing areas) =====
 { name: "Harness", cost: 80, category: "Essential Safety Gear", statEffect: "all", value: -2, routeFilter: ["Top Rope", "Lead"], holdFeatureFilter: [], description: "Essential safety equipment for roped climbing", effectDisplay: "-2 All Stats on rope routes | Unlocks Top Rope", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: "Top Rope", restBonus: 0 },
 { name: "Belay Device", cost: 70, category: "Essential Safety Gear", statEffect: "strength", value: -2, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Managing a heavy rope builds arm strength", effectDisplay: "-2 Strength on Lead routes | Unlocks Top Rope", prerequisiteItems: ["Harness"], prerequisiteLevel: 1, accessRequirement: "Top Rope", restBonus: 0 },
 { name: "Locking Carabiner", cost: 60, category: "Essential Safety Gear", statEffect: "endurance", value: 5, routeFilter: ["Lead"], holdFeatureFilter: [], description: "A secure system builds confidence, reducing mental fatigue", effectDisplay: "+5 Max Endurance | Part of Lead system", prerequisiteItems: ["Harness", "Belay Device"], prerequisiteLevel: 1, accessRequirement: "Lead", restBonus: 0 },
 { name: "Lead Rope", cost: 120, category: "Essential Safety Gear", statEffect: "strength", value: -3, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Dynamic rope absorbs fall energy", effectDisplay: "-3 Strength on Lead routes | Unlocks Lead", prerequisiteItems: ["Harness", "Belay Device", "Locking Carabiner"], prerequisiteLevel: 1, accessRequirement: "Lead", restBonus: 0 },

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
