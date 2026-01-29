# Contributing to Reflex Arena

Thank you for your interest in contributing to Reflex Arena! This document provides guidelines and instructions for contributing.

## Ways to Contribute

### 🐛 Report Bugs

Found a bug? Please open an issue with:

- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots (if applicable)
- Environment details (OS, Bun version, etc.)

### 💡 Suggest Features

Have an idea? Open a discussion or issue with:

- Clear description of the feature
- Use case / why it's needed
- Mockups or examples (if applicable)
- Implementation ideas (optional)

### 🔧 Submit Code

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test thoroughly**
   - Run the bot locally
   - Test payment flows
   - Verify miniapp loads correctly
5. **Commit with clear messages**
   ```bash
   git commit -m "Add: new game mode with power-ups"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) installed
- Towns Protocol bot credentials from [app.towns.com/developer](https://app.towns.com/developer)
- Base ETH in gas wallet for testing

### Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/towns-bot-reflex-game.git
cd towns-bot-reflex-game

# Install dependencies
bun install

# Configure environment
cp .env.sample .env
# Edit .env with your credentials

# Run locally
bun run dev
```

## Code Guidelines

### TypeScript Style

- Use TypeScript for type safety
- Follow existing code style
- Add comments for complex logic
- Use meaningful variable names

### Bot SDK Patterns

- Follow AGENTS.md documentation strictly
- Use proper API structures (`type:` instead of `case:` for interactions)
- Always verify transactions with `waitForTransactionReceipt`
- Validate all user inputs

### Security Best Practices

✅ **Always validate user input**
```typescript
if (typeof score !== 'number' || score < 0 || score > 100000) {
  return c.json({ error: 'Invalid score' }, 400)
}
```

✅ **Verify transactions on-chain**
```typescript
const receipt = await waitForTransactionReceipt(bot.viem, { hash: txHash })
if (receipt.status !== 'success') {
  // Reject - transaction failed
}
```

✅ **Never trust client data**
- All game scores are validated server-side
- Payment verification happens on-chain
- Use rate limiting on API endpoints

### Testing Checklist

Before submitting a PR, verify:

- [ ] Bot starts without errors
- [ ] All commands work as expected
- [ ] Payment flows complete successfully
- [ ] Miniapp loads and SDK initializes
- [ ] Game mechanics work correctly
- [ ] No console errors in browser
- [ ] Transaction verification works
- [ ] Leaderboard updates properly

## Project Structure

```
reflex-arena/
├── src/
│   ├── commands.ts       # Command definitions
│   └── index.ts          # Bot logic & handlers
├── public/
│   └── miniapp.html      # Game interface
├── .env.sample           # Environment template
└── package.json          # Dependencies
```

## Key Files

### src/index.ts

Main bot logic including:
- Event handlers (`onSlashCommand`, `onInteractionResponse`)
- Payment verification
- Challenge system
- Leaderboard management
- API endpoints

### public/miniapp.html

Game interface including:
- Towns SDK initialization
- Game mechanics (targets, penalties)
- CSS styling and animations
- Score submission

### src/commands.ts

Slash command definitions used by the bot.

## Feature Ideas

Looking for contribution ideas? Here are some suggestions:

### Beginner Friendly
- Add new color themes
- Improve error messages
- Add sound effects
- Create new target shapes

### Intermediate
- Implement difficulty levels
- Add combo multipliers
- Create achievement system
- Add database persistence

### Advanced
- Tournament system
- NFT rewards integration
- Multi-token support
- Team challenges

## Blockchain Development

### Testing Payments

When testing payment flows:

1. Use Base testnet for development
2. Fund gas wallet with Base ETH
3. Test transaction verification thoroughly
4. Verify refund logic works

### USDC Contract

Base Mainnet USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

### Gas Wallet vs Treasury

- **Gas Wallet** (`bot.viem.account.address`): Must be funded with Base ETH
- **Treasury** (`bot.appAddress`): Holds player payments

## Pull Request Guidelines

### PR Title Format

- `Add: new feature description`
- `Fix: bug description`
- `Update: improvement description`
- `Docs: documentation changes`

### PR Description

Include:
- What changed and why
- How to test the changes
- Screenshots (for UI changes)
- Breaking changes (if any)

### Review Process

1. Automated checks must pass
2. Code review by maintainer
3. Test deployment verification
4. Merge when approved

## Questions?

- Open a discussion on GitHub
- Check AGENTS.md for bot SDK reference
- Review README.md for setup instructions

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on the code, not the person
- Help others learn

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Reflex Arena! 🎯
