import photoVault from './assets/images/photo_1_2026-05-15_19-53-42.jpg?url';
import photoCapital from './assets/images/photo_2_2026-05-15_19-53-42.jpg?url';
import photoShield from './assets/images/photo_3_2026-05-15_19-53-42.jpg?url';
import photoYield from './assets/images/photo_4_2026-05-15_19-53-42.jpg?url';
import photoCapitalAlt from './assets/images/photo_5_2026-05-15_19-53-42.jpg?url';
import photoReserve from './assets/images/photo_6_2026-05-15_19-53-42.jpg?url';

const Phaser = window.Phaser;

const STORAGE_KEY = 'concrete-vault-defender-settings';
const SCORE_KEY = 'concrete-vault-defender-high-score';

const COLORS = {
  stablecoin: 0x5d9fff,
  concrete: 0xf3d37a,
  volatility: 0xf25e5e,
  security: 0x9ca4b2,
  premium: 0x1d1d22,
};

const ORB_VARIANTS = {
  stablecoin: ['reserve-sphere'],
  concrete: ['vault-orb', 'capital-node'],
  volatility: ['yield-rocket'],
  security: ['capital-node-gray'],
  premium: ['shield-core'],
};

const PHOTO_ASSETS = [
  ['photo-vault', photoVault],
  ['photo-capital', photoCapital],
  ['photo-shield', photoShield],
  ['photo-yield', photoYield],
  ['photo-capital-alt', photoCapitalAlt],
  ['photo-reserve', photoReserve],
];

const PHOTO_ASSET_MAP = Object.fromEntries(PHOTO_ASSETS);
const PREVIEW_IMAGE_BY_SKIN = {
  'vault-orb': PHOTO_ASSET_MAP['photo-vault'],
  'capital-node': PHOTO_ASSET_MAP['photo-capital-alt'],
  'capital-node-gray': PHOTO_ASSET_MAP['photo-capital'],
  'shield-core': PHOTO_ASSET_MAP['photo-shield'],
  'yield-rocket': PHOTO_ASSET_MAP['photo-yield'],
  'reserve-sphere': PHOTO_ASSET_MAP['photo-reserve'],
};

const MOBILE_STAGE_WIDTH = 390;
const MOBILE_STAGE_HEIGHT = 844;

const COLOR_KEYS = Object.keys(COLORS);

const POWER_UP_CONFIG = {
  autoCompound: {
    label: 'Auto Compound',
    color: 0x7be7ff,
    duration: 7000,
    cooldown: 12000,
  },
  liquidityBoost: {
    label: 'Liquidity Boost',
    color: 0x8bf0c5,
    duration: 8500,
    cooldown: 13500,
  },
  riskShield: {
    label: 'Risk Shield',
    color: 0x9ad0ff,
  },
  capitalSurge: {
    label: 'Capital Surge',
    color: 0xffdf84,
    duration: 6500,
    cooldown: 11000,
  },
  institutionalMode: {
    label: 'Institutional Mode',
    color: 0xd9b86b,
    duration: 9500,
    cooldown: 15000,
  },
};

const DEFAULT_SETTINGS = {
  sound: true,
  aimGuide: true,
  motion: true,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function getHighScore() {
  return Number(localStorage.getItem(SCORE_KEY) ?? '0');
}

function setHighScore(score) {
  localStorage.setItem(SCORE_KEY, String(score));
}

function pickColor(level = 1) {
  const bias = level > 4 ? COLOR_KEYS : COLOR_KEYS.slice(0, 4);
  return bias[Math.floor(Math.random() * bias.length)];
}

function pickVariantKey(colorKey) {
  const variants = ORB_VARIANTS[colorKey] ?? ORB_VARIANTS.concrete;
  return variants[Math.floor(Math.random() * variants.length)];
}

function hexToCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function hexToRgba(hex, alpha) {
  return `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${alpha})`;
}

class AudioEngine {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  ensureContext() {
    if (!this.enabled) {
      return null;
    }

    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!this.context) {
      this.context = new AudioContextClass();
    }

    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => undefined);
    }

    return this.context;
  }

  tone({ frequency = 440, duration = 0.11, type = 'sine', gain = 0.08, bend = 0 } = {}) {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + bend), context.currentTime + duration);
    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(gain, context.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }

  shoot() {
    this.tone({ frequency: 260, duration: 0.08, type: 'triangle', gain: 0.05, bend: 80 });
  }

  pop(count = 1) {
    this.tone({ frequency: 520 + count * 22, duration: 0.12, type: 'sine', gain: 0.08, bend: 60 });
  }

  drop() {
    this.tone({ frequency: 180, duration: 0.14, type: 'sawtooth', gain: 0.06, bend: -40 });
  }

  fail() {
    this.tone({ frequency: 110, duration: 0.22, type: 'square', gain: 0.08, bend: -24 });
  }
}

class ConcreteVaultScene extends Phaser.Scene {
  constructor() {
    super('ConcreteVaultScene');
    this.columns = 9;
    this.rows = 12;
    this.board = {};
    this.grid = [];
    this.projectile = null;
    this.projectileVelocity = new Phaser.Math.Vector2(0, 0);
    this.aimDirection = new Phaser.Math.Vector2(0, -1);
    this.launcher = { x: 0, y: 0 };
    this.currentColor = 'concrete';
    this.currentSkinKey = null;
    this.nextColor = 'stablecoin';
    this.nextSkinKey = null;
    this.isAiming = false;
    this.chargeTimer = null;
    this.isCharging = false;
    this.chargeStart = 0;
    this.chargeMaxMs = 1200;
    this.chargeMinMs = 40;
    this.chargeMaxMultiplier = 1.8;
    this.score = 0;
    this.level = 1;
    this.comboChain = 0;
    this.turnCleared = false;
    this.vaultStability = 100;
    this.highScore = getHighScore();
    this.shotsUntilPressure = 6;
    this.shotsTaken = 0;
    this.state = 'boot';
    this.hud = window.concreteVaultUI;
    this.audio = null;
    this.motionEnabled = true;
    this.aimGuideEnabled = true;
    this.pointerIsActive = false;
    this.lastPointer = { x: null, y: null };
    this.bubbles = [];
    this.overlayMessage = null;
    this.shakeStrength = 0;
    this.powerUps = {
      autoCompound: { meter: 0, activeUntil: 0, cooldownUntil: 0 },
      liquidityBoost: { meter: 0, activeUntil: 0, cooldownUntil: 0 },
      riskShield: { charges: 1 },
      capitalSurge: { meter: 0, activeUntil: 0, cooldownUntil: 0 },
      institutionalMode: { meter: 0, activeUntil: 0, cooldownUntil: 0 },
    };
  }

  preload() {
    PHOTO_ASSETS.forEach(([key, path]) => {
      this.load.image(key, path);
    });
  }

  create() {
    this.createTextures();
    this.hud = window.concreteVaultUI;
    this.audio = window.concreteVaultAudio;
    this.motionEnabled = window.concreteVaultSettings.motion;
    this.aimGuideEnabled = window.concreteVaultSettings.aimGuide;

    this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
    this.particles = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: this.scale.width },
      y: { min: 0, max: this.scale.height },
      scale: { start: 0.28, end: 0.02 },
      alpha: { start: 0.14, end: 0 },
      lifespan: 4200,
      speedY: { min: -8, max: -28 },
      speedX: { min: -10, max: 10 },
      quantity: 1,
      frequency: 320,
      tint: [0xf3d37a, 0x9aa7bf, 0xffffff],
      blendMode: Phaser.BlendModes.SCREEN,
    });

    this.ambientOrbs = this.add.group();
    for (let index = 0; index < 6; index += 1) {
      const orb = this.add.image(0, 0, 'orb').setAlpha(0.08).setBlendMode(Phaser.BlendModes.MULTIPLY);
      orb.setTint(index % 2 === 0 ? 0xf3d37a : 0x9aa7bf);
      this.tweens.add({
        targets: orb,
        x: { from: this.scale.width * (0.15 + index * 0.12), to: this.scale.width * (0.18 + index * 0.14) },
        y: { from: this.scale.height * (0.18 + (index % 3) * 0.18), to: this.scale.height * (0.16 + (index % 3) * 0.2) },
        duration: 4800 + index * 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.ambientOrbs.add(orb);
    }

    this.aimGraphics = this.add.graphics();
    this.targetGraphics = this.add.graphics();
    this.flashGraphics = this.add.graphics();
    this.powerPulseGraphics = this.add.graphics();
    this.statusText = this.add.text(0, 0, '', {
      fontFamily: 'Orbitron, sans-serif',
      fontSize: '26px',
      color: '#fff4cf',
      align: 'center',
      shadow: {
        offsetX: 0,
        offsetY: 0,
        color: '#f3d37a',
        blur: 12,
        fill: true,
      },
    }).setOrigin(0.5).setAlpha(0);
    // Keep the status text visually above game sprites and fixed to camera
    this.statusText.setDepth(200);
    this.statusText.setScrollFactor(0);

    this.scale.on('resize', this.handleResize, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.keyboard.on('keydown-SPACE', this.handleShootKeyDown, this);
    this.input.keyboard.on('keyup-SPACE', this.handleShootKeyUp, this);
    this.input.keyboard.on('keydown-ENTER', this.handleShootKeyDown, this);
    this.input.keyboard.on('keyup-ENTER', this.handleShootKeyUp, this);

    this.handleResize({ width: this.scale.width, height: this.scale.height });
  }

  createTextures() {
    const makeOrbTexture = (textureKey, sourceKey, colorKey) => {
      const source = this.textures.get(sourceKey)?.getSourceImage?.();
      if (!source) {
        return;
      }

      const textureSize = 112;
      const canvasTexture = this.textures.createCanvas(textureKey, textureSize, textureSize);
      const context = canvasTexture.getContext();
      context.clearRect(0, 0, textureSize, textureSize);

      const center = textureSize / 2;
      const radius = textureSize * 0.34;
      context.save();
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.closePath();
      context.clip();

      const coverScale = Math.max((textureSize * 0.9) / source.width, (textureSize * 0.9) / source.height);
      const drawWidth = source.width * coverScale;
      const drawHeight = source.height * coverScale;
      context.filter = 'saturate(0.76) contrast(0.9) brightness(0.94)';
      context.drawImage(source, (textureSize - drawWidth) / 2, (textureSize - drawHeight) / 2, drawWidth, drawHeight);
      context.filter = 'none';
      context.restore();

      context.globalCompositeOperation = 'source-atop';
      const wash = context.createRadialGradient(center * 0.74, center * 0.68, textureSize * 0.1, center, center, radius);
      wash.addColorStop(0, 'rgba(255,255,255,0.18)');
      wash.addColorStop(0.42, hexToRgba(COLORS[colorKey], colorKey === 'premium' ? 0.06 : 0.14));
      wash.addColorStop(1, hexToRgba(colorKey === 'premium' ? 0x0c0c10 : 0x000000, 0.34));
      context.fillStyle = wash;
      context.fillRect(0, 0, textureSize, textureSize);
      context.globalCompositeOperation = 'source-over';

      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.closePath();
      context.lineWidth = 4;
      context.strokeStyle = hexToRgba(COLORS[colorKey], colorKey === 'premium' ? 0.22 : 0.14);
      context.stroke();

      context.beginPath();
      context.arc(center * 0.82, center * 0.74, radius * 0.45, Math.PI * 1.1, Math.PI * 1.7);
      context.lineWidth = 5;
      context.strokeStyle = 'rgba(255,255,255,0.08)';
      context.stroke();

      context.beginPath();
      context.arc(center, center, radius + 3, 0, Math.PI * 2);
      context.lineWidth = 5;
      context.strokeStyle = colorKey === 'premium' ? 'rgba(255, 214, 109, 0.38)' : hexToRgba(COLORS[colorKey], 0.28);
      context.stroke();

      context.beginPath();
      context.arc(center, center, radius + 6, 0, Math.PI * 2);
      context.lineWidth = 6;
      context.strokeStyle = 'rgba(0,0,0,0.58)';
      context.stroke();

      context.beginPath();
      context.arc(center, center, radius - 1, 0, Math.PI * 2);
      context.lineWidth = 1.5;
      context.strokeStyle = 'rgba(255,255,255,0.12)';
      context.stroke();

      canvasTexture.refresh();
    };

    makeOrbTexture('vault-orb', 'photo-vault', 'concrete');
    makeOrbTexture('capital-node', 'photo-capital-alt', 'concrete');
    makeOrbTexture('capital-node-gray', 'photo-capital', 'security');
    makeOrbTexture('shield-core', 'photo-shield', 'premium');
    makeOrbTexture('yield-rocket', 'photo-yield', 'volatility');
    makeOrbTexture('reserve-sphere', 'photo-reserve', 'stablecoin');

    const orb = this.make.graphics({ x: 0, y: 0, add: false });
    orb.fillStyle(0xffffff, 1);
    orb.fillCircle(64, 64, 24);
    orb.fillStyle(0xf3d37a, 0.08);
    orb.fillCircle(64, 64, 48);
    orb.generateTexture('orb', 128, 128);
    orb.destroy();

    const spark = this.make.graphics({ x: 0, y: 0, add: false });
    spark.fillStyle(0xffffff, 1);
    spark.fillCircle(4, 4, 4);
    spark.generateTexture('spark', 8, 8);
    spark.destroy();
  }

  handleResize(gameSize) {
    const width = gameSize.width ?? this.scale.width;
    const height = gameSize.height ?? this.scale.height;
    const radius = clamp(Math.floor(Math.min(width / 20.5, height / 28)), 16, 22);
    const compactScreen = height < 760;
    const boardTop = compactScreen ? Math.max(84, Math.round(height * 0.1)) : Math.max(106, Math.round(height * 0.13));
    const boardBottom = compactScreen ? height - Math.max(112, Math.round(height * 0.1)) : height - Math.max(142, Math.round(height * 0.14));
    const shooterY = compactScreen ? height - Math.max(78, Math.round(height * 0.055)) : height - Math.max(100, Math.round(height * 0.08));

    this.board = {
      width,
      height,
      radius,
      bubbleScale: radius / 39,
      diameter: radius * 2,
      rowHeight: Math.max(Math.floor(radius * 1.92), radius * 2 + 1),
      left: Math.round((width - ((this.columns * radius * 2) + radius)) / 2),
      top: boardTop,
      bottom: boardBottom,
      shooterY,
      shooterX: Math.round(width / 2),
    };

    this.launcher = { x: this.board.shooterX, y: this.board.shooterY };
    // Responsive font sizing for mobile / small screens
    const baseSize = Math.max(12, Math.round(Math.min(width, height) * 0.035));
    this.statusText.setStyle({ fontSize: `${baseSize}px` });
    // Vertical offset: nudge up on small screens to avoid overlapping the bubble field
    const yOffset = height < 520 ? Math.round(-Math.max(28, baseSize * 1.4)) : -24;
    this.statusText.setPosition(width / 2, height / 2 + yOffset);
    this.repositionDecor(width, height);
    this.relayoutBubbles();
    this.redrawProjectile();
    this.drawAimGuide();
  }

  repositionDecor(width, height) {
    if (this.ambientOrbs) {
      this.ambientOrbs.getChildren().forEach((orb, index) => {
        orb.setPosition(width * (0.12 + index * 0.14), height * (0.18 + (index % 3) * 0.18));
      });
    }
  }

  resetGame(fullReset = false) {
    this.score = 0;
    this.level = 1;
    this.comboChain = 0;
    this.turnCleared = false;
    this.vaultStability = 100;
    this.shotsUntilPressure = 7;
    this.shotsTaken = 0;
    this.projectile = null;
    this.projectileVelocity.set(0, 0);
    this.state = 'playing';
    this.shakeStrength = 0;
    this.resetPowerUps();
    this.clearBoard();
    this.spawnOpeningWave();
    this.currentColor = pickColor(this.level);
    this.currentSkinKey = pickVariantKey(this.currentColor);
    this.nextColor = pickColor(this.level);
    this.nextSkinKey = pickVariantKey(this.nextColor);
    this.syncHud();
    this.showStatus(fullReset ? 'VAULT STABILIZED' : 'NEW WAVE READY', 1100);
    this.audio?.tone({ frequency: 420, duration: 0.08, type: 'triangle', gain: 0.03, bend: 20 });
  }

  clearBoard() {
    this.bubbles.forEach((bubble) => bubble.sprite.destroy());
    this.bubbles = [];
    this.grid = Array.from({ length: this.rows }, () => Array(this.columns).fill(null));
    if (this.currentBubbleSprite) {
      this.currentBubbleSprite.destroy();
      this.currentBubbleSprite = null;
    }
    if (this.projectileSprite) {
      this.projectileSprite.destroy();
      this.projectileSprite = null;
    }
  }

  resetPowerUps() {
    this.powerUps = {
      autoCompound: { meter: 0, activeUntil: 0, cooldownUntil: 0 },
      liquidityBoost: { meter: 0, activeUntil: 0, cooldownUntil: 0 },
      riskShield: { charges: 1 },
      capitalSurge: { meter: 0, activeUntil: 0, cooldownUntil: 0 },
      institutionalMode: { meter: 0, activeUntil: 0, cooldownUntil: 0 },
    };
    this.syncPowerUpHud();
  }

  spawnOpeningWave() {
    const rowsToSeed = 4;
    for (let row = 0; row < rowsToSeed; row += 1) {
      for (let col = 0; col < this.columns; col += 1) {
        if (Math.random() < 0.76 || row < 2) {
          this.spawnBubble(row, col, pickColor(this.level));
        }
      }
    }
    this.relayoutBubbles();
  }

  spawnBubble(row, col, colorKey, skinKey = null) {
    const skinToUse = skinKey || pickVariantKey(colorKey);
    const bubble = {
      row,
      col,
      colorKey,
      skinKey: skinToUse,
      sprite: this.add.image(0, 0, skinToUse),
      scale: this.board.bubbleScale,
      moving: false,
    };

    bubble.sprite.setOrigin(0.5);
    bubble.sprite.setScale(bubble.scale);
    bubble.sprite.setDepth(2);
    bubble.sprite.setBlendMode(Phaser.BlendModes.NORMAL);
    this.grid[row][col] = bubble;
    this.bubbles.push(bubble);
    this.placeBubble(bubble);
    return bubble;
  }

  placeBubble(bubble) {
    const position = this.cellToWorld(bubble.row, bubble.col);
    bubble.sprite.setPosition(position.x, position.y);
    bubble.sprite.setScale(this.board.bubbleScale);
  }

  redrawProjectile() {
    if (this.projectileSprite && this.projectile) {
      this.projectileSprite.setPosition(this.projectile.sprite.x, this.projectile.sprite.y);
      this.projectileSprite.setScale(this.board.bubbleScale);
    }
  }

  relayoutBubbles() {
    this.bubbles.forEach((bubble) => {
      if (bubble.sprite && bubble.sprite.active) {
        this.placeBubble(bubble);
      }
    });
  }

  cellToWorld(row, col) {
    const offset = row % 2 === 0 ? 0 : this.board.radius;
    return {
      x: this.board.left + offset + col * this.board.diameter + this.board.radius,
      y: this.board.top + row * this.board.rowHeight + this.board.radius,
    };
  }

  worldToCell(x, y) {
    let bestRow = 0;
    let bestCol = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.columns; col += 1) {
        if (this.grid[row][col]) {
          continue;
        }

        const position = this.cellToWorld(row, col);
        const distance = Phaser.Math.Distance.Between(x, y, position.x, position.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRow = row;
          bestCol = col;
        }
      }
    }

    return { row: bestRow, col: bestCol };
  }

  getNeighbors(row, col) {
    const offsets = row % 2 === 0
      ? [
          [-1, -1],
          [-1, 0],
          [0, -1],
          [0, 1],
          [1, -1],
          [1, 0],
        ]
      : [
          [-1, 0],
          [-1, 1],
          [0, -1],
          [0, 1],
          [1, 0],
          [1, 1],
        ];

    return offsets
      .map(([rowOffset, colOffset]) => ({ row: row + rowOffset, col: col + colOffset }))
      .filter((cell) => cell.row >= 0 && cell.row < this.rows && cell.col >= 0 && cell.col < this.columns);
  }

  handlePointerMove(pointer) {
    if (this.state !== 'playing') {
      return;
    }

    this.pointerIsActive = true;
    this.lastPointer.x = pointer.worldX;
    this.lastPointer.y = pointer.worldY;
    this.updateAim(pointer.worldX, pointer.worldY);
  }

  handlePointerDown(pointer) {
    if (this.state !== 'playing') {
      return;
    }

    this.lastPointer.x = pointer.worldX;
    this.lastPointer.y = pointer.worldY;
    this.updateAim(pointer.worldX, pointer.worldY);
    // Begin aiming immediately. Start charging only after a short hold.
    this.isAiming = true;
    if (this.chargeTimer) {
      clearTimeout(this.chargeTimer);
      this.chargeTimer = null;
    }
    this.chargeTimer = setTimeout(() => {
      this.chargeTimer = null;
      this.startCharge();
    }, 200);
  }

  handleShootKey() {
    if (this.state !== 'playing') {
      return;
    }
    // legacy single-key handler replaced by keydown/keyup pairing
    this.startCharge();
  }

  handleShootKeyDown() {
    if (this.state !== 'playing') return;
    this.startCharge();
  }

  handleShootKeyUp() {
    if (this.state !== 'playing') return;
    // ensure aim reflects latest pointer position when using keyboard
    const px = (this.lastPointer && this.lastPointer.x != null) ? this.lastPointer.x : this.input.activePointer.worldX;
    const py = (this.lastPointer && this.lastPointer.y != null) ? this.lastPointer.y : this.input.activePointer.worldY;
    if (px != null && py != null) {
      this.updateAim(px, py);
      this.drawAimGuide();
    }
    if (this.isCharging) {
      const now = Date.now();
      const dur = Math.max(0, now - this.chargeStart);
      const ratio = Math.min(1, dur / this.chargeMaxMs);
      const multiplier = 1 + ratio * (this.chargeMaxMultiplier - 1);
      this.releaseCharge(multiplier);
    } else {
      // fallback quick fire
      this.fireProjectile(1);
    }
  }

  handlePointerUp(pointer) {
    if (this.state !== 'playing') return;
    // update last pointer and aim to release position, then redraw guide
    if (pointer && pointer.worldX != null) {
      this.lastPointer.x = pointer.worldX;
      this.lastPointer.y = pointer.worldY;
      this.updateAim(pointer.worldX, pointer.worldY);
      this.drawAimGuide();
    }
    // cancel pending charge timer if present
    if (this.chargeTimer) {
      clearTimeout(this.chargeTimer);
      this.chargeTimer = null;
    }
    if (this.isCharging) {
      const now = Date.now();
      const dur = Math.max(0, now - this.chargeStart);
      const ratio = Math.min(1, dur / this.chargeMaxMs);
      const multiplier = 1 + ratio * (this.chargeMaxMultiplier - 1);
      this.releaseCharge(multiplier);
      this.isAiming = false;
      return;
    }
    // if we weren't charging, treat as a quick tap -> immediate fire
    if (this.isAiming) {
      this.isAiming = false;
      this.fireProjectile(1);
    }
  }

  startCharge() {
    if (this.projectile) return; // already have a projectile
    this.isCharging = true;
    this.chargeStart = Date.now();
  }

  releaseCharge(multiplier = 1) {
    if (!this.isCharging) return;
    this.isCharging = false;
    this.fireProjectile(multiplier);
  }

  updateAim(targetX, targetY) {
    const vector = new Phaser.Math.Vector2(targetX - this.launcher.x, targetY - this.launcher.y);
    if (vector.lengthSq() === 0) {
      vector.set(0, -1);
    }

    vector.normalize();
    // allow shallower upward angles so corners are reachable
    vector.y = Math.min(vector.y, -0.06);
    vector.normalize();
    this.aimDirection.copy(vector);
    this.drawAimGuide();
  }

  fireProjectile(powerMultiplier = 1) {
    if (this.projectile) {
      return;
    }

    if (this.currentColor == null) {
      this.currentColor = pickColor(this.level);
    }

    if (this.currentSkinKey == null) {
      this.currentSkinKey = pickVariantKey(this.currentColor);
    }

    const scale = this.board.radius / 22;
    this.projectileSprite = this.add.image(this.launcher.x, this.launcher.y, this.currentSkinKey)
      .setScale(scale)
      .setDepth(3)
      .setBlendMode(Phaser.BlendModes.NORMAL);

    this.projectile = {
      sprite: this.projectileSprite,
      colorKey: this.currentColor,
      skinKey: this.currentSkinKey,
      radius: this.board.radius,
    };

    this.turnCleared = false;
    this.projectileVelocity = this.aimDirection.clone().scale(this.projectileSpeed() * (powerMultiplier ?? 1));
    this.audio?.shoot();
    this.shotsTaken += 1;
    this.syncHud();

    this.currentColor = this.nextColor;
    this.currentSkinKey = this.nextSkinKey;
    this.nextColor = pickColor(this.level);
    this.nextSkinKey = pickVariantKey(this.nextColor);
    this.syncNextPreview();
    this.drawAimGuide();
  }

  projectileSpeed() {
    return 720 + (this.level - 1) * 22;
  }

  update(time, delta) {
    this.updatePowerUps(time, delta);

    if (this.state !== 'playing') {
      this.drawAimGuide(time);
      this.drawTargetPulse(time);
      return;
    }

    this.flashGraphics.clear();
    this.targetGraphics.clear();
    this.powerPulseGraphics.clear();

    if (this.projectile) {
      const step = delta / 1000;
      const sprite = this.projectile.sprite;
      sprite.x += this.projectileVelocity.x * step;
      sprite.y += this.projectileVelocity.y * step;

      const radius = this.board.radius;
      const leftLimit = this.board.left + radius;
      const rightLimit = this.board.left + (this.columns - 1) * this.board.diameter + this.board.diameter + radius;
      const topLimit = this.board.top + radius;

      if (sprite.x <= leftLimit) {
        sprite.x = leftLimit;
        this.projectileVelocity.x = Math.abs(this.projectileVelocity.x);
        this.emitWallFlash(sprite.x, sprite.y);
      } else if (sprite.x >= rightLimit) {
        sprite.x = rightLimit;
        this.projectileVelocity.x = -Math.abs(this.projectileVelocity.x);
        this.emitWallFlash(sprite.x, sprite.y);
      }

      if (sprite.y <= topLimit) {
        this.lockProjectileToGrid(sprite.x, sprite.y);
        this.drawTargetPulse(time);
        return;
      }

      const hitBubble = this.findCollisionBubble(sprite.x, sprite.y, radius * 1.92);
      if (hitBubble) {
        this.lockProjectileToGrid(sprite.x, sprite.y, hitBubble);
        this.drawTargetPulse(time);
      }
    }

    // Draw charge indicator if charging
    if (this.isCharging) {
      const dur = Math.min(this.chargeMaxMs, Date.now() - this.chargeStart);
      const ratio = Math.max(0, Math.min(1, dur / this.chargeMaxMs));
      const radius = this.board.radius * (1 + 0.5 * ratio);
      this.powerPulseGraphics.lineStyle(3, 0xf3d37a, 0.9);
      this.powerPulseGraphics.strokeCircle(this.launcher.x, this.launcher.y, radius);
    }

    this.updateCameraMotion(delta);
    this.drawAimGuide(time);
    this.drawTargetPulse(time);
  }

  updateCameraMotion(delta) {
    if (!this.motionEnabled) {
      this.cameras.main.setScroll(0, 0);
      return;
    }

    this.shakeStrength = Math.max(0, this.shakeStrength - delta * 0.0028);
    const offset = this.shakeStrength > 0 ? this.shakeStrength * 2 : 0;
    this.cameras.main.setScroll((Math.random() - 0.5) * offset, (Math.random() - 0.5) * offset);
  }

  findCollisionBubble(x, y, radius) {
    let closest = null;
    let bestDistance = radius;
    this.bubbles.forEach((bubble) => {
      if (!bubble.sprite.active || bubble.moving) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(x, y, bubble.sprite.x, bubble.sprite.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        closest = bubble;
      }
    });

    return closest;
  }

  lockProjectileToGrid(x, y, collisionBubble = null) {
    if (!this.projectile) {
      return;
    }

    const targetCell = this.pickAttachmentCell(x, y, collisionBubble);
    if (!targetCell) {
      if (this.absorbFailedShot()) {
        this.syncHud();
        return;
      }

      this.failRun();
      return;
    }

    const bubble = this.spawnBubble(targetCell.row, targetCell.col, this.projectile.colorKey, this.projectile.skinKey);
    bubble.sprite.setScale(this.board.bubbleScale);
    bubble.sprite.setAlpha(0.98);
    bubble.sprite.setPosition(this.projectile.sprite.x, this.projectile.sprite.y);
    this.tweens.add({
      targets: bubble.sprite,
      x: this.cellToWorld(targetCell.row, targetCell.col).x,
      y: this.cellToWorld(targetCell.row, targetCell.col).y,
      duration: 88,
      ease: 'Sine.easeOut',
    });

    this.destroyProjectile();
    this.resolveMatches(bubble);
  }

  pickAttachmentCell(x, y, collisionBubble) {
    const candidates = [];
    const addCandidate = (row, col) => {
      if (row < 0 || row >= this.rows || col < 0 || col >= this.columns) {
        return;
      }

      if (this.grid[row][col]) {
        return;
      }

      const position = this.cellToWorld(row, col);
      candidates.push({ row, col, distance: Phaser.Math.Distance.Between(x, y, position.x, position.y) });
    };

    if (collisionBubble) {
      this.getNeighbors(collisionBubble.row, collisionBubble.col).forEach((cell) => addCandidate(cell.row, cell.col));
    }

    if (candidates.length === 0) {
      const suggested = this.worldToCell(x, y);
      addCandidate(suggested.row, suggested.col);
      this.getNeighbors(suggested.row, suggested.col).forEach((cell) => addCandidate(cell.row, cell.col));
    }

    if (candidates.length === 0) {
      for (let row = 0; row < this.rows; row += 1) {
        for (let col = 0; col < this.columns; col += 1) {
          addCandidate(row, col);
        }
      }
    }

    candidates.sort((left, right) => left.distance - right.distance);
    return candidates[0] ?? null;
  }

  destroyProjectile() {
    if (this.projectile?.sprite) {
      this.projectile.sprite.destroy();
    }

    this.projectile = null;
    this.projectileSprite = null;
  }

  resolveMatches(startBubble) {
    const group = this.collectGroup(startBubble);
    if (group.length >= 3) {
      this.popGroup(group);
    }

    this.dropDisconnectedBubbles();
    this.afterTurn();
  }

  collectGroup(startBubble) {
    const targetColor = startBubble.colorKey;
    const stack = [startBubble];
    const visited = new Set();
    const group = [];

    while (stack.length > 0) {
      const bubble = stack.pop();
      const key = `${bubble.row}:${bubble.col}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      if (bubble.colorKey !== targetColor) {
        continue;
      }

      group.push(bubble);
      this.getNeighbors(bubble.row, bubble.col).forEach((cell) => {
        const neighbor = this.grid[cell.row][cell.col];
        if (neighbor && neighbor.colorKey === targetColor) {
          stack.push(neighbor);
        }
      });
    }

    return group;
  }

  popGroup(group) {
    const pulse = group.length;
    const capitalMultiplier = this.isPowerUpActive('capitalSurge') ? 2 : 1;
    const comboMultiplier = 1 + Math.min(this.comboChain + 1, 8) * 0.14;
    this.score += Math.round((pulse * 12 + Math.max(0, pulse - 3) * 4) * capitalMultiplier * comboMultiplier);
    this.audio?.pop(pulse);
    this.shakeStrength = Math.min(12, this.shakeStrength + 4 + pulse * 0.25);
    this.turnCleared = true;

    group.forEach((bubble) => {
      this.grid[bubble.row][bubble.col] = null;
      this.bubbles = this.bubbles.filter((item) => item !== bubble);
      this.tweens.add({
        targets: bubble.sprite,
        scale: bubble.sprite.scale * 1.5,
        alpha: 0,
        duration: 180,
        ease: 'Back.easeIn',
        onComplete: () => bubble.sprite.destroy(),
      });
    });

    this.gainPowerUpMeter('autoCompound', pulse * 12);
    this.gainPowerUpMeter('capitalSurge', pulse * 10 + this.comboChain * 5);
    this.gainPowerUpMeter('liquidityBoost', 8);
    this.gainPowerUpMeter('institutionalMode', this.vaultStability < 60 ? 14 : 6);
    this.triggerAutoCompound(group);
    if (pulse >= 4) {
      this.powerUps.riskShield.charges = Math.min(2, this.powerUps.riskShield.charges + 1);
    }

    this.syncHud();
    this.flashGraphics.fillStyle(0xf3d37a, 0.06);
    this.flashGraphics.fillCircle(this.scale.width / 2, this.scale.height / 2, 180);
  }

  dropDisconnectedBubbles() {
    const connected = new Set();
    const queue = [];

    for (let col = 0; col < this.columns; col += 1) {
      const bubble = this.grid[0][col];
      if (bubble) {
        queue.push(bubble);
      }
    }

    while (queue.length > 0) {
      const bubble = queue.shift();
      const key = `${bubble.row}:${bubble.col}`;
      if (connected.has(key)) {
        continue;
      }
      connected.add(key);

      this.getNeighbors(bubble.row, bubble.col).forEach((cell) => {
        const neighbor = this.grid[cell.row][cell.col];
        if (neighbor) {
          queue.push(neighbor);
        }
      });
    }

    const detached = [];
    this.bubbles.forEach((bubble) => {
      const key = `${bubble.row}:${bubble.col}`;
      if (!connected.has(key)) {
        detached.push(bubble);
      }
    });

    if (detached.length === 0) {
      return;
    }

    this.turnCleared = true;
    this.audio?.drop();
    this.gainPowerUpMeter('autoCompound', detached.length * 8);
    this.gainPowerUpMeter('liquidityBoost', 6);
    detached.forEach((bubble) => {
      this.grid[bubble.row][bubble.col] = null;
      this.bubbles = this.bubbles.filter((item) => item !== bubble);
      this.tweens.add({
        targets: bubble.sprite,
        y: this.scale.height + 80,
        alpha: 0,
        duration: 360,
        ease: 'Sine.easeIn',
        onComplete: () => bubble.sprite.destroy(),
      });
      this.score += 6;
    });

    this.syncHud();
  }

  afterTurn() {
    this.comboChain = this.turnCleared ? Math.min(99, this.comboChain + 1) : 0;
    this.turnCleared = false;
    this.shotsUntilPressure -= this.getPressureDrainPerTurn();
    if (this.score >= this.level * 180) {
      this.level += 1;
      this.shotsUntilPressure = Math.max(this.getPressureThreshold() - 1, this.getPressureThreshold() - Math.floor(this.level / 3));
      this.powerUps.riskShield.charges = Math.min(2, this.powerUps.riskShield.charges + 1);
      this.gainPowerUpMeter('institutionalMode', 18);
      this.gainPowerUpMeter('capitalSurge', 12);
      this.showStatus(`LEVEL ${this.level}`, 900);
    }

    if (this.isBoardEmpty()) {
      this.showStatus('WAVE CLEARED', 900);
      this.powerUps.riskShield.charges = 1;
      this.gainPowerUpMeter('autoCompound', 18);
      this.gainPowerUpMeter('institutionalMode', 12);
      this.time.delayedCall(520, () => {
        if (this.state === 'playing') {
          this.spawnOpeningWave();
          this.currentColor = pickColor(this.level);
          this.currentSkinKey = pickVariantKey(this.currentColor);
          this.nextColor = pickColor(this.level);
          this.nextSkinKey = pickVariantKey(this.nextColor);
          this.syncNextPreview();
          this.syncHud();
        }
      });
    }

    if (this.isPowerUpActive('institutionalMode') && this.shotsUntilPressure <= 0) {
      this.shotsUntilPressure = this.getPressureThreshold();
    } else if (this.shotsUntilPressure <= 0) {
      this.shotsUntilPressure = this.getPressureThreshold();
      this.pushPressureRow();
    }

    this.gainPowerUpMeter('liquidityBoost', this.shotsUntilPressure <= 2 ? 12 : 6);
    this.gainPowerUpMeter('autoCompound', this.comboChain > 0 ? 4 : 0);
    this.syncHud();
  }

  isBoardEmpty() {
    return this.bubbles.length === 0;
  }

  pushPressureRow() {
    if (this.isPowerUpActive('institutionalMode')) {
      this.showStatus('INSTITUTIONAL MODE STABILIZED THE BOARD', 900);
      return;
    }

    if (this.grid[this.rows - 1].some(Boolean)) {
      this.failRun();
      return;
    }

    const nextGrid = Array.from({ length: this.rows }, () => Array(this.columns).fill(null));
    for (let row = this.rows - 1; row >= 1; row -= 1) {
      for (let col = 0; col < this.columns; col += 1) {
        const bubble = this.grid[row - 1][col];
        if (bubble) {
          bubble.row = row;
          bubble.col = col;
          nextGrid[row][col] = bubble;
        }
      }
    }

    for (let col = 0; col < this.columns; col += 1) {
      if (Math.random() < 0.82 || col === 0 || col === this.columns - 1) {
        const bubble = this.spawnBubble(0, col, pickColor(this.level));
        nextGrid[0][col] = bubble;
      }
    }

    this.grid = nextGrid;
    this.relayoutBubbles();
    this.audio?.tone({ frequency: 210, duration: 0.11, type: 'triangle', gain: 0.05, bend: -30 });
    this.gainPowerUpMeter('liquidityBoost', 16);
    this.gainPowerUpMeter('institutionalMode', 10);
    this.showStatus('PRESSURE RISE', 700);
  }

  failRun() {
    if (this.state === 'gameover') {
      return;
    }

    if (this.absorbFailedShot()) {
      this.syncHud();
      return;
    }

    this.state = 'gameover';
    this.audio?.fail();
    this.showStatus('VAULT BREACHED', 1400);
    if (this.score > this.highScore) {
      this.highScore = this.score;
      setHighScore(this.highScore);
    }
    window.concreteVaultUI?.showGameOver(this.score, this.highScore);
  }

  emitWallFlash(x, y) {
    this.flashGraphics.fillStyle(0xffdd86, 0.04);
    this.flashGraphics.fillCircle(x, y, 28);
  }

  findAimCollision(origin, direction, maxDistance) {
    const step = Math.max(6, this.board.radius * 0.45);
    const hitRadius = this.board.radius * 1.22;
    for (let traveled = step; traveled <= maxDistance; traveled += step) {
      const x = origin.x + direction.x * traveled;
      const y = origin.y + direction.y * traveled;
      const hit = this.findCollisionBubble(x, y, hitRadius);
      if (hit) {
        return { hit, x, y };
      }
    }
    return null;
  }

  drawAimGuide(time = this.time.now) {
    this.aimGraphics.clear();
    if (this.state !== 'playing' || this.projectile || !this.aimGuideEnabled) {
      return;
    }

    const origin = new Phaser.Math.Vector2(this.launcher.x, this.launcher.y);
    const direction = this.aimDirection.clone();
    const segmentLength = Math.max(this.scale.height, this.scale.width);
    const end = this.projectAim(origin, direction, segmentLength);
    const maxDistance = Phaser.Math.Distance.Between(origin.x, origin.y, end.x, end.y);
    const collision = this.findAimCollision(origin, direction, maxDistance);
    let targetCell = null;
    let impactPoint = end;

    if (collision) {
      targetCell = this.pickAttachmentCell(collision.x, collision.y, collision.hit);
    } else {
      targetCell = this.worldToCell(end.x, end.y);
    }

    if (targetCell) {
      impactPoint = this.cellToWorld(targetCell.row, targetCell.col);
    }

    const guideEnd = impactPoint;
    const pulse = 0.5 + Math.sin(time * 0.0075) * 0.5;
    const impactRadius = this.board.radius * (0.72 + pulse * 0.1);

    this.aimGraphics.lineStyle(5, 0xf3d37a, 0.05);
    this.aimGraphics.lineBetween(origin.x, origin.y, guideEnd.x, guideEnd.y);
    this.aimGraphics.lineStyle(2, 0xf3d37a, 0.2);
    this.aimGraphics.lineBetween(origin.x, origin.y, guideEnd.x, guideEnd.y);
    this.aimGraphics.lineStyle(1, 0xfff0ba, 0.55);
    this.aimGraphics.lineBetween(origin.x, origin.y, guideEnd.x, guideEnd.y);
    this.aimGraphics.fillStyle(0xffdf84, 0.18 + pulse * 0.08);
    this.aimGraphics.fillCircle(impactPoint.x, impactPoint.y, impactRadius * 0.82);
    this.aimGraphics.lineStyle(2, 0xffdf84, 0.36 + pulse * 0.18);
    this.aimGraphics.strokeCircle(impactPoint.x, impactPoint.y, impactRadius);
    this.aimGraphics.fillStyle(0xfff5c8, 0.58);
    this.aimGraphics.fillCircle(guideEnd.x, guideEnd.y, 4 + pulse * 1.3);
  }

  drawTargetPulse(time = this.time.now) {
    this.targetGraphics.clear();
    if (this.state !== 'playing' || !this.projectile?.sprite) {
      return;
    }

    const sprite = this.projectile.sprite;
    const pulse = 0.5 + Math.sin(time * 0.0085) * 0.5;
    const radius = this.board.radius * (0.62 + pulse * 0.08);

    this.targetGraphics.fillStyle(0xf3d37a, 0.08 + pulse * 0.06);
    this.targetGraphics.fillCircle(sprite.x, sprite.y, radius * 1.25);
    this.targetGraphics.lineStyle(2, 0xfff0ba, 0.12 + pulse * 0.1);
    this.targetGraphics.strokeCircle(sprite.x, sprite.y, radius * 1.1);
    this.targetGraphics.fillStyle(0xfff7dc, 0.18 + pulse * 0.08);
    this.targetGraphics.fillCircle(sprite.x, sprite.y, radius * 0.44);
  }

  projectAim(origin, direction, maxDistance) {
    let x = origin.x;
    let y = origin.y;
    let dx = direction.x;
    let dy = direction.y;
    let remaining = maxDistance;

    for (let step = 0; step < 2 && remaining > 0; step += 1) {
      const toLeft = dx < 0 ? (this.board.left + this.board.radius - x) / dx : Number.POSITIVE_INFINITY;
      const toRight = dx > 0 ? ((this.board.left + (this.columns - 1) * this.board.diameter + this.board.diameter + this.board.radius) - x) / dx : Number.POSITIVE_INFINITY;
      const toTop = dy < 0 ? ((this.board.top + this.board.radius) - y) / dy : Number.POSITIVE_INFINITY;
      const candidates = [toLeft, toRight, toTop].filter((value) => Number.isFinite(value) && value > 0);
      const distance = candidates.length > 0 ? Math.min(...candidates) : remaining;

      if (distance >= remaining) {
        x += dx * remaining;
        y += dy * remaining;
        break;
      }

      x += dx * distance;
      y += dy * distance;
      remaining -= distance;

      if (distance === toLeft || distance === toRight) {
        dx *= -1;
      } else {
        break;
      }
    }

    return { x, y };
  }

  syncHud() {
    const pressureThreshold = this.getPressureThreshold();
    const pressure = clamp(Math.round(((pressureThreshold - this.shotsUntilPressure) / pressureThreshold) * 100), 0, 100);
    const stability = this.calculateVaultStability(pressure);
    this.vaultStability = stability;
    this.hud?.setScore(this.score);
    this.hud?.setLevel(this.level);
    this.hud?.setPressure(pressure);
    this.hud?.setCombo(this.comboChain);
    this.hud?.setStability(stability);
    this.hud?.setHighScore(Math.max(this.highScore, getHighScore()));
    this.syncNextPreview();
    this.syncPowerUpHud();

    // Mirror core metrics into the branded floating HUD elements
    this.hud?.setYield?.(stability);
    this.hud?.setEfficiency?.(this.level);
    this.hud?.setOptimization?.(this.score);
    this.hud?.setRisk?.(pressure);
    this.hud?.setIntegrity?.(this.comboChain);
  }

  calculateVaultStability(pressure) {
    const highestOccupiedRow = this.bubbles.reduce((highest, bubble) => Math.max(highest, bubble.row), -1);
    const stackRisk = highestOccupiedRow >= 0 ? Math.round(((highestOccupiedRow + 1) / this.rows) * 48) : 0;
    const institutionalBuffer = this.isPowerUpActive('institutionalMode') ? 14 : 0;
    const shieldBuffer = this.powerUps.riskShield.charges > 0 ? 8 : 0;
    return clamp(100 - Math.round(pressure * 0.55) - stackRisk + institutionalBuffer + shieldBuffer, 0, 100);
  }

  getPressureThreshold() {
    let threshold = 7;
    if (this.isPowerUpActive('liquidityBoost')) {
      threshold += 3;
    }

    if (this.isPowerUpActive('institutionalMode')) {
      threshold += 4;
    }

    return threshold;
  }

  getPressureDrainPerTurn() {
    if (this.isPowerUpActive('institutionalMode')) {
      return 0;
    }

    if (this.isPowerUpActive('liquidityBoost')) {
      return 0.45;
    }

    return 1;
  }

  isPowerUpActive(name, time = this.time.now) {
    const powerUp = this.powerUps[name];
    return Boolean(powerUp && powerUp.activeUntil && powerUp.activeUntil > time);
  }

  gainPowerUpMeter(name, amount) {
    const config = POWER_UP_CONFIG[name];
    const powerUp = this.powerUps[name];
    if (!config || !powerUp || typeof powerUp.meter !== 'number' || amount <= 0) {
      return;
    }

    if (this.isPowerUpActive(name)) {
      return;
    }

    const now = this.time.now;
    if (powerUp.cooldownUntil && powerUp.cooldownUntil > now) {
      powerUp.meter = clamp(powerUp.meter + amount * 0.34, 0, 99.5);
      return;
    }

    powerUp.meter = clamp(powerUp.meter + amount, 0, 100);
    if (powerUp.meter >= 100) {
      this.activatePowerUp(name);
    }
  }

  activatePowerUp(name) {
    const config = POWER_UP_CONFIG[name];
    const powerUp = this.powerUps[name];
    if (!config || !powerUp || typeof powerUp.meter !== 'number') {
      return;
    }

    const now = this.time.now;
    if (powerUp.cooldownUntil && powerUp.cooldownUntil > now) {
      return;
    }

    powerUp.meter = 0;
    powerUp.activeUntil = now + config.duration;
    powerUp.cooldownUntil = now + config.cooldown;
    this.cameras.main.flash(
      180,
      (config.color >> 16) & 255,
      (config.color >> 8) & 255,
      config.color & 255,
    );
    this.cameras.main.shake(120, name === 'institutionalMode' ? 0.004 : 0.006);
    this.audio?.tone({
      frequency: name === 'capitalSurge' ? 760 : name === 'institutionalMode' ? 320 : 560,
      duration: 0.2,
      type: 'sine',
      gain: 0.085,
      bend: name === 'liquidityBoost' ? 100 : -24,
    });

    const activationMessages = {
      autoCompound: 'AUTO COMPOUND ONLINE',
      liquidityBoost: 'LIQUIDITY BOOST ENGAGED',
      capitalSurge: 'CAPITAL SURGE x2',
      institutionalMode: 'INSTITUTIONAL MODE STABLE',
    };

    this.showStatus(activationMessages[name] ?? config.label.toUpperCase(), 1000);
  }

  updatePowerUps(time) {
    let changed = false;
    Object.entries(POWER_UP_CONFIG).forEach(([name, config]) => {
      const powerUp = this.powerUps[name];
      if (!powerUp || typeof powerUp.meter !== 'number') {
        return;
      }

      if (powerUp.activeUntil && powerUp.activeUntil <= time) {
        powerUp.activeUntil = 0;
        changed = true;
        this.showStatus(`${config.label.toUpperCase()} OFFLINE`, 700);
      }

      if (powerUp.cooldownUntil && powerUp.cooldownUntil <= time) {
        powerUp.cooldownUntil = 0;
        changed = true;
      }
    });

    if (changed) {
      this.syncPowerUpHud();
    }
  }

  syncPowerUpHud() {
    const now = this.time?.now ?? 0;
    const snapshot = (name) => {
      const config = POWER_UP_CONFIG[name];
      const powerUp = this.powerUps[name];
      if (!config || !powerUp) {
        return null;
      }

      if (name === 'riskShield') {
        const armed = powerUp.charges > 0;
        return {
          state: armed ? 'armed' : 'recharging',
          fill: armed ? 100 : 0,
          detail: armed ? `${powerUp.charges} CHARGE` : '0 CHARGE',
        };
      }

      const active = powerUp.activeUntil > now;
      const cooling = !active && powerUp.cooldownUntil > now;
      const fill = active ? Math.round(((powerUp.activeUntil - now) / config.duration) * 100) : Math.round(powerUp.meter);

      return {
        state: active ? 'active' : cooling ? 'cooldown' : 'ready',
        fill: clamp(fill, 0, 100),
        detail: active
          ? `${Math.ceil((powerUp.activeUntil - now) / 1000)}S`
          : cooling
            ? 'COOLDOWN'
            : `${Math.round(powerUp.meter)}%`,
      };
    };

    Object.keys(POWER_UP_CONFIG).forEach((name) => {
      this.hud?.setPowerUpState?.(name, {
        label: POWER_UP_CONFIG[name].label,
        accent: hexToCss(POWER_UP_CONFIG[name].color),
        ...snapshot(name),
      });
    });
  }

  triggerAutoCompound(group) {
    if (!this.isPowerUpActive('autoCompound')) {
      return;
    }

    const targets = new Set();
    group.forEach((bubble) => {
      this.getNeighbors(bubble.row, bubble.col).forEach((cell) => {
        const neighbor = this.grid[cell.row][cell.col];
        if (neighbor && !group.includes(neighbor)) {
          targets.add(neighbor);
        }
      });
    });

    if (targets.size === 0) {
      return;
    }

    const compoundTargets = Array.from(targets).slice(0, 10);
    this.audio?.tone({ frequency: 820, duration: 0.16, type: 'triangle', gain: 0.06, bend: 120 });
    this.flashGraphics.fillStyle(0x8befff, 0.08);
    this.flashGraphics.fillCircle(this.scale.width / 2, this.scale.height / 2, 220);

    compoundTargets.forEach((bubble, index) => {
      this.grid[bubble.row][bubble.col] = null;
      this.bubbles = this.bubbles.filter((item) => item !== bubble);
      this.tweens.add({
        targets: bubble.sprite,
        scale: bubble.sprite.scale * 1.3,
        alpha: 0,
        delay: index * 30,
        duration: 180,
        ease: 'Sine.easeOut',
        onComplete: () => bubble.sprite.destroy(),
      });
      this.score += 8;
    });

    this.gainPowerUpMeter('autoCompound', compoundTargets.length * 4);
  }

  absorbFailedShot() {
    if (!this.projectile || this.powerUps.riskShield.charges <= 0) {
      return false;
    }

    this.powerUps.riskShield.charges -= 1;
    this.audio?.tone({ frequency: 220, duration: 0.14, type: 'sine', gain: 0.06, bend: 90 });
    this.cameras.main.flash(150, 0x9a, 0xd0, 0xff);
    this.showStatus('RISK SHIELD ABSORBED THE FAILED SHOT', 980);
    this.destroyProjectile();
    return true;
  }

  syncNextPreview() {
    this.hud?.setNextColor(this.currentColor, this.currentSkinKey);
  }

  showStatus(message, duration = 900) {
    this.statusText.setText(message);
    this.statusText.setAlpha(1);
    this.tweens.killTweensOf(this.statusText);
    this.tweens.add({
      targets: this.statusText,
      alpha: 0,
      delay: duration,
      duration: 280,
      ease: 'Sine.easeOut',
    });
  }
}

function createParticles() {
  const layer = document.getElementById('particle-layer');
  const motionPref = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = motionPref ? 10 : 22;

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement('span');
    const size = 2 + Math.random() * 4;
    const offsetX = Math.round((Math.random() - 0.5) * window.innerWidth);
    const offsetY = Math.round((Math.random() - 0.5) * window.innerHeight);
    particle.className = 'ambient-particle';
    particle.style.setProperty('--size', `${size}px`);
    particle.style.setProperty('--duration', `${14 + Math.random() * 16}s`);
    particle.style.setProperty('--offset-x', `${offsetX}`);
    particle.style.setProperty('--offset-y', `${offsetY}`);
    particle.style.setProperty('--drift', `${50 + Math.random() * 120}`);
    particle.style.setProperty('--rise', `${40 + Math.random() * 100}`);
    particle.style.left = `${10 + Math.random() * 80}%`;
    particle.style.top = `${10 + Math.random() * 78}%`;
    particle.style.opacity = `${0.12 + Math.random() * 0.25}`;
    layer.appendChild(particle);
  }
}

function buildUiBridge() {
  const scoreValue = document.getElementById('scoreValue');
  const levelValue = document.getElementById('levelValue');
  const pressureValue = document.getElementById('pressureValue');
  const comboValue = document.getElementById('comboValue');
  const stabilityValue = document.getElementById('stabilityValue');
  const nextBubblePreview = document.getElementById('nextBubblePreview');
  const yieldValue = document.getElementById('yieldValue');
  const efficiencyValue = document.getElementById('efficiencyValue');
  const optimizationValue = document.getElementById('optimizationValue');
  const riskValue = document.getElementById('riskValue');
  const integrityValue = document.getElementById('integrityValue');
  const powerCards = {
    autoCompound: document.getElementById('powerAutoCompound'),
    liquidityBoost: document.getElementById('powerLiquidityBoost'),
    riskShield: document.getElementById('powerRiskShield'),
    capitalSurge: document.getElementById('powerCapitalSurge'),
    institutionalMode: document.getElementById('powerInstitutionalMode'),
  };
  const hud = document.getElementById('hud');
  const mainMenu = document.getElementById('mainMenu');
  const howToModal = document.getElementById('howToModal');
  const settingsModal = document.getElementById('settingsModal');
  const gameOverModal = document.getElementById('gameOverModal');
  const finalScoreText = document.getElementById('finalScoreText');
  const soundToggle = document.getElementById('soundToggle');
  const aimGuideToggle = document.getElementById('aimGuideToggle');
  const motionToggle = document.getElementById('motionToggle');
  const playButton = document.getElementById('playButton');
  const howToButton = document.getElementById('howToButton');
  const settingsButton = document.getElementById('settingsButton');
  const restartButton = document.getElementById('restartButton');
  const menuButton = document.getElementById('menuButton');
  const closeButtons = document.querySelectorAll('.close-modal');

  const settings = loadSettings();
  soundToggle.checked = settings.sound;
  aimGuideToggle.checked = settings.aimGuide;
  motionToggle.checked = settings.motion;

  const audio = new AudioEngine(settings.sound);

  const ui = {
    setScore(value) {
      scoreValue.textContent = String(value);
    },
    setLevel(value) {
      levelValue.textContent = String(value);
    },
    setPressure(value) {
      pressureValue.textContent = `${value}%`;
    },
    setCombo(value) {
      comboValue.textContent = value > 0 ? `${value}x` : '0x';
    },
    setStability(value) {
      stabilityValue.textContent = `${value}%`;
    },
    setNextColor(colorKey, skinKey) {
      const color = COLORS[colorKey] ?? COLORS.concrete;
      const rimColor = colorKey === 'premium' ? 0xd8b76a : color;
      const previewImage = skinKey ? PREVIEW_IMAGE_BY_SKIN[skinKey] : null;
      nextBubblePreview.style.backgroundImage = previewImage
        ? `radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.58), transparent 33%), radial-gradient(circle at 68% 74%, ${hexToRgba(rimColor, 0.24)}, transparent 58%), url("${previewImage}")`
        : `radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.58), transparent 33%), radial-gradient(circle at 68% 74%, ${hexToRgba(rimColor, 0.24)}, transparent 58%), linear-gradient(180deg, ${hexToCss(color)}, ${colorKey === 'premium' ? '#0d0d11' : '#674714'})`;
      nextBubblePreview.style.backgroundPosition = 'center, center, center';
      nextBubblePreview.style.backgroundSize = 'auto, auto, cover';
      nextBubblePreview.style.backgroundRepeat = 'no-repeat';
      nextBubblePreview.style.borderColor = hexToRgba(rimColor, 0.36);
      nextBubblePreview.style.boxShadow = `0 0 18px ${hexToRgba(rimColor, 0.28)}, inset 0 2px 8px rgba(255, 255, 255, 0.3), inset 0 -10px 18px rgba(0, 0, 0, 0.18)`;
    },
    setYield(value) {
      if (yieldValue) yieldValue.textContent = `${value}%`;
    },
    setEfficiency(value) {
      if (efficiencyValue) efficiencyValue.textContent = String(value);
    },
    setOptimization(value) {
      if (optimizationValue) optimizationValue.textContent = String(value);
    },
    setRisk(value) {
      if (riskValue) riskValue.textContent = `${value}%`;
    },
    setIntegrity(value) {
      if (integrityValue) integrityValue.textContent = value > 0 ? `${value}x` : '0x';
    },
    setPowerUpState(name, snapshot) {
      const card = powerCards[name];
      if (!card || !snapshot) {
        return;
      }

      card.dataset.state = snapshot.state ?? 'ready';
      card.style.setProperty('--power-fill', `${snapshot.fill ?? 0}%`);
      if (snapshot.accent) {
        card.style.setProperty('--power-accent', snapshot.accent);
      }

      const status = card.querySelector('.power-status');
      if (status) {
        status.textContent = snapshot.detail ?? snapshot.label ?? '';
      }
    },
    setHighScore() {
      // The persistent high score is handled inside the scene; the menu uses the live scoreboard only.
    },
    showGameOver(score, highScore) {
      finalScoreText.textContent = `Final Score: ${score}  |  Best: ${highScore}`;
      gameOverModal.classList.remove('hidden');
      gameOverModal.setAttribute('aria-hidden', 'false');
    },
    hideGameOver() {
      gameOverModal.classList.add('hidden');
      gameOverModal.setAttribute('aria-hidden', 'true');
    },
    showHud() {
      hud.classList.remove('hidden');
    },
    hideHud() {
      hud.classList.add('hidden');
    },
    showMenu() {
      mainMenu.classList.remove('hidden');
    },
    hideMenu() {
      mainMenu.classList.add('hidden');
    },
    openModal(modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    },
    closeModal(modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    },
    getSettings() {
      return { ...settings };
    },
    syncSettings(nextSettings) {
      Object.assign(settings, nextSettings);
      soundToggle.checked = settings.sound;
      aimGuideToggle.checked = settings.aimGuide;
      motionToggle.checked = settings.motion;
      saveSettings(settings);
      audio.setEnabled(settings.sound);
      window.concreteVaultSettings = { ...settings };
      if (window.concreteVaultScene) {
        window.concreteVaultScene.motionEnabled = settings.motion;
        window.concreteVaultScene.aimGuideEnabled = settings.aimGuide;
      }
    },
    audio,
  };

  window.concreteVaultUI = ui;
  window.concreteVaultAudio = audio;
  window.concreteVaultSettings = { ...settings };

  playButton.addEventListener('click', () => {
    ui.hideMenu();
    ui.hideGameOver();
    ui.showHud();
    audio.ensureContext();
    window.concreteVaultScene?.resetGame(true);
  });

  howToButton.addEventListener('click', () => {
    ui.openModal(howToModal);
  });

  settingsButton.addEventListener('click', () => {
    ui.openModal(settingsModal);
  });

  restartButton.addEventListener('click', () => {
    ui.hideGameOver();
    ui.hideMenu();
    ui.showHud();
    audio.ensureContext();
    window.concreteVaultScene?.resetGame(true);
  });

  menuButton.addEventListener('click', () => {
    ui.hideGameOver();
    ui.showMenu();
    ui.hideHud();
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-close');
      if (targetId) {
        ui.closeModal(document.getElementById(targetId));
      }
    });
  });

  soundToggle.addEventListener('change', () => {
    ui.syncSettings({ ...settings, sound: soundToggle.checked });
  });

  aimGuideToggle.addEventListener('change', () => {
    ui.syncSettings({ ...settings, aimGuide: aimGuideToggle.checked });
  });

  motionToggle.addEventListener('change', () => {
    ui.syncSettings({ ...settings, motion: motionToggle.checked });
  });

  ui.setScore(0);
  ui.setLevel(1);
  ui.setPressure(0);
  ui.setCombo(0);
  ui.setStability(100);
  ui.setNextColor('concrete', 'vault-orb');
  ui.setYield?.(100);
  ui.setEfficiency?.(1);
  ui.setOptimization?.(0);
  ui.setRisk?.(0);
  ui.setIntegrity?.(0);
  ui.setPowerUpState?.('autoCompound', { state: 'ready', fill: 0, detail: '0%' });
  ui.setPowerUpState?.('liquidityBoost', { state: 'ready', fill: 0, detail: '0%' });
  ui.setPowerUpState?.('riskShield', { state: 'armed', fill: 100, detail: '1 CHARGE' });
  ui.setPowerUpState?.('capitalSurge', { state: 'ready', fill: 0, detail: '0%' });
  ui.setPowerUpState?.('institutionalMode', { state: 'ready', fill: 0, detail: '0%' });
  return ui;
}

createParticles();
const ui = buildUiBridge();
window.concreteVaultUI = ui;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  transparent: true,
  backgroundColor: 'rgba(0, 0, 0, 0)',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    pixelArt: false,
    powerPreference: 'high-performance',
  },
  scene: [ConcreteVaultScene],
});

window.concreteVaultGame = game;

game.events.once(Phaser.Core.Events.READY, () => {
  window.concreteVaultScene = game.scene.keys.ConcreteVaultScene;
  window.concreteVaultScene.motionEnabled = window.concreteVaultSettings.motion;
  window.concreteVaultScene.aimGuideEnabled = window.concreteVaultSettings.aimGuide;
});