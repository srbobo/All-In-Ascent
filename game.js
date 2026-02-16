// ===== GAME DATA =====

const CHARACTERS = {
    powerhouse: {
        name: "The Powerhouse",
        archetype: "Power Climber",
        description: "A gym rat who focuses on raw pulling power and campus board training. Dominates overhang routes.",
        startingStats: { strength: 25, technique: 12, focus: 15, flexibility: 13 },
        startingEndurance: 95,
        growth: { strength: 4.5, technique: 1.5, focus: 2, flexibility: 1.5, endurance: 6 },
        specialAbility: {
            name: "Muscle Memory",
            description: "Once per round, re-roll any Strength check and take the better result",
            used: false
        }
    },
    technician: {
        name: "The Technician",
        archetype: "Precision Specialist",
        description: "A movement artist who reads sequences perfectly and wastes no energy on inefficient beta.",
        startingStats: { strength: 12, technique: 26, focus: 18, flexibility: 14 },
        startingEndurance: 100,
        growth: { strength: 1.5, technique: 4.5, focus: 2.5, flexibility: 2, endurance: 5 },
        specialAbility: {
            name: "Perfect Beta",
            description: "Ignore one nerf dice penalty per climb (converts +1d6 to 0)",
            used: false
        }
    },
    zenMaster: {
        name: "The Zen Master",
        archetype: "Mental Warrior",
        description: "Maintains perfect composure under pressure. Never lets fear dictate climbing decisions.",
        startingStats: { strength: 14, technique: 16, focus: 24, flexibility: 12 },
        startingEndurance: 105,
        growth: { strength: 2, technique: 2.5, focus: 4.5, flexibility: 1.5, endurance: 7 },
        specialAbility: {
            name: "Unshakeable",
            description: "Once per round, ignore all Focus requirements on a single climb attempt",
            used: false
        }
    },
    contortionist: {
        name: "The Contortionist",
        archetype: "Flexibility Expert",
        description: "Can reach holds others can't and squeeze into impossible positions with ease.",
        startingStats: { strength: 13, technique: 15, focus: 14, flexibility: 24 },
        startingEndurance: 90,
        growth: { strength: 1.5, technique: 2.5, focus: 2, flexibility: 4.5, endurance: 4 },
        specialAbility: {
            name: "Elastic Advantage",
            description: "Once per round, treat any Flexibility requirement as 10 points lower",
            used: false
        }
    },
    allRounder: {
        name: "The All-Rounder",
        archetype: "Balanced Climber",
        description: "Jack of all trades who adapts to any climbing style with consistent performance.",
        startingStats: { strength: 18, technique: 18, focus: 18, flexibility: 18 },
        startingEndurance: 100,
        growth: { strength: 3, technique: 3, focus: 3, flexibility: 3, endurance: 5 },
        specialAbility: {
            name: "Versatile",
            description: "Once per round, redistribute up to 10 stat points between any two stats for a single climb",
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
            description: "Reduce time cost of any climb by 2 units (minimum 1), but gain only half XP on success",
            used: false
        }
    },
    ironLung: {
        name: "The Iron Lung",
        archetype: "Endurance Athlete",
        description: "Built for the long haul with incredible stamina. Can climb all day without tiring.",
        startingStats: { strength: 16, technique: 17, focus: 19, flexibility: 14 },
        startingEndurance: 120,
        growth: { strength: 2.5, technique: 2.5, focus: 3, flexibility: 2, endurance: 8 },
        specialAbility: {
            name: "Endless Stamina",
            description: "When resting, recover 50% more endurance than normal (rounded up)",
            used: false
        }
    },
    boulderer: {
        name: "The Boulderer",
        archetype: "Problem Crusher",
        description: "Specializes in powerful sequences. Thrives on V-grade challenges.",
        startingStats: { strength: 23, technique: 16, focus: 14, flexibility: 12 },
        startingEndurance: 90,
        growth: { strength: 4.5, technique: 2.5, focus: 2, flexibility: 1, endurance: 5 },
        specialAbility: {
            name: "Boulder Bias",
            description: "On Bouldering climbs only: roll 3 dice instead of 2 and choose the best 2 results",
            used: false
        }
    },
    slabDancer: {
        name: "The Slab Dancer",
        archetype: "Balance Master",
        description: "Moves like water on vertical terrain. Trusts footwork over brute force.",
        startingStats: { strength: 11, technique: 23, focus: 20, flexibility: 16 },
        startingEndurance: 100,
        growth: { strength: 1.5, technique: 4, focus: 3, flexibility: 2.5, endurance: 6 },
        specialAbility: {
            name: "Friction Trust",
            description: "On Slab routes only: ignore one buff dice (converts -1d6 to 0) to gain +5 permanent to Technique checks",
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
            name: "Preview Vision",
            description: "Once per round, before attempting a climb, may look at all requirements and roll effects, then decide whether to attempt",
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
        { name: "Beginner's Fortune", grade: "V0", strength: 15, technique: 20, focus: 15, flexibility: 10, time: 2, endurance: 12, xpSuccess: 25, xpFail: 8, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Climbing Shoes"] },
        { name: "Warm-Up Wonder", grade: "V1", strength: 22, technique: 25, focus: 18, flexibility: 20, time: 2, endurance: 16, xpSuccess: 32, xpFail: 12, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [] },
        { name: "Crimson Ladder", grade: "V2", strength: 30, technique: 28, focus: 25, flexibility: 22, time: 2, endurance: 22, xpSuccess: 42, xpFail: 16, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: ["Finger Tape"] },
        { name: "Toe Hook Traverse", grade: "V3", strength: 32, technique: 35, focus: 30, flexibility: 28, time: 3, endurance: 28, xpSuccess: 52, xpFail: 22, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: ["Climbing Shoes"] },
        { name: "Crimper's Delight", grade: "V4", strength: 45, technique: 40, focus: 35, flexibility: 28, time: 4, endurance: 36, xpSuccess: 65, xpFail: 30, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: -1 }], gearModifiers: ["Finger Tape"] },
        { name: "Dyno Dilemma", grade: "V5", strength: 52, technique: 38, focus: 36, flexibility: 30, time: 4, endurance: 46, xpSuccess: 78, xpFail: 38, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [] },
        { name: "Heel Hook Heaven", grade: "V6", strength: 48, technique: 50, focus: 44, flexibility: 42, time: 4, endurance: 56, xpSuccess: 90, xpFail: 46, rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'flexibility', modifier: -1 }], gearModifiers: ["Climbing Shoes"] },
        { name: "The Roof of Doom", grade: "V7", strength: 58, technique: 48, focus: 42, flexibility: 40, time: 5, endurance: 64, xpSuccess: 100, xpFail: 54, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Chalk Bag"] },
        { name: "Shoulder Shredder", grade: "V8", strength: 65, technique: 48, focus: 44, flexibility: 40, time: 5, endurance: 72, xpSuccess: 100, xpFail: 62, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'technique', modifier: 1 }], gearModifiers: ["Chalk Bag"] },
        { name: "Dyno Chain", grade: "V9", strength: 70, technique: 52, focus: 50, flexibility: 44, time: 5, endurance: 80, xpSuccess: 100, xpFail: 70, rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: -1 }], gearModifiers: ["Chalk Bag"] },
        { name: "Precision Impossible", grade: "V10", strength: 58, technique: 70, focus: 68, flexibility: 58, time: 5, endurance: 88, xpSuccess: 100, xpFail: 78, rollEffect: [{ stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [] },
        { name: "The Impossible Pinch", grade: "V11", strength: 80, technique: 64, focus: 60, flexibility: 52, time: 5, endurance: 96, xpSuccess: 100, xpFail: 86, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: -1 }], gearModifiers: [] },
        { name: "Project Zero", grade: "V12", strength: 82, technique: 72, focus: 70, flexibility: 58, time: 6, endurance: 100, xpSuccess: 100, xpFail: 90, rollEffect: [{ stat: 'technique', modifier: 1 }, { stat: 'focus', modifier: 1 }], gearModifiers: [] }
    ],
    topRope: [
        { name: "First Timer's Friend", grade: "5.6", strength: 20, technique: 18, focus: 15, flexibility: 12, time: 3, endurance: 15, xpSuccess: 30, xpFail: 10, rollEffect: [{ stat: 'technique', modifier: -1 }], gearModifiers: ["Harness"] },
        { name: "Learning Curve", grade: "5.8", strength: 30, technique: 28, focus: 26, flexibility: 22, time: 4, endurance: 25, xpSuccess: 42, xpFail: 18, rollEffect: [{ stat: 'technique', modifier: -1 }], gearModifiers: ["Climbing Shoes"] },
        { name: "The Standard", grade: "5.9", strength: 38, technique: 34, focus: 30, flexibility: 26, time: 4, endurance: 35, xpSuccess: 55, xpFail: 26, rollEffect: [{ stat: 'strength', modifier: -1 }], gearModifiers: [] },
        { name: "Crimson Wall", grade: "5.10a", strength: 40, technique: 38, focus: 35, flexibility: 30, time: 5, endurance: 40, xpSuccess: 62, xpFail: 30, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Finger Tape"] },
        { name: "Overhang Initiation", grade: "5.10b", strength: 45, technique: 38, focus: 34, flexibility: 30, time: 5, endurance: 48, xpSuccess: 70, xpFail: 36, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"] },
        { name: "Crimp Central", grade: "5.10d", strength: 50, technique: 46, focus: 42, flexibility: 36, time: 5, endurance: 56, xpSuccess: 80, xpFail: 44, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Finger Tape"] },
        { name: "Power Climb", grade: "5.11b", strength: 56, technique: 48, focus: 44, flexibility: 38, time: 6, endurance: 66, xpSuccess: 92, xpFail: 54, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [] },
        { name: "Sustained Difficulty", grade: "5.11c", strength: 58, technique: 52, focus: 50, flexibility: 44, time: 6, endurance: 70, xpSuccess: 98, xpFail: 58, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"] },
        { name: "Dynamic Moves", grade: "5.12a", strength: 62, technique: 56, focus: 54, flexibility: 48, time: 6, endurance: 78, xpSuccess: 100, xpFail: 66, rollEffect: [{ stat: 'focus', modifier: 1 }], gearModifiers: [] },
        { name: "The Power Endurance", grade: "5.12b", strength: 68, technique: 60, focus: 58, flexibility: 54, time: 7, endurance: 84, xpSuccess: 100, xpFail: 72, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"] },
        { name: "Micro Hold Heaven", grade: "5.12d", strength: 66, technique: 66, focus: 64, flexibility: 58, time: 6, endurance: 90, xpSuccess: 100, xpFail: 78, rollEffect: [{ stat: 'technique', modifier: 1 }], gearModifiers: ["Finger Tape"] },
        { name: "The Upper Echelon", grade: "5.13a", strength: 72, technique: 68, focus: 66, flexibility: 60, time: 7, endurance: 92, xpSuccess: 100, xpFail: 80, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [] },
        { name: "Professional Grade", grade: "5.13c", strength: 80, technique: 74, focus: 72, flexibility: 66, time: 7, endurance: 100, xpSuccess: 100, xpFail: 88, rollEffect: [{ stat: 'technique', modifier: 1 }], gearModifiers: [] }
    ],
    leadClimbing: [
        { name: "Lead Introduction", grade: "5.8", strength: 30, technique: 28, focus: 30, flexibility: 22, time: 4, endurance: 25, xpSuccess: 40, xpFail: 15, rollEffect: [{ stat: 'focus', modifier: -1 }], gearModifiers: ["Harness", "Lead Rope"] },
        { name: "Clip and Climb", grade: "5.9", strength: 38, technique: 34, focus: 36, flexibility: 28, time: 4, endurance: 32, xpSuccess: 48, xpFail: 22, rollEffect: [{ stat: 'focus', modifier: -1 }], gearModifiers: ["Harness", "Belay Device"] },
        { name: "First Overhang Lead", grade: "5.10a", strength: 42, technique: 38, focus: 40, flexibility: 30, time: 5, endurance: 35, xpSuccess: 52, xpFail: 24, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [] },
        { name: "Pump Management", grade: "5.10b", strength: 45, technique: 44, focus: 46, flexibility: 34, time: 6, endurance: 40, xpSuccess: 58, xpFail: 28, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"] },
        { name: "Power Lead", grade: "5.10d", strength: 52, technique: 48, focus: 50, flexibility: 38, time: 6, endurance: 50, xpSuccess: 70, xpFail: 36, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Chalk Bag"] },
        { name: "The Steep Lead", grade: "5.11a", strength: 54, technique: 50, focus: 52, flexibility: 44, time: 6, endurance: 55, xpSuccess: 75, xpFail: 40, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"] },
        { name: "Runout Section", grade: "5.11b", strength: 56, technique: 52, focus: 58, flexibility: 48, time: 6, endurance: 60, xpSuccess: 80, xpFail: 44, rollEffect: [{ stat: 'focus', modifier: 1 }], gearModifiers: [] },
        { name: "Overhang Lead Challenge", grade: "5.11c", strength: 60, technique: 56, focus: 60, flexibility: 52, time: 7, endurance: 65, xpSuccess: 85, xpFail: 48, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness", "Chalk Bag"] },
        { name: "Advanced Clipping", grade: "5.12a", strength: 66, technique: 64, focus: 66, flexibility: 58, time: 7, endurance: 75, xpSuccess: 95, xpFail: 56, rollEffect: [{ stat: 'focus', modifier: 1 }], gearModifiers: [] },
        { name: "The Compression Lead", grade: "5.12b", strength: 72, technique: 66, focus: 66, flexibility: 60, time: 7, endurance: 82, xpSuccess: 100, xpFail: 62, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: ["Harness"] },
        { name: "Endurance Lead", grade: "5.12d", strength: 72, technique: 72, focus: 72, flexibility: 66, time: 8, endurance: 88, xpSuccess: 100, xpFail: 68, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [] },
        { name: "The Elite Lead", grade: "5.13a", strength: 76, technique: 74, focus: 74, flexibility: 70, time: 8, endurance: 92, xpSuccess: 100, xpFail: 72, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [] },
        { name: "World Class Leading", grade: "5.14a", strength: 88, technique: 84, focus: 84, flexibility: 80, time: 8, endurance: 100, xpSuccess: 100, xpFail: 88, rollEffect: [{ stat: 'strength', modifier: 1 }], gearModifiers: [] }
    ]
};

const GEAR_SHOP = [
    { name: "Climbing Shoes", cost: 75, statEffect: "technique", value: -3, description: "Improves foothold precision", effectDisplay: "🎯 -3 Technique on routes" },
    { name: "Chalk", cost: 50, statEffect: "strength", value: -2, description: "Maintains friction on sweaty hands", effectDisplay: "💪 -2 Strength on routes" },
    { name: "Chalk Bag", cost: 60, statEffect: "strength", value: -2, description: "Allows chalk access without leaving wall", effectDisplay: "💪 -2 Strength on routes" },
    { name: "Harness", cost: 95, statEffect: "all", value: -3, description: "Required for rope climbing", effectDisplay: "✨ -3 All Stats on routes" },
    { name: "Belay Device", cost: 80, statEffect: "focus", value: -2, description: "Safer belaying and catching", effectDisplay: "🧠 -2 Focus on routes" },
    { name: "Lead Rope", cost: 120, statEffect: "strength", value: -3, description: "Required for lead climbing", effectDisplay: "💪 -3 Strength on routes" },
    { name: "Helmet", cost: 65, statEffect: "endurance", value: 5, description: "Protects head from impacts", effectDisplay: "💨 +5 Max Endurance" },
    { name: "Finger Tape", cost: 85, statEffect: "strength", value: -4, description: "Prevents finger injuries on crimps", effectDisplay: "💪 -4 Strength on routes" },
    { name: "Liquid Chalk", cost: 95, statEffect: "strength", value: -3, description: "Long-lasting friction", effectDisplay: "💪 -3 Strength on routes" },
    { name: "Water Bottle", cost: 40, statEffect: "endurance", value: 3, description: "Recover extra endurance when resting", effectDisplay: "💨 +3 Max Endurance" },
    { name: "Energy Snacks", cost: 45, statEffect: "endurance", value: 10, description: "Once per round, recover 2d6 Endurance without resting", effectDisplay: "💨 +10 Max Endurance" },
    { name: "Grip Strength Trainer", cost: 180, statEffect: "strength", value: 2, description: "+2 permanent Strength", effectDisplay: "💪 +2 Permanent Strength" },
    { name: "Portable Hangboard", cost: 280, statEffect: "strengthTech", value: 3, description: "+3 permanent Strength, +2 permanent Technique", effectDisplay: "💪 +3 Str, 🎯 +2 Tech" },
    { name: "Resistance Bands", cost: 150, statEffect: "flexibility", value: 2, description: "+2 permanent Flexibility", effectDisplay: "🤸 +2 Permanent Flexibility" }
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
    attemptedRoutes: {} // Maps playerNum -> Set of route keys ("area:routeName") attempted this round
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

// ===== GAME INITIALIZATION =====

function startCharacterSelect() {
    const numPlayers = parseInt(document.getElementById('numPlayers').value);
    if (numPlayers < 1 || numPlayers > 4) {
        alert('Please select 1-4 players');
        return;
    }

    gameState.players = [];
    for (let i = 0; i < numPlayers; i++) {
        gameState.players.push({ playerNum: i + 1, character: null });
    }

    document.getElementById('characterSelection').style.display = 'block';
    renderCharacterSelect();
}

function renderCharacterSelect() {
    const container = document.getElementById('characterSelect');
    container.innerHTML = '';

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
        location: 'lobby' // Track which section of the gym the player is at
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

    initializeRoutes();
    initializeGearShop();
    renderGameBoard();
    addLog("Game started! Round 1 begins.");
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
    // Shuffle and select 3 random gear items
    const gearPool = [...GEAR_SHOP].sort(() => Math.random() - 0.5);
    gameState.availableGear = gearPool.slice(0, 3);
}

function replaceGearInShop(purchasedGearName) {
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
            ...ownedGearNames
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

        panel.innerHTML = `
            <div class="player-header">
                <div>
                    <h3>Player ${player.playerNum}: ${char.name}</h3>
                    <div style="color: #667eea; font-weight: bold;">${char.archetype}</div>
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
                        ${char.stats.strength}${char.trainingBonuses.strength > 0 || char.gearBonuses.strength > 0 ? ` <span style="color: #28a745;">(+${char.trainingBonuses.strength + char.gearBonuses.strength})</span>` : ''}
                    </div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Technique</div>
                    <div class="stat-value">
                        ${char.stats.technique}${char.trainingBonuses.technique > 0 || char.gearBonuses.technique > 0 ? ` <span style="color: #28a745;">(+${char.trainingBonuses.technique + char.gearBonuses.technique})</span>` : ''}
                    </div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Focus</div>
                    <div class="stat-value">
                        ${char.stats.focus}${char.trainingBonuses.focus > 0 || char.gearBonuses.focus > 0 ? ` <span style="color: #28a745;">(+${char.trainingBonuses.focus + char.gearBonuses.focus})</span>` : ''}
                    </div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Flexibility</div>
                    <div class="stat-value">
                        ${char.stats.flexibility}${char.trainingBonuses.flexibility > 0 || char.gearBonuses.flexibility > 0 ? ` <span style="color: #28a745;">(+${char.trainingBonuses.flexibility + char.gearBonuses.flexibility})</span>` : ''}
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
                <strong>⭐ ${char.specialAbility.name}</strong> ${char.abilityUsed ? '(Used)' : '(Available)'}
                <div style="font-size: 0.9em; color: #666;">${char.specialAbility.description}</div>
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

    // Add capacity indicator
    const playersHere = getPlayersInSection('topRope');
    const capacity = getSectionCapacity('topRope');
    const isFull = playersHere.length >= capacity;
    const capacityDiv = document.createElement('div');
    capacityDiv.style.cssText = `background: ${isFull ? '#ffe8e8' : '#e8f4f8'}; padding: 8px; border-radius: 5px; margin-bottom: 10px; font-size: 0.9em; border-left: 4px solid ${isFull ? '#dc3545' : '#007bff'};`;
    capacityDiv.innerHTML = `<strong>👥 Occupancy: ${playersHere.length}/${capacity}</strong> <span style="color: #666;">(${gameState.belayersUnlocked} belayer${gameState.belayersUnlocked > 1 ? 's' : ''})</span>${playersHere.length > 0 ? `<br><span style="color: #666;">Players here: ${playersHere.map(p => `P${p.playerNum}`).join(', ')}</span>` : ''}${isFull ? `<br><span style="color: #dc3545; font-weight: bold;">⚠️ FULL - No space available</span>` : ''}`;
    container.appendChild(capacityDiv);

    // Add route clearing indicator if this area will be cleared next
    if (gameState.routeClearingPosition === 1) {
        const indicator = document.createElement('div');
        indicator.className = 'route-clearing-indicator';
        indicator.innerHTML = '🔄 This area will be cleared at end of round';
        container.appendChild(indicator);
    }

    gameState.availableRoutes.topRope.forEach((route, idx) => {
        container.appendChild(createRouteCard(route, 'topRope', idx));
    });
}

function renderLeadClimbingRoutes() {
    const container = document.getElementById('leadClimbingRoutes');
    container.innerHTML = '';

    // Add capacity indicator
    const playersHere = getPlayersInSection('leadClimbing');
    const capacity = getSectionCapacity('leadClimbing');
    const isFull = playersHere.length >= capacity;
    const capacityDiv = document.createElement('div');
    capacityDiv.style.cssText = `background: ${isFull ? '#ffe8e8' : '#e8f4f8'}; padding: 8px; border-radius: 5px; margin-bottom: 10px; font-size: 0.9em; border-left: 4px solid ${isFull ? '#dc3545' : '#007bff'};`;
    capacityDiv.innerHTML = `<strong>👥 Occupancy: ${playersHere.length}/${capacity}</strong> <span style="color: #666;">(${gameState.belayersUnlocked} belayer${gameState.belayersUnlocked > 1 ? 's' : ''})</span>${playersHere.length > 0 ? `<br><span style="color: #666;">Players here: ${playersHere.map(p => `P${p.playerNum}`).join(', ')}</span>` : ''}${isFull ? `<br><span style="color: #dc3545; font-weight: bold;">⚠️ FULL - No space available</span>` : ''}`;
    container.appendChild(capacityDiv);

    const requirementsDiv = document.createElement('p');
    requirementsDiv.style.cssText = 'margin-bottom: 10px; color: #666;';
    requirementsDiv.textContent = 'Requires: Harness, Lead Rope, Carabiners';
    container.appendChild(requirementsDiv);

    // Add route clearing indicator if this area will be cleared next
    if (gameState.routeClearingPosition === 0) {
        const indicator = document.createElement('div');
        indicator.className = 'route-clearing-indicator';
        indicator.innerHTML = '🔄 This area will be cleared at end of round';
        container.appendChild(indicator);
    }

    gameState.availableRoutes.leadClimbing.forEach((route, idx) => {
        container.appendChild(createRouteCard(route, 'leadClimbing', idx));
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

    const canVisitStore = char.timeRemaining >= 1;

    gameState.availableGear.forEach(gear => {
        const owned = char.equipment.includes(gear.name);
        const canAfford = !owned && canVisitStore && spendableXP >= gear.cost;

        const card = document.createElement('div');
        card.className = 'gear-card' + (owned ? ' owned' : '');
        if (!owned && !canAfford) card.style.opacity = '0.5';

        card.onclick = () => !owned && canAfford && purchaseGear(gear);

        card.innerHTML = `
            <div class="gear-name">${gear.name} ${owned ? '✓' : ''}</div>
            <div class="gear-cost">${gear.cost} XP</div>
            <div style="background: #f0f8ff; padding: 8px; border-radius: 5px; margin: 8px 0; font-weight: bold; color: #007bff; font-size: 0.9em;">
                ${gear.effectDisplay}
            </div>
            <div class="gear-effect">${gear.description}</div>
        `;

        container.appendChild(card);
    });
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

    // Check requirements
    if (char.timeRemaining < route.time || char.currentEndurance < route.endurance) {
        alert('Not enough time or endurance!');
        return;
    }

    // Move player to this section
    movePlayerToSection(currentPlayer.playerNum, area);

    // Ensure gearBonuses exists
    if (!char.gearBonuses) {
        char.gearBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
    }

    // Calculate total stats
    const totalStats = {
        strength: char.stats.strength + char.trainingBonuses.strength + char.gearBonuses.strength,
        technique: char.stats.technique + char.trainingBonuses.technique + char.gearBonuses.technique,
        focus: char.stats.focus + char.trainingBonuses.focus + char.gearBonuses.focus,
        flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility
    };

    // Roll dice based on route's rollEffect array
    const numDiceNeeded = route.rollEffect ? route.rollEffect.length : 2;
    let numDice = numDiceNeeded;

    // Boulderer gets 3 dice on bouldering routes and picks best 2
    if (char.key === 'boulderer' && area === 'bouldering' && numDiceNeeded === 2) {
        numDice = 3;
    }

    const rolls = [];
    for (let i = 0; i < numDice; i++) {
        rolls.push(Math.floor(Math.random() * 6) + 1);
    }

    // For boulderer, take best 2 (lowest for buffs, highest for nerfs - take lowest to be safe)
    const diceToUse = numDice === 3 ? rolls.sort((a, b) => a - b).slice(0, 2) : rolls;

    // Apply dice to specific stats based on rollEffect
    const effectiveRequirements = {
        strength: route.strength,
        technique: route.technique,
        focus: route.focus,
        flexibility: route.flexibility
    };

    // Track which die affected which stat for display
    const diceEffects = [];

    if (route.rollEffect) {
        route.rollEffect.forEach((effect, index) => {
            const die = diceToUse[index];
            const stat = effect.stat;
            const modifier = effect.modifier;

            // modifier -1 means subtract die (buff), +1 means add die (nerf)
            if (modifier === -1) {
                effectiveRequirements[stat] -= die;
            } else {
                effectiveRequirements[stat] += die;
            }

            diceEffects.push({
                die: die,
                stat: stat,
                modifier: modifier
            });
        });
    }

    // Check success against effective requirements
    const strengthCheck = totalStats.strength >= effectiveRequirements.strength;
    const techniqueCheck = totalStats.technique >= effectiveRequirements.technique;
    const focusCheck = totalStats.focus >= effectiveRequirements.focus;
    const flexibilityCheck = totalStats.flexibility >= effectiveRequirements.flexibility;

    const success = strengthCheck && techniqueCheck && focusCheck && flexibilityCheck;

    // Apply costs
    char.timeRemaining -= route.time;
    char.currentEndurance -= route.endurance;

    // Mark route as attempted
    gameState.attemptedRoutes[currentPlayer.playerNum].add(routeKey);

    // Award XP
    const xpGained = success ? route.xpSuccess : route.xpFail;
    char.xp += xpGained;

    // Check for level up
    checkLevelUp(char);

    // Show result modal
    showClimbResult(route, rolls, diceToUse, totalStats, effectiveRequirements, diceEffects, success, xpGained);

    addLog(`Player ${currentPlayer.playerNum} ${success ? 'completed' : 'failed'} ${route.name} (${route.grade}) - ${xpGained} XP gained`);

    // Check if turn should end
    checkTurnEnd();
    renderGameBoard();
}

function showClimbResult(route, rolls, diceUsed, stats, effectiveReqs, diceEffects, success, xpGained) {
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
            const sign = effect.modifier === -1 ? '-' : '+';
            const color = effect.modifier === -1 ? '#28a745' : '#dc3545';
            return `<div style="padding: 8px; background: white; border-radius: 5px; border-left: 4px solid ${color};">
                Die ${index + 1} (${effect.die}): ${sign}${effect.die} to ${icon} ${statName} ${effect.modifier === -1 ? '(easier)' : '(harder)'}
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
    if (char.key === 'ironLung') {
        recovery = Math.ceil(recovery * 1.5);
    }

    char.currentEndurance = Math.min(char.maxEndurance, char.currentEndurance + recovery);

    addLog(`Player ${currentPlayer.playerNum} rested and recovered endurance to ${char.currentEndurance}`);

    checkTurnEnd();
    renderGameBoard();
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

    // Move player to gear shop
    movePlayerToSection(currentPlayer.playerNum, 'gearShop');

    const spendableXP = getSpendableXP(char);
    const xpToGo = getXPToNextLevel(char);

    if (spendableXP < gear.cost) {
        alert(`Not enough spendable XP!\n\nYou have ${spendableXP} XP earned in Level ${char.level}.\nYou need ${gear.cost} XP to purchase this item.\n\nCurrently ${xpToGo} XP away from Level ${char.level + 1}.`);
        return;
    }

    char.timeRemaining -= 1;
    char.xp -= gear.cost;

    const newXpToGo = getXPToNextLevel(char);

    char.equipment.push(gear.name);

    // Apply permanent stat bonuses to gearBonuses
    if (gear.statEffect === 'endurance') {
        char.maxEndurance += gear.value;
    } else if (gear.statEffect === 'strength' && gear.name === 'Grip Strength Trainer') {
        char.gearBonuses.strength += gear.value;
    } else if (gear.statEffect === 'flexibility' && gear.name === 'Resistance Bands') {
        char.gearBonuses.flexibility += gear.value;
    } else if (gear.statEffect === 'strengthTech') {
        char.gearBonuses.strength += 3;
        char.gearBonuses.technique += 2;
    }

    addLog(`Player ${currentPlayer.playerNum} purchased ${gear.name} for ${gear.cost} XP (now ${newXpToGo} XP to Level ${char.level + 1})`);

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

// Initialize on page load
window.onload = function() {
    // Game is ready to start
};
