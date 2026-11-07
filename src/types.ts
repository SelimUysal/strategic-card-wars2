export type Team = 'player' | 'enemy';
export type UnitId = 'altin_madencisi' | 'oduncu' | 'tirendaz' | 'yenicheri' | 'deliler' | 'sahi' | 'zirhli_fil' | 'fetih_gemisi';
export type BuildingId = 'hq' | 'okcular_ocagi' | 'yenicheri_ocagi' | 'suvari_ocagi' | 'tophane' | 'fil_ocagi' | 'tersane' | 'hisar' | 'mancinik_i_azam';
export type CardId = 'tirendaz' | 'yenicheri' | 'deliler' | 'sahi' | 'hisar' | 'mancinik_i_azam' | 'zirhli_fil' | 'fetih_gemisi';
export type CommanderId = 'fatih' | 'yavuz' | 'kanuni' | 'abdulhamid' | 'vi_mehmed' | 'yildirim' | 'celebi' | 'ii_murad' | 'sinan' | 'eyup';
export type DifficultyId = 'kolay' | 'normal' | 'zor' | 'cehennem';
export type MapId = 'rumeli_ovasi' | 'tuna_gecidi' | 'karpat_daglari' | 'viyana_ovasi';
export type EnemyId = 'fransa' | 'ingiltere' | 'rusya' | 'alman' | 'cin' | 'israil' | 'abd' | 'siyonist_ittifak';
export type FactionId = 'islam_halifeligi' | 'bati_roma' | EnemyId;
export type UnitTag = 'worker' | 'archer' | 'infantry' | 'cavalry' | 'heavy' | 'artillery' | 'siege';
export type TargetCategory = 'attacker' | 'soldier' | 'archer' | 'worker' | 'defense' | 'production' | 'hq';
export type Targeting = { mode: 'ordered'; order: TargetCategory[] } | { mode: 'nearest'; categories: TargetCategory[] };
export interface BonusVs { targetUnitId?: UnitId; targetTag?: UnitTag; targetBuildings?: boolean; mult: number; }
export interface UnitDef { id: UnitId; nameTr: string; roleTr: string; descriptionTr: string; tags: UnitTag[]; producedAt: BuildingId; hp: number; damage: number; range: number; attackIntervalSec: number; moveSpeed: number; vision: number; buildTimeSec: number; costGold: number; costWood: number; pop: number; targeting: Targeting; bonusVs: BonusVs[]; gatherResource?: 'gold' | 'wood'; }
export type BuildingKind = 'hq' | 'production' | 'defense';
export interface BuildingDef { id: BuildingId; nameTr: string; descriptionTr: string; kind: BuildingKind; hp: number; vision: number; buildTimeSec: number; costGold: number; costWood: number; footprint: { w: number; h: number }; popCapacity: number; maxCount: number; produces: UnitId[]; damage: number; attackIntervalSec: number; range: number; minRange: number; splashRadius: number; targeting: Targeting | null; bonusVs: BonusVs[]; }
export interface CardDef { id: CardId; nameTr: string; roleTr: string; category: 'asker' | 'savunma'; refType: 'unit' | 'building'; refId: UnitId | BuildingId; startUnlocked: boolean; marketPriceGold: number; }
export type StatName = 'hp' | 'damage' | 'moveSpeed' | 'damageTaken' | 'gatherRate' | 'structureBuildTime' | 'structureMaxHp';
export interface EffectFilter { unitIds?: UnitId[]; tags?: UnitTag[]; buildingIds?: BuildingId[]; }
export type CommanderEffect = { kind: 'statPct'; stat: StatName; pct: number; filter: EffectFilter } | { kind: 'periodicHealPct'; everySec: number; pct: number } | { kind: 'ignoreFog' };
export interface CommanderDef { id: CommanderId; nameTr: string; abilityNameTr: string; bonusTextTr: string; startUnlocked: boolean; marketPriceGold: number; effects: CommanderEffect[]; }
export interface DifficultyDef { id: DifficultyId; labelTr: string; rewardGold: number | null; enemyGatherMult: number; enemyStartGold: number; enemyStartWood: number; enemyPopCap: number; enemyCardIds: CardId[]; decisionIntervalSec: number; firstWaveFraction: number; waveIntervalSec: number | null; continuousWaves: boolean; survival: boolean; }
export type TerrainType = 'flat' | 'forest' | 'blocked' | 'passage';
export type TerrainLook = 'grass' | 'forest' | 'river' | 'mountain' | 'rock' | 'hill' | 'wall' | 'bridge' | 'ford' | 'gate' | 'field';
export interface TerrainRect { type: TerrainType; look: TerrainLook; x: number; y: number; w: number; h: number; }
export interface TilePos { x: number; y: number; }
export interface NodeTemplates { gold: { player: TilePos[]; enemy: TilePos[] }; wood: { player: TilePos[]; enemy: TilePos[] }; }
export interface MapDef { id: MapId; nameTr: string; themeTr: string; battleStyleTr: string; width: number; height: number; playerStart: TilePos; enemyStart: TilePos; commonArea: { x: number; y: number; w: number; h: number }; rects: TerrainRect[]; nodes: NodeTemplates; }
export interface FactionDef { id: FactionId; nameTr: string; colorHex: string; }
export interface MatchConfig { mapId: MapId; difficultyId: DifficultyId; playerCommanderId: CommanderId | null; playerFactionId: FactionId; enemyFactionId: FactionId; enemyCommanderId: CommanderId | null; seed: number; }
export interface MatchStats { enemySoldiersKilled: number; friendlySoldiersLost: number; enemyBuildingsDestroyed: number; goldGathered: number; woodGathered: number; soldiersProduced: number; survivalTimeSec: number; battleScore: number; accountGoldEarned: number; }

export interface MatchHistoryEntry {
  dateIso: string;
  mapId: MapId;
  difficultyId: DifficultyId;
  result: 'win' | 'loss' | 'draw' | 'exit';
  durationRealSec: number;
  battleScore: number;
  accountGoldDelta: number;
}

export interface Profile {
  accountGold: number;
  unlockedCards: CardId[];
  unlockedCommanders: CommanderId[];
  deck: CardId[];
  survivalRecords: Partial<Record<MapId, number>>;
  history: MatchHistoryEntry[];
}

