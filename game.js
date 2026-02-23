// ===== GAME DATA =====
console.log('🎮 game.js is loading...');

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
            description: "PASSIVE: Can access Top Rope and Lead routes without equipment. All dice roll effects are negated. Can only attempt climbs where all stats guarantee success.",
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
        { name: "Beginner's Fortune", grade: "V0", strength: 15, technique: 20, focus: 15, flexibility: 10, time: 2, endurance: 12, xpSuccess: 25, xpFail: 8, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Slab", holdFeatures: ["Jugs"], moveFeatures: [] },
        { name: "Warm-Up Wonder", grade: "V1", strength: 22, technique: 25, focus: 18, flexibility: 20, time: 2, endurance: 16, xpSuccess: 32, xpFail: 12, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: ["Jugs"], moveFeatures: [] },
        { name: "Crimson Ladder", grade: "V2", strength: 30, technique: 28, focus: 25, flexibility: 22, time: 2, endurance: 22, xpSuccess: 42, xpFail: 16, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [] },
        { name: "Toe Hook Traverse", grade: "V3", strength: 32, technique: 35, focus: 30, flexibility: 28, time: 3, endurance: 28, xpSuccess: 52, xpFail: 22, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Traverse", holdFeatures: [], moveFeatures: ["Toe Hook", "Heel Hook"] },
        { name: "Crimper's Delight", grade: "V4", strength: 45, technique: 40, focus: 35, flexibility: 28, time: 4, endurance: 36, xpSuccess: 65, xpFail: 30, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: -1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [] },
        { name: "Dyno Dilemma", grade: "V5", strength: 52, technique: 38, focus: 36, flexibility: 30, time: 4, endurance: 46, xpSuccess: 78, xpFail: 38, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic", "Dyno"] },
        { name: "Heel Hook Heaven", grade: "V6", strength: 48, technique: 50, focus: 44, flexibility: 42, time: 4, endurance: 56, xpSuccess: 90, xpFail: 46, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Heel Hook"] },
        { name: "The Roof of Doom", grade: "V7", strength: 58, technique: 48, focus: 42, flexibility: 40, time: 5, endurance: 64, xpSuccess: 100, xpFail: 54, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: ["Jugs"], moveFeatures: ["Roof"] },
        { name: "Shoulder Shredder", grade: "V8", strength: 65, technique: 48, focus: 44, flexibility: 40, time: 5, endurance: 72, xpSuccess: 100, xpFail: 62, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Dyno Chain", grade: "V9", strength: 70, technique: 52, focus: 50, flexibility: 44, time: 5, endurance: 80, xpSuccess: 100, xpFail: 70, rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic", "Dyno"] },
        { name: "Precision Impossible", grade: "V10", strength: 58, technique: 70, focus: 68, flexibility: 58, time: 5, endurance: 88, xpSuccess: 100, xpFail: 78, rollEffect: [{ stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Slab", holdFeatures: [], moveFeatures: [] },
        { name: "The Impossible Pinch", grade: "V11", strength: 80, technique: 64, focus: 60, flexibility: 52, time: 5, endurance: 96, xpSuccess: 100, xpFail: 86, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: ["Pinch"], moveFeatures: [] },
        { name: "Project Zero", grade: "V12", strength: 82, technique: 72, focus: 70, flexibility: 58, time: 6, endurance: 100, xpSuccess: 100, xpFail: 90, rollEffect: [{ stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] }
    ],
    topRope: [
        { name: "First Timer's Friend", grade: "5.6", strength: 20, technique: 18, focus: 15, flexibility: 12, time: 3, endurance: 15, xpSuccess: 30, xpFail: 10, rollEffect: [{ stat: 'technique', modifier: -1 }], gearModifiers: ["Harness"], routeType: "Slab", holdFeatures: ["Jugs"], moveFeatures: [] },
        { name: "Learning Curve", grade: "5.8", strength: 30, technique: 28, focus: 26, flexibility: 22, time: 4, endurance: 25, xpSuccess: 42, xpFail: 18, rollEffect: [{ stat: 'technique', modifier: -1 }], gearModifiers: ["Climbing Shoes"], routeType: "Vertical", holdFeatures: [], moveFeatures: [] },
        { name: "The Standard", grade: "5.9", strength: 38, technique: 34, focus: 30, flexibility: 26, time: 4, endurance: 35, xpSuccess: 55, xpFail: 26, rollEffect: [{ stat: 'strength', modifier: -1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [] },
        { name: "Crimson Wall", grade: "5.10a", strength: 40, technique: 38, focus: 35, flexibility: 30, time: 5, endurance: 40, xpSuccess: 62, xpFail: 30, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [] },
        { name: "Overhang Initiation", grade: "5.10b", strength: 45, technique: 38, focus: 34, flexibility: 30, time: 5, endurance: 48, xpSuccess: 70, xpFail: 36, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Crimp Central", grade: "5.10d", strength: 50, technique: 46, focus: 42, flexibility: 36, time: 5, endurance: 56, xpSuccess: 80, xpFail: 44, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [] },
        { name: "Power Climb", grade: "5.11b", strength: 56, technique: 48, focus: 44, flexibility: 38, time: 6, endurance: 66, xpSuccess: 92, xpFail: 54, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Sustained Difficulty", grade: "5.11c", strength: 58, technique: 52, focus: 50, flexibility: 44, time: 6, endurance: 70, xpSuccess: 98, xpFail: 58, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: ["Sloper"], moveFeatures: [] },
        { name: "Dynamic Moves", grade: "5.12a", strength: 62, technique: 56, focus: 54, flexibility: 48, time: 6, endurance: 78, xpSuccess: 100, xpFail: 66, rollEffect: [{ stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: ["Dynamic"] },
        { name: "The Power Endurance", grade: "5.12b", strength: 68, technique: 60, focus: 58, flexibility: 54, time: 7, endurance: 84, xpSuccess: 100, xpFail: 72, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Micro Hold Heaven", grade: "5.12d", strength: 66, technique: 66, focus: 64, flexibility: 58, time: 6, endurance: 90, xpSuccess: 100, xpFail: 78, rollEffect: [{ stat: 'technique', modifier: 1 }], gearModifiers: ["Finger Tape"], routeType: "Vertical", holdFeatures: ["Crimp"], moveFeatures: [] },
        { name: "The Upper Echelon", grade: "5.13a", strength: 72, technique: 68, focus: 66, flexibility: 60, time: 7, endurance: 92, xpSuccess: 100, xpFail: 80, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Professional Grade", grade: "5.13c", strength: 80, technique: 74, focus: 72, flexibility: 66, time: 7, endurance: 100, xpSuccess: 100, xpFail: 88, rollEffect: [{ stat: 'technique', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] }
    ],
    leadClimbing: [
        { name: "Lead Introduction", grade: "5.8", strength: 30, technique: 28, focus: 30, flexibility: 22, time: 4, endurance: 25, xpSuccess: 40, xpFail: 15, rollEffect: [{ stat: 'focus', modifier: -1 }], gearModifiers: ["Harness", "Lead Rope"], routeType: "Vertical", holdFeatures: [], moveFeatures: [] },
        { name: "Clip and Climb", grade: "5.9", strength: 38, technique: 34, focus: 36, flexibility: 28, time: 4, endurance: 32, xpSuccess: 48, xpFail: 22, rollEffect: [{ stat: 'focus', modifier: -1 }], gearModifiers: ["Harness", "Belay Device"], routeType: "Vertical", holdFeatures: [], moveFeatures: [] },
        { name: "First Overhang Lead", grade: "5.10a", strength: 42, technique: 38, focus: 40, flexibility: 30, time: 5, endurance: 35, xpSuccess: 52, xpFail: 24, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Pump Management", grade: "5.10b", strength: 45, technique: 44, focus: 46, flexibility: 34, time: 6, endurance: 40, xpSuccess: 58, xpFail: 28, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Power Lead", grade: "5.10d", strength: 52, technique: 48, focus: 50, flexibility: 38, time: 6, endurance: 50, xpSuccess: 70, xpFail: 36, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "The Steep Lead", grade: "5.11a", strength: 54, technique: 50, focus: 52, flexibility: 44, time: 6, endurance: 55, xpSuccess: 75, xpFail: 40, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Runout Section", grade: "5.11b", strength: 56, technique: 52, focus: 58, flexibility: 48, time: 6, endurance: 60, xpSuccess: 80, xpFail: 44, rollEffect: [{ stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Vertical", holdFeatures: [], moveFeatures: [] },
        { name: "Overhang Lead Challenge", grade: "5.11c", strength: 60, technique: 56, focus: 60, flexibility: 52, time: 7, endurance: 65, xpSuccess: 85, xpFail: 48, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness", "Chalk Bag"], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "Advanced Clipping", grade: "5.12a", strength: 66, technique: 64, focus: 66, flexibility: 58, time: 7, endurance: 75, xpSuccess: 95, xpFail: 56, rollEffect: [{ stat: 'focus', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "The Compression Lead", grade: "5.12b", strength: 72, technique: 66, focus: 66, flexibility: 60, time: 7, endurance: 82, xpSuccess: 100, xpFail: 62, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"], routeType: "Overhang", holdFeatures: ["Pinch"], moveFeatures: [] },
        { name: "Endurance Lead", grade: "5.12d", strength: 72, technique: 72, focus: 72, flexibility: 66, time: 8, endurance: 88, xpSuccess: 100, xpFail: 68, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "The Elite Lead", grade: "5.13a", strength: 76, technique: 74, focus: 74, flexibility: 70, time: 8, endurance: 92, xpSuccess: 100, xpFail: 72, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] },
        { name: "World Class Leading", grade: "5.14a", strength: 88, technique: 84, focus: 84, flexibility: 80, time: 8, endurance: 100, xpSuccess: 100, xpFail: 88, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [], routeType: "Overhang", holdFeatures: [], moveFeatures: [] }
    ]
};

const GEAR_SHOP = [
    { name: "Climbing Shoes", cost: 75, category: "Essential Safety Gear", statEffect: "technique", value: -3, routeFilter: ["Slab"], holdFeatureFilter: ["Heel Hook", "Toe Hook"], description: "Sticky rubber provides superior footwork precision", effectDisplay: "🎯 -3 Technique on Slab, -2 on Heel/Toe Hook routes", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Chalk", cost: 50, category: "Performance Gear", statEffect: "strength", value: -2, routeFilter: [], holdFeatureFilter: ["Crimp", "Sloper"], description: "Maintains friction on challenging holds", effectDisplay: "💪 -2 Strength on Crimp/Sloper holds", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Chalk Bag", cost: 60, category: "Performance Gear", statEffect: "strength", value: -2, routeFilter: ["All"], holdFeatureFilter: [], description: "Convenient chalk access during climbs", effectDisplay: "💪 -2 Strength on all routes", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Harness", cost: 80, category: "Essential Safety Gear", statEffect: "all", value: -2, routeFilter: ["Top Rope", "Lead"], holdFeatureFilter: [], description: "Essential safety equipment for roped climbing", effectDisplay: "✨ -2 All Stats on rope routes | 🔓 Unlocks Top Rope", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: "Top Rope", restBonus: 0 },
    { name: "Belay Device", cost: 70, category: "Essential Safety Gear", statEffect: "focus", value: -2, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Controls rope friction for safe belaying", effectDisplay: "🧠 -2 Focus on Lead routes | 🔓 Unlocks Top Rope", prerequisiteItems: ["Harness"], prerequisiteLevel: 1, accessRequirement: "Top Rope", restBonus: 0 },
    { name: "Locking Carabiner", cost: 60, category: "Essential Safety Gear", statEffect: "focus", value: -1, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Secures belay device to harness", effectDisplay: "🧠 -1 Focus on Lead routes | 🔓 Part of Lead system", prerequisiteItems: ["Harness", "Belay Device"], prerequisiteLevel: 1, accessRequirement: "Lead", restBonus: 0 },
    { name: "Lead Rope", cost: 120, category: "Essential Safety Gear", statEffect: "strength", value: -3, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Dynamic rope absorbs fall energy", effectDisplay: "💪 -3 Strength on Lead routes | 🔓 Unlocks Lead", prerequisiteItems: ["Harness", "Belay Device", "Locking Carabiner"], prerequisiteLevel: 1, accessRequirement: "Lead", restBonus: 0 },
    { name: "Quickdraws Set", cost: 140, category: "Performance Gear", statEffect: "focus", value: -4, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Enables efficient clipping during lead climbs", effectDisplay: "🧠 -4 Focus on Lead routes", prerequisiteItems: ["Lead Rope"], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Finger Tape", cost: 85, category: "Performance Gear", statEffect: "strength", value: -4, routeFilter: [], holdFeatureFilter: ["Crimp"], description: "Protects fingers and supports tendons on sharp holds", effectDisplay: "💪 -4 Strength on Crimp holds", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Liquid Chalk", cost: 95, category: "Performance Gear", statEffect: "strength", value: -3, routeFilter: ["All"], holdFeatureFilter: [], description: "Long-lasting alcohol-based chalk layer", effectDisplay: "💪 -3 Strength on all routes (stacks)", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Knee Pads", cost: 110, category: "Specialized Gear", statEffect: "all", value: -5, routeFilter: [], holdFeatureFilter: ["Roof"], description: "Enables knee bar rest positions on overhangs", effectDisplay: "✨ -5 All Stats on Roof features", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Athletic Tape", cost: 50, category: "Performance Gear", statEffect: "flexibility", value: -2, routeFilter: ["All"], holdFeatureFilter: [], description: "Joint support and stability", effectDisplay: "🤸 -2 Flexibility on all routes", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Crash Pad", cost: 130, category: "Safety Gear", statEffect: "all", value: -3, routeFilter: ["Bouldering"], holdFeatureFilter: [], description: "Cushioned landing provides confidence", effectDisplay: "✨ -3 All Stats on Bouldering", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Belay Gloves", cost: 95, category: "Safety Gear", statEffect: "focus", value: -2, routeFilter: ["Lead"], holdFeatureFilter: [], description: "Prevents rope burn during belaying", effectDisplay: "🧠 -2 Focus on Lead routes", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Helmet", cost: 65, category: "Safety Gear", statEffect: "endurance", value: 5, routeFilter: ["All"], holdFeatureFilter: [], description: "Head protection reduces injury risk", effectDisplay: "💨 +5 Max Endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Comfortable Climbing Apparel", cost: 90, category: "Comfort Gear", statEffect: "all", value: -1, routeFilter: ["All"], holdFeatureFilter: [], description: "Full range of motion and breathability", effectDisplay: "✨ -1 All Stats, 💨 +10 Max Endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0, enduranceBonus: 10 },
    { name: "Water Bottle", cost: 40, category: "Comfort Gear", statEffect: "endurance", value: 5, routeFilter: ["All"], holdFeatureFilter: [], description: "Proper hydration during sessions", effectDisplay: "💨 +5 Max Endurance, +3 Rest Bonus", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 3 },
    { name: "Foam Roller", cost: 120, category: "Recovery Gear", statEffect: "endurance", value: 8, routeFilter: ["All"], holdFeatureFilter: [], description: "Muscle recovery and tension release", effectDisplay: "💨 +8 Max Endurance, +5 Rest Bonus", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 5 },
    { name: "Approach Shoes", cost: 55, category: "Comfort Gear", statEffect: "time", value: -1, routeFilter: ["All"], holdFeatureFilter: [], description: "Comfortable for walking around gym", effectDisplay: "⏱️ -1 time when moving areas", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Yoga Mat", cost: 95, category: "Training Equipment", statEffect: "endurance", value: 10, routeFilter: ["All"], holdFeatureFilter: [], description: "Used for stretching and mobility work", effectDisplay: "💨 +10 Max Endurance, +4 Rest Bonus", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 4 },
    { name: "Grip Strength Trainer", cost: 180, category: "Training Equipment", statEffect: "strength", value: 2, routeFilter: ["All"], holdFeatureFilter: [], description: "Builds finger and forearm strength", effectDisplay: "💪 +2 Permanent Strength", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Portable Hangboard", cost: 240, category: "Training Equipment", statEffect: "strengthTech", value: 2, routeFilter: ["All"], holdFeatureFilter: [], description: "Advanced finger strength training", effectDisplay: "💪 +2 Str, 🎯 +2 Tech (Permanent)", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Resistance Bands", cost: 150, category: "Training Equipment", statEffect: "flexibility", value: 2, routeFilter: ["All"], holdFeatureFilter: [], description: "Mobility and warm-up tool", effectDisplay: "🤸 +2 Permanent Flexibility", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Campus Board Training Program", cost: 200, category: "Training Equipment", statEffect: "strengthTechMixed", value: 3, routeFilter: ["All"], holdFeatureFilter: [], description: "Explosive power training with drawbacks", effectDisplay: "💪 +3 Str, 🎯 -1 Tech (Permanent)", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Technique Training System", cost: 180, category: "Training Equipment", statEffect: "technique", value: 2, routeFilter: ["All"], holdFeatureFilter: [], description: "Deliberate practice for movement precision", effectDisplay: "🎯 +2 Permanent Technique", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Meditation App", cost: 160, category: "Training Equipment", statEffect: "focus", value: 2, routeFilter: ["All"], holdFeatureFilter: [], description: "Mental training for composure", effectDisplay: "🧠 +2 Permanent Focus", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Gear Bag", cost: 70, category: "Convenience Gear", statEffect: "time", value: -1, routeFilter: ["All"], holdFeatureFilter: [], description: "Organized gear storage", effectDisplay: "⏱️ Gear shop costs 0 time", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Non-Locking Carabiner", cost: 35, category: "Convenience Gear", statEffect: "special", value: 0, routeFilter: ["All"], holdFeatureFilter: [], description: "Quick clipping of accessories", effectDisplay: "🔗 Utility item", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Climbing Brush", cost: 55, category: "Convenience Gear", statEffect: "endurance", value: 3, routeFilter: ["All"], holdFeatureFilter: [], description: "Cleans holds of chalk buildup", effectDisplay: "💨 +3 Max Endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Route Notebook", cost: 100, category: "Strategy Gear", statEffect: "technique", value: -2, routeFilter: ["Repeated"], holdFeatureFilter: [], description: "Record beta and learn from attempts", effectDisplay: "🎯 -2 Technique on repeated routes", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Power Grips", cost: 130, category: "Performance Gear", statEffect: "strength", value: -3, routeFilter: [], holdFeatureFilter: ["Sloper", "Pinch"], description: "Enhanced grip for difficult holds", effectDisplay: "💪 -3 Strength on Sloper/Pinch holds", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Compression Sleeves", cost: 75, category: "Recovery Gear", statEffect: "strength", value: -1, routeFilter: ["All"], holdFeatureFilter: [], description: "Reduces muscle fatigue and pump", effectDisplay: "💪 -1 Strength, 💨 +8 Max Endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0, enduranceBonus: 8 },
    { name: "Dynamic Shoes", cost: 110, category: "Specialized Gear", statEffect: "flexibility", value: -3, routeFilter: [], holdFeatureFilter: ["Dynamic", "Dyno"], description: "Specialized shoes for explosive movements", effectDisplay: "🤸 -3 Flexibility on Dynamic/Dyno routes", prerequisiteItems: ["Climbing Shoes"], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Mental Training Card Set", cost: 140, category: "Strategy Gear", statEffect: "focus", value: -3, routeFilter: ["Repeated"], holdFeatureFilter: [], description: "Visualization and mental rehearsal techniques", effectDisplay: "🧠 -3 Focus on repeated routes", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 },
    { name: "Recovery Supplements", cost: 90, category: "Recovery Gear", statEffect: "endurance", value: 12, routeFilter: ["All"], holdFeatureFilter: [], description: "Optimized nutrition for sustained performance", effectDisplay: "💨 +12 Max Endurance", prerequisiteItems: [], prerequisiteLevel: 1, accessRequirement: null, restBonus: 0 }
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
    belayersUnlocked: 1,
    gameLog: [],
    availableGear: [], // Randomized gear available in shop
    attemptedRoutes: {}, // Maps playerNum -> Set of route keys ("area:routeName") attempted this round
    milestoneRoutes: {
        beginner: null,
        intermediate: null,
        expert: null
    },
    gameEnded: false,
    winner: null
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

function getSectionCapacity(section) {
    // Returns the maximum number of players allowed in a section
    switch(section) {
        case 'bouldering':
            return 10; // Unlimited for practical purposes
        case 'topRope':
            return gameState.belayersUnlocked; // Limited by belayers (1-3)
        case 'leadClimbing':
            return gameState.belayersUnlocked; // Limited by belayers (1-3)
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

    // Bouldering is always accessible
    if (area === 'bouldering') {
        return { hasAccess: true, missingItems: [] };
    }
    
    // Top Rope requires Harness + Belay Device
    if (area === 'topRope') {
        const hasHarness = char.equipment.includes('Harness');
        const hasBelayDevice = char.equipment.includes('Belay Device');
        
        if (!hasHarness || !hasBelayDevice) {
            const missing = [];
            if (!hasHarness) missing.push('Harness');
            if (!hasBelayDevice) missing.push('Belay Device');
            return { hasAccess: false, missingItems: missing };
        }
        return { hasAccess: true, missingItems: [] };
    }
    
    // Lead Climbing requires Harness + Belay Device + Locking Carabiner + Lead Rope
    if (area === 'leadClimbing') {
        const hasHarness = char.equipment.includes('Harness');
        const hasBelayDevice = char.equipment.includes('Belay Device');
        const hasCarabiner = char.equipment.includes('Locking Carabiner');
        const hasLeadRope = char.equipment.includes('Lead Rope');
        
        if (!hasHarness || !hasBelayDevice || !hasCarabiner || !hasLeadRope) {
            const missing = [];
            if (!hasHarness) missing.push('Harness');
            if (!hasBelayDevice) missing.push('Belay Device');
            if (!hasCarabiner) missing.push('Locking Carabiner');
            if (!hasLeadRope) missing.push('Lead Rope');
            return { hasAccess: false, missingItems: missing };
        }
        return { hasAccess: true, missingItems: [] };
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
        
        // Skip if gear doesn't apply to this route type
        if (gear.routeFilter && gear.routeFilter.length > 0 && !gear.routeFilter.includes("All") && !gear.routeFilter.includes("Repeated")) {
            let applies = false;
            
            // Check area match (Bouldering, Top Rope, Lead)
            if (area === 'bouldering' && gear.routeFilter.includes('Bouldering')) applies = true;
            if (area === 'topRope' && gear.routeFilter.includes('Top Rope')) applies = true;
            if (area === 'leadClimbing' && gear.routeFilter.includes('Lead')) applies = true;
            
            // Check route type match (Slab, Overhang, Vertical, Traverse)
            if (route.routeType && gear.routeFilter.includes(route.routeType)) applies = true;
            
            if (!applies) return;  // Skip this gear
        }
        
        // Check hold/move feature filter
        if (gear.holdFeatureFilter && gear.holdFeatureFilter.length > 0) {
            let featureMatches = false;
            if (route.holdFeatures) {
                route.holdFeatures.forEach(feature => {
                    if (gear.holdFeatureFilter.includes(feature)) featureMatches = true;
                });
            }
            if (route.moveFeatures) {
                route.moveFeatures.forEach(feature => {
                    if (gear.holdFeatureFilter.includes(feature)) featureMatches = true;
                });
            }
            
            if (!featureMatches) return;  // Skip this gear
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
    console.log('🏆 Selecting milestone routes...');
    
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
    
    // Randomly select one from each difficulty
    const beginnerIndex = Math.floor(Math.random() * beginnerRoutes.length);
    const intermediateIndex = Math.floor(Math.random() * intermediateRoutes.length);
    const expertIndex = Math.floor(Math.random() * expertRoutes.length);
    
    gameState.milestoneRoutes.beginner = beginnerRoutes[beginnerIndex];
    gameState.milestoneRoutes.intermediate = intermediateRoutes[intermediateIndex];
    gameState.milestoneRoutes.expert = expertRoutes[expertIndex];
    
    console.log('✅ Milestone routes selected:');
    console.log('  Beginner:', gameState.milestoneRoutes.beginner.route.name, `(${gameState.milestoneRoutes.beginner.route.grade})`);
    console.log('  Intermediate:', gameState.milestoneRoutes.intermediate.route.name, `(${gameState.milestoneRoutes.intermediate.route.grade})`);
    console.log('  Expert:', gameState.milestoneRoutes.expert.route.name, `(${gameState.milestoneRoutes.expert.route.grade})`);
}

function renderMilestonePanel() {
    const container = document.getElementById('milestonePanel');
    if (!container) return;
    
    let html = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 15px; margin-bottom: 20px; box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);">
            <h2 style="margin: 0 0 15px 0; font-size: 1.8em; text-align: center;">
                🏆 MILESTONE ROUTES - First to Complete All 3 WINS! 🏆
            </h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
    `;
    
    const difficulties = ['beginner', 'intermediate', 'expert'];
    const colors = { beginner: '#4ade80', intermediate: '#fbbf24', expert: '#ef4444' };
    const icons = { beginner: '🟢', intermediate: '🟡', expert: '🔴' };
    
    difficulties.forEach(difficulty => {
        const milestone = gameState.milestoneRoutes[difficulty];
        if (!milestone) return;
        
        const route = milestone.route;
        const area = milestone.area;
        const areaIcon = area === 'bouldering' ? '🪨' : (area === 'topRope' ? '🧗' : '⛰️');
        
        html += `
            <div style="background: white; color: #2c3e50; padding: 15px; border-radius: 10px; border-left: 5px solid ${colors[difficulty]};">
                <div style="font-weight: bold; font-size: 1.2em; margin-bottom: 10px;">
                    ${icons[difficulty]} ${difficulty.toUpperCase()}
                </div>
                <div style="font-size: 1.1em; font-weight: bold; color: #667eea; margin-bottom: 5px;">
                    ${areaIcon} ${route.name}
                </div>
                <div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">
                    Grade: ${route.grade} | Time: ${route.time} | Endurance: ${route.endurance}
                </div>
                <div style="font-size: 0.85em; margin-bottom: 10px;">
                    💪 ${route.strength} | 🎯 ${route.technique} | 🧠 ${route.focus} | 🤸 ${route.flexibility}
                </div>
                <div style="border-top: 1px solid #ddd; padding-top: 10px; margin-top: 10px;">
                    <div style="font-weight: bold; margin-bottom: 5px; font-size: 0.9em;">Player Progress:</div>
        `;
        
        gameState.players.forEach(player => {
            const completed = player.character.milestonesCompleted[difficulty];
            const statusIcon = completed ? '✅' : '⏳';
            const statusText = completed ? 'COMPLETE' : 'Not Complete';
            const statusColor = completed ? '#22c55e' : '#6b7280';
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 0.85em;">
                    <span>${player.character.name}</span>
                    <span style="color: ${statusColor}; font-weight: bold;">${statusIcon} ${statusText}</span>
                </div>
            `;
        });
        
        html += `
                </div>
                <button class="btn" onclick="attemptMilestoneRoute('${difficulty}')" style="width: 100%; margin-top: 10px; font-size: 0.9em; padding: 10px;">
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
    console.log('🎯 startCharacterSelect() called');
    const numPlayersInput = document.getElementById('numPlayers');
    if (!numPlayersInput) {
        console.error('❌ numPlayers input not found');
        return;
    }
    
    const numPlayers = parseInt(numPlayersInput.value);
    console.log('Number of players:', numPlayers);
    if (numPlayers < 1 || numPlayers > 4 || isNaN(numPlayers)) {
        alert('Please select 1-4 players');
        return;
    }

    gameState.players = [];
    for (let i = 0; i < numPlayers; i++) {
        gameState.players.push({ playerNum: i + 1, character: null });
    }

    const charSelectionDiv = document.getElementById('characterSelection');
    if (!charSelectionDiv) {
        console.error('❌ characterSelection div not found');
        return;
    }
    
    charSelectionDiv.style.display = 'block';
    console.log('✓ Character selection shown');
    renderCharacterSelect();
}

function renderCharacterSelect() {
    console.log('📝 renderCharacterSelect() called');
    const container = document.getElementById('characterSelect');
    if (!container) {
        console.error('❌ characterSelect container not found');
        return;
    }
    container.innerHTML = '';
    console.log('✓ Container cleared, rendering characters...');

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
                <div class="ability-name">⭐ ${char.specialAbility.name}</div>
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
    document.getElementById('gameSetup').style.display = 'none';
    document.getElementById('gameBoard').style.display = 'block';

    // Initialize attempted routes tracking
    gameState.attemptedRoutes = {};

    // Select milestone routes FIRST (before initializing regular routes)
    selectMilestoneRoutes();
    
    initializeRoutes();
    initializeGearShop();
    renderGameBoard();
    addLog("Game started! Round 1 begins.");
    addLog("🏆 Milestone routes have been set! First player to complete all 3 wins the game!");
}

function initializeRoutes() {
    // Shuffle and select 5 bouldering routes
    const boulderingPool = [...ROUTES.bouldering].sort(() => Math.random() - 0.5);
    gameState.availableRoutes.bouldering = boulderingPool.slice(0, 5);

    // Lead climbing starts with 5 routes
    const leadPool = [...ROUTES.leadClimbing].sort(() => Math.random() - 0.5);
    gameState.availableRoutes.leadClimbing = leadPool.slice(0, 5);

    // Top rope starts with 5 routes
    const topRopePool = [...ROUTES.topRope].sort(() => Math.random() - 0.5);
    gameState.availableRoutes.topRope = topRopePool.slice(0, 5);
}

function initializeGearShop() {
    // Define access card names that should never be in random rotation
    const accessCardNames = ['Harness', 'Belay Device', 'Locking Carabiner', 'Lead Rope'];
    
    // Filter out access cards from the pool
    const nonAccessGear = GEAR_SHOP.filter(gear => !accessCardNames.includes(gear.name));
    
    // Shuffle and select 3 random gear items (excluding access cards)
    const gearPool = [...nonAccessGear].sort(() => Math.random() - 0.5);
    gameState.availableGear = gearPool.slice(0, 3);
}

function replaceGearInShop(purchasedGearName) {
    // Define access card names
    const accessCardNames = ['Harness', 'Belay Device', 'Locking Carabiner', 'Lead Rope'];
    
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
    renderRestArea();
    updateTurnIndicator();
}

function renderRestArea() {
    const container = document.getElementById('restAreaInfo');
    if (!container) return;

    // Add capacity indicator
    const playersHere = getPlayersInSection('rest');
    const capacity = getSectionCapacity('rest');
    container.innerHTML = `<div style="background: #e8f4f8; padding: 8px; border-radius: 5px; margin-bottom: 10px; font-size: 0.9em; border-left: 4px solid #007bff;">
        <strong>👥 Occupancy: ${playersHere.length}/${capacity}</strong>${playersHere.length > 0 ? `<br><span style="color: #666;">Players here: ${playersHere.map(p => `P${p.playerNum}`).join(', ')}</span>` : ''}
    </div>`;
}

function renderGameInfo() {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const routeClearingPositions = [
        { name: 'Bouldering ↔ Lead', next: 'Lead Climbing' },
        { name: 'Lead ↔ Top Rope', next: 'Top Rope' },
        { name: 'Top Rope ↔ Bouldering', next: 'Bouldering' }
    ];
    const currentPosition = routeClearingPositions[gameState.routeClearingPosition];

    document.getElementById('gameInfo').innerHTML = `
        <div class="info-box">
            <div class="info-label">Round</div>
            <div class="info-value">${gameState.round}</div>
        </div>
        <div class="info-box">
            <div class="info-label">Current Player</div>
            <div class="info-value">Player ${currentPlayer.playerNum}</div>
        </div>
        <div class="info-box">
            <div class="info-label">Belayers Available</div>
            <div class="info-value">${gameState.belayersUnlocked}</div>
        </div>
        <div class="info-box">
            <div class="info-label">🔄 Route Clearing Token</div>
            <div class="info-value" style="font-size: 1.1em;">${currentPosition.name}</div>
            <div style="font-size: 0.8em; color: #666; margin-top: 5px;">Next: ${currentPosition.next}</div>
        </div>
    `;
}

function updateTurnIndicator() {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    document.getElementById('turnIndicator').innerHTML = `
        🎯 Player ${currentPlayer.playerNum}'s Turn - ${currentPlayer.character.name}
        <br>Time Remaining: ${currentPlayer.character.timeRemaining} units
    `;
}

function renderPlayers() {
    const container = document.getElementById('playersContainer');
    container.innerHTML = '';

    gameState.players.forEach((player, idx) => {
        const char = player.character;

        // Ensure gearBonuses exists (for backward compatibility)
        if (!char.gearBonuses) {
            char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
        }

        const isCurrentPlayer = idx === gameState.currentPlayerIndex;

        const panel = document.createElement('div');
        panel.className = 'player-panel' + (isCurrentPlayer ? ' player-turn' : '');

        const endurancePercent = (char.currentEndurance / char.maxEndurance) * 100;
        const xpForLevel = XP_TABLE[char.level - 1];
        const xpProgress = char.level < 15 ? ((char.xp - xpForLevel.cumulative) / xpForLevel.needed) * 100 : 100;

        const totalStats = {
            strength: char.stats.strength + char.trainingBonuses.strength + char.gearBonuses.strength,
            technique: char.stats.technique + char.trainingBonuses.technique + char.gearBonuses.technique,
            focus: char.stats.focus + char.trainingBonuses.focus + char.gearBonuses.focus,
            flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility
        };

        const spendableXP = getSpendableXP(char);
        const xpToGo = getXPToNextLevel(char);
        
        // Calculate milestone progress
        const milestonesCompleted = Object.values(char.milestonesCompleted).filter(Boolean).length;
        const milestoneIcons = [
            char.milestonesCompleted.beginner ? '✅' : '⏳',
            char.milestonesCompleted.intermediate ? '✅' : '⏳',
            char.milestonesCompleted.expert ? '✅' : '⏳'
        ];

        panel.innerHTML = `
            <div class="player-header">
                <div>
                    <h3>Player ${player.playerNum}: ${char.name}</h3>
                    <div style="color: #667eea; font-weight: bold;">${char.archetype}</div>
                    <div style="margin-top: 8px; padding: 8px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; border-radius: 8px; font-weight: bold; font-size: 0.95em;">
                        🏆 Milestones: ${milestonesCompleted}/3 ${milestoneIcons.join(' ')}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.8em; font-weight: bold;">Level ${char.level}</div>
                    <div style="color: #666;">Total XP: ${char.xp}</div>
                    <div style="color: #28a745; font-weight: bold; font-size: 0.95em;">💰 Spendable: ${spendableXP} XP</div>
                    ${char.level < 15 ? `<div style="color: #ff9800; font-size: 0.9em;">🎯 ${xpToGo} XP to Level ${char.level + 1}</div>` : ''}
                </div>
            </div>

            <div class="player-stats">
                <div class="stat-box">
                    <div class="stat-label">Strength</div>
                    <div class="stat-value">
                        ${char.stats.strength}${char.trainingBonuses.strength > 0 || char.gearBonuses.strength > 0 ? ` <span style="color: #28a745;">(+${char.trainingBonuses.strength + char.gearBonuses.strength})</span>` : ''}${char.betaBoostActive ? ' <span style="color: #9c27b0; font-weight: bold;">(+3 ⚡)</span>' : ''}
                    </div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Technique</div>
                    <div class="stat-value">
                        ${char.stats.technique}${char.trainingBonuses.technique > 0 || char.gearBonuses.technique > 0 ? ` <span style="color: #28a745;">(+${char.trainingBonuses.technique + char.gearBonuses.technique})</span>` : ''}${char.betaBoostActive ? ' <span style="color: #9c27b0; font-weight: bold;">(+3 ⚡)</span>' : ''}
                    </div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Focus</div>
                    <div class="stat-value">
                        ${char.stats.focus}${char.trainingBonuses.focus > 0 || char.gearBonuses.focus > 0 ? ` <span style="color: #28a745;">(+${char.trainingBonuses.focus + char.gearBonuses.focus})</span>` : ''}${char.betaBoostActive ? ' <span style="color: #9c27b0; font-weight: bold;">(+3 ⚡)</span>' : ''}
                    </div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Flexibility</div>
                    <div class="stat-value">
                        ${char.stats.flexibility}${char.trainingBonuses.flexibility > 0 || char.gearBonuses.flexibility > 0 ? ` <span style="color: #28a745;">(+${char.trainingBonuses.flexibility + char.gearBonuses.flexibility})</span>` : ''}${char.betaBoostActive ? ' <span style="color: #9c27b0; font-weight: bold;">(+3 ⚡)</span>' : ''}
                    </div>
                </div>
            </div>

            <div>
                <strong>Endurance:</strong> ${char.currentEndurance} / ${char.maxEndurance}
                <div class="endurance-bar">
                    <div class="endurance-fill" style="width: ${endurancePercent}%">
                        ${Math.round(endurancePercent)}%
                    </div>
                </div>
            </div>

            <div>
                <strong>XP Progress to Level ${char.level < 15 ? char.level + 1 : 15}:</strong>
                <div class="xp-bar">
                    <div class="xp-fill" style="width: ${xpProgress}%">
                        ${char.level < 15 ? `${xpForLevel.needed - xpToGo} / ${xpForLevel.needed}` : 'MAX'}
                    </div>
                </div>
                ${char.level < 15 ? `<div style="font-size: 0.85em; color: #666; margin-top: 5px;">
                    Earned in this level: ${spendableXP} XP | Need ${xpToGo} more XP
                </div>` : ''}
            </div>

            <div style="margin-top: 15px;">
                <strong>⭐ ${char.specialAbility.name}</strong>
                <span style="padding: 3px 8px; border-radius: 4px; font-size: 0.85em; font-weight: bold; ${char.abilityUsed ? 'background: #dc3545; color: white;' : 'background: #28a745; color: white;'}">
                    ${char.abilityUsed ? '❌ Used' : '✅ Available'}
                </span>
                <div style="font-size: 0.9em; color: #666; margin-top: 5px;">${char.specialAbility.description}</div>
                ${char.betaBoostActive ? `<div style="margin-top: 8px; padding: 8px 12px; background: linear-gradient(135deg, #7b1fa2, #ce93d8); color: white; border-radius: 8px; font-weight: bold; text-align: center; font-size: 0.95em;">⚡ Beta Boost Active — +3 to all stats on next climb!</div>` : ''}
            </div>

            ${char.equipment.length > 0 ? `
                <div class="equipment-list">
                    ${char.equipment.map(e => `<div class="equipment-badge">${e}</div>`).join('')}
                </div>
            ` : ''}

            <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                <strong>Time Remaining: ${char.timeRemaining} units</strong>
            </div>

            <div style="margin-top: 10px; padding: 10px; background: #e8f4f8; border-radius: 5px; border-left: 4px solid #007bff;">
                <strong>📍 Location: ${formatLocationName(char.location)}</strong>
            </div>
        `;

        container.appendChild(panel);
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

    // Add capacity indicator
    const playersHere = getPlayersInSection('bouldering');
    const capacity = getSectionCapacity('bouldering');
    const capacityDiv = document.createElement('div');
    capacityDiv.style.cssText = 'background: #e8f4f8; padding: 8px; border-radius: 5px; margin-bottom: 10px; font-size: 0.9em; border-left: 4px solid #007bff;';
    capacityDiv.innerHTML = `<strong>👥 Occupancy: ${playersHere.length}/${capacity}</strong>${playersHere.length > 0 ? `<br><span style="color: #666;">Players here: ${playersHere.map(p => `P${p.playerNum}`).join(', ')}</span>` : ''}`;
    container.appendChild(capacityDiv);

    // Add route clearing indicator if this area will be cleared next
    if (gameState.routeClearingPosition === 2) {
        const indicator = document.createElement('div');
        indicator.className = 'route-clearing-indicator';
        indicator.innerHTML = '🔄 This area will be cleared at end of round';
        container.appendChild(indicator);
    }

    gameState.availableRoutes.bouldering.forEach((route, idx) => {
        container.appendChild(createRouteCard(route, 'bouldering', idx));
    });
}

function renderTopRopeRoutes() {
    const container = document.getElementById('topRopeRoutes');
    container.innerHTML = '';

    if (gameState.belayersUnlocked === 0) {
        container.innerHTML = '<p style="color: #666;">No belayers available yet. Wait until round 5.</p>';
        return;
    }

    // Check if player has access to this area
    const accessCheck = checkAreaAccess('topRope');
    
    if (!accessCheck.hasAccess) {
        // Show locked message but still display routes
        const lockedDiv = document.createElement('div');
        lockedDiv.style.cssText = 'padding: 15px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; margin-bottom: 15px;';
        lockedDiv.innerHTML = `
            <h4 style="color: #856404; margin-top: 0;">🔒 Area Locked</h4>
            <p style="color: #856404; margin-bottom: 10px;">Required gear to access:</p>
            <ul style="list-style: none; padding-left: 0; color: #856404; font-weight: bold;">
                ${accessCheck.missingItems.map(item => `<li>❌ ${item}</li>`).join('')}
            </ul>
        `;
        container.appendChild(lockedDiv);
    } else {
        // Add capacity indicator only if unlocked
        const playersHere = getPlayersInSection('topRope');
        const capacity = getSectionCapacity('topRope');
        const isFull = playersHere.length >= capacity;
        const capacityDiv = document.createElement('div');
        capacityDiv.style.cssText = `background: ${isFull ? '#ffe8e8' : '#e8f4f8'}; padding: 8px; border-radius: 5px; margin-bottom: 10px; font-size: 0.9em; border-left: 4px solid ${isFull ? '#dc3545' : '#007bff'};`;
        capacityDiv.innerHTML = `<strong>👥 Occupancy: ${playersHere.length}/${capacity}</strong> <span style="color: #666;">(${gameState.belayersUnlocked} belayer${gameState.belayersUnlocked > 1 ? 's' : ''})</span>${playersHere.length > 0 ? `<br><span style="color: #666;">Players here: ${playersHere.map(p => `P${p.playerNum}`).join(', ')}</span>` : ''}${isFull ? `<br><span style="color: #dc3545; font-weight: bold;">⚠️ FULL - No space available</span>` : ''}`;
        container.appendChild(capacityDiv);
    }

    // Add route clearing indicator if this area will be cleared next
    if (gameState.routeClearingPosition === 1) {
        const indicator = document.createElement('div');
        indicator.className = 'route-clearing-indicator';
        indicator.innerHTML = '🔄 This area will be cleared at end of round';
        container.appendChild(indicator);
    }

    // Always show routes, but disable if locked
    const isLocked = !accessCheck.hasAccess;
    gameState.availableRoutes.topRope.forEach((route, idx) => {
        const card = createRouteCard(route, 'topRope', idx);
        if (isLocked) {
            card.style.opacity = '0.3';
            card.style.pointerEvents = 'none';
            card.style.filter = 'grayscale(80%)';
        }
        container.appendChild(card);
    });
}

function renderLeadClimbingRoutes() {
    const container = document.getElementById('leadClimbingRoutes');
    container.innerHTML = '';

    // Check if player has access to this area
    const accessCheck = checkAreaAccess('leadClimbing');
    
    if (!accessCheck.hasAccess) {
        // Show locked message but still display routes
        const lockedDiv = document.createElement('div');
        lockedDiv.style.cssText = 'padding: 15px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; margin-bottom: 15px;';
        lockedDiv.innerHTML = `
            <h4 style="color: #856404; margin-top: 0;">🔒 Area Locked</h4>
            <p style="color: #856404; margin-bottom: 10px;">Required gear to access:</p>
            <ul style="list-style: none; padding-left: 0; color: #856404; font-weight: bold;">
                ${accessCheck.missingItems.map(item => `<li>❌ ${item}</li>`).join('')}
            </ul>
        `;
        container.appendChild(lockedDiv);
    } else {
        // Add capacity indicator only if unlocked
        const playersHere = getPlayersInSection('leadClimbing');
        const capacity = getSectionCapacity('leadClimbing');
        const isFull = playersHere.length >= capacity;
        const capacityDiv = document.createElement('div');
        capacityDiv.style.cssText = `background: ${isFull ? '#ffe8e8' : '#e8f4f8'}; padding: 8px; border-radius: 5px; margin-bottom: 10px; font-size: 0.9em; border-left: 4px solid ${isFull ? '#dc3545' : '#007bff'};`;
        capacityDiv.innerHTML = `<strong>👥 Occupancy: ${playersHere.length}/${capacity}</strong> <span style="color: #666;">(${gameState.belayersUnlocked} belayer${gameState.belayersUnlocked > 1 ? 's' : ''})</span>${playersHere.length > 0 ? `<br><span style="color: #666;">Players here: ${playersHere.map(p => `P${p.playerNum}`).join(', ')}</span>` : ''}${isFull ? `<br><span style="color: #dc3545; font-weight: bold;">⚠️ FULL - No space available</span>` : ''}`;
        container.appendChild(capacityDiv);
    }

    // Add route clearing indicator if this area will be cleared next
    if (gameState.routeClearingPosition === 0) {
        const indicator = document.createElement('div');
        indicator.className = 'route-clearing-indicator';
        indicator.innerHTML = '🔄 This area will be cleared at end of round';
        container.appendChild(indicator);
    }

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
    const statIcons = {
        strength: '💪',
        technique: '🎯',
        focus: '🧠',
        flexibility: '🤸'
    };

    const statNames = {
        strength: 'Str',
        technique: 'Tech',
        focus: 'Focus',
        flexibility: 'Flex'
    };

    let diceEffectsHTML = '';
    if (route.rollEffect && route.rollEffect.length > 0) {
        diceEffectsHTML = `
            <div style="margin-top: 8px; padding: 8px; background: #f0f8ff; border-radius: 5px; border-left: 4px solid #667eea;">
                <div style="font-weight: bold; font-size: 0.85em; margin-bottom: 5px; color: #667eea;">🎲 Dice Roll Effects:</div>
                <div style="display: flex; flex-direction: column; gap: 3px;">
                    ${route.rollEffect.map((effect, index) => {
                        const icon = statIcons[effect.stat];
                        const statName = statNames[effect.stat];
                        const isBuff = effect.modifier === -1;
                        const color = isBuff ? '#28a745' : '#dc3545';
                        const label = isBuff ? '↓ Easier' : '↑ Harder';
                        const sign = isBuff ? '-' : '+';
                        return `<div style="font-size: 0.8em; color: ${color}; font-weight: bold;">
                            Die ${index + 1}: ${sign}1d6 ${icon} ${statName} ${label}
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    const card = document.createElement('div');
    card.className = 'route-card';
    if (!canAttempt) card.style.opacity = '0.5';
    if (alreadyAttempted) {
        card.style.border = '3px solid #ffc107';
        card.style.background = '#fff3cd';
    }

    card.onclick = () => canAttempt && attemptClimb(route, area);

    card.innerHTML = `
        ${alreadyAttempted ? `
            <div style="background: #ffc107; color: #856404; padding: 5px 10px; border-radius: 5px;
                        margin-bottom: 8px; font-size: 0.85em; font-weight: bold; text-align: center;">
                ⚠️ Already Attempted This Round
            </div>
        ` : ''}
        <div class="route-name">${route.name}</div>
        <div class="route-grade">${route.grade}</div>
        ${playerHasGear.length > 0 ? `
            <div style="background: #d4edda; border: 2px solid #28a745; padding: 5px; border-radius: 5px; margin: 5px 0; font-size: 0.85em; font-weight: bold; color: #155724;">
                ✅ Gear Bonus: ${playerHasGear.join(', ')}
            </div>
        ` : ''}
        ${diceEffectsHTML}
        <div class="route-requirements">
            <div class="requirement ${totalStats.strength >= route.strength ? 'met' : 'unmet'}">
                💪 Str: ${route.strength}
            </div>
            <div class="requirement ${totalStats.technique >= route.technique ? 'met' : 'unmet'}">
                🎯 Tech: ${route.technique}
            </div>
            <div class="requirement ${totalStats.focus >= route.focus ? 'met' : 'unmet'}">
                🧠 Focus: ${route.focus}
            </div>
            <div class="requirement ${totalStats.flexibility >= route.flexibility ? 'met' : 'unmet'}">
                🤸 Flex: ${route.flexibility}
            </div>
        </div>
        <div class="route-costs">
            <span>⏱️ ${route.time} time</span>
            <span>💨 ${route.endurance} endurance</span>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 0.9em;">
            <div style="color: #28a745; font-weight: bold;">✅ Success: ${route.xpSuccess} XP</div>
            <div style="color: #dc3545; font-weight: bold;">❌ Fail: ${route.xpFail} XP</div>
        </div>
    `;

    return card;
}

function renderTraining() {
    const container = document.getElementById('trainingAreas');
    container.innerHTML = '';

    const statIcons = {
        strength: '💪',
        technique: '🎯',
        focus: '🧠',
        flexibility: '🤸'
    };

    TRAINING_AREAS.forEach(area => {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        const char = currentPlayer.character;

        // Check if this equipment is occupied
        const playersHere = getPlayersInSection(area.name);
        const isOccupied = playersHere.length > 0;
        const occupyingPlayer = isOccupied ? playersHere[0] : null;

        // Can train if: have resources AND (equipment is free OR current player is already using it)
        const canTrain = char.timeRemaining >= area.time &&
                        char.currentEndurance >= area.endurance &&
                        (!isOccupied || char.location === area.name);

        const div = document.createElement('div');
        div.style.marginBottom = '15px';
        div.style.padding = '15px';
        div.style.background = canTrain ? 'white' : '#f0f0f0';
        div.style.borderRadius = '8px';
        div.style.cursor = canTrain ? 'pointer' : 'not-allowed';
        div.style.border = isOccupied && occupyingPlayer.playerNum !== currentPlayer.playerNum ? '2px solid #dc3545' : '2px solid #ddd';
        div.style.opacity = !canTrain ? '0.6' : '1';

        div.onclick = () => canTrain && trainAction(area);

        div.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">${area.name}</div>
            ${isOccupied ? `
                <div style="background: ${occupyingPlayer.playerNum === currentPlayer.playerNum ? '#d4edda' : '#ffe8e8'}; padding: 6px; border-radius: 5px; margin-bottom: 8px; font-size: 0.85em; font-weight: bold; color: ${occupyingPlayer.playerNum === currentPlayer.playerNum ? '#155724' : '#721c24'};">
                    ${occupyingPlayer.playerNum === currentPlayer.playerNum ? '✅ You are here' : `⚠️ Occupied by Player ${occupyingPlayer.playerNum}`}
                </div>
            ` : `
                <div style="background: #d4edda; padding: 6px; border-radius: 5px; margin-bottom: 8px; font-size: 0.85em; font-weight: bold; color: #155724;">
                    ✓ Available
                </div>
            `}
            <div class="training-bonus">${statIcons[area.stat]} ${area.description}</div>
            <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
                ⏱️ ${area.time} time | 💨 ${area.endurance} endurance
            </div>
        `;

        container.appendChild(div);
    });
}

function renderStore() {
    const container = document.getElementById('gearShop');
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const char = currentPlayer.character;
    const spendableXP = getSpendableXP(char);
    const xpToGo = getXPToNextLevel(char);

    // Add capacity indicator
    const playersHere = getPlayersInSection('gearShop');
    const capacity = getSectionCapacity('gearShop');
    const capacityHTML = `<div style="background: #e8f4f8; padding: 8px; border-radius: 5px; margin-bottom: 10px; font-size: 0.9em; border-left: 4px solid #007bff;">
        <strong>👥 Occupancy: ${playersHere.length}/${capacity}</strong>${playersHere.length > 0 ? `<br><span style="color: #666;">Players here: ${playersHere.map(p => `P${p.playerNum}`).join(', ')}</span>` : ''}
    </div>`;

    container.innerHTML = capacityHTML + `<p style="margin-bottom: 10px; color: #666;">
        Purchase items with XP earned in your current level<br>
        <strong style="color: #28a745;">💰 Spendable: ${spendableXP} XP</strong> |
        <strong style="color: #ff9800;">🎯 ${xpToGo} XP to next level</strong>
    </p>`;

    const hasGearBag = char.equipment.includes('Gear Bag');
    const canVisitStore = hasGearBag || char.timeRemaining >= 1;

    // ===== SECTION 1: ESSENTIAL ACCESS GEAR (Always visible) =====
    const accessGearSection = document.createElement('div');
    accessGearSection.style.cssText = 'background: #fff9e6; border: 2px solid #ffc107; border-radius: 10px; padding: 15px; margin-bottom: 20px;';
    accessGearSection.innerHTML = '<h3 style="margin: 0 0 10px 0; color: #856404; font-size: 1.1em;">🔑 Essential Access Gear (Required for Areas)</h3>';
    
    // Define the 4 essential access cards
    const accessCardNames = ['Harness', 'Belay Device', 'Locking Carabiner', 'Lead Rope'];
    const accessCards = GEAR_SHOP.filter(g => accessCardNames.includes(g.name));
    
    accessCards.forEach(gear => {
        const owned = char.equipment.includes(gear.name);
        const canAfford = !owned && canVisitStore && spendableXP >= gear.cost;

        // Check prerequisites
        let prerequisitesMet = true;
        let prerequisiteText = '';
        
        if (gear.prerequisiteLevel && char.level < gear.prerequisiteLevel) {
            prerequisitesMet = false;
            prerequisiteText += `<div style="color: #dc3545; font-size: 0.85em; margin-top: 5px;">⚠️ Requires Level ${gear.prerequisiteLevel}</div>`;
        }
        
        if (gear.prerequisiteItems && gear.prerequisiteItems.length > 0) {
            const missingItems = gear.prerequisiteItems.filter(item => !char.equipment.includes(item));
            if (missingItems.length > 0) {
                prerequisitesMet = false;
                prerequisiteText += `<div style="color: #dc3545; font-size: 0.85em; margin-top: 5px;">⚠️ Requires: ${missingItems.join(', ')}</div>`;
            }
        }

        const card = document.createElement('div');
        card.className = 'gear-card access-gear-card' + (owned ? ' owned' : '') + (!prerequisitesMet ? ' locked' : '');
        if (!owned && (!canAfford || !prerequisitesMet)) card.style.opacity = '0.5';

        card.onclick = () => !owned && canAfford && prerequisitesMet && purchaseGear(gear);

        card.innerHTML = `
            <div class="gear-name">${gear.name} ${owned ? '✓' : ''}</div>
            <div class="gear-category" style="font-size: 0.8em; color: #6c757d; margin-bottom: 5px;">${gear.category}</div>
            <div class="gear-cost">${gear.cost} XP</div>
            ${prerequisiteText}
            <div style="background: #f0f8ff; padding: 8px; border-radius: 5px; margin: 8px 0; font-weight: bold; color: #007bff; font-size: 0.9em;">
                ${gear.effectDisplay}
            </div>
            <div class="gear-effect" style="font-size: 0.85em; color: #666; font-style: italic;">
                ${gear.description}
            </div>
            ${gear.accessRequirement ? `<div style="background: #d4edda; padding: 6px; border-radius: 4px; margin-top: 8px; font-size: 0.85em; color: #155724; font-weight: bold;">🔓 Unlocks ${gear.accessRequirement} Access</div>` : ''}
        `;

        accessGearSection.appendChild(card);
    });
    
    container.appendChild(accessGearSection);

    // ===== SECTION 2: AVAILABLE GEAR (Rotating selection) =====
    const availableGearSection = document.createElement('div');
    availableGearSection.innerHTML = '<h3 style="margin: 0 0 10px 0; color: #333; font-size: 1.1em;">🎒 Available Gear</h3>';
    
    gameState.availableGear.forEach(gear => {
        const owned = char.equipment.includes(gear.name);
        const canAfford = !owned && canVisitStore && spendableXP >= gear.cost;

        // Check prerequisites
        let prerequisitesMet = true;
        let prerequisiteText = '';
        
        if (gear.prerequisiteLevel && char.level < gear.prerequisiteLevel) {
            prerequisitesMet = false;
            prerequisiteText += `<div style="color: #dc3545; font-size: 0.85em; margin-top: 5px;">⚠️ Requires Level ${gear.prerequisiteLevel}</div>`;
        }
        
        if (gear.prerequisiteItems && gear.prerequisiteItems.length > 0) {
            const missingItems = gear.prerequisiteItems.filter(item => !char.equipment.includes(item));
            if (missingItems.length > 0) {
                prerequisitesMet = false;
                prerequisiteText += `<div style="color: #dc3545; font-size: 0.85em; margin-top: 5px;">⚠️ Requires: ${missingItems.join(', ')}</div>`;
            }
        }

        const card = document.createElement('div');
        card.className = 'gear-card' + (owned ? ' owned' : '') + (!prerequisitesMet ? ' locked' : '');
        if (!owned && (!canAfford || !prerequisitesMet)) card.style.opacity = '0.5';

        card.onclick = () => !owned && canAfford && prerequisitesMet && purchaseGear(gear);

        card.innerHTML = `
            <div class="gear-name">${gear.name} ${owned ? '✓' : ''}</div>
            <div class="gear-category" style="font-size: 0.8em; color: #6c757d; margin-bottom: 5px;">${gear.category}</div>
            <div class="gear-cost">${gear.cost} XP</div>
            ${prerequisiteText}
            <div style="background: #f0f8ff; padding: 8px; border-radius: 5px; margin: 8px 0; font-weight: bold; color: #007bff; font-size: 0.9em;">
                ${gear.effectDisplay}
            </div>
            <div class="gear-effect" style="font-size: 0.85em; color: #666; font-style: italic;">
                ${gear.description}
            </div>
            ${gear.accessRequirement ? `<div style="background: #d4edda; padding: 6px; border-radius: 4px; margin-top: 8px; font-size: 0.85em; color: #155724; font-weight: bold;">🔓 Unlocks ${gear.accessRequirement} Access</div>` : ''}
        `;

        availableGearSection.appendChild(card);
    });
    
    container.appendChild(availableGearSection);
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
        const use = confirm(`🌟 Use Versatility – Stat Redistribution?\n\nMove up to 10 points between any two stats for this climb.\n\nThis can only be used once per round.`);
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
            e.modifier === 1 ? {...e, modifier: 0, abilityNeutralized: true} : e
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
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const char = currentPlayer.character;

    // Check if player can enter this section
    const locationCheck = canEnterSection(area, currentPlayer.playerNum);
    if (!locationCheck.canEnter) {
        alert(`Cannot climb here!\n\n${locationCheck.reason}`);
        return;
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

    // Move player to this section
    movePlayerToSection(currentPlayer.playerNum, area);

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
            alert('⚠️ Life or Die: You can only attempt routes you are guaranteed to complete!\n\nYour stats must meet all base requirements.');
            return;
        }
    }

    // ABILITY: Apply stat modifications (beta boost passive + Versatility redistribution)
    totalStats = applyAbilityToStats(char, activatedAbility, totalStats);

    // Build local roll effect array (allows Sprinter to add extra Focus nerf without mutating route data)
    let effectRollArray = route.rollEffect ? [...route.rollEffect] : [];

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
    let xpGained = success ? route.xpSuccess : route.xpFail;
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

    // Show result modal
    showClimbResult(route, rolls, diceToUse, totalStats, effectiveRequirements, diceEffects, success, xpGained, activatedAbility);

    // Add log with ability notation
    const abilityLog = activatedAbility ? ` (${activatedAbility})` : '';
    addLog(`Player ${currentPlayer.playerNum} ${success ? 'completed' : 'failed'} ${route.name} (${route.grade})${abilityLog} - ${xpGained} XP gained`);

    // Check if turn should end
    checkTurnEnd();
    renderGameBoard();
}

function showClimbResult(route, rolls, diceUsed, stats, effectiveReqs, diceEffects, success, xpGained, activatedAbility) {
    const modal = document.getElementById('climbModal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    title.textContent = route.name + ' - ' + route.grade;

    const statIcons = {
        strength: '💪',
        technique: '🎯',
        focus: '🧠',
        flexibility: '🤸'
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
            let sign = effect.modifier === -1 ? '-' : '+';
            let color = effect.modifier === -1 ? '#28a745' : '#dc3545';
            
            // Handle neutralized dice
            if (effect.modifier === 0 && effect.abilityNeutralized) {
                sign = '~';
                color = '#6c757d';
            } else if (effect.modifier === 0) {
                sign = '±';
                color = '#6c757d';
            }
            
            const neutralizedText = effect.abilityNeutralized ? ' <span style="color: #ffc107;">(Neutralized by Ability)</span>' : '';
            return `<div style="margin: 5px 0; color: ${color}; font-weight: bold;">
                Die ${index + 1}: 🎲 ${effect.die} → ${sign}${effect.die} ${icon} ${statName}${neutralizedText}
            </div>`;
        }).join('');
    }

    body.innerHTML = `
        <div class="result-box ${success ? 'result-success' : 'result-failure'}">
            <div class="result-text">
                ${success ? '✅ CLIMB SUCCESSFUL!' : '❌ CLIMB FAILED'}
            </div>
            <div class="result-details">
                <strong>XP Gained: ${xpGained}</strong>
            </div>
        </div>

        <h3>Dice Rolls:</h3>
        <div class="dice-container">
            ${rolls.map((r, i) => `
                <div class="die" style="${diceUsed.includes(r) ? '' : 'opacity: 0.3;'}">
                    ${r}
                </div>
            `).join('')}
        </div>
        ${rolls.length > diceUsed.length ? `<p style="text-align: center; margin-top: 10px; font-size: 0.9em; color: #666;">
            (Rolled ${rolls.length} dice, used best ${diceUsed.length})
        </p>` : ''}

        <h3 style="margin-top: 20px;">Dice Effects:</h3>
        <div style="display: grid; gap: 10px; margin-bottom: 20px;">
            ${diceEffectsHTML}
        </div>

        <h3 style="margin-top: 20px;">Requirements Check:</h3>
        <div class="route-requirements">
            <div class="requirement ${stats.strength >= effectiveReqs.strength ? 'met' : 'unmet'}">
                💪 Strength: ${stats.strength} vs ${effectiveReqs.strength} required
            </div>
            <div class="requirement ${stats.technique >= effectiveReqs.technique ? 'met' : 'unmet'}">
                🎯 Technique: ${stats.technique} vs ${effectiveReqs.technique} required
            </div>
            <div class="requirement ${stats.focus >= effectiveReqs.focus ? 'met' : 'unmet'}">
                🧠 Focus: ${stats.focus} vs ${effectiveReqs.focus} required
            </div>
            <div class="requirement ${stats.flexibility >= effectiveReqs.flexibility ? 'met' : 'unmet'}">
                🤸 Flexibility: ${stats.flexibility} vs ${effectiveReqs.flexibility} required
            </div>
        </div>
    `;

    modal.classList.add('show');
}

function trainAction(area) {
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
        strength: '💪',
        technique: '🎯',
        focus: '🧠',
        flexibility: '🤸'
    };

    const newTotal = char.trainingBonuses[area.stat];
    addLog(`Player ${currentPlayer.playerNum} trained at ${area.name} - gained +${area.bonus} ${statIcons[area.stat]} ${area.stat} (total training bonus: +${newTotal})`);

    checkTurnEnd();
    renderGameBoard();
}

function restAction() {
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
        addLog(`Player ${currentPlayer.playerNum}: ⚡ Beta Boost active — +3 to all stats on next climb!`);
    }

    checkTurnEnd();
    renderGameBoard();
}

// ===== MILESTONE ROUTE ATTEMPTS =====

function attemptMilestoneRoute(difficulty) {
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
    
    // Check if player can enter this section (includes capacity checks for belayers)
    const locationCheck = canEnterSection(area, currentPlayer.playerNum);
    if (!locationCheck.canEnter) {
        alert(`Cannot attempt this milestone route!\n\n${locationCheck.reason}`);
        return;
    }
    
    // Check prerequisites for the route area (Free Solo bypasses equipment requirements)
    if (char.key !== 'freeSolo') {
        if (area === 'topRope' || area === 'leadClimbing') {
            if (!char.equipment.includes('Harness') || !char.equipment.includes('Belay Device')) {
                alert(`You need a Harness and Belay Device to attempt ${area === 'topRope' ? 'Top Rope' : 'Lead'} routes!`);
                return;
            }
        }

        if (area === 'leadClimbing') {
            if (!char.equipment.includes('Locking Carabiner') || !char.equipment.includes('Lead Rope')) {
                alert('You need a Locking Carabiner and Lead Rope to attempt Lead Climbing routes!');
                return;
            }
        }
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
            alert('⚠️ Life or Die: You can only attempt routes you are guaranteed to complete!\n\nYour stats must meet all base requirements.');
            return;
        }
    }

    // Move player to this section (important for capacity tracking)
    movePlayerToSection(currentPlayer.playerNum, area);

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
    let effectRollArray = route.rollEffect ? [...route.rollEffect] : [];

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
    let xpGained = success ? route.xpSuccess : route.xpFail;
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
    if (success) {
        char.milestonesCompleted[difficulty] = true;
        addLog(`🏆 Player ${currentPlayer.playerNum} completed the ${difficulty.toUpperCase()} milestone: ${route.name}!`);

        // Check for victory
        checkVictory(currentPlayer);
    } else {
        addLog(`Player ${currentPlayer.playerNum} attempted ${difficulty} milestone "${route.name}" but failed. Gained ${xpGained} XP.`);
    }

    // Show result modal
    showClimbResultModal(route, area, rolls, diceUsed, diceEffects, effectiveReqs, stats, success, xpGained);

    checkTurnEnd();
    renderGameBoard();
}

function checkVictory(player) {
    const milestones = player.character.milestonesCompleted;
    
    if (milestones.beginner && milestones.intermediate && milestones.expert) {
        gameState.gameEnded = true;
        gameState.winner = player;
        
        addLog(`🎉🎉🎉 GAME OVER! Player ${player.playerNum} (${player.character.name}) has completed all milestone routes and WINS THE GAME! 🎉🎉🎉`);
        
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
            <h1 style="font-size: 3em; margin-bottom: 20px;">🎉 GAME OVER! 🎉</h1>
            <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; border-radius: 15px; margin-bottom: 30px;">
                <h2 style="font-size: 2.5em; margin: 0 0 10px 0;">🏆 WINNER 🏆</h2>
                <h3 style="font-size: 2em; margin: 0;">Player ${winner.playerNum}</h3>
                <p style="font-size: 1.5em; margin: 10px 0 0 0;">${winner.character.name}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3 style="margin-top: 0;">Final Stats</h3>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; text-align: left;">
                    <div><strong>✅ Milestones:</strong> 3/3 Complete</div>
                    <div><strong>📊 Level:</strong> ${winner.character.level}</div>
                    <div><strong>⭐ Total XP:</strong> ${winner.character.xp}</div>
                    <div><strong>💪 Strength:</strong> ${winner.character.stats.strength}</div>
                    <div><strong>🎯 Technique:</strong> ${winner.character.stats.technique}</div>
                    <div><strong>🧠 Focus:</strong> ${winner.character.stats.focus}</div>
                    <div><strong>🤸 Flexibility:</strong> ${winner.character.stats.flexibility}</div>
                    <div><strong>💨 Endurance:</strong> ${winner.character.maxEndurance}</div>
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
                <span>🏆 ${milestonesCount}/3 | Level ${player.character.level} | ${player.character.xp} XP</span>
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
            alert(`This gear requires the following items:\n\n${missingItems.map(i => `❌ ${i}`).join('\n')}\n\nPurchase these items first.`);
            return;
        }
    }

    // Move player to gear shop
    movePlayerToSection(currentPlayer.playerNum, 'gearShop');

    const spendableXP = getSpendableXP(char);
    const xpToGo = getXPToNextLevel(char);

    if (spendableXP < gear.cost) {
        alert(`Not enough spendable XP!\n\nYou have ${spendableXP} XP earned in Level ${char.level}.\nYou need ${gear.cost} XP to purchase this item.\n\nCurrently ${xpToGo} XP away from Level ${char.level + 1}.`);
        return;
    }

    // Check if has Gear Bag for free shop visit
    const hasGearBag = char.equipment.includes('Gear Bag');
    const timeCost = hasGearBag ? 0 : 1;
    
    char.timeRemaining -= timeCost;
    char.xp -= gear.cost;

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

    addLog(`Player ${currentPlayer.playerNum} purchased ${gear.name} for ${gear.cost} XP${timeCost === 0 ? ' (Gear Bag: free visit)' : ''} (now ${newXpToGo} XP to Level ${char.level + 1})`);

    // Replace purchased gear with new one
    replaceGearInShop(gear.name);

    checkTurnEnd();
    renderGameBoard();
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

        // Log level up with stat changes
        const playerNum = gameState.players.find(p => p.character === char).playerNum;
        addLog(`🎉 Player ${playerNum} leveled up to Level ${char.level}!`);
        addLog(`   💪 Strength: ${oldStats.strength} → ${char.stats.strength} (+${char.stats.strength - oldStats.strength})`);
        addLog(`   🎯 Technique: ${oldStats.technique} → ${char.stats.technique} (+${char.stats.technique - oldStats.technique})`);
        addLog(`   🧠 Focus: ${oldStats.focus} → ${char.stats.focus} (+${char.stats.focus - oldStats.focus})`);
        addLog(`   🤸 Flexibility: ${oldStats.flexibility} → ${char.stats.flexibility} (+${char.stats.flexibility - oldStats.flexibility})`);
        addLog(`   💨 Max Endurance: ${oldStats.maxEndurance} → ${char.maxEndurance} (+${char.maxEndurance - oldStats.maxEndurance})`);
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
        gameState.currentPlayerIndex = nextPlayerIndex;
        addLog(`Turn passes to Player ${gameState.players[nextPlayerIndex].playerNum} (${maxTime} time remaining)`);
    }

    renderGameBoard();
}

function nextPlayer() {
    // This function is now replaced by determineNextPlayer
    // Keeping it for backwards compatibility in case it's called elsewhere
    determineNextPlayer();
}

function endRound() {
    addLog(`Round ${gameState.round} ended!`);

    // Route clearing
    clearRoutes();

    // Reset player time, abilities, and locations (training bonuses are permanent and not reset)
    gameState.players.forEach(player => {
        player.character.timeRemaining = 10;
        player.character.abilityUsed = false;
        player.character.location = 'lobby'; // Return all players to lobby
    });

    // Clear all attempted routes for new round
    gameState.attemptedRoutes = {};

    // Check for new belayers
    if (gameState.round === 5) {
        gameState.belayersUnlocked = 2;
        addLog('Second belayer unlocked!');
    } else if (gameState.round === 12) {
        gameState.belayersUnlocked = 3;
        addLog('Third belayer unlocked!');
    }

    gameState.round++;
    gameState.currentPlayerIndex = 0;

    addLog(`Round ${gameState.round} begins!`);
    renderGameBoard();
}

function clearRoutes() {
    // Route clearing mechanic:
    // Position 0: between bouldering and lead → clear lead climbing (next clockwise)
    // Position 1: between lead and top rope → clear top rope (next clockwise)
    // Position 2: between top rope and bouldering → clear bouldering (next clockwise)

    const positionNames = ['Bouldering ↔ Lead Climbing', 'Lead Climbing ↔ Top Rope', 'Top Rope ↔ Bouldering'];
    addLog(`🔄 Route Clearing: Token is at ${positionNames[gameState.routeClearingPosition]}`);

    // Clear the next area in clockwise rotation
    if (gameState.routeClearingPosition === 0) {
        // Token between bouldering and lead → clear lead climbing
        const leadPool = [...ROUTES.leadClimbing].sort(() => Math.random() - 0.5);
        gameState.availableRoutes.leadClimbing = leadPool.slice(0, 5);
        addLog('🧗 Lead climbing routes refreshed and reset');
    } else if (gameState.routeClearingPosition === 1) {
        // Token between lead and top rope → clear top rope
        const topRopePool = [...ROUTES.topRope].sort(() => Math.random() - 0.5);
        gameState.availableRoutes.topRope = topRopePool.slice(0, 5);
        addLog('⛰️ Top rope routes refreshed and reset');
    } else {
        // Token between top rope and bouldering → clear bouldering
        const boulderingPool = [...ROUTES.bouldering].sort(() => Math.random() - 0.5);
        gameState.availableRoutes.bouldering = boulderingPool.slice(0, 5);
        addLog('🪨 Bouldering routes refreshed and reset');
    }

    // Move the token clockwise to the next position
    gameState.routeClearingPosition = (gameState.routeClearingPosition + 1) % 3;
    addLog(`➡️ Route clearing token moves to ${positionNames[gameState.routeClearingPosition]}`);
}

function closeModal() {
    document.getElementById('climbModal').classList.remove('show');
}

// Make sure functions are globally accessible
window.startCharacterSelect = startCharacterSelect;
window.startGame = startGame;
window.closeModal = closeModal;
window.restAction = restAction;
window.attemptMilestoneRoute = attemptMilestoneRoute;

// Initialize on page load
window.onload = function() {
    console.log('✅ game.js fully loaded and initialized');
    console.log('startCharacterSelect function exists:', typeof startCharacterSelect !== 'undefined');
    console.log('window.startCharacterSelect function exists:', typeof window.startCharacterSelect !== 'undefined');
    // Game is ready to start
};
