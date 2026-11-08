import * as THREE from 'three';
import { NatureModels } from '../render/NatureModels';
import { PALETTE } from '../render/Palette';
import { TerrainLook } from '../types';
import { GameMap } from './MapConfig';

export class Terrain {
  private group: THREE.Group;
  private instancedMeshes: THREE.InstancedMesh[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  // S6: Nehir dalga animasyonu
  private riverTexture: THREE.CanvasTexture | null = null;
  private animFrameId: number | null = null;
  private disposed: boolean = false;

  constructor(private map: GameMap) {
    this.group = new THREE.Group();
    this.buildTerrain();
    // S5: Harita kenarı diorama katmanları ve sisle bütünleşen dış zemin
    this.buildDioramaSkirt();
  }

  // Pseudo-random yardımcı fonksiyonlar (tohumlu ve deterministik)
  private hash2D(x: number, y: number, seed: number = 1337): number {
    const val = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.123) * 43758.5453;
    return val - Math.floor(val);
  }

  private smoothNoise2D(x: number, y: number, seed: number): number {
    const scale = 0.16;
    const gx = x * scale;
    const gy = y * scale;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;

    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const n00 = this.hash2D(x0, y0, seed);
    const n10 = this.hash2D(x0 + 1, y0, seed);
    const n01 = this.hash2D(x0, y0 + 1, seed);
    const n11 = this.hash2D(x0 + 1, y0 + 1, seed);

    const nx0 = n00 * (1 - sx) + n10 * sx;
    const nx1 = n01 * (1 - sx) + n11 * sx;
    return nx0 * (1 - sy) + nx1 * sy;
  }

  private buildTerrain(): void {
    const seed = this.map.width * 71 + this.map.height * 109 + this.map.playerStart.x * 19;

    // Kareleri görünümlerine göre grupla
    const lookPositions: Map<TerrainLook, THREE.Vector3[]> = new Map();

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const look = this.map.looks[y * this.map.width + x];
        if (!lookPositions.has(look)) {
          lookPositions.set(look, []);
        }
        lookPositions.get(look)!.push(new THREE.Vector3(x + 0.5, 0, y + 0.5));
      }
    }

    // 1. ZEMİN DÖŞEMELERİ (BASE GROUND TILES)
    for (const [look, positions] of lookPositions.entries()) {
      if (look === 'grass') {
        // S1: Çim zemini - Tohumlu değer gürültüsüyle açık/koyu/kuru yama renk değişimi
        const boxGeo = new THREE.BoxGeometry(1, 0.1, 1);
        this.geometries.push(boxGeo);

        const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.materials.push(grassMat);

        const grassMesh = new THREE.InstancedMesh(boxGeo, grassMat, positions.length);
        grassMesh.receiveShadow = true;
        grassMesh.frustumCulled = false;

        const dummy = new THREE.Object3D();
        const tileColor = new THREE.Color();
        const darkC = new THREE.Color(PALETTE.grassDark);
        const lightC = new THREE.Color(PALETTE.grassLight);
        const dryC = new THREE.Color(PALETTE.grassDry);

        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          dummy.position.set(pos.x, 0.05, pos.z);
          dummy.updateMatrix();
          grassMesh.setMatrixAt(i, dummy.matrix);

          const n = this.smoothNoise2D(pos.x, pos.z, seed);
          if (n < 0.35) {
            tileColor.copy(darkC).lerp(lightC, n / 0.35);
          } else if (n > 0.65) {
            tileColor.copy(lightC).lerp(dryC, (n - 0.65) / 0.35);
          } else {
            tileColor.copy(lightC);
          }

          // Hafif kare içi titreşim
          const jitter = (this.hash2D(pos.x * 5, pos.z * 5, seed + 9) - 0.5) * 0.06;
          tileColor.offsetHSL(jitter * 0.4, jitter, jitter);

          grassMesh.setColorAt(i, tileColor);
        }

        grassMesh.instanceMatrix.needsUpdate = true;
        if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
        this.instancedMeshes.push(grassMesh);
        this.group.add(grassMesh);
      } else if (look === 'river') {
        // S6: Nehir - Çift tonlu ve dalga dokulu
        const riverGeo = new THREE.BoxGeometry(1, 0.04, 1);
        this.geometries.push(riverGeo);

        this.riverTexture = NatureModels.createRiverTexture();
        this.textures.push(this.riverTexture);

        const riverMat = new THREE.MeshLambertMaterial({
          map: this.riverTexture,
          color: PALETTE.waterDeep,
        });
        this.materials.push(riverMat);

        const riverMesh = new THREE.InstancedMesh(riverGeo, riverMat, positions.length);
        riverMesh.frustumCulled = false;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          dummy.position.set(pos.x, 0.02, pos.z);
          dummy.updateMatrix();
          riverMesh.setMatrixAt(i, dummy.matrix);
        }
        riverMesh.instanceMatrix.needsUpdate = true;
        this.instancedMeshes.push(riverMesh);
        this.group.add(riverMesh);
      } else if (look === 'field') {
        // S9: Tarla - Şeritli dokulu kare
        const fieldGeo = new THREE.BoxGeometry(1, 0.1, 1);
        this.geometries.push(fieldGeo);

        const fieldTex = NatureModels.createFieldTexture();
        this.textures.push(fieldTex);

        const fieldMat = new THREE.MeshLambertMaterial({ map: fieldTex });
        this.materials.push(fieldMat);

        const fieldMesh = new THREE.InstancedMesh(fieldGeo, fieldMat, positions.length);
        fieldMesh.receiveShadow = true;
        fieldMesh.frustumCulled = false;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          dummy.position.set(pos.x, 0.05, pos.z);
          dummy.updateMatrix();
          fieldMesh.setMatrixAt(i, dummy.matrix);
        }
        fieldMesh.instanceMatrix.needsUpdate = true;
        this.instancedMeshes.push(fieldMesh);
        this.group.add(fieldMesh);
      } else if (look === 'forest') {
        // Orman tabanı düz yeşil kare (ağaçlar ayrıca S3'te eklenir)
        const forestFloorGeo = new THREE.BoxGeometry(1, 0.1, 1);
        this.geometries.push(forestFloorGeo);

        const forestFloorMat = new THREE.MeshLambertMaterial({ color: PALETTE.forestDark });
        this.materials.push(forestFloorMat);

        const floorMesh = new THREE.InstancedMesh(forestFloorGeo, forestFloorMat, positions.length);
        floorMesh.receiveShadow = true;
        floorMesh.frustumCulled = false;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          dummy.position.set(pos.x, 0.05, pos.z);
          dummy.updateMatrix();
          floorMesh.setMatrixAt(i, dummy.matrix);
        }
        floorMesh.instanceMatrix.needsUpdate = true;
        this.instancedMeshes.push(floorMesh);
        this.group.add(floorMesh);
      } else {
        // Dağ, kaya, tepe, sur, köprü vb.
        const { geometry, material, yOffset } = this.createLookAssets(look, seed);
        this.geometries.push(geometry);
        this.materials.push(material);

        const instancedMesh = new THREE.InstancedMesh(geometry, material, positions.length);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = false;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          dummy.position.set(pos.x, yOffset, pos.z);
          dummy.updateMatrix();
          instancedMesh.setMatrixAt(i, dummy.matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMeshes.push(instancedMesh);
        this.group.add(instancedMesh);
      }
    }

    // 2. S3: AĞAÇLAR (Çam, Meşe, Selvi)
    this.buildForestTrees(lookPositions.get('forest') || [], seed);

    // 3. S2: DOĞA DEKORLARI (Bina alanları dışındaki kırsal ot, çiçek, taş, çalı)
    this.buildWildernessDecor(lookPositions.get('grass') || [], seed);

    // Nehir akıntı animasyonu başlat
    this.startRiverAnimation();
  }

  // S3: Orman ağaçları (Çam, Meşe, Selvi - 3 tür, tohumlu boy 0.8-1.3, R3 işçisini örtmeyen boy)
  private buildForestTrees(forestTiles: THREE.Vector3[], seed: number): void {
    if (forestTiles.length === 0) return;

    const pineGeo = NatureModels.createPineGeometry();
    const oakGeo = NatureModels.createOakGeometry();
    const cypressGeo = NatureModels.createCypressGeometry();
    this.geometries.push(pineGeo, oakGeo, cypressGeo);

    const pineMat = new THREE.MeshLambertMaterial({ color: PALETTE.pineNeedle });
    const oakMat = new THREE.MeshLambertMaterial({ color: PALETTE.oakLeaves });
    const cypressMat = new THREE.MeshLambertMaterial({ color: PALETTE.cypress });
    this.materials.push(pineMat, oakMat, cypressMat);

    // Her kare için 2-3 ağaç (içte sık, kenarda 1-2)
    const maxTreeCount = forestTiles.length * 3;
    const pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, maxTreeCount);
    const oakMesh = new THREE.InstancedMesh(oakGeo, oakMat, maxTreeCount);
    const cypressMesh = new THREE.InstancedMesh(cypressGeo, cypressMat, maxTreeCount);

    pineMesh.castShadow = true;
    pineMesh.receiveShadow = true;
    pineMesh.frustumCulled = false;

    oakMesh.castShadow = true;
    oakMesh.receiveShadow = true;
    oakMesh.frustumCulled = false;

    cypressMesh.castShadow = true;
    cypressMesh.receiveShadow = true;
    cypressMesh.frustumCulled = false;

    let pineCount = 0;
    let oakCount = 0;
    let cypressCount = 0;

    const dummy = new THREE.Object3D();

    for (const tilePos of forestTiles) {
      const tx = Math.floor(tilePos.x);
      const ty = Math.floor(tilePos.z);

      // Kenar kontrolü
      const isEdge =
        this.isNeighborGrass(tx, ty - 1) ||
        this.isNeighborGrass(tx, ty + 1) ||
        this.isNeighborGrass(tx - 1, ty) ||
        this.isNeighborGrass(tx + 1, ty);

      const treesInTile = isEdge ? 1 : 2;

      for (let t = 0; t < treesInTile; t++) {
        const hVal = this.hash2D(tx * 3 + t, ty * 3 + t, seed);
        const species = Math.floor(hVal * 3); // 0 = Pine, 1 = Oak, 2 = Cypress

        // Konum ofseti
        const offX = (this.hash2D(tx * 7 + t, ty * 11, seed) - 0.5) * 0.45;
        const offZ = (this.hash2D(tx * 13, ty * 17 + t, seed) - 0.5) * 0.45;

        // Tohumlu boy: 0.85 - 1.25 (R3 işçi boyu 1.35'in taç boyu < 1.6 katı)
        const scale = 0.85 + this.hash2D(tx * 23 + t, ty * 29, seed) * 0.38;
        const rotY = this.hash2D(tx * 31 + t, ty * 37, seed) * Math.PI * 2;

        dummy.position.set(tilePos.x + offX, 0.1, tilePos.z + offZ);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();

        if (species === 0) {
          pineMesh.setMatrixAt(pineCount++, dummy.matrix);
        } else if (species === 1) {
          oakMesh.setMatrixAt(oakCount++, dummy.matrix);
        } else {
          cypressMesh.setMatrixAt(cypressCount++, dummy.matrix);
        }
      }
    }

    pineMesh.count = pineCount;
    pineMesh.instanceMatrix.needsUpdate = true;
    oakMesh.count = oakCount;
    oakMesh.instanceMatrix.needsUpdate = true;
    cypressMesh.count = cypressCount;
    cypressMesh.instanceMatrix.needsUpdate = true;

    this.instancedMeshes.push(pineMesh, oakMesh, cypressMesh);
    this.group.add(pineMesh, oakMesh, cypressMesh);
  }

  // S2: Doğa Dekorları (Ot, çiçek, küçük taş ve çalılar)
  // TASARIM KARARI: Binaların ve birimlerin içine girmemesi için oyuncu/düşman üs kurma alanları DIŞINDAKİ,
  // orman, nehir, kaya ve dağ kenarındaki doğal kırsal alanlara yerleştirilir.
  private buildWildernessDecor(grassTiles: THREE.Vector3[], seed: number): void {
    const isTouchOrNarrow =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || window.innerWidth < 768);

    // Dokunmatik/dar ekranda yoğunluk yarıya düşürülür
    const decorRate = isTouchOrNarrow ? 0.12 : 0.24;

    const grassTuftGeo = NatureModels.createDecorGeometry('grass');
    const flowerGeo = NatureModels.createDecorGeometry('flower');
    const pebbleGeo = NatureModels.createDecorGeometry('pebble');
    const bushGeo = NatureModels.createDecorGeometry('bush');
    this.geometries.push(grassTuftGeo, flowerGeo, pebbleGeo, bushGeo);

    const grassTuftMat = new THREE.MeshLambertMaterial({ color: PALETTE.grassDark });
    const flowerMat = new THREE.MeshLambertMaterial({ color: PALETTE.flowerYellow });
    const pebbleMat = new THREE.MeshLambertMaterial({ color: PALETTE.rockLight });
    const bushMat = new THREE.MeshLambertMaterial({ color: PALETTE.forestLight });
    this.materials.push(grassTuftMat, flowerMat, pebbleMat, bushMat);

    const maxCount = Math.floor(grassTiles.length * 0.4);
    const tuftMesh = new THREE.InstancedMesh(grassTuftGeo, grassTuftMat, maxCount);
    const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, maxCount);
    const pebbleMesh = new THREE.InstancedMesh(pebbleGeo, pebbleMat, maxCount);
    const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, maxCount);

    let tuftCount = 0;
    let flowerCount = 0;
    let pebbleCount = 0;
    let bushCount = 0;

    const dummy = new THREE.Object3D();

    for (const tile of grassTiles) {
      const tx = Math.floor(tile.x);
      const ty = Math.floor(tile.z);

      // Ana karargâh kurma alanlarına (playerStart ve enemyStart çevresine 8 kare mesafe) dekor koyma
      const distPlayer = Math.hypot(tx - this.map.playerStart.x, ty - this.map.playerStart.y);
      const distEnemy = Math.hypot(tx - this.map.enemyStart.x, ty - this.map.enemyStart.y);
      if (distPlayer < 8 || distEnemy < 8) continue;

      // Yalnızca doğal sınırlarda (orman kenarı, kaya kenarı, nehir kenarı)
      const hasNaturalNeighbor =
        this.isNeighborNatural(tx, ty - 1) ||
        this.isNeighborNatural(tx, ty + 1) ||
        this.isNeighborNatural(tx - 1, ty) ||
        this.isNeighborNatural(tx + 1, ty);

      if (!hasNaturalNeighbor) continue;

      const roll = this.hash2D(tx * 17, ty * 23, seed);
      if (roll > decorRate) continue;

      const typePick = Math.floor(this.hash2D(tx * 31, ty * 41, seed) * 4);
      const offX = (this.hash2D(tx * 53, ty * 61, seed) - 0.5) * 0.5;
      const offZ = (this.hash2D(tx * 71, ty * 79, seed) - 0.5) * 0.5;
      const rotY = this.hash2D(tx * 83, ty * 89, seed) * Math.PI * 2;

      dummy.position.set(tile.x + offX, 0.1, tile.z + offZ);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();

      if (typePick === 0 && tuftCount < maxCount) {
        tuftMesh.setMatrixAt(tuftCount++, dummy.matrix);
      } else if (typePick === 1 && flowerCount < maxCount) {
        flowerMesh.setMatrixAt(flowerCount++, dummy.matrix);
      } else if (typePick === 2 && pebbleCount < maxCount) {
        pebbleMesh.setMatrixAt(pebbleCount++, dummy.matrix);
      } else if (bushCount < maxCount) {
        bushMesh.setMatrixAt(bushCount++, dummy.matrix);
      }
    }

    tuftMesh.count = tuftCount;
    tuftMesh.instanceMatrix.needsUpdate = true;
    flowerMesh.count = flowerCount;
    flowerMesh.instanceMatrix.needsUpdate = true;
    pebbleMesh.count = pebbleCount;
    pebbleMesh.instanceMatrix.needsUpdate = true;
    bushMesh.count = bushCount;
    bushMesh.instanceMatrix.needsUpdate = true;

    this.instancedMeshes.push(tuftMesh, flowerMesh, pebbleMesh, bushMesh);
    this.group.add(tuftMesh, flowerMesh, pebbleMesh, bushMesh);
  }

  private isNeighborGrass(x: number, y: number): boolean {
    if (!this.map.inBounds(x, y)) return false;
    return this.map.looks[y * this.map.width + x] === 'grass';
  }

  private isNeighborNatural(x: number, y: number): boolean {
    if (!this.map.inBounds(x, y)) return false;
    const l = this.map.looks[y * this.map.width + x];
    return l === 'forest' || l === 'mountain' || l === 'rock' || l === 'river' || l === 'hill';
  }

  // S6: Nehir akıntı animasyonu (düşük maliyetli texture offset)
  private startRiverAnimation(): void {
    const animate = () => {
      if (this.disposed) return;
      if (this.riverTexture) {
        this.riverTexture.offset.x += 0.0012;
        this.riverTexture.offset.y += 0.0006;
      }
      this.animFrameId = requestAnimationFrame(animate);
    };
    this.animFrameId = requestAnimationFrame(animate);
  }

  // S4, S5, S7, S8: Her TerrainLook için özel low-poly modeller
  private createLookAssets(look: TerrainLook, seed: number): {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    yOffset: number;
  } {
    switch (look) {
      case 'mountain':
        // S4: İkosahedron'dan tohumlu bozulmuş karlı kayalık sıradağ kütlesi
        return {
          geometry: NatureModels.createMountainGeometry(seed),
          material: new THREE.MeshLambertMaterial({ vertexColors: true }),
          yOffset: 0.1,
        };

      case 'rock':
        // S5: 3-4 bozuk kutudan oluşan kaya kümesi
        return {
          geometry: NatureModels.createRockClusterGeometry(),
          material: new THREE.MeshLambertMaterial({ color: PALETTE.rockLight }),
          yOffset: 0.1,
        };

      case 'hill':
        // S5: Alçak, yarım küre biçimli yeşil-kahve tepe
        return {
          geometry: NatureModels.createHillGeometry(),
          material: new THREE.MeshLambertMaterial({ color: PALETTE.grassDry }),
          yOffset: 0.05,
        };

      case 'wall':
        // S8: Taş sur ve Tuna Geçidi için mazgallı / kalıntılı duvar
        return {
          geometry: NatureModels.createWallGeometry(),
          material: new THREE.MeshLambertMaterial({ color: PALETTE.wallStone }),
          yOffset: 0.05,
        };

      case 'bridge':
        // S7: Ahşap zemin, korkuluklar ve kazıklar
        return {
          geometry: NatureModels.createBridgeGeometry(),
          material: new THREE.MeshLambertMaterial({ color: PALETTE.woodLight }),
          yOffset: 0.05,
        };

      case 'ford':
        // S7: Sığ geçit suyu ve basamak taşları
        return {
          geometry: NatureModels.createFordGeometry(),
          material: new THREE.MeshLambertMaterial({ color: PALETTE.waterShallow }),
          yOffset: 0.02,
        };

      case 'gate':
        // S7: Taş kemerli kapı kule açıklığı
        return {
          geometry: NatureModels.createGateGeometry(),
          material: new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark }),
          yOffset: 0.05,
        };

      default:
        return {
          geometry: new THREE.BoxGeometry(1, 0.1, 1),
          material: new THREE.MeshLambertMaterial({ color: PALETTE.grassLight }),
          yOffset: 0.05,
        };
    }
  }

  // S5: Harita kenarı diorama görünümü
  private buildDioramaSkirt(): void {
    const w = this.map.width;
    const h = this.map.height;

    // 1. Üst toprak katmanı (Top soil rim) - y: 0.05 .. -0.45
    const soilThickness = 0.45;
    const soilHeight = 0.50;
    const soilY = -soilHeight / 2 + 0.05;

    const northSoil = new THREE.BoxGeometry(w + soilThickness * 2, soilHeight, soilThickness);
    northSoil.translate(w / 2, soilY, -soilThickness / 2);

    const southSoil = new THREE.BoxGeometry(w + soilThickness * 2, soilHeight, soilThickness);
    southSoil.translate(w / 2, soilY, h + soilThickness / 2);

    const westSoil = new THREE.BoxGeometry(soilThickness, soilHeight, h);
    westSoil.translate(-soilThickness / 2, soilY, h / 2);

    const eastSoil = new THREE.BoxGeometry(soilThickness, soilHeight, h);
    eastSoil.translate(w + soilThickness / 2, soilY, h / 2);

    const soilGeo = NatureModels.mergeGeometries([northSoil, southSoil, westSoil, eastSoil]);
    const soilMat = new THREE.MeshLambertMaterial({ color: PALETTE.dirt });
    const soilMesh = new THREE.Mesh(soilGeo, soilMat);
    soilMesh.receiveShadow = true;
    this.geometries.push(soilGeo);
    this.materials.push(soilMat);
    this.group.add(soilMesh);

    // 2. Alt kaya / kesit katmanı (Bedrock rim) - y: -0.45 .. -1.6
    const rockThickness = 0.85;
    const rockHeight = 1.15;
    const rockY = -0.45 - rockHeight / 2 + 0.05;

    const northRock = new THREE.BoxGeometry(w + rockThickness * 2, rockHeight, rockThickness);
    northRock.translate(w / 2, rockY, -rockThickness / 2);

    const southRock = new THREE.BoxGeometry(w + rockThickness * 2, rockHeight, rockThickness);
    southRock.translate(w / 2, rockY, h + rockThickness / 2);

    const westRock = new THREE.BoxGeometry(rockThickness, rockHeight, h);
    westRock.translate(-rockThickness / 2, rockY, h / 2);

    const eastRock = new THREE.BoxGeometry(rockThickness, rockHeight, h);
    eastRock.translate(w + rockThickness / 2, rockY, h / 2);

    const rockGeo = NatureModels.mergeGeometries([northRock, southRock, westRock, eastRock]);
    const rockMat = new THREE.MeshLambertMaterial({ color: PALETTE.rockDark });
    const rockMesh = new THREE.Mesh(rockGeo, rockMat);
    rockMesh.receiveShadow = true;
    this.geometries.push(rockGeo);
    this.materials.push(rockMat);
    this.group.add(rockMesh);

    // 3. Ötesinde sis rengine karışan zemin (Diorama outer skirt) - y = -1.55
    const skirtMargin = 45;
    const outerW = w + skirtMargin * 2;
    const outerH = h + skirtMargin * 2;
    const skirtGeo = new THREE.PlaneGeometry(outerW, outerH);
    skirtGeo.rotateX(-Math.PI / 2);
    skirtGeo.translate(w / 2, -1.55, h / 2);

    const skirtMat = new THREE.MeshBasicMaterial({
      color: PALETTE.fog,
      depthWrite: true,
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    this.geometries.push(skirtGeo);
    this.materials.push(skirtMat);
    this.group.add(skirtMesh);
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    for (const mesh of this.instancedMeshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    for (const geo of this.geometries) {
      geo.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.group.clear();
  }
}
