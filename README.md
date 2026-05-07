# All-In Ascent - Rock Climbing Board Game

A digital implementation of the "All-In Ascent" rock climbing board game set at Alpine Indoors gym.

## How to Play

### Starting the Game

1. Open `index.html` in a web browser
2. Select the number of players (1-4)
3. Each player selects a character with unique abilities and stats
4. Click "Start Game" to begin

### Game Overview

This is a worker placement RPG game where players are rock climbers training and attempting routes to gain experience and level up. The game combines strategic resource management with dice-based climbing mechanics.

### Core Mechanics

#### Characters
Choose from 10 unique climbers:
- **The Powerhouse** - Strength-focused power climber
- **The Technician** - Precision and technique specialist
- **The Zen Master** - Mental focus and composure
- **The Contortionist** - Flexibility expert
- **The All-Rounder** - Balanced across all stats
- **The Sprinter** - Fast but burns energy quickly
- **The Iron Lung** - Incredible endurance
- **The Boulderer** - Specializes in bouldering problems
- **The Slab Dancer** - Balance and footwork master
- **The Route Reader** - Studies routes before attempting

Each character has:
- **4 Core Stats**: Strength, Technique, Focus, Flexibility
- **Endurance**: Energy pool for actions
- **Special Ability**: Unique once-per-round power
- **Level Progression**: Gain XP to level up (1-15)

#### Turn Structure

Each round consists of 10 time units. Players take turns based on who has the most time remaining (similar to speed-based initiative). Once all players exhaust their time, the round ends.

#### Actions

**Climbing** - Attempt routes in three areas:
- **Bouldering Wall** (V0-V12): 3 routes available, more random (extra dice rolls)
- **Top Rope** (5.6-5.13c): Limited by belayers (1 at start, unlock more rounds 5 & 12)
- **Lead Climbing** (5.8-5.14a): Highest XP, requires equipment

When attempting a climb:
1. Check if you have enough time and endurance
2. Roll 2d6 (or 3d6 for Boulderer on bouldering routes)
3. Subtract dice total from each stat
4. Meet or exceed all route requirements to succeed
5. Gain XP (more for success, some for failure)
6. Spend time and endurance

**Training** - Visit 4 training areas:
- Grip Board: +5 Focus
- Campus Board: +5 Strength
- Continuous MoonBoard: +5 Technique
- Balance and Core: +5 Flexibility

Training bonuses last until end of round.

**Rest** - Recover full endurance (costs 2 time units)

**Gear Shop** - Purchase equipment with XP:
- Climbing shoes, chalk, harness, rope, etc.
- Permanent stat boosts or special effects
- Can only purchase once per round (1 time unit)

#### Route Clearing

After each round, one climbing area's routes are refreshed in clockwise rotation:
- Round 1 end: Bouldering refreshes
- Round 2 end: Lead Climbing refreshes
- Round 3 end: Top Rope refreshes
- Cycle repeats...

#### Winning

The game continues until players decide to stop. Success is measured by:
- Highest level achieved
- Total XP accumulated
- Hardest routes completed

### Strategy Tips

1. **Balance Resources**: Manage time and endurance carefully
2. **Train Early**: Training bonuses help with harder routes
3. **Attempt Appropriate Routes**: Failing gives less XP than succeeding easier routes
4. **Use Special Abilities**: Each character's ability can turn failure into success
5. **Buy Smart**: Some gear provides permanent stat boosts
6. **Watch the Route Rotation**: Time your visits to areas before routes refresh

### Game Rules Highlights

- **Stat Requirements**: All four stat checks must pass to complete a climb
- **Dice Penalty**: Dice rolls reduce your effective stats for that climb
- **Equipment Effects**: Reduce stat requirements (e.g., -3 Strength with harness)
- **Level Up**: Automatic when reaching XP thresholds, stats increase
- **Endurance Management**: Running out forces you to rest, losing turns

## Implementation Features

### What's Included

- ✅ All 10 characters with full stat progressions (levels 1-15)
- ✅ 13 bouldering routes (V0-V12)
- ✅ 13 top rope routes (5.6-5.13c)
- ✅ 13 lead climbing routes (5.8-5.14a)
- ✅ 4 training areas with stat bonuses
- ✅ 14 equipment items in gear shop
- ✅ Full dice rolling mechanics with visual feedback
- ✅ Turn-based system with time management
- ✅ Endurance and XP tracking
- ✅ Level progression system
- ✅ Route rotation mechanic
- ✅ Belayer unlocking system
- ✅ Game log for action history
- ✅ Responsive UI with animations

### Simplified Elements

For playability in digital format:
- Gear shop shows 3 items at a time (instead of full deck)
- Special abilities are semi-automated (player must apply effects)
- Some advanced gear effects are simplified

## Files

- `index.html` - Main game file with UI structure and styling
- `game.js` - Complete game engine and logic
- `README.md` - This file

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari

## Credits

Game Design: "All-In Ascent" - Alpine Indoors Rock Climbing Board Game
Digital Implementation: Claude Code
