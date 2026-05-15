const Phaser = window.Phaser;

const STORAGE_KEY = 'concrete-vault-defender-settings';
const SCORE_KEY = 'concrete-vault-defender-high-score';

const COLORS = {
  amber: 0xf2c35a,
  gold: 0xffdd86,
  jade: 0x5ccf9c,
  cyan: 0x63d8ff,
  steel: 0x9aa7bf,
};

const MOBILE_STAGE_WIDTH = 390;
const MOBILE_STAGE_HEIGHT = 844;

const COLOR_KEYS = Object.keys(COLORS);

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

function hexToCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
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
    this.currentColor = 'gold';
    this.nextColor = 'jade';
    this.score = 0;
    this.level = 1;
    this.highScore = getHighScore();
    this.shotsUntilPressure = 6;
    this.shotsTaken = 0;
    this.state = 'boot';
    this.hud = window.concreteVaultUI;
    this.audio = null;
    this.motionEnabled = true;
    this.aimGuideEnabled = true;
    this.pointerIsActive = false;
    this.bubbles = [];
    this.overlayMessage = null;
    this.shakeStrength = 0;
  }

  preload() {
    this.createTextures();
  }

  create() {
    this.hud = window.concreteVaultUI;
    this.audio = window.concreteVaultAudio;
    this.motionEnabled = window.concreteVaultSettings.motion;
    this.aimGuideEnabled = window.concreteVaultSettings.aimGuide;

    this.cameras.main.setBackgroundColor('#050505');
    this.particles = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: this.scale.width },
      y: { min: 0, max: this.scale.height },
      scale: { start: 0.34, end: 0.02 },
      alpha: { start: 0.28, end: 0 },
      lifespan: 6200,
      speedY: { min: -8, max: -28 },
      speedX: { min: -10, max: 10 },
      quantity: 1,
      frequency: 220,
      tint: [0xf3d37a, 0x9aa7bf, 0xffffff],
      blendMode: 'ADD',
    });

    this.ambientOrbs = this.add.group();
    for (let index = 0; index < 6; index += 1) {
      const orb = this.add.image(0, 0, 'orb').setAlpha(0.18).setBlendMode(Phaser.BlendModes.SCREEN);
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
    this.flashGraphics = this.add.graphics();
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

    this.scale.on('resize', this.handleResize, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.keyboard.on('keydown-SPACE', this.handleShootKey, this);
    this.input.keyboard.on('keydown-ENTER', this.handleShootKey, this);

    this.handleResize({ width: this.scale.width, height: this.scale.height });
    this.resetGame(true);
  }

  createTextures() {
    const bubbleRadius = 22;
    const textureSize = 64;

    const makeTexture = (key, baseColor) => {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(0x000000, 0);
      graphics.fillRect(0, 0, textureSize, textureSize);
      graphics.fillStyle(baseColor, 1);
      graphics.fillCircle(textureSize / 2, textureSize / 2, bubbleRadius);
      graphics.fillStyle(0xffffff, 0.28);
      graphics.fillCircle(textureSize * 0.38, textureSize * 0.34, bubbleRadius * 0.44);
      graphics.fillStyle(0xffffff, 0.08);
      graphics.fillCircle(textureSize / 2, textureSize / 2, bubbleRadius * 0.98);
      graphics.lineStyle(3, 0xffffff, 0.08);
      graphics.strokeCircle(textureSize / 2, textureSize / 2, bubbleRadius - 1);
      graphics.generateTexture(key, textureSize, textureSize);
      graphics.destroy();
    };

    makeTexture('bubble-gold', COLORS.gold);
    makeTexture('bubble-amber', COLORS.amber);
    makeTexture('bubble-jade', COLORS.jade);
    makeTexture('bubble-cyan', COLORS.cyan);
    makeTexture('bubble-steel', COLORS.steel);

    const orb = this.make.graphics({ x: 0, y: 0, add: false });
    orb.fillStyle(0xffffff, 1);
    orb.fillCircle(64, 64, 24);
    orb.fillStyle(0xf3d37a, 0.18);
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

    this.board = {
      width,
      height,
      radius,
      diameter: radius * 2,
      rowHeight: Math.max(Math.floor(radius * 1.72), radius * 2 - 6),
      left: Math.round((width - ((this.columns * radius * 2) + radius)) / 2),
      top: Math.max(132, Math.round(height * 0.17)),
      bottom: height - 190,
      shooterY: height - 110,
      shooterX: Math.round(width / 2),
    };

    this.launcher = { x: this.board.shooterX, y: this.board.shooterY };
    this.statusText.setPosition(width / 2, height / 2 - 24);
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
    this.shotsUntilPressure = 6;
    this.shotsTaken = 0;
    this.projectile = null;
    this.projectileVelocity.set(0, 0);
    this.state = 'playing';
    this.shakeStrength = 0;
    this.clearBoard();
    this.spawnOpeningWave();
    this.nextColor = pickColor(this.level);
    this.currentColor = pickColor(this.level);
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

  spawnBubble(row, col, colorKey) {
    const bubble = {
      row,
      col,
      colorKey,
      sprite: this.add.image(0, 0, `bubble-${colorKey}`),
      scale: this.board.radius / 22,
      moving: false,
    };

    bubble.sprite.setOrigin(0.5);
    bubble.sprite.setScale(bubble.scale);
    bubble.sprite.setDepth(2);
    bubble.sprite.setTint(COLORS[colorKey]);
    bubble.sprite.setBlendMode(Phaser.BlendModes.ADD);
    this.grid[row][col] = bubble;
    this.bubbles.push(bubble);
    this.placeBubble(bubble);
    return bubble;
  }

  placeBubble(bubble) {
    const position = this.cellToWorld(bubble.row, bubble.col);
    bubble.sprite.setPosition(position.x, position.y);
    bubble.sprite.setScale(this.board.radius / 22);
  }

  redrawProjectile() {
    if (this.projectileSprite && this.projectile) {
      this.projectileSprite.setPosition(this.projectile.sprite.x, this.projectile.sprite.y);
      this.projectileSprite.setScale(this.board.radius / 22);
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
    this.updateAim(pointer.worldX, pointer.worldY);
  }

  handlePointerDown(pointer) {
    if (this.state !== 'playing') {
      return;
    }

    this.updateAim(pointer.worldX, pointer.worldY);
    this.fireProjectile();
  }

  handleShootKey() {
    if (this.state !== 'playing') {
      return;
    }

    this.fireProjectile();
  }

  updateAim(targetX, targetY) {
    const vector = new Phaser.Math.Vector2(targetX - this.launcher.x, targetY - this.launcher.y);
    if (vector.lengthSq() === 0) {
      vector.set(0, -1);
    }

    vector.normalize();
    vector.y = Math.min(vector.y, -0.12);
    vector.normalize();
    this.aimDirection.copy(vector);
    this.drawAimGuide();
  }

  fireProjectile() {
    if (this.projectile) {
      return;
    }

    if (this.currentColor == null) {
      this.currentColor = pickColor(this.level);
    }

    const scale = this.board.radius / 22;
    this.projectileSprite = this.add.image(this.launcher.x, this.launcher.y, `bubble-${this.currentColor}`)
      .setScale(scale)
      .setDepth(3)
      .setTint(COLORS[this.currentColor])
      .setBlendMode(Phaser.BlendModes.ADD);

    this.projectile = {
      sprite: this.projectileSprite,
      colorKey: this.currentColor,
      radius: this.board.radius,
    };

    this.projectileVelocity = this.aimDirection.clone().scale(this.projectileSpeed());
    this.audio?.shoot();
    this.shotsTaken += 1;
    this.syncHud();

    this.currentColor = this.nextColor;
    this.nextColor = pickColor(this.level);
    this.syncNextPreview();
    this.drawAimGuide();
  }

  projectileSpeed() {
    return 720 + (this.level - 1) * 22;
  }

  update(time, delta) {
    if (this.state !== 'playing') {
      this.drawAimGuide();
      return;
    }

    this.flashGraphics.clear();

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
        return;
      }

      const hitBubble = this.findCollisionBubble(sprite.x, sprite.y, radius * 1.92);
      if (hitBubble) {
        this.lockProjectileToGrid(sprite.x, sprite.y, hitBubble);
      }
    }

    this.updateCameraMotion(delta);
    this.drawAimGuide();
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
      this.failRun();
      return;
    }

    const bubble = this.spawnBubble(targetCell.row, targetCell.col, this.projectile.colorKey);
    bubble.sprite.setScale(this.board.radius / 22);
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
    this.score += pulse * 12 + Math.max(0, pulse - 3) * 4;
    this.audio?.pop(pulse);
    this.shakeStrength = Math.min(12, this.shakeStrength + 4 + pulse * 0.25);

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

    this.syncHud();
    this.flashGraphics.fillStyle(0xf3d37a, 0.12);
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

    this.audio?.drop();
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
    this.shotsUntilPressure -= 1;
    if (this.score >= this.level * 180) {
      this.level += 1;
      this.shotsUntilPressure = Math.max(4, 6 - Math.floor(this.level / 3));
      this.showStatus(`LEVEL ${this.level}`, 900);
    }

    if (this.isBoardEmpty()) {
      this.showStatus('WAVE CLEARED', 900);
      this.time.delayedCall(520, () => {
        if (this.state === 'playing') {
          this.spawnOpeningWave();
          this.currentColor = pickColor(this.level);
          this.nextColor = pickColor(this.level);
          this.syncNextPreview();
          this.syncHud();
        }
      });
    }

    if (this.shotsUntilPressure <= 0) {
      this.shotsUntilPressure = Math.max(4, 7 - Math.floor(this.level / 2));
      this.pushPressureRow();
    }

    this.syncHud();
  }

  isBoardEmpty() {
    return this.bubbles.length === 0;
  }

  pushPressureRow() {
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
    this.showStatus('PRESSURE RISE', 700);
  }

  failRun() {
    if (this.state === 'gameover') {
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
    this.flashGraphics.fillStyle(0xffdd86, 0.08);
    this.flashGraphics.fillCircle(x, y, 28);
  }

  drawAimGuide() {
    this.aimGraphics.clear();
    if (this.state !== 'playing' || this.projectile || !this.aimGuideEnabled) {
      return;
    }

    const origin = new Phaser.Math.Vector2(this.launcher.x, this.launcher.y);
    const direction = this.aimDirection.clone();
    const segmentLength = Math.max(this.scale.height, this.scale.width);
    const end = this.projectAim(origin, direction, segmentLength);

    this.aimGraphics.lineStyle(4, 0xf3d37a, 0.25);
    this.aimGraphics.lineBetween(origin.x, origin.y, end.x, end.y);
    this.aimGraphics.lineStyle(2, 0xfff0ba, 0.7);
    this.aimGraphics.lineBetween(origin.x, origin.y, end.x, end.y);
    this.aimGraphics.fillStyle(0xffdf84, 0.5);
    this.aimGraphics.fillCircle(end.x, end.y, 4);
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
    const pressure = clamp(Math.round(((7 - this.shotsUntilPressure) / 7) * 100), 0, 100);
    this.hud?.setScore(this.score);
    this.hud?.setLevel(this.level);
    this.hud?.setPressure(pressure);
    this.hud?.setHighScore(Math.max(this.highScore, getHighScore()));
    this.syncNextPreview();
  }

  syncNextPreview() {
    this.hud?.setNextColor(this.nextColor);
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
  const nextBubblePreview = document.getElementById('nextBubblePreview');
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
    setNextColor(colorKey) {
      const color = COLORS[colorKey] ?? COLORS.gold;
      nextBubblePreview.style.background = `radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.55), transparent 33%), linear-gradient(180deg, ${hexToCss(color)}, rgba(98, 70, 18, 0.96))`;
      nextBubblePreview.style.boxShadow = `0 0 22px rgba(255, 215, 94, 0.34), inset 0 2px 8px rgba(255, 255, 255, 0.34), inset 0 -10px 18px rgba(0, 0, 0, 0.18)`;
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
  ui.setNextColor('gold');
  return ui;
}

createParticles();
const ui = buildUiBridge();
window.concreteVaultUI = ui;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#050505',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: MOBILE_STAGE_WIDTH,
    height: MOBILE_STAGE_HEIGHT,
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