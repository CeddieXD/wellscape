// Vanilla port of Phase1Game.ts.
// KAPLAY is loaded globally via <script> (window.kaplay).
//
// initPhase1Game(canvas, { characterId, playerName, touchInput, npcs,
//   completedTaskIds, onNpcProximity, onInteract }, onStatusUpdate)
//   -> controller { destroy, resetPosition, setUseSprite, interact, markQuestDone }
//
// touchInput (optional) is a mutable { x, y } vector set by on-screen controls.
// npcs: array from quests.js. onNpcProximity(npc|null) fires when the nearest
// interactable NPC in range changes. onInteract(npc) fires on E / interact.

function pad(n) {
  return String(n).padStart(3, "0");
}

export function initPhase1Game(canvas, options = {}, onStatusUpdate) {
  const {
    characterId = null,
    playerName = "You",
    touchInput = { x: 0, y: 0 },
    npcs = [],
    completedTaskIds = [],
    onNpcProximity = null,
    onInteract = null,
  } = options;

  const doneTasks = new Set(completedTaskIds);

  console.log("🎮 Initializing Wellscape Phase 1 Game. Character:", characterId);

  const k = window.kaplay({
    canvas,
    width: 800,
    height: 600,
    // letterbox keeps a fixed 800x600 virtual resolution on every device, so
    // k.width()/k.height() stay 800x600 and the camera-follow math is identical
    // on desktop and phone. (With letterbox off, KAPLAY resizes the internal
    // buffer to the device's real pixels — which broke following on mobile.)
    letterbox: true,
    background: [86, 168, 96], // Cozy plaza grass
    loadingScreen: false,
    pixelDensity: window.devicePixelRatio || 1,
    global: false,
  });

  // Top-down games have zero gravity
  k.setGravity(0);

  // World size and camera zoom. The camera follows the player (see update loop),
  // zoomed in so the view feels focused on the character.
  const WORLD_W = 800;
  const WORLD_H = 600;
  const CAM_SCALE = 1.6;
  k.setCamScale(CAM_SCALE);

  // Load the chosen character sheet (falls back to the default sprite).
  // Sheet is 3 columns x 4 rows, each frame 20x32 (cropped to 60x128).
  // Row order: 0 down, 1 left, 2 right, 3 up — 3 frames per direction.
  const characterSrc =
    characterId === null || characterId === undefined
      ? "/sprites/player.png"
      : `/characters/${pad(characterId)}.png`;

  let spriteLoaded = false;
  try {
    k.loadSprite("player", characterSrc, {
      sliceX: 3,
      sliceY: 4,
      anims: {
        "idle-down": 0,
        "walk-down": { from: 0, to: 2, speed: 7, loop: true },
        "idle-left": 3,
        "walk-left": { from: 3, to: 5, speed: 7, loop: true },
        "idle-right": 6,
        "walk-right": { from: 6, to: 8, speed: 7, loop: true },
        "idle-up": 9,
        "walk-up": { from: 9, to: 11, speed: 7, loop: true },
      },
    })
      .then(() => {
        spriteLoaded = true;
        console.log("✅ Character sprite loaded successfully.");
        // The sprite is the default visual, so show it as soon as it's ready.
        updateVisualMode(true);
      })
      .catch((err) => {
        console.warn("⚠️ Sprite loading failed, using placeholder avatar:", err);
        spriteLoaded = false;
      });
  } catch (err) {
    console.warn("⚠️ Error initiating sprite load:", err);
    spriteLoaded = false;
  }

  // Load the 16x16 village tileset as a sliced atlas (19 cols x 20 rows = 380).
  const TILE = 16; // source tile size in px
  const SHEET_COLS = 19;
  const SHEET_ROWS = 20;
  k.loadSprite("village", "/tiles/assets/village-palette01-day.png", {
    sliceX: SHEET_COLS,
    sliceY: SHEET_ROWS,
  }).catch((err) => console.warn("⚠️ village tileset failed to load:", err));

  // Keep the pre-cut town props too (used for a couple of standout buildings).
  const PROPS = {
    building1: "/tiles/building1.png",
    tree: "/tiles/tree.png",
  };
  for (const [name, src] of Object.entries(PROPS)) {
    k.loadSprite(name, src).catch(() => {});
  }

  // ==========================================
  // 1. TILEMAP WORLD
  // ==========================================
  // The world is a grid of 16x16 tiles drawn at TILE_SCALE. We size the grid so
  // the world is ~800x600 game units (matching the camera math).
  const TILE_SCALE = 2.5; // 16 -> 40px tiles on screen
  const DRAW = TILE * TILE_SCALE; // 40
  const COLS = Math.round(WORLD_W / DRAW); // 20
  const ROWS = Math.round(WORLD_H / DRAW); // 15

  // --- Named tile indices picked from palette01-day (verified from the sheet) ---
  const T = {
    grass: 307, // plain green grass
    grassAlt: 308, // subtle grass variant
    path: 192, // tan dirt path
    // Framed pond block (3x3) with grassy border:
    pondTL: 316, pondTM: 317, pondTR: 318,
    pondML: 335, pondMM: 336, pondMR: 337,
    pondBL: 354, pondBM: 355, pondBR: 356,
    // Decorative grass overlays (bushes / flowers):
    bush: 273, // small leafy shrub (transparent bg, sits on grass)
    hedge: 268, // dense hedge texture
    flowersW: 271, // grass with white flowers (blends with grass base)
    flowersY: 271, // (same tile — tidy white flower patch)
  };

  // Helper: draw one tile from the atlas at grid cell (cx, cy).
  function drawTile(frame, cx, cy, z = -10) {
    k.add([
      k.sprite("village", { frame }),
      k.pos(cx * DRAW, cy * DRAW),
      k.scale(TILE_SCALE),
      k.z(z),
    ]);
  }

  // Invisible solid collision box (world units).
  function createSolid(x, y, w, h, labelText) {
    const obj = k.add([
      k.rect(w, h),
      k.pos(x, y),
      k.opacity(0),
      k.area(),
      k.body({ isStatic: true }),
      "wall",
    ]);
    if (labelText) {
      k.add([
        k.text(labelText, { size: 15 }),
        k.pos(x + w / 2, y + h + 8),
        k.anchor("center"),
        k.color(255, 255, 255),
        k.outline(4, k.rgb(15, 30, 20)),
        k.z(20),
      ]);
    }
    return obj;
  }

  // 1a. Ground layer: grass everywhere (with a little variation).
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const variant = (cx * 7 + cy * 3) % 11 === 0 ? T.grassAlt : T.grass;
      drawTile(variant, cx, cy, -10);
    }
  }

  // 1b. Dirt path layer: a cross through the middle of the plaza.
  const midRow = Math.floor(ROWS / 2);
  const midCol = Math.floor(COLS / 2);
  for (let cx = 2; cx < COLS - 2; cx++) {
    drawTile(T.path, cx, midRow, -9);
    drawTile(T.path, cx, midRow + 1, -9);
  }
  for (let cy = 2; cy < ROWS - 2; cy++) {
    drawTile(T.path, midCol, cy, -9);
    drawTile(T.path, midCol + 1, cy, -9);
  }

  // 1c. A pond in the lower-left, built from the framed 3x3 pond tiles.
  const pondCol = 2;
  const pondRow = ROWS - 4;
  const pondRows = [
    [T.pondTL, T.pondTM, T.pondTR],
    [T.pondML, T.pondMM, T.pondMR],
    [T.pondBL, T.pondBM, T.pondBR],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      drawTile(pondRows[r][c], pondCol + c, pondRow + r, -8);
    }
  }
  // Pond is solid (can't walk through water). Inset slightly so the grassy
  // border of the pond tiles stays walkable.
  createSolid(
    (pondCol + 0.15) * DRAW,
    (pondRow + 0.15) * DRAW,
    2.7 * DRAW,
    2.7 * DRAW
  );

  // ==========================================
  // 2. OBSTACLES & DECORATIONS (Solid)
  // ==========================================

  // Place a decoration sprite centered on a footprint.
  function placeDecor(sprite, x, y, w, h, scale = 1, zIndex = 6) {
    k.add([
      k.sprite(sprite),
      k.pos(x + w / 2, y + h / 2),
      k.anchor("center"),
      k.scale(scale),
      k.z(zIndex),
    ]);
  }

  // Place a single atlas tile as a solid decoration (bush / tree-ish).
  function placeTile(frame, cx, cy, scale = TILE_SCALE, solid = true, z = 6) {
    k.add([
      k.sprite("village", { frame }),
      k.pos(cx * DRAW, cy * DRAW),
      k.scale(scale),
      k.z(z),
    ]);
    if (solid) {
      createSolid(cx * DRAW + 4, cy * DRAW + 4, TILE * scale - 8, TILE * scale - 8);
    }
  }

  // Perimeter boundary walls (invisible) so the player can't leave the world.
  const B = 10;
  createSolid(-B, -B, WORLD_W + 2 * B, B); // top
  createSolid(-B, WORLD_H, WORLD_W + 2 * B, B); // bottom
  createSolid(-B, -B, B, WORLD_H + 2 * B); // left
  createSolid(WORLD_W, -B, B, WORLD_H + 2 * B); // right

  // A standout building (uses the pre-cut coffee/shop facade) — the barangay store.
  createSolid(70, 60, 150, 110, "Tindahan ni Aling Nena");
  placeDecor("building1", 70, 36, 90, 140, 1.0, 6);

  // Trees from the pre-cut tree prop (clearly readable at this scale).
  createSolid(620, 70, 60, 70, "Puno");
  placeDecor("tree", 612, 44, 56, 69, 1.4, 7);
  createSolid(680, 420, 60, 70, "Puno");
  placeDecor("tree", 672, 394, 56, 69, 1.4, 7);

  // Scatter a few atlas bushes & flowers around the plaza as cozy accents.
  placeTile(T.bush, 3, 2, TILE_SCALE, true);
  placeTile(T.bush, COLS - 4, 2, TILE_SCALE, true);
  placeTile(T.bush, 4, ROWS - 3, TILE_SCALE, true);
  placeTile(T.flowersW, 6, 3, TILE_SCALE, false, -7);
  placeTile(T.flowersY, COLS - 6, ROWS - 4, TILE_SCALE, false, -7);
  placeTile(T.flowersW, midCol - 3, midRow - 3, TILE_SCALE, false, -7);

  // ==========================================
  // 2b. WELLNESS NPCs
  // ==========================================
  // Each NPC: a character sprite (idle), a name tag, a floating quest marker,
  // and a solid body. We keep refs so the update loop can detect proximity.
  const INTERACT_RADIUS = 70;
  const npcEntities = [];
  let activeNpc = null; // nearest NPC currently in interaction range

  npcs.forEach((npc) => {
    const spriteKey = `npc-${npc.id}`;
    // Reuse the cropped 60x128 character sheet for NPCs.
    k.loadSprite(spriteKey, `/characters/${pad(npc.characterId)}.png`, {
      sliceX: 3,
      sliceY: 4,
      anims: { "idle-down": 0 },
    }).catch((err) => console.warn(`NPC sprite ${npc.id} failed:`, err));

    const sprite = k.add([
      k.sprite(spriteKey, { anim: "idle-down" }),
      k.pos(npc.x, npc.y),
      k.anchor("center"),
      k.scale(2),
      k.z(3),
    ]);

    // Shadow under the NPC.
    k.add([
      k.rect(22, 7),
      k.pos(npc.x, npc.y + 26),
      k.anchor("center"),
      k.color(30, 60, 30),
      k.opacity(0.3),
      k.z(2),
    ]);

    // Name tag.
    k.add([
      k.text(npc.name, { size: 15 }),
      k.pos(npc.x, npc.y - 40),
      k.anchor("center"),
      k.color(255, 255, 255),
      k.outline(4, k.rgb(15, 30, 20)),
      k.z(5),
    ]);

    // Floating quest marker ("!" if open, "✓" if done).
    const done = doneTasks.has(npc.task.id);
    const marker = k.add([
      k.text(done ? "✓" : "!", { size: 24 }),
      k.pos(npc.x, npc.y - 58),
      k.anchor("center"),
      k.color(done ? k.rgb(110, 231, 183) : k.rgb(255, 210, 70)),
      k.outline(5, k.rgb(15, 30, 20)),
      k.z(6),
    ]);

    // Solid collision so the player can't walk through the NPC.
    createSolid(npc.x - 14, npc.y - 2, 28, 26);

    npcEntities.push({ npc, sprite, marker, baseMarkerY: npc.y - 58 });
  });

  // Bob the quest markers gently.
  k.onUpdate(() => {
    const t = k.time();
    npcEntities.forEach((e, i) => {
      e.marker.pos.y = e.baseMarkerY + Math.sin(t * 3 + i) * 3;
    });
  });

  // Called by the UI when a quest is finished — flip the marker to ✓.
  function markQuestDone(taskId) {
    doneTasks.add(taskId);
    npcEntities.forEach((e) => {
      if (e.npc.task.id === taskId) {
        e.marker.text = "✓";
        e.marker.color = k.rgb(110, 231, 183);
      }
    });
  }

  // ==========================================
  // 3. PLAYER CHARACTER (Placeholder + Sprite)
  // ==========================================

  const SPAWN_X = 400;
  const SPAWN_Y = 320;
  const PLAYER_SPEED = 180;

  let currentDirection = "down";
  let useSpriteVisual = false;
  let paused = false; // frozen while a wellness task popup is open

  const player = k.add([
    k.pos(SPAWN_X, SPAWN_Y),
    k.anchor("center"),
    k.area({ shape: new k.Rect(k.vec2(0, 6), 26, 26) }),
    k.body(),
    "player",
    { dir: "down", speed: PLAYER_SPEED },
  ]);

  // Ground Shadow
  const shadow = k.add([
    k.rect(24, 8),
    k.pos(SPAWN_X, SPAWN_Y + 14),
    k.anchor("center"),
    k.color(30, 60, 30),
    k.opacity(0.35),
    k.z(1),
  ]);

  // Placeholder Body
  const avatarBody = k.add([
    k.rect(26, 32),
    k.pos(SPAWN_X, SPAWN_Y),
    k.anchor("center"),
    k.color(46, 120, 220), // Student blue uniform
    k.outline(2, k.rgb(20, 70, 140)),
    k.z(2),
  ]);

  // Placeholder Head / Face
  const avatarHead = k.add([
    k.circle(9),
    k.pos(SPAWN_X, SPAWN_Y - 14),
    k.anchor("center"),
    k.color(248, 206, 168), // Skin tone
    k.outline(2, k.rgb(170, 120, 80)),
    k.z(3),
  ]);

  // Direction Sight Dot
  const dirIndicator = k.add([
    k.circle(3),
    k.pos(SPAWN_X, SPAWN_Y - 11),
    k.anchor("center"),
    k.color(40, 40, 40),
    k.z(4),
  ]);

  // Name Tag
  const nameTag = k.add([
    k.text(playerName, { size: 15 }),
    k.pos(SPAWN_X, SPAWN_Y - 36),
    k.anchor("center"),
    k.color(255, 255, 255),
    k.outline(4, k.rgb(15, 15, 15)),
    k.z(5),
  ]);

  let spriteObj = null;

  function updateVisualMode(useSprite) {
    useSpriteVisual = useSprite && spriteLoaded;
    if (useSpriteVisual) {
      avatarBody.hidden = true;
      avatarHead.hidden = true;
      dirIndicator.hidden = true;
      if (!spriteObj) {
        spriteObj = k.add([
          k.sprite("player", { anim: "idle-down" }),
          k.pos(player.pos),
          k.anchor("center"),
          k.scale(2),
          k.z(3),
        ]);
      } else {
        spriteObj.hidden = false;
      }
    } else {
      avatarBody.hidden = false;
      avatarHead.hidden = false;
      dirIndicator.hidden = false;
      if (spriteObj) spriteObj.hidden = true;
    }
  }

  // ==========================================
  // 4. MOVEMENT & COLLISION RESOLUTION LOOP
  // ==========================================

  let isCollidingWithWall = false;

  player.onCollide("wall", () => {
    isCollidingWithWall = true;
    avatarBody.color = k.rgb(220, 80, 80); // red flash on collision
  });

  player.onCollideEnd("wall", () => {
    isCollidingWithWall = false;
    avatarBody.color = k.rgb(46, 120, 220); // restore blue
  });

  k.onUpdate(() => {
    let moveX = 0;
    let moveY = 0;

    // While a task popup is open the player is frozen (can't walk away).
    if (!paused) {
      if (k.isKeyDown("left") || k.isKeyDown("a")) moveX -= 1;
      if (k.isKeyDown("right") || k.isKeyDown("d")) moveX += 1;
      if (k.isKeyDown("up") || k.isKeyDown("w")) moveY -= 1;
      if (k.isKeyDown("down") || k.isKeyDown("s")) moveY += 1;

      // On-screen touch controls (D-pad / joystick) feed the same movement.
      moveX += touchInput.x;
      moveY += touchInput.y;
    }
    // Clamp so touch + keyboard can't exceed unit magnitude per axis.
    moveX = Math.max(-1, Math.min(1, moveX));
    moveY = Math.max(-1, Math.min(1, moveY));

    const isMoving = moveX !== 0 || moveY !== 0;

    if (isMoving) {
      if (Math.abs(moveX) > Math.abs(moveY)) {
        currentDirection = moveX > 0 ? "right" : "left";
      } else {
        currentDirection = moveY > 0 ? "down" : "up";
      }

      // Normalize diagonal movement
      if (moveX !== 0 && moveY !== 0) {
        const factor = Math.SQRT1_2;
        moveX *= factor;
        moveY *= factor;
      }

      player.move(moveX * PLAYER_SPEED, moveY * PLAYER_SPEED);
    }

    // Anchor visuals to player's position
    shadow.pos = k.vec2(player.pos.x, player.pos.y + 14);
    avatarBody.pos = player.pos;
    avatarHead.pos = k.vec2(player.pos.x, player.pos.y - 14);
    nameTag.pos = k.vec2(player.pos.x, player.pos.y - 36);

    if (spriteObj) {
      spriteObj.pos = player.pos;
      if (isMoving) {
        const animName = `walk-${currentDirection}`;
        if (spriteObj.curAnim() !== animName) spriteObj.play(animName);
      } else {
        const idleName = `idle-${currentDirection}`;
        if (spriteObj.curAnim() !== idleName) spriteObj.play(idleName);
      }
    }

    const dotOffsets = {
      down: [0, -9],
      up: [0, -17],
      left: [-6, -14],
      right: [6, -14],
    };
    const [dx, dy] = dotOffsets[currentDirection] || [0, -9];
    dirIndicator.pos = k.vec2(player.pos.x + dx, player.pos.y + dy);

    // --- Camera follows the player, clamped to the world bounds ---
    // Half of the visible area in world units (accounts for the zoom scale).
    const halfW = k.width() / (2 * CAM_SCALE);
    const halfH = k.height() / (2 * CAM_SCALE);
    // If the world is smaller than the viewport on an axis, just center it.
    const camX =
      WORLD_W <= halfW * 2
        ? WORLD_W / 2
        : Math.max(halfW, Math.min(WORLD_W - halfW, player.pos.x));
    const camY =
      WORLD_H <= halfH * 2
        ? WORLD_H / 2
        : Math.max(halfH, Math.min(WORLD_H - halfH, player.pos.y));
    k.setCamPos(camX, camY);

    // --- NPC proximity: find the nearest NPC within interaction range ---
    let nearest = null;
    let nearestDist = INTERACT_RADIUS;
    for (const e of npcEntities) {
      const d = player.pos.dist(e.npc.x, e.npc.y);
      if (d <= nearestDist) {
        nearest = e.npc;
        nearestDist = d;
      }
    }
    if (nearest !== activeNpc) {
      activeNpc = nearest;
      if (onNpcProximity) onNpcProximity(activeNpc);
    }

    if (onStatusUpdate) {
      onStatusUpdate({
        x: Math.round(player.pos.x),
        y: Math.round(player.pos.y),
        direction: currentDirection,
        isMoving,
        isColliding: isCollidingWithWall,
        fps: Math.round((k.debug.fps && k.debug.fps()) || 60),
      });
    }
  });

  // Interact via the E key (desktop). The UI button calls controller.interact().
  k.onKeyPress("e", () => {
    if (activeNpc && onInteract) onInteract(activeNpc);
  });

  return {
    destroy: () => {
      try {
        k.quit();
      } catch (err) {
        console.warn("KAPLAY quit warning:", err);
      }
    },
    resetPosition: () => {
      player.pos = k.vec2(SPAWN_X, SPAWN_Y);
      avatarBody.color = k.rgb(46, 120, 220);
      isCollidingWithWall = false;
    },
    setUseSprite: (use) => {
      updateVisualMode(use);
    },
    // Trigger interaction with the currently-active NPC (if any).
    interact: () => {
      if (activeNpc && onInteract) onInteract(activeNpc);
    },
    getActiveNpc: () => activeNpc,
    markQuestDone,
    // Freeze/unfreeze player movement while a task popup is open.
    setPaused: (p) => {
      paused = p;
    },
  };
}
