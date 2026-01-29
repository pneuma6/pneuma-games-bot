import type { BotCommand } from '@towns-protocol/bot'

// Reflex Arena - Competitive reaction-time game commands
const commands = [
    {
        name: 'play',
        description: 'Play Reflex Arena - $0.10 USDC',
    },
    {
        name: 'challenge',
        description: 'Challenge another player - $0.20 USDC wager',
    },
    {
        name: 'leaderboard',
        description: 'Show top 10 players by best score',
    },
    {
        name: 'stats',
        description: 'Show player stats (games, scores, W/L, earnings)',
    },
    {
        name: 'help',
        description: 'Game instructions and rules',
    },
    {
        name: 'balance',
        description: 'Show bot stats and balances',
    },
] as const satisfies BotCommand[]

export default commands
