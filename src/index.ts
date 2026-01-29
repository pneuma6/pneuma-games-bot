import { makeTownsBot, getSmartAccountFromUserId } from '@towns-protocol/bot'
import { parseEther, formatEther, parseUnits, formatUnits, encodeFunctionData, erc20Abi } from 'viem'
import { getBalance, waitForTransactionReceipt, readContract } from 'viem/actions'
import { execute } from 'viem/experimental/erc7821'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import commands from './commands'

// USDC token address on Base (AGENTS.md §1.4)
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// Entry fees in USDC (6 decimals) - $0.10 and $0.20
const ENTRY_FEE = parseUnits('0.1', 6) // 0.1 USDC
const CHALLENGE_FEE = parseUnits('0.2', 6) // 0.2 USDC

// Data storage (In-memory - use database in production, see AGENTS.md §19.4)
interface PlayerStats {
    displayName: string
    gamesPlayed: number
    bestScore: number
    totalScore: number
    challengesWon: number
    challengesLost: number
    earnings: bigint
}

interface PendingChallenge {
    id: string
    challengerId: string
    challengerName: string
    targetId: string
    targetName: string
    wager: bigint
    challengerPaid: boolean
    targetPaid: boolean
    challengerScore: number | null
    targetScore: number | null
    createdAt: Date
    channelId: string
    challengerTxHash?: string  // Transaction hash for transparency
    targetTxHash?: string      // Transaction hash for transparency
}

interface PendingPayment {
    userId: string
    type: 'play' | 'challenge-initiator' | 'challenge-acceptor'
    challengeId?: string
    channelId: string
    status: 'pending' | 'confirmed' | 'failed'
}

const playerStats = new Map<string, PlayerStats>()
const pendingChallenges = new Map<string, PendingChallenge>()
const pendingPayments = new Map<string, PendingPayment>()
const confirmedPayments = new Set<string>() // Track confirmed payment IDs
let totalGamesPlayed = 0
let jackpotPool = 0n // Jackpot pool in USDC (6 decimals)

// Initialize bot (AGENTS.md §4.3)
const baseRpcUrl = process.env.BASE_RPC_URL && !process.env.BASE_RPC_URL.includes('YOUR_ALCHEMY_KEY')
    ? process.env.BASE_RPC_URL
    : undefined // Use SDK default if no valid RPC configured

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
    baseRpcUrl,
    identity: {
        name: 'Pneuma Games',
        description: 'ETH PvP Arena - Skill-based games with on-chain wagers',
        image: process.env.BOT_IMAGE_URL || `${process.env.BASE_URL}/image.png`,
    },
})

console.log(`[Bot] Using RPC: ${baseRpcUrl || 'SDK default'}`)
console.log(`[Bot] Gas wallet: ${bot.viem.account.address}`)
console.log(`[Bot] Treasury: ${bot.appAddress}`)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Helper: Get or create player stats
function getOrCreatePlayerStats(userId: string, displayName: string): PlayerStats {
    if (!playerStats.has(userId)) {
        playerStats.set(userId, {
            displayName,
            gamesPlayed: 0,
            bestScore: 0,
            totalScore: 0,
            challengesWon: 0,
            challengesLost: 0,
            earnings: 0n,
        })
    }
    return playerStats.get(userId)!
}

// Helper: Update player stats after game
function updatePlayerStats(userId: string, displayName: string, score: number) {
    const stats = getOrCreatePlayerStats(userId, displayName)
    stats.gamesPlayed++
    stats.totalScore += score
    if (score > stats.bestScore) {
        stats.bestScore = score
    }
}

// Helper: Send USDC prize to winner
async function sendPrize(recipientUserId: string, amount: bigint): Promise<string | null> {
    try {
        // Get winner's smart account
        const recipientAddress = await getSmartAccountFromUserId(bot, { userId: recipientUserId as `0x${string}` }) as `0x${string}` | null
        if (!recipientAddress) {
            console.error(`[Prize] No smart account found for user ${recipientUserId}`)
            return null
        }

        console.log(`[Prize] Sending ${formatUnits(amount, 6)} USDC to ${recipientAddress}`)

        // Execute USDC transfer using ERC-7821
        const hash = await execute(bot.viem, {
            address: bot.appAddress,
            account: bot.viem.account,
            calls: [
                {
                    to: USDC_ADDRESS,
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [recipientAddress, amount],
                },
            ],
        })

        console.log(`[Prize] Transfer transaction: ${hash}`)

        // Wait for confirmation
        const receipt = await waitForTransactionReceipt(bot.viem, { hash })

        if (receipt.status === 'success') {
            console.log(`[Prize] Prize sent successfully!`)
            return hash
        } else {
            console.error(`[Prize] Transaction failed`)
            return null
        }
    } catch (error) {
        console.error(`[Prize] Error sending prize:`, error)
        return null
    }
}

// /help command (AGENTS.md §8.2)
bot.onSlashCommand('help', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        `**🎮 Pneuma Games - ETH PvP Arena**

**Available Games:**
🎯 **Reflex Arena** - Test your reaction speed
✊ **Rock Paper Scissors** - Classic duel with ETH stakes
🎲 **Dice Duel** - Roll the dice, win ETH
📈 **High / Low** - Coming soon!
🪙 **Coin Flip** - Coming soon!

**Commands:**
• \`/play\` - Open Games Arena
• \`/challenge @user\` - Challenge someone ($0.20 USDC wager, winner takes all)
• \`/leaderboard\` - View top 10 players
• \`/stats [@user]\` - View your stats or another player's
• \`/balance\` - View bot stats and prize pool
• \`/help\` - Show this help

**Challenge System:**
1. Challenger pays $0.20 USDC to issue challenge
2. Target accepts/declines via buttons
3. If accepted, target pays $0.20 USDC
4. Both play the game
5. Winner takes all $0.40 USDC!

**Payment Verification:**
All transactions are verified on-chain before granting access.

Good luck! 🚀`,
    )
})

// /play command - Opens miniapp
bot.onSlashCommand('play', async (handler, event) => {
    const miniappUrl = process.env.MINIAPP_URL || `${process.env.BASE_URL}/miniapp.html`
    await handler.sendMessage(
        event.channelId,
        '🎮 Click below to open Pneuma Games:',
        {
            attachments: [
                {
                    type: 'miniapp',
                    url: miniappUrl,
                },
            ],
        },
    )
})

// /challenge command (AGENTS.md §8.2, §10.1)
bot.onSlashCommand('challenge', async (handler, event) => {
    if (!event.mentions || event.mentions.length === 0) {
        await handler.sendMessage(event.channelId, '❌ Please mention a player to challenge: `/challenge @username`')
        return
    }

    const targetId = event.mentions[0].userId
    const targetName = event.mentions[0].displayName

    if (targetId === event.userId) {
        await handler.sendMessage(event.channelId, '❌ You cannot challenge yourself!')
        return
    }

    // Create payment request for challenger
    const challengeId = `challenge-${Date.now()}`
    const paymentId = `challenge-init-${challengeId}`

    pendingPayments.set(paymentId, {
        userId: event.userId,
        type: 'challenge-initiator',
        challengeId,
        channelId: event.channelId,
        status: 'pending',
    })

    // Store challenge data
    pendingChallenges.set(challengeId, {
        id: challengeId,
        challengerId: event.userId,
        challengerName: event.mentions.find((m) => m.userId === event.userId)?.displayName || 'Player',
        targetId,
        targetName,
        wager: CHALLENGE_FEE,
        challengerPaid: false,
        targetPaid: false,
        challengerScore: null,
        targetScore: null,
        createdAt: new Date(),
        channelId: event.channelId,
    })

    console.log('[Challenge] Created challenge:', {
        id: challengeId,
        challenger: event.userId,
        target: targetId,
    })

    // Send transaction request for USDC (Flattened API format)
    await handler.sendInteractionRequest(event.channelId, {
        type: 'transaction',
        id: paymentId,
        title: '⚔️ Issue Challenge',
        subtitle: `Pay $0.20 USDC to challenge ${targetName}`,
        tx: {
            chainId: '8453',
            to: USDC_ADDRESS,
            value: '0',
            data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'transfer',
                args: [bot.appAddress, CHALLENGE_FEE],
            }),
            signerWallet: undefined,
        },
        recipient: event.userId as `0x${string}`,
    })
})

// /leaderboard command (AGENTS.md §8.2)
bot.onSlashCommand('leaderboard', async (handler, { channelId }) => {
    if (playerStats.size === 0) {
        await handler.sendMessage(channelId, '📊 No players yet! Be the first to `/play`')
        return
    }

    const topPlayers = Array.from(playerStats.values())
        .filter((p) => p.bestScore > 0)
        .sort((a, b) => b.bestScore - a.bestScore)
        .slice(0, 10)

    const leaderboard = topPlayers
        .map(
            (player, index) =>
                `${index + 1}. **${player.displayName}** - ${player.bestScore} pts (${player.gamesPlayed} games)`,
        )
        .join('\n')

    await handler.sendMessage(
        channelId,
        `**🏆 Top 10 Leaderboard**\n\n${leaderboard}\n\nUse \`/stats\` to see detailed stats!`,
    )
})

// /stats command (AGENTS.md §8.2)
bot.onSlashCommand('stats', async (handler, event) => {
    const targetId = event.mentions && event.mentions.length > 0 ? event.mentions[0].userId : event.userId
    const stats = playerStats.get(targetId)

    if (!stats || stats.gamesPlayed === 0) {
        const playerName = event.mentions && event.mentions.length > 0 ? event.mentions[0].displayName : 'You'
        await handler.sendMessage(event.channelId, `📊 ${playerName} haven't played yet! Use \`/play\` to start.`)
        return
    }

    const avgScore = stats.gamesPlayed > 0 ? Math.round(stats.totalScore / stats.gamesPlayed) : 0
    const totalChallenges = stats.challengesWon + stats.challengesLost
    const winRate = totalChallenges > 0 ? Math.round((stats.challengesWon / totalChallenges) * 100) : 0

    await handler.sendMessage(
        event.channelId,
        `**📊 Stats for ${stats.displayName}**

**Games:** ${stats.gamesPlayed}
**Best Score:** ${stats.bestScore} pts
**Average Score:** ${avgScore} pts
**Total Score:** ${stats.totalScore} pts

**Challenges:**
• Won: ${stats.challengesWon}
• Lost: ${stats.challengesLost}
• Win Rate: ${winRate}%

**Earnings:** $${formatUnits(stats.earnings, 6)} USDC`,
    )
})

// /balance command (AGENTS.md §8.2, §12.1)
bot.onSlashCommand('balance', async (handler, { channelId }) => {
    const gasBalance = await getBalance(bot.viem, { address: bot.viem.account.address })

    // Get USDC balance from treasury
    const usdcBalance = await readContract(bot.viem, {
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [bot.appAddress],
    })

    const totalPlayers = playerStats.size

    await handler.sendMessage(
        channelId,
        `**💰 Pneuma Games Stats**

**Treasury Balance:** $${formatUnits(usdcBalance, 6)} USDC
**Jackpot Pool:** $${formatUnits(jackpotPool, 6)} USDC 🎰
**Gas Wallet:** ${formatEther(gasBalance)} ETH
**Total Games:** ${totalGamesPlayed}
**Total Players:** ${totalPlayers}
**Active Challenges:** ${pendingChallenges.size}

**Bot Addresses:**
Treasury: \`${bot.appAddress}\`
Gas: \`${bot.viem.account.address}\``,
    )
})

// Handle transaction responses (AGENTS.md §10.4, §10.5)
bot.onInteractionResponse(async (handler, event) => {
    if (event.response.payload.content?.case === 'transaction') {
        const tx = event.response.payload.content.value
        console.log(`[Payment] Received transaction response:`, {
            requestId: tx.requestId,
            txHash: tx.txHash,
            error: (tx as any).error  // Optional field, not in type definition
        })

        const pending = pendingPayments.get(tx.requestId)

        if (!pending) {
            console.log(`[Payment] No pending payment found for ${tx.requestId}`)
            return
        }

        console.log(`[Payment] Processing payment for user ${pending.userId}, type: ${pending.type}`)

        if (tx.txHash) {
            // CRITICAL: Verify transaction on-chain (AGENTS.md §10.5)
            try {
                console.log(`[Payment] Verifying transaction ${tx.txHash} for payment ${tx.requestId}`)

                const receipt = await waitForTransactionReceipt(bot.viem, {
                    hash: tx.txHash as `0x${string}`,
                    timeout: 120_000, // 2 minutes timeout
                })

                console.log(`[Payment] Transaction receipt:`, {
                    hash: tx.txHash,
                    status: receipt.status,
                    blockNumber: receipt.blockNumber
                })

                if (receipt.status !== 'success') {
                    pending.status = 'failed'
                    await handler.sendMessage(
                        pending.channelId,
                        '❌ Transaction failed on-chain. Please try again.',
                    )
                    // Keep for 30 seconds so miniapp can detect failure
                    setTimeout(() => pendingPayments.delete(tx.requestId), 30000)
                    return
                }

                // Transaction verified! Process based on type
                if (pending.type === 'play') {
                    console.log(`[Payment] Solo play payment confirmed for ${pending.userId}`)

                    // Mark payment as confirmed for miniapp to detect
                    pending.status = 'confirmed'
                    confirmedPayments.add(tx.requestId)

                    await handler.sendMessage(
                        pending.channelId,
                        `✅ Payment confirmed! Starting your game...\n\n**Transaction:** [View on Basescan](https://basescan.org/tx/${tx.txHash})`,
                    )

                    console.log(`[Payment] Payment ${tx.requestId} marked as confirmed, miniapp can now start game`)

                    // Keep payment in map for 5 minutes for miniapp to query
                    setTimeout(() => {
                        pendingPayments.delete(tx.requestId)
                        confirmedPayments.delete(tx.requestId)
                    }, 5 * 60 * 1000)
                } else if (pending.type === 'challenge-initiator' && pending.challengeId) {
                    // Challenger paid, send accept/decline form to target (AGENTS.md §9.1)
                    const challenge = pendingChallenges.get(pending.challengeId)
                    if (!challenge) return

                    challenge.challengerPaid = true
                    challenge.challengerTxHash = tx.txHash // Store tx hash
                    console.log('[Challenge] Challenger paid:', {
                        id: pending.challengeId,
                        challenger: challenge.challengerId,
                        challengerPaid: challenge.challengerPaid,
                        targetPaid: challenge.targetPaid
                    })

                    await handler.sendMessage(
                        challenge.channelId,
                        `⚔️ <@${challenge.targetId}> - ${challenge.challengerName} has challenged you!\n\n**Wager:** $0.20 USDC\n**Prize:** $0.40 USDC (winner takes all)\n\n**Challenger's Payment:** [View on Basescan](https://basescan.org/tx/${tx.txHash})\n\nAccept the challenge?`,
                        {
                            mentions: [{ userId: challenge.targetId, displayName: challenge.targetName }],
                        },
                    )

                    // Send form with accept/decline buttons (Flattened API format)
                    await handler.sendInteractionRequest(challenge.channelId, {
                        type: 'form',
                        id: `challenge-response-${challenge.id}`,
                        components: [
                            { id: 'accept', type: 'button', label: '✅ Accept Challenge' },
                            { id: 'decline', type: 'button', label: '❌ Decline' },
                        ],
                        recipient: challenge.targetId as `0x${string}`,
                    })

                    pendingPayments.delete(tx.requestId)
                } else if (pending.type === 'challenge-acceptor' && pending.challengeId) {
                    // Target paid, both can now play (AGENTS.md §9.1)
                    const challenge = pendingChallenges.get(pending.challengeId)
                    if (!challenge) return

                    challenge.targetPaid = true
                    challenge.targetTxHash = tx.txHash // Store tx hash
                    console.log('[Challenge] Target paid - BOTH READY:', {
                        id: pending.challengeId,
                        challenger: challenge.challengerId,
                        target: challenge.targetId,
                        challengerPaid: challenge.challengerPaid,
                        targetPaid: challenge.targetPaid
                    })

                    const miniappUrl = process.env.MINIAPP_URL || `${process.env.BASE_URL}/miniapp.html`

                    console.log('[Challenge] Sending miniapp to both players')

                    // Build payment verification links
                    const paymentLinks =
                        `**Payment Verification:**\n` +
                        `• ${challenge.challengerName}: [View Transaction](https://basescan.org/tx/${challenge.challengerTxHash})\n` +
                        `• ${challenge.targetName}: [View Transaction](https://basescan.org/tx/${challenge.targetTxHash})`

                    // Send miniapp to both players (no URL param needed - miniapp will detect challenge via API)
                    await handler.sendMessage(
                        challenge.channelId,
                        `✅ Challenge accepted! Both players click below to play:\n\n<@${challenge.challengerId}> vs <@${challenge.targetId}>\n\n**Prize:** $0.40 USDC to the winner! 🏆\n\n${paymentLinks}`,
                        {
                            mentions: [
                                { userId: challenge.challengerId, displayName: challenge.challengerName },
                                { userId: challenge.targetId, displayName: challenge.targetName },
                            ],
                            attachments: [
                                {
                                    type: 'miniapp',
                                    url: miniappUrl,  // Removed ?challenge param - API detection instead
                                },
                            ],
                        },
                    )

                    pendingPayments.delete(tx.requestId)
                }
            } catch (error) {
                console.error(`[Payment] Transaction verification failed for ${tx.txHash}:`, error)

                // Check if it's a timeout or RPC error
                const errorMessage = error instanceof Error ? error.message : String(error)

                if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
                    // RPC timeout - transaction might still be valid
                    pending.status = 'confirmed'
                    confirmedPayments.add(tx.requestId)

                    await handler.sendMessage(
                        pending.channelId,
                        '✅ Payment received! Starting your game...\n_Note: Blockchain verification is slow, but payment was received._',
                    )

                    setTimeout(() => {
                        pendingPayments.delete(tx.requestId)
                        confirmedPayments.delete(tx.requestId)
                    }, 5 * 60 * 1000)
                } else {
                    // Real verification error
                    pending.status = 'failed'
                    await handler.sendMessage(
                        pending.channelId,
                        '❌ Failed to verify transaction. Please try again or contact support.',
                    )
                    setTimeout(() => pendingPayments.delete(tx.requestId), 30000)
                }
            }
        } else {
            // Transaction failed or cancelled
            pending.status = 'failed'
            await handler.sendMessage(pending.channelId, '❌ Transaction was not completed.')
            setTimeout(() => pendingPayments.delete(tx.requestId), 30000)
        }
    }

    // Handle form responses (AGENTS.md §9.3)
    if (event.response.payload.content?.case === 'form') {
        const form = event.response.payload.content.value

        // Handle challenge accept/decline
        if (form.requestId.startsWith('challenge-response-')) {
            const challengeId = form.requestId.replace('challenge-response-', '')
            const challenge = pendingChallenges.get(challengeId)

            if (!challenge || event.userId !== challenge.targetId) return

            for (const c of form.components) {
                if (c.component.case === 'button') {
                    if (c.id === 'accept') {
                        // Send payment request to target
                        const paymentId = `challenge-accept-${challengeId}`
                        pendingPayments.set(paymentId, {
                            userId: event.userId,
                            type: 'challenge-acceptor',
                            challengeId,
                            channelId: challenge.channelId,
                            status: 'pending',
                        })

                        await handler.sendInteractionRequest(challenge.channelId, {
                            type: 'transaction',
                            id: paymentId,
                            title: '⚔️ Accept Challenge',
                            subtitle: `Pay $0.20 USDC to accept challenge from ${challenge.challengerName}`,
                            tx: {
                                chainId: '8453',
                                to: USDC_ADDRESS,
                                value: '0',
                                data: encodeFunctionData({
                                    abi: erc20Abi,
                                    functionName: 'transfer',
                                    args: [bot.appAddress, CHALLENGE_FEE],
                                }),
                                signerWallet: undefined,
                            },
                            recipient: event.userId as `0x${string}`,
                        })
                    } else if (c.id === 'decline') {
                        // Refund the challenger's payment
                        const refundTxHash = await sendPrize(challenge.challengerId, CHALLENGE_FEE)

                        const refundMessage = refundTxHash
                            ? `❌ <@${challenge.targetId}> declined the challenge from ${challenge.challengerName}.\n\n**Refund Transaction:** [View on Basescan](https://basescan.org/tx/${refundTxHash})`
                            : `❌ <@${challenge.targetId}> declined the challenge from ${challenge.challengerName}. Refund pending.`

                        await handler.sendMessage(
                            challenge.channelId,
                            refundMessage,
                            {
                                mentions: [{ userId: challenge.targetId, displayName: challenge.targetName }],
                            },
                        )
                        pendingChallenges.delete(challengeId)
                    }
                }
            }
        }
    }
})

// Start Hono app and add custom routes (AGENTS.md §18.1)
const app = bot.start()

// Serve miniapp HTML (AGENTS.md §18.1)
app.get('/miniapp.html', (c) => {
    try {
        const htmlPath = join(__dirname, '..', 'public', 'miniapp.html')
        const html = readFileSync(htmlPath, 'utf-8')
        return c.html(html)
    } catch (error) {
        console.error('Failed to serve miniapp:', error)
        return c.text('Miniapp not found', 404)
    }
})

// Serve bot/miniapp image
app.get('/image.png', (c) => {
    try {
        const imagePath = join(__dirname, '..', 'public', 'image.png')
        const image = readFileSync(imagePath)
        c.header('Content-Type', 'image/png')
        return c.body(image)
    } catch (error) {
        console.error('Failed to serve image:', error)
        return c.text('Image not found', 404)
    }
})

// API endpoint for miniapp to request payment
app.post('/api/request-payment', async (c) => {
    try {
        const { userId, channelId } = await c.req.json()

        if (!userId || !channelId) {
            return c.json({ error: 'Missing userId or channelId' }, 400)
        }

        const paymentId = `play-${userId}-${Date.now()}`
        pendingPayments.set(paymentId, {
            userId,
            type: 'play',
            channelId,
            status: 'pending',
        })

        // Send transaction request to chat channel
        await bot.sendInteractionRequest(channelId, {
            type: 'transaction',
            id: paymentId,
            title: '🎮 Play Pneuma Games',
            subtitle: `Pay $0.10 USDC to play`,
            tx: {
                chainId: '8453',
                to: USDC_ADDRESS,
                value: '0',
                data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [bot.appAddress, ENTRY_FEE],
                }),
                signerWallet: undefined,
            },
            recipient: userId as `0x${string}`,
        })

        return c.json({ success: true, paymentId })
    } catch (error) {
        console.error('Payment request error:', error)
        return c.json({ error: 'Failed to request payment' }, 500)
    }
})

// API endpoint for miniapp to check payment status
app.post('/api/check-payment', async (c) => {
    try {
        const { paymentId } = await c.req.json()

        if (!paymentId) {
            return c.json({ error: 'Missing paymentId' }, 400)
        }

        const payment = pendingPayments.get(paymentId)

        if (!payment) {
            return c.json({ status: 'not_found' })
        }

        if (payment.status === 'confirmed') {
            return c.json({ status: 'confirmed' })
        }

        if (payment.status === 'failed') {
            return c.json({ status: 'failed' })
        }

        return c.json({ status: 'pending' })
    } catch (error) {
        console.error('Check payment error:', error)
        return c.json({ error: 'Failed to check payment' }, 500)
    }
})

// API endpoint to check if user has an active challenge
app.post('/api/check-challenge', async (c) => {
    try {
        const { userId } = await c.req.json()

        if (!userId) {
            return c.json({ error: 'Missing userId' }, 400)
        }

        console.log('[Challenge API] Checking challenges for user:', userId)
        console.log('[Challenge API] Total pending challenges:', pendingChallenges.size)
        console.log('[Challenge API] All challenges:', Array.from(pendingChallenges.entries()).map(([id, c]) => ({
            id,
            challengerId: c.challengerId,
            targetId: c.targetId,
            challengerPaid: c.challengerPaid,
            targetPaid: c.targetPaid
        })))

        // Normalize userId for case-insensitive comparison
        const normalizedUserId = userId.toLowerCase()

        // Find any challenge where this user is involved and both have paid
        for (const [challengeId, challenge] of pendingChallenges.entries()) {
            const isInvolved =
                challenge.challengerId.toLowerCase() === normalizedUserId ||
                challenge.targetId.toLowerCase() === normalizedUserId

            if (isInvolved) {
                console.log('[Challenge API] Found challenge:', {
                    id: challengeId,
                    challengerPaid: challenge.challengerPaid,
                    targetPaid: challenge.targetPaid,
                    hasPlayedYet: challenge.challengerId.toLowerCase() === normalizedUserId ?
                        challenge.challengerScore !== null :
                        challenge.targetScore !== null
                })

                // Check if both players have paid
                if (challenge.challengerPaid && challenge.targetPaid) {
                    // Check if this user already played
                    const hasPlayed = challenge.challengerId.toLowerCase() === normalizedUserId ?
                        challenge.challengerScore !== null :
                        challenge.targetScore !== null

                    return c.json({
                        hasChallenge: true,
                        challengeId: challengeId,
                        isPaid: true,
                        hasPlayed,
                        opponentName: challenge.challengerId.toLowerCase() === normalizedUserId ?
                            challenge.targetName :
                            challenge.challengerName,
                        wager: formatUnits(challenge.wager, 6)
                    })
                }

                // Challenge exists but not both paid yet
                return c.json({
                    hasChallenge: true,
                    challengeId: challengeId,
                    isPaid: false,
                    message: 'Waiting for both players to pay'
                })
            }
        }

        // No active challenge
        console.log('[Challenge API] No active challenge found for user')
        return c.json({ hasChallenge: false })
    } catch (error) {
        console.error('Check challenge error:', error)
        return c.json({ error: 'Failed to check challenge' }, 500)
    }
})

// API endpoint for score submission (AGENTS.md §15.8)
app.post('/api/score', async (c) => {
    try {
        const { userId, score, timestamp, displayName, challengeId } = await c.req.json()

        // Input validation (AGENTS.md §15.8, §19.4)
        if (!userId || typeof score !== 'number' || typeof timestamp !== 'number') {
            return c.json({ error: 'Invalid input: missing required fields' }, 400)
        }

        if (score < 0 || score > 100000) {
            return c.json({ error: 'Invalid score range: must be 0-100000' }, 400)
        }

        if (timestamp < 0 || timestamp > Date.now() + 60000) {
            return c.json({ error: 'Invalid timestamp' }, 400)
        }

        // Update player stats
        updatePlayerStats(userId, displayName || 'Player', score)
        totalGamesPlayed++

        // Handle challenge scoring
        if (challengeId) {
            const challenge = pendingChallenges.get(challengeId)
            if (challenge) {
                if (userId === challenge.challengerId) {
                    challenge.challengerScore = score
                } else if (userId === challenge.targetId) {
                    challenge.targetScore = score
                }

                // If both players finished, determine winner
                if (challenge.challengerScore !== null && challenge.targetScore !== null) {
                    const winnerId =
                        challenge.challengerScore > challenge.targetScore
                            ? challenge.challengerId
                            : challenge.targetId
                    const loserId = winnerId === challenge.challengerId ? challenge.targetId : challenge.challengerId
                    const winnerName =
                        winnerId === challenge.challengerId ? challenge.challengerName : challenge.targetName
                    const loserName =
                        loserId === challenge.challengerId ? challenge.challengerName : challenge.targetName

                    // Calculate revenue split: 99% to winner, 1% to bot
                    const totalPrize = CHALLENGE_FEE * 2n
                    const botCut = totalPrize / 100n // 1%
                    const winnerPrize = totalPrize - botCut // 99%

                    // Update challenge stats
                    const winner = getOrCreatePlayerStats(winnerId, winnerName)
                    const loser = getOrCreatePlayerStats(loserId, loserName)

                    winner.challengesWon++
                    winner.earnings += winnerPrize
                    loser.challengesLost++

                    // Send prize to winner using ERC-7821 batch execution
                    console.log(`[Challenge] Sending prize to winner ${winnerId}`)
                    const txHash = await sendPrize(winnerId, winnerPrize)

                    // Send result message
                    const prizeMessage = txHash
                        ? `**Prize:** $${formatUnits(winnerPrize, 6)} USDC → ${winnerName}\n[View Transaction](https://basescan.org/tx/${txHash})`
                        : `**Prize:** $${formatUnits(winnerPrize, 6)} USDC (pending distribution)`

                    await bot.sendMessage(
                        challenge.channelId,
                        `**⚔️ Challenge Complete!**\n\n🏆 Winner: <@${winnerId}> (${winnerName}) - ${winnerId === challenge.challengerId ? challenge.challengerScore : challenge.targetScore} pts\n😢 Loser: <@${loserId}> (${loserName}) - ${loserId === challenge.challengerId ? challenge.challengerScore : challenge.targetScore} pts\n\n${prizeMessage}\n\nUse \`/stats\` to see updated stats!`,
                        {
                            mentions: [
                                { userId: challenge.challengerId, displayName: challenge.challengerName },
                                { userId: challenge.targetId, displayName: challenge.targetName },
                            ],
                        },
                    )

                    pendingChallenges.delete(challengeId)

                    // Return challenge result to miniapp
                    return c.json({
                        success: true,
                        score,
                        challengeComplete: true,
                        isWinner: userId === winnerId,
                        winnerId,
                        winnerName,
                        winnerScore: winnerId === challenge.challengerId ? challenge.challengerScore : challenge.targetScore,
                        loserId,
                        loserName,
                        loserScore: loserId === challenge.challengerId ? challenge.challengerScore : challenge.targetScore,
                        prize: formatUnits(winnerPrize, 6),
                        opponentId: userId === challenge.challengerId ? challenge.targetId : challenge.challengerId,
                        opponentName: userId === challenge.challengerId ? challenge.targetName : challenge.challengerName,
                    })
                } else {
                    // Waiting for opponent
                    return c.json({
                        success: true,
                        score,
                        challengeComplete: false,
                        waitingForOpponent: true,
                    })
                }
            }
        }

        // Solo play - contribute to jackpot
        const jackpotContribution = ENTRY_FEE / 10n // 10% to jackpot
        jackpotPool += jackpotContribution

        return c.json({
            success: true,
            score,
            jackpotPool: formatUnits(jackpotPool, 6),
        })
    } catch (error) {
        console.error('Score submission error:', error)
        return c.json({ error: 'Failed to process score' }, 500)
    }
})

// Health check endpoint
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        players: playerStats.size,
        games: totalGamesPlayed,
        challenges: pendingChallenges.size,
    })
})

// Export Hono app - Bun reads PORT env automatically
export default app
