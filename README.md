# 🎯 Reflex Arena - Towns Protocol Bot

> A competitive reaction-time game built on Towns Protocol with dynamic gameplay mechanics

**Open Source Community Project** | Built with Towns Protocol Bot SDK

## 🌟 What is Reflex Arena?

Reflex Arena is a fast-paced browser game where players test their reaction speed by clicking targets as quickly as possible. Players can compete solo or challenge others with on-chain USDC wagers, with all payments verified on the Base blockchain.

### Game Mechanics

- **Green Targets**: Click 10 green circles as fast as possible
- **Moving Targets**: 30% of targets move around - stay sharp!
- **Penalty Objects**: Red star-shaped objects appear randomly (40% chance)
  - Clicking a penalty: -500 points
  - Auto-disappear after 2 seconds
- **Scoring**: 1000 - reaction time (ms) per target (faster = higher score)

### Key Features

✅ **6 Slash Commands** - Complete game experience
✅ **On-Chain Payment Verification** - Secure USDC transactions on Base
✅ **Challenge System** - Player vs player with automatic prize distribution
✅ **Leaderboards & Stats** - Track performance and earnings
✅ **Interactive Forms** - Accept/decline challenges with buttons
✅ **Embedded Miniapp** - Browser game with Towns SDK integration
✅ **Dynamic Gameplay** - Moving targets and penalty objects for extra challenge

## 🎮 How to Play

### Solo Play
1. Use `/play` command in any Towns channel
2. Pay $0.10 USDC (verified on-chain)
3. Click 10 targets as fast as possible
4. Avoid red penalty objects (-500 pts each)
5. Score saved to leaderboard

### Challenge Mode
1. Use `/challenge @username` to challenge another player
2. Challenger pays $0.20 USDC
3. Target receives accept/decline buttons
4. If accepted, target pays $0.20 USDC
5. Both players compete in separate game sessions
6. Winner takes all $0.40 USDC! 🏆

## 📋 Commands

| Command | Description |
|---------|-------------|
| `/play` | Pay $0.10 USDC and play solo |
| `/challenge @user` | Challenge another player with $0.20 USDC wager |
| `/leaderboard` | Show top 10 players by best score |
| `/stats [@user]` | View detailed player statistics |
| `/help` | Display game instructions and rules |
| `/balance` | Show bot stats, prize pool, and balances |

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Bun
- **Framework**: Towns Protocol SDK (`@towns-protocol/bot`)
- **Blockchain**: Base (Chain ID: 8453)
- **Web3 Library**: Viem with ERC-7821
- **Server**: Hono (bundled with bot SDK)
- **Miniapp SDK**: Farcaster Miniapp SDK v0.2.1

### Project Structure

```
reflex-arena/
├── src/
│   ├── commands.ts       # Slash command definitions
│   └── index.ts          # Main bot logic & event handlers
├── public/
│   └── miniapp.html      # Embedded game interface
├── .env.sample           # Environment variables template
├── package.json          # Dependencies
├── AGENTS.md             # Towns Protocol SDK reference
└── README.md             # This file
```

### Key Components

**Bot Logic** ([src/index.ts](src/index.ts)):
- Payment verification with `waitForTransactionReceipt`
- Challenge system with state management
- Interactive forms for accept/decline
- Leaderboard and stats tracking
- API endpoints for score submission

**Miniapp** ([public/miniapp.html](public/miniapp.html)):
- Towns SDK initialization with proper timeout handling
- Dynamic game mechanics (moving targets, penalty objects)
- CSS animations and glass-morphism design
- Canvas particle system for background effects
- Server-side score submission

**Data Storage**:
- In-memory Maps (production: use database - see [Production Considerations](#-production-considerations))
- `playerStats`: userId → stats object
- `pendingChallenges`: challengeId → challenge data
- `pendingPayments`: paymentId → payment info

## 🚀 Setup Instructions

### Prerequisites
- [Bun](https://bun.sh) installed
- Towns Protocol bot created at [app.towns.com/developer](https://app.towns.com/developer)
- Base ETH in gas wallet for transaction fees

### 1. Clone & Install

```bash
git clone https://github.com/Crisvond-hnt/towns-bot-reflex-game.git
cd towns-bot-reflex-game
bun install
```

### 2. Configure Environment

```bash
cp .env.sample .env
```

Edit `.env` with your credentials:

```bash
# Required: Get from https://app.towns.com/developer
APP_PRIVATE_DATA=<your_app_private_data>
JWT_SECRET=<your_jwt_secret>

# Required: Your deployment URL
BASE_URL=https://your-bot-domain.com
MINIAPP_URL=https://your-bot-domain.com/miniapp.html

# Recommended: Custom RPC for better reliability
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY

# Optional
PORT=5123
BOT_IMAGE_URL=https://your-domain.com/avatar.png
```

### 3. Fund Gas Wallet

Your bot has TWO addresses:

1. **Gas Wallet** (`bot.viem.account.address`) - **MUST fund with Base ETH**
2. **Treasury** (`bot.appAddress`) - Holds player payments (auto-funded by players)

Check your gas wallet address:

```bash
bun run src/index.ts
# Look for gas wallet address in logs, then send Base ETH to it
```

### 4. Run Locally

```bash
bun run dev
```

Bot runs on `http://localhost:5123`

### 5. Deploy to Production

#### Option A: Render.com (Recommended)

1. Create new Web Service
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `bun install`
   - **Start Command**: `bun run src/index.ts`
   - **Environment**: Add all `.env` variables
4. Update `BASE_URL` and `MINIAPP_URL` to your Render URL
5. Deploy!

#### Option B: Railway.app

1. Create new project from GitHub
2. Add environment variables
3. Deploy automatically
4. Update URLs to Railway domain

#### Option C: Self-Hosted VPS

1. Set up server with Bun
2. Configure reverse proxy (nginx/caddy)
3. Use PM2 or systemd for process management
4. Set up HTTPS (required for miniapp)

### 6. Update Miniapp Meta Tag

Edit [public/miniapp.html](public/miniapp.html) line 9:

```html
<meta name="fc:miniapp" content='{
  "version":"1",
  "imageUrl":"YOUR_IMAGE_URL",
  "button":{
    "title":"Play Reflex Arena",
    "action":{
      "type":"launch_miniapp",
      "name":"Reflex Arena",
      "url":"YOUR_MINIAPP_URL",
      "splashBackgroundColor":"#0f2027"
    }
  }
}' />
```

Replace:
- `YOUR_IMAGE_URL` → Preview image URL (1200x630 recommended)
- `YOUR_MINIAPP_URL` → Your deployed miniapp URL

### 7. Configure Bot Settings

At [app.towns.com/developer](https://app.towns.com/developer):

1. Set **Webhook URL**: `https://your-domain.com/webhook`
2. Set **Message Forwarding**: "Mentions, Commands, Replies & Reactions"
3. Verify webhook signature matches `JWT_SECRET`

## 🎨 Customization Ideas

Want to make Reflex Arena your own? Here are some ideas:

### Game Mechanics
- Add different target shapes (triangles, hexagons)
- Implement difficulty levels (easy/medium/hard)
- Add power-ups (freeze time, double points)
- Create combo multipliers for consecutive hits
- Add sound effects and haptic feedback

### Visual Design
- Change color themes in miniapp.html CSS
- Add custom animations and transitions
- Implement different game modes (zen mode, speed run)
- Create seasonal themes (holiday skins)

### Features
- Add tournaments with multiple players
- Implement team challenges
- Create achievement system
- Add daily/weekly quests
- Integrate NFT rewards for high scores

### Blockchain Integration
- Support multiple tokens (ETH, other ERC20s)
- Add NFT-gated access (holder-only games)
- Implement progressive jackpots
- Create staking mechanisms

## 🔧 Technical Details

### Payment Flow

```typescript
// 1. Send transaction request
await handler.sendInteractionRequest(channelId, {
  type: 'transaction',
  id: 'payment-id',
  title: 'Play Reflex Arena',
  subtitle: 'Pay 0.10 USDC',
  tx: {
    chainId: '8453',
    to: USDC_ADDRESS,
    value: '0',
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [bot.appAddress, parseUnits('0.10', 6)]
    })
  }
})

// 2. Verify transaction on-chain
const receipt = await waitForTransactionReceipt(bot.viem, { hash: txHash })
if (receipt.status !== 'success') {
  // Transaction failed - reject
  return
}

// 3. Grant access
await handler.sendMessage(channelId, 'Payment confirmed!', {
  attachments: [{ type: 'miniapp', url: miniappUrl }]
})
```

### Score Calculation

```javascript
// Formula: 1000 - reactionTime (ms) per target
// Faster clicks = higher score
// Penalty objects add 1500ms (equivalent to -500 pts)
let totalScore = 0
for (const reactionTime of clickTimes) {
  const targetScore = Math.max(0, 1000 - reactionTime)
  totalScore += targetScore
}
```

### Security Features

✅ **On-chain verification** - Never trust `txHash` alone
✅ **Input validation** - Score range 0-100000, timestamp validation
✅ **Server-side scoring** - No client-side score manipulation
✅ **Transaction receipts** - Verify with `waitForTransactionReceipt`

## 🐛 Troubleshooting

### Bot Not Responding
- Verify `APP_PRIVATE_DATA` and `JWT_SECRET` are correct
- Check webhook URL is publicly accessible (HTTPS required)
- Ensure bot is added to the Towns channel

### Payment Fails
- **Gas wallet must have Base ETH** (`bot.viem.account.address`)
- Check balance with `/balance` command
- Verify Base RPC URL is working
- Ensure USDC contract address is correct

### Miniapp Won't Load
- Verify `MINIAPP_URL` matches deployed URL
- Check meta tag in `miniapp.html` has correct URL
- HTTPS required for production
- Check browser console for SDK errors

### Score Not Saving
- Check `/api/score` endpoint is accessible
- Verify input validation isn't rejecting scores
- Check server logs for errors
- Ensure user ID matches Towns context

## 📊 Production Considerations

This bot uses **in-memory storage** for simplicity. For production:

### Use a Database
```typescript
// SQLite (simple, single-instance)
import Database from 'bun:sqlite'
const db = new Database('reflex.db')

// PostgreSQL (multi-instance deployments)
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
```

### Implement Refunds
Currently challenge declines don't refund automatically:

```typescript
// Refund challenger when target declines
await execute(bot.viem, {
  address: bot.appAddress,
  account: bot.viem.account,
  calls: [{
    to: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [challengerAddress, CHALLENGE_FEE]
  }]
})
```

### Rate Limiting
```typescript
import { rateLimiter } from 'hono-rate-limiter'
app.use('/api/*', rateLimiter({ limit: 10, windowMs: 60000 }))
```

### Monitoring
- Log important events (payments, errors, security events)
- Monitor bot health with `/health` endpoint
- Track command usage and performance
- Set up error alerts (Sentry, etc.)

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Ways to Contribute

- 🐛 **Report bugs** - Open an issue with reproduction steps
- 💡 **Suggest features** - Share your ideas in discussions
- 🔧 **Fix issues** - Submit pull requests
- 📖 **Improve docs** - Help make setup clearer
- 🎨 **Share designs** - Contribute themes and UI improvements

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly (run bot locally)
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Guidelines

- Follow existing code style (TypeScript + Bun)
- Add comments for complex logic
- Test payment flows thoroughly
- Validate all user inputs
- Follow AGENTS.md patterns for bot SDK usage

## 📚 Resources

- **Towns Protocol Docs**: [docs.towns.com](https://docs.towns.com)
- **Developer Portal**: [app.towns.com/developer](https://app.towns.com/developer)
- **AGENTS.md Reference**: [AGENTS.md](./AGENTS.md)
- **Base Explorer**: [basescan.org](https://basescan.org)
- **Farcaster Miniapp SDK**: [docs.farcaster.xyz](https://docs.farcaster.xyz)

## 📝 License

MIT License - feel free to use this code for your own projects!

## 🙏 Acknowledgments

- Built with [Towns Protocol](https://towns.com) Bot SDK
- Powered by [Base](https://base.org) blockchain
- Inspired by the Towns Protocol community

---

**Ready to build something amazing?** Fork this repo and create your own game! 🚀

*For questions or issues, please open an issue on GitHub.*
