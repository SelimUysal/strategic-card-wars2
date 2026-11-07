import * as THREE from 'three';
import { BuildingManager } from '../buildings/BuildingManager';
import { CommanderManager } from '../commanders/CommanderManager';
import { FactionDef } from '../types';
import { FogOfWar } from '../world/FogOfWar';

export class WorldLabels {
  private group: THREE.Group;
  private playerSprite: THREE.Sprite | null = null;
  private enemySprite: THREE.Sprite | null = null;
  private playerCanvas: HTMLCanvasElement;
  private enemyCanvas: HTMLCanvasElement;
  private playerTexture: THREE.CanvasTexture;
  private enemyTexture: THREE.CanvasTexture;

  constructor(
    private scene: THREE.Scene,
    private buildingManager: BuildingManager,
    private commanderManager: CommanderManager,
    private fogOfWar: FogOfWar,
    private playerFaction: FactionDef,
    private enemyFaction: FactionDef
  ) {
    this.group = new THREE.Group();
    this.group.name = 'WorldLabelsGroup';
    this.scene.add(this.group);

    this.playerCanvas = document.createElement('canvas');
    this.playerCanvas.width = 256;
    this.playerCanvas.height = 128;
    this.playerTexture = new THREE.CanvasTexture(this.playerCanvas);

    this.enemyCanvas = document.createElement('canvas');
    this.enemyCanvas.width = 256;
    this.enemyCanvas.height = 128;
    this.enemyTexture = new THREE.CanvasTexture(this.enemyCanvas);

    this.playerSprite = this.createSprite(this.playerTexture);
    this.enemySprite = this.createSprite(this.enemyTexture);

    this.group.add(this.playerSprite);
    this.group.add(this.enemySprite);

    this.update();
  }

  private createSprite(texture: THREE.CanvasTexture): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6, 3, 1);
    sprite.renderOrder = 998;
    return sprite;
  }

  public update(): void {
    // 1. Oyuncu Karargâh Etiketi
    const playerHq = this.buildingManager.getHq('player');
    if (playerHq && playerHq.state !== 'destroyed' && this.playerSprite) {
      this.playerSprite.visible = true;
      const center = playerHq.getCenter();
      this.playerSprite.position.set(center.x, 4.5, center.y);

      const line1 = this.playerFaction.nameTr;
      const cmdDef = this.commanderManager.getCommanderDef('player');
      const line2 = cmdDef ? cmdDef.nameTr : undefined;
      this.drawLabelToCanvas(this.playerCanvas, this.playerTexture, line1, line2, '#10b981');
    } else if (this.playerSprite) {
      this.playerSprite.visible = false;
    }

    // 2. Düşman Karargâh Etiketi
    const enemyHq = this.buildingManager.getHq('enemy');
    if (
      enemyHq &&
      enemyHq.state !== 'destroyed' &&
      this.enemySprite &&
      this.fogOfWar.canPlayerSee(enemyHq)
    ) {
      this.enemySprite.visible = true;
      const center = enemyHq.getCenter();
      this.enemySprite.position.set(center.x, 4.5, center.y);

      const line1 = this.enemyFaction.nameTr;
      let line2: string | undefined = undefined;
      if (this.commanderManager.isEnemyCommanderRevealed()) {
        const cmdDef = this.commanderManager.getCommanderDef('enemy');
        line2 = cmdDef ? cmdDef.nameTr : '???';
      } else {
        line2 = '???';
      }
      this.drawLabelToCanvas(this.enemyCanvas, this.enemyTexture, line1, line2, '#e11d48');
    } else if (this.enemySprite) {
      this.enemySprite.visible = false;
    }
  }

  private drawLabelToCanvas(
    canvas: HTMLCanvasElement,
    texture: THREE.CanvasTexture,
    line1: string,
    line2: string | undefined,
    colorHex: string
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(18, 18, 20, 0.85)';
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (line2) {
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#f9fafb';
      ctx.fillText(line1, canvas.width / 2, 42);

      ctx.font = '18px sans-serif';
      ctx.fillStyle = '#93c5fd';
      ctx.fillText(line2, canvas.width / 2, 82);
    } else {
      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = '#f9fafb';
      ctx.fillText(line1, canvas.width / 2, canvas.height / 2);
    }

    texture.needsUpdate = true;
  }

  public destroy(): void {
    if (this.playerSprite) {
      this.group.remove(this.playerSprite);
      this.playerSprite.material.dispose();
      this.playerSprite = null;
    }
    if (this.enemySprite) {
      this.group.remove(this.enemySprite);
      this.enemySprite.material.dispose();
      this.enemySprite = null;
    }
    this.playerTexture.dispose();
    this.enemyTexture.dispose();
    this.scene.remove(this.group);
    this.group.clear();
  }
}
