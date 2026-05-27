# Vault Defender

A premium Phaser-based bubble shooter game set inside a futuristic DeFi fortress. Match and clear themed orbs while managing pressure and combos to achieve high scores.

## Features

- Bubble shooter gameplay with DeFi-themed orbs
- Multiple orb variants: Stablecoin, Concrete, Volatility, Security, and Premium
- Dynamic scoring and combo system
- Level progression with increasing difficulty
- Pressure management mechanic
- Responsive design with mobile support
- High score tracking with persistent storage
- Futuristic vault aesthetic with gradient effects

## Technology Stack

- **Game Engine**: Phaser 3.80.1
- **Build Tool**: Vite 5.4.14
- **Language**: JavaScript (ES Modules)
- **Styling**: CSS3
- **Runtime**: Browser-based

## Installation

1. Clone or download the project
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

To start the development server:

```bash
npm run dev
```

This launches Vite's dev server with hot module replacement for rapid development.

## Building for Production

To build the project for production:

```bash
npm run build
```

The optimized build will be output to the `dist/` directory.

## Preview

To preview the production build locally:

```bash
npm run preview
```

## Project Structure

```
concrete-bubble-shooter/
├── index.html              # Main HTML entry point
├── package.json            # Project metadata and dependencies
├── src/
│   ├── main.js            # Game initialization and core logic
│   ├── styles.css         # Styling and animations
│   └── assets/
│       └── images/        # Game images and textures
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## Game Mechanics

### Orb Types

- **Stablecoin**: Blue spheres (0x5d9fff)
- **Concrete**: Yellow orbs (0xf3d37a) - Core vault elements
- **Volatility**: Red rockets (0xf25e5e) - High-risk orbs
- **Security**: Gray nodes (0x9ca4b2) - Defensive orbs
- **Premium**: Dark shield cores (0x1d1d22) - Rare elements

### Gameplay Statistics

- **Score**: Accumulates as you match and clear orbs
- **Level**: Increases with progression
- **Pressure**: Resource management - monitor to prevent vault breach
- **Combo**: Consecutive successful matches for bonus points

## Browser Support

Works on modern browsers supporting ES6 modules and HTML5 Canvas. Optimized for both desktop and mobile devices (390px x 844px mobile viewport).

## License

Private project.
