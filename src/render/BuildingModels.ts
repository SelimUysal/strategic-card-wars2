import * as THREE from 'three';
import { BuildingId } from '../types';
import { PALETTE } from './Palette';

/**
 * R11D: BuildingModels.ts
 * Osmanlı esintili, özgün, stilize low-poly bina modelleri, inşaat iskelesi, hasar ve enkaz geometrileri.
 */

export class BuildingModels {
  // B1-B9: Bina model tepe yükseklikleri (R4/R6 etiketleri ve kamera hizalaması için)
  public static buildingModelHeight(defId: BuildingId): number {
    switch (defId) {
      case 'hq':
        return 4.3; // Ana kubbe 3.2, sancak 4.0, minare külahı 4.3
      case 'hisar':
        return 3.5; // Mazgallı gövde 2.8, platform ve sancak 3.5
      case 'fil_ocagi':
        return 3.4; // Yüksek kemerli ahır 2.6, çatı ve sancak 3.4
      case 'tersane':
        return 3.3; // Açık hangar 2.0, gemi direği ve flama 3.3
      case 'mancinik_i_azam':
        return 3.2; // A-ayak 1.8, atış kolu ve flama 3.2
      case 'tophane':
        return 3.1; // Dökümhane 1.8, baca ve kubbe sancağı 3.1
      case 'yenicheri_ocagi':
        return 3.0; // Taş kışla 2.0, kiremit çatı ve sancak 3.0
      case 'okcular_ocagi':
        return 2.8; // Açık sundurma 2.0, çatı ve flama 2.8
      case 'suvari_ocagi':
        return 2.7; // Ahşap ahır 1.9, çatı bandı ve flama 2.7
      default:
        return 3.0;
    }
  }

  // D4: Bina tabanındaki taş / çakıl temel şeridi geometrisi
  private static createFoundation(w: number, h: number, material: THREE.Material): THREE.Mesh {
    const geom = new THREE.BoxGeometry(w - 0.2, 0.05, h - 0.2);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.y = 0.025;
    mesh.receiveShadow = true;
    return mesh;
  }

  // B1: Ana Karargâh (6x6) - Taş avlu, kubbeli yapı, 4 köşe kulesi, minare kulesi, giriş kemeri, sancak
  private static createHqModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_hq';

    const stoneMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneLight, flatShading: true });
    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const domeMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.domeTurquoise, flatShading: true });
    const woodMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });
    const dirtMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.dirt, flatShading: true });

    // D4: Taş çakıl temel şeridi (5.8 x 5.8)
    group.add(this.createFoundation(6.0, 6.0, stoneDarkMat));

    // D4: Avlu girişi hafif toprak / yol izi (ön cepheye doğru uzanan yol)
    const pathGeom = new THREE.BoxGeometry(1.6, 0.055, 1.8);
    const pathMesh = new THREE.Mesh(pathGeom, dirtMat);
    pathMesh.position.set(0, 0.028, 2.1);
    group.add(pathMesh);

    // Taş avlu duvarları (4 kenar)
    const wallW = new THREE.BoxGeometry(4.8, 0.9, 0.35);
    const wallN = new THREE.Mesh(wallW, stoneMat);
    wallN.position.set(0, 0.45, -2.4);
    wallN.castShadow = true;
    wallN.receiveShadow = true;
    group.add(wallN);

    const wallSLeft = new THREE.BoxGeometry(1.6, 0.9, 0.35);
    const wallSL = new THREE.Mesh(wallSLeft, stoneMat);
    wallSL.position.set(-1.6, 0.45, 2.4);
    group.add(wallSL);

    const wallSR = new THREE.Mesh(wallSLeft, stoneMat);
    wallSR.position.set(1.6, 0.45, 2.4);
    group.add(wallSR);

    const wallSide = new THREE.BoxGeometry(0.35, 0.9, 4.8);
    const wallWLeft = new THREE.Mesh(wallSide, stoneMat);
    wallWLeft.position.set(-2.4, 0.45, 0);
    group.add(wallWLeft);

    const wallWRight = new THREE.Mesh(wallSide, stoneMat);
    wallWRight.position.set(2.4, 0.45, 0);
    group.add(wallWRight);

    // Girişte taş kemer taç kapısı
    const archPillar = new THREE.BoxGeometry(0.35, 1.4, 0.4);
    const archPL = new THREE.Mesh(archPillar, stoneMat);
    archPL.position.set(-0.7, 0.7, 2.4);
    const archPR = new THREE.Mesh(archPillar, stoneMat);
    archPR.position.set(0.7, 0.7, 2.4);
    const archLintel = new THREE.BoxGeometry(1.75, 0.35, 0.45);
    const archL = new THREE.Mesh(archLintel, stoneMat);
    archL.position.set(0, 1.45, 2.4);
    group.add(archPL, archPR, archL);

    // 4 Köşe küçük kulesi
    const cornerTowerGeom = new THREE.CylinderGeometry(0.45, 0.5, 1.5, 6);
    const corners = [
      [-2.4, -2.4],
      [2.4, -2.4],
      [-2.4, 2.4],
      [2.4, 2.4],
    ];
    for (const [cx, cz] of corners) {
      const tower = new THREE.Mesh(cornerTowerGeom, stoneMat);
      tower.position.set(cx, 0.75, cz);
      tower.castShadow = true;
      group.add(tower);

      const cap = new THREE.ConeGeometry(0.5, 0.5, 6);
      const capMesh = new THREE.Mesh(cap, stoneDarkMat);
      capMesh.position.set(cx, 1.75, cz);
      group.add(capMesh);
    }

    // Ortada büyük kubbeli saray gövdesi (3.6 x 1.6 x 3.6)
    const palaceBaseGeom = new THREE.BoxGeometry(3.6, 1.6, 3.6);
    const palaceBase = new THREE.Mesh(palaceBaseGeom, stoneMat);
    palaceBase.position.set(0, 0.8, 0);
    palaceBase.castShadow = true;
    palaceBase.receiveShadow = true;
    group.add(palaceBase);

    // Kubbe kasnağı (sekizgen silindir)
    const kasnakGeom = new THREE.CylinderGeometry(1.5, 1.55, 0.45, 8);
    const kasnak = new THREE.Mesh(kasnakGeom, stoneDarkMat);
    kasnak.position.set(0, 1.8, 0);
    group.add(kasnak);

    // Takım kubbe bandı
    const domeBandGeom = new THREE.CylinderGeometry(1.52, 1.52, 0.16, 8);
    const domeBand = new THREE.Mesh(domeBandGeom, teamMat);
    domeBand.name = 'teamPart';
    domeBand.position.set(0, 1.8, 0);
    group.add(domeBand);

    // Yarım küre büyük kubbe
    const domeGeom = new THREE.SphereGeometry(1.4, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeom, domeMat);
    dome.position.set(0, 2.0, 0);
    dome.castShadow = true;
    group.add(dome);

    // Kubbe tepesinde sancak direği ve takım sancağı
    const flagPole = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4);
    const poleMesh = new THREE.Mesh(flagPole, woodMat);
    poleMesh.position.set(0, 3.4, 0);
    group.add(poleMesh);

    const bannerGeom = new THREE.BoxGeometry(0.02, 0.45, 0.65);
    const banner = new THREE.Mesh(bannerGeom, teamMat);
    banner.name = 'teamPart';
    banner.position.set(0, 3.65, 0.32);
    group.add(banner);

    // Bir yanda ince minare benzeri kule (sağ arka köşede)
    const minaretBase = new THREE.CylinderGeometry(0.28, 0.35, 3.3, 8);
    const minaret = new THREE.Mesh(minaretBase, stoneMat);
    minaret.position.set(1.8, 1.65, -1.8);
    minaret.castShadow = true;
    group.add(minaret);

    // Minare şerefesi
    const balconyGeom = new THREE.CylinderGeometry(0.42, 0.32, 0.25, 8);
    const balcony = new THREE.Mesh(balconyGeom, stoneDarkMat);
    balcony.position.set(1.8, 3.3, -1.8);
    group.add(balcony);

    // Minare külahı (sivri koni, toplam boy 4.3)
    const coneGeom = new THREE.ConeGeometry(0.32, 0.9, 8);
    const cone = new THREE.Mesh(coneGeom, domeMat);
    cone.position.set(1.8, 3.85, -1.8);
    group.add(cone);

    return group;
  }

  // B2: Okçular Ocağı (4x4) - Ahşap açık talimhane, kiremit çatı, hedef tahtası ve yay rafı
  private static createArcheryRangeModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_okcular_ocagi';

    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const woodMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodLight, flatShading: true });
    const woodDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true });
    const tileMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.tileRed, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });
    const targetMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: 0xf8fafc, flatShading: true });
    const targetRedMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: 0xef4444, flatShading: true });

    // D4 Temel
    group.add(this.createFoundation(4.0, 4.0, stoneDarkMat));

    // Ahşap talimhane tabanı
    const floor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 2.6), woodDarkMat);
    floor.position.set(0, 0.1, -0.3);
    group.add(floor);

    // 4 Ahşap sütun direk
    const postGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 5);
    const postPositions = [
      [-1.4, -1.4],
      [1.4, -1.4],
      [-1.4, 0.8],
      [1.4, 0.8],
    ];
    for (const [px, pz] of postPositions) {
      const post = new THREE.Mesh(postGeom, woodMat);
      post.position.set(px, 0.95, pz);
      post.castShadow = true;
      group.add(post);
    }

    // Arka ahşap siper paneli
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.2, 0.15), woodMat);
    backWall.position.set(0, 0.7, -1.4);
    group.add(backWall);

    // Kiremit eğimli çatı
    const roofGeom = new THREE.BoxGeometry(3.5, 0.35, 2.8);
    roofGeom.rotateX(-0.1);
    const roof = new THREE.Mesh(roofGeom, tileMat);
    roof.position.set(0, 1.95, -0.3);
    roof.castShadow = true;
    group.add(roof);

    // Çatı tepesinde takım sancağı
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4), woodDarkMat);
    flagPole.position.set(0, 2.45, -0.3);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.5), teamMat);
    flag.name = 'teamPart';
    flag.position.set(0, 2.65, -0.05);
    group.add(flagPole, flag);

    // Yanda hedef tahtası (ön sağda)
    const targetStand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), woodDarkMat);
    targetStand.position.set(1.2, 0.45, 1.2);
    const targetBoard = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 12), targetMat);
    targetBoard.rotateX(Math.PI / 2);
    targetBoard.position.set(1.2, 0.7, 1.15);
    const bullseye = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 10), targetRedMat);
    bullseye.rotateX(Math.PI / 2);
    bullseye.position.set(1.2, 0.7, 1.16);
    group.add(targetStand, targetBoard, bullseye);

    // Yay rafı (ön solda)
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.25), woodDarkMat);
    rack.position.set(-1.2, 0.4, 1.2);
    group.add(rack);

    return group;
  }

  // B3: Yeniçeri Ocağı (4x4) - Uzun taş kışla, kemerli kapı, yeniçeri kazanı, kapı üstü sancak
  private static createJanissaryBarracksModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_yenicheri_ocagi';

    const stoneMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneLight, flatShading: true });
    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const tileMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.tileRed, flatShading: true });
    const copperMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: 0xb45309, flatShading: true });
    const woodMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });

    // D4 Temel
    group.add(this.createFoundation(4.0, 4.0, stoneDarkMat));

    // Uzun taş kışla ana gövdesi (3.4 x 1.6 x 2.7)
    const barracks = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 2.7), stoneMat);
    barracks.position.set(0, 0.8, -0.2);
    barracks.castShadow = true;
    barracks.receiveShadow = true;
    group.add(barracks);

    // Kemerli kapı girişi ve takım kapı bandı
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.1), woodMat);
    door.position.set(0, 0.6, 1.16);
    const doorBand = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.15), teamMat);
    doorBand.name = 'teamPart';
    doorBand.position.set(0, 1.3, 1.16);
    group.add(door, doorBand);

    // Kiremit beşik çatı
    const roofGeom = new THREE.ConeGeometry(2.3, 0.9, 4);
    roofGeom.rotateY(Math.PI / 4);
    roofGeom.scale(1.1, 0.9, 0.9);
    const roof = new THREE.Mesh(roofGeom, tileMat);
    roof.position.set(0, 2.0, -0.2);
    roof.castShadow = true;
    group.add(roof);

    // Kapı üstünde ve çatıda sancak
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), woodMat);
    pole.position.set(0, 2.6, -0.2);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.6), teamMat);
    flag.name = 'teamPart';
    flag.position.set(0, 2.8, 0.1);
    group.add(pole, flag);

    // Önünde büyük yeniçeri kazanı (bronz/bakır kazan ve ocak taşları)
    const cauldron = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.45, 8), copperMat);
    cauldron.position.set(1.1, 0.28, 1.2);
    const ashes = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.1, 7), stoneDarkMat);
    ashes.position.set(1.1, 0.05, 1.2);
    group.add(cauldron, ashes);

    return group;
  }

  // B4: Süvari Ocağı (4x4) - Ahır görünümü, çit, saman balyaları, geniş çift kapı, flama
  private static createCavalryStableModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_suvari_ocagi';

    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const woodMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true });
    const woodLightMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodLight, flatShading: true });
    const strawMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.gold, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });

    // D4 Temel
    group.add(this.createFoundation(4.0, 4.0, stoneDarkMat));

    // Ahşap ahır gövdesi
    const stable = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.5, 2.8), woodMat);
    stable.position.set(0, 0.75, -0.3);
    stable.castShadow = true;
    stable.receiveShadow = true;
    group.add(stable);

    // Geniş çift ahşap kapı
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.08), woodLightMat);
    doorL.position.set(-0.4, 0.55, 1.12);
    const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.08), woodLightMat);
    doorR.position.set(0.4, 0.55, 1.12);
    group.add(doorL, doorR);

    // Ahır eğimli çatısı
    const roofGeom = new THREE.ConeGeometry(2.3, 0.85, 4);
    roofGeom.rotateY(Math.PI / 4);
    roofGeom.scale(1.1, 0.9, 0.95);
    const roof = new THREE.Mesh(roofGeom, woodLightMat);
    roof.position.set(0, 1.9, -0.3);
    roof.castShadow = true;
    group.add(roof);

    // Takım çatı bandı
    const band = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 0.18), teamMat);
    band.name = 'teamPart';
    band.position.set(0, 1.5, 1.1);
    group.add(band);

    // Çatı tepesinde süvari flaması
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 4), woodMat);
    pole.position.set(0, 2.4, -0.3);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.55), teamMat);
    flag.name = 'teamPart';
    flag.position.set(0, 2.6, -0.05);
    group.add(pole, flag);

    // Saman balyaları (ön sağda)
    const bale1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.4), strawMat);
    bale1.position.set(1.2, 0.2, 1.2);
    const bale2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.38), strawMat);
    bale2.position.set(1.2, 0.52, 1.2);
    group.add(bale1, bale2);

    // Ahşap çit (ön solda)
    const fence = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.08), woodLightMat);
    fence.position.set(-1.2, 0.25, 1.2);
    group.add(fence);

    return group;
  }

  // B5: Tophane (4x4) - Taş depo, yarım kubbe çatı, bronz namlu, gülle yığını, baca, sancak
  private static createFoundryModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_tophane';

    const stoneMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneLight, flatShading: true });
    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const bronzeMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: 0xb45309, flatShading: true });
    const cannonballMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: 0x1c1917, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });

    // D4 Temel
    group.add(this.createFoundation(4.0, 4.0, stoneDarkMat));

    // Sağlam taş dökümhane deposu (3.3 x 1.6 x 2.8)
    const depot = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.6, 2.8), stoneMat);
    depot.position.set(0, 0.8, -0.3);
    depot.castShadow = true;
    depot.receiveShadow = true;
    group.add(depot);

    // Yarım kubbeli taş çatı
    const domeGeom = new THREE.SphereGeometry(1.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeom, stoneDarkMat);
    dome.position.set(0, 1.6, -0.3);
    dome.castShadow = true;
    group.add(dome);

    // Dökümhane duman bacası
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.45), stoneDarkMat);
    chimney.position.set(-1.0, 2.2, -0.9);
    chimney.castShadow = true;
    group.add(chimney);

    // Kubbe tepesinde takım sancağı
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4), stoneDarkMat);
    pole.position.set(0, 2.8, -0.3);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.38, 0.55), teamMat);
    flag.name = 'teamPart';
    flag.position.set(0, 3.0, -0.05);
    group.add(pole, flag);

    // Ön tarafta bronz döküm top namlusu
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.1, 7), bronzeMat);
    barrel.rotateX(Math.PI / 2);
    barrel.position.set(0.8, 0.25, 1.2);
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.8), stoneDarkMat);
    carriage.position.set(0.8, 0.1, 1.2);
    group.add(barrel, carriage);

    // Gülle yığını (küreler piramidi)
    const ballGeom = new THREE.SphereGeometry(0.12, 5, 4);
    const b1 = new THREE.Mesh(ballGeom, cannonballMat);
    b1.position.set(-0.8, 0.12, 1.1);
    const b2 = new THREE.Mesh(ballGeom, cannonballMat);
    b2.position.set(-0.6, 0.12, 1.1);
    const b3 = new THREE.Mesh(ballGeom, cannonballMat);
    b3.position.set(-0.7, 0.12, 1.3);
    const b4 = new THREE.Mesh(ballGeom, cannonballMat);
    b4.position.set(-0.7, 0.28, 1.2);
    group.add(b1, b2, b3, b4);

    return group;
  }

  // B6: Fil Ocağı (4x4) - Geniş yüksek kapı, iki sütun, çatıda kilimli süs, kilim bandı
  private static createElephantPenModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_fil_ocagi';

    const stoneMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneLight, flatShading: true });
    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const woodMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });

    // D4 Temel
    group.add(this.createFoundation(4.0, 4.0, stoneDarkMat));

    // Geniş ve yüksek ahır gövdesi (3.4 x 2.2 x 2.8)
    const pen = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 2.8), stoneMat);
    pen.position.set(0, 1.05, -0.3);
    pen.castShadow = true;
    pen.receiveShadow = true;
    group.add(pen);

    // Geniş ve yüksek açık kapı açıklığı
    const doorHole = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.1), woodMat);
    doorHole.position.set(0, 0.9, 1.11);
    group.add(doorHole);

    // Kapı yanında iki taş sütun
    const pillarGeom = new THREE.CylinderGeometry(0.2, 0.22, 2.0, 6);
    const pillarL = new THREE.Mesh(pillarGeom, stoneDarkMat);
    pillarL.position.set(-0.95, 1.0, 1.15);
    const pillarR = new THREE.Mesh(pillarGeom, stoneDarkMat);
    pillarR.position.set(0.95, 1.0, 1.15);
    group.add(pillarL, pillarR);

    // Çatı ve kilimli saçak süsü
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 3.0), woodMat);
    roof.position.set(0, 2.25, -0.3);
    roof.castShadow = true;
    group.add(roof);

    // Takım rengi kilim süs bandı
    const rugBand = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 0.12), teamMat);
    rugBand.name = 'teamPart';
    rugBand.position.set(0, 2.05, 1.15);
    group.add(rugBand);

    // Çatı tepesinde sancak
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), woodMat);
    pole.position.set(0, 2.8, -0.3);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, 0.65), teamMat);
    flag.name = 'teamPart';
    flag.position.set(0, 3.05, 0.05);
    group.add(pole, flag);

    return group;
  }

  // B7: Tersane (5x5) - Ahşap açık hangar, gemi iskeleti (yarım gövde), direk ve kızak, yelken parçası
  private static createShipyardModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_tersane';

    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const woodLightMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodLight, flatShading: true });
    const woodDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });

    // D4 Temel (4.8 x 4.8)
    group.add(this.createFoundation(5.0, 5.0, stoneDarkMat));

    // Ahşap hangar arka ve yan duvarları (açık ön cephe)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.8, 0.25), woodDarkMat);
    backWall.position.set(0, 0.9, -1.9);
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 3.8), woodDarkMat);
    wallL.position.set(-2.0, 0.9, 0);
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 3.8), woodDarkMat);
    wallR.position.set(2.0, 0.9, 0);
    group.add(backWall, wallL, wallR);

    // Hangar çatısı
    const roofGeom = new THREE.BoxGeometry(4.4, 0.3, 4.0);
    roofGeom.rotateX(-0.1);
    const roof = new THREE.Mesh(roofGeom, woodLightMat);
    roof.position.set(0, 2.0, 0);
    roof.castShadow = true;
    group.add(roof);

    // Ahşap kızaklar (yerde)
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 3.2), woodDarkMat);
    skidL.position.set(-0.6, 0.08, 0.2);
    const skidR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 3.2), woodDarkMat);
    skidR.position.set(0.6, 0.08, 0.2);
    group.add(skidL, skidR);

    // İçinde gemi iskeleti (yarım omurga / kaburga kadırga teknesi)
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.35, 2.8), woodLightMat);
    keel.position.set(0, 0.3, 0.2);
    const rib1 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 3, 6, Math.PI), woodLightMat);
    rib1.rotateY(-Math.PI / 2);
    rib1.position.set(0, 0.35, -0.6);
    const rib2 = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 3, 6, Math.PI), woodLightMat);
    rib2.rotateY(-Math.PI / 2);
    rib2.position.set(0, 0.35, 0.2);
    const rib3 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 3, 6, Math.PI), woodLightMat);
    rib3.rotateY(-Math.PI / 2);
    rib3.position.set(0, 0.35, 1.0);
    group.add(keel, rib1, rib2, rib3);

    // Direk ve takım yelken parçası
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 5), woodDarkMat);
    mast.position.set(0, 1.8, 0.2);
    const sailPiece = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.6, 0.9), teamMat);
    sailPiece.name = 'teamPart';
    sailPiece.position.set(0, 2.4, 0.55);
    group.add(mast, sailPiece);

    return group;
  }

  // B8: Hisar (3x3) - Mazgallı taş kule, dar ve uzun silüet, dar pencereler, sancak
  private static createCastleModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_hisar';

    const stoneMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneLight, flatShading: true });
    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });
    const woodMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true });

    // D4 Temel
    group.add(this.createFoundation(3.0, 3.0, stoneDarkMat));

    // Dar ve uzun sekizgen taş kule gövdesi (yükseklik 2.6)
    const towerGeom = new THREE.CylinderGeometry(1.0, 1.15, 2.6, 8);
    const tower = new THREE.Mesh(towerGeom, stoneMat);
    tower.position.set(0, 1.3, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    // Dar okçu mazgal pencereleri (siyah ince şeritler)
    const slit1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.08), stoneDarkMat);
    slit1.position.set(0, 1.6, 1.08);
    const slit2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.12), stoneDarkMat);
    slit2.position.set(1.08, 1.6, 0);
    group.add(slit1, slit2);

    // Üst geniş mazgal platformu
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.1, 0.35, 8), stoneDarkMat);
    platform.position.set(0, 2.65, 0);
    group.add(platform);

    // 4 Mazgal dişi (merlonlar)
    const merlonGeom = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const mOffsets = [
      [0, 1.15],
      [0, -1.15],
      [1.15, 0],
      [-1.15, 0],
    ];
    for (const [mx, mz] of mOffsets) {
      const merlon = new THREE.Mesh(merlonGeom, stoneMat);
      merlon.position.set(mx, 2.95, mz);
      group.add(merlon);
    }

    // Tepede sancak direği ve takım sancağı (toplam boy 3.5)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), woodMat);
    pole.position.set(0, 3.2, 0);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.6), teamMat);
    flag.name = 'teamPart';
    flag.position.set(0, 3.45, 0.3);
    group.add(pole, flag);

    return group;
  }

  // B9: Mancınık-ı Azam (4x4) - Ahşap kaide, uzun atış kolu, karşı ağırlık sandığı, taş yığını, flama
  private static createTrebuchetModel(overrideMaterial?: THREE.Material, teamColor: number = 0x2563eb): THREE.Group {
    const group = new THREE.Group();
    group.name = 'building_mancinik_i_azam';

    const stoneDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.stoneDark, flatShading: true });
    const woodDarkMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true });
    const woodMat = woodDarkMat;
    const woodLightMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: PALETTE.woodLight, flatShading: true });
    const teamMat = overrideMaterial || new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });

    // D4 Temel
    group.add(this.createFoundation(4.0, 4.0, stoneDarkMat));

    // Ahşap taban çerçevesi (3.2 x 0.25 x 3.2)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 3.2), woodMat);
    frame.position.set(0, 0.15, 0);
    group.add(frame);

    // İki yan A-iskelet desteği
    const aPillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.8, 4), woodMat);
    aPillarL.rotateZ(0.18);
    aPillarL.position.set(-0.7, 1.0, 0);
    const aPillarR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.8, 4), woodMat);
    aPillarR.rotateZ(-0.18);
    aPillarR.position.set(0.7, 1.0, 0);
    group.add(aPillarL, aPillarR);

    // Üst aks mili
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 5), woodDarkMat);
    axle.rotateZ(Math.PI / 2);
    axle.position.set(0, 1.8, 0);
    group.add(axle);

    // Devasa uzun atış kolu (eğimli)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 3.2), woodLightMat);
    arm.rotateX(-Math.PI / 4);
    arm.position.set(0, 1.9, 0.2);
    arm.castShadow = true;
    group.add(arm);

    // Karşı ağırlık sandığı (arka alt uçta)
    const weight = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), woodDarkMat);
    weight.position.set(0, 0.8, -1.1);
    weight.castShadow = true;
    group.add(weight);

    // Yanında taş / kaya gülle yığını
    const rock1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28), stoneDarkMat);
    rock1.position.set(1.1, 0.25, 0.9);
    const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24), stoneDarkMat);
    rock2.position.set(1.3, 0.22, 0.5);
    group.add(rock1, rock2);

    // Atış kolunun ucunda takım flaması
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.6), teamMat);
    flag.name = 'teamPart';
    flag.position.set(0, 3.0, 1.4);
    group.add(flag);

    return group;
  }

  // D1: İnşaat İskelesi Modeli (yarı saydam ahşap çubuklar ve direkler)
  public static createScaffoldModel(w: number, h: number, height: number): THREE.Group {
    const scaffold = new THREE.Group();
    scaffold.name = 'scaffold_group';

    const scaffoldMat = new THREE.MeshBasicMaterial({
      color: 0xb45309,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const hw = (w - 0.4) / 2;
    const hh = (h - 0.4) / 2;

    // 4 Köşe dikmesi
    const postGeom = new THREE.CylinderGeometry(0.06, 0.06, height, 4);
    const cornerCoords = [
      [-hw, -hh],
      [hw, -hh],
      [-hw, hh],
      [hw, hh],
    ];
    for (const [cx, cz] of cornerCoords) {
      const post = new THREE.Mesh(postGeom, scaffoldMat);
      post.position.set(cx, height / 2, cz);
      scaffold.add(post);
    }

    // Yatay kuşaklar (2 seviye)
    const levels = [height * 0.4, height * 0.8];
    const beamXGeom = new THREE.BoxGeometry(w - 0.4, 0.08, 0.08);
    const beamZGeom = new THREE.BoxGeometry(0.08, 0.08, h - 0.4);

    for (const lvl of levels) {
      const bNorth = new THREE.Mesh(beamXGeom, scaffoldMat);
      bNorth.position.set(0, lvl, -hh);
      const bSouth = new THREE.Mesh(beamXGeom, scaffoldMat);
      bSouth.position.set(0, lvl, hh);
      const bWest = new THREE.Mesh(beamZGeom, scaffoldMat);
      bWest.position.set(-hw, lvl, 0);
      const bEast = new THREE.Mesh(beamZGeom, scaffoldMat);
      bEast.position.set(hw, lvl, 0);
      scaffold.add(bNorth, bSouth, bWest, bEast);
    }

    // Çapraz payanda çubuğu
    const diagLen = Math.hypot(w - 0.4, height);
    const diagGeom = new THREE.CylinderGeometry(0.04, 0.04, diagLen, 4);
    const diag = new THREE.Mesh(diagGeom, scaffoldMat);
    diag.position.set(0, height / 2, hh);
    diag.rotation.z = Math.atan2(w - 0.4, height);
    scaffold.add(diag);

    return scaffold;
  }

  // D3: Yıkım Enkazı Modeli (taş ve kırık tahta parçaları)
  public static createRubbleModel(w: number, h: number): THREE.Group {
    const rubble = new THREE.Group();
    rubble.name = 'rubble_group';

    const stoneMat = new THREE.MeshLambertMaterial({
      color: PALETTE.stoneDark,
      transparent: true,
      opacity: 0.95,
      flatShading: true,
    });
    const woodMat = new THREE.MeshLambertMaterial({
      color: PALETTE.woodDark,
      transparent: true,
      opacity: 0.95,
      flatShading: true,
    });

    const hw = (w - 0.8) / 2;
    const hh = (h - 0.8) / 2;

    // Birkaç taş bloğu ve kırık tahta
    const pieces = [
      { geom: new THREE.BoxGeometry(0.6, 0.25, 0.5), mat: stoneMat, x: -hw * 0.5, z: -hh * 0.4, ry: 0.3 },
      { geom: new THREE.BoxGeometry(0.7, 0.22, 0.4), mat: stoneMat, x: hw * 0.4, z: hh * 0.5, ry: -0.4 },
      { geom: new THREE.BoxGeometry(0.45, 0.3, 0.45), mat: stoneMat, x: 0.2, z: -0.2, ry: 0.6 },
      { geom: new THREE.BoxGeometry(0.18, 0.12, 1.2), mat: woodMat, x: -hw * 0.2, z: hh * 0.2, ry: 0.8 },
      { geom: new THREE.BoxGeometry(0.16, 0.1, 0.9), mat: woodMat, x: hw * 0.5, z: -hh * 0.3, ry: -0.7 },
      { geom: new THREE.DodecahedronGeometry(0.22), mat: stoneMat, x: -0.4, z: -hh * 0.6, ry: 0 },
    ];

    for (const p of pieces) {
      const mesh = new THREE.Mesh(p.geom, p.mat);
      mesh.position.set(p.x, 0.15, p.z);
      mesh.rotation.y = p.ry;
      rubble.add(mesh);
    }

    return rubble;
  }

  // Ortak üretici fonksiyon (R5 BuildPreview ve BuildingManager tarafından çağrılır)
  public static createBuildingVisualModel(
    defId: BuildingId,
    overrideMaterial?: THREE.Material,
    teamColor: number = 0x2563eb
  ): THREE.Group {
    let group: THREE.Group;

    switch (defId) {
      case 'hq':
        group = this.createHqModel(overrideMaterial, teamColor);
        break;
      case 'okcular_ocagi':
        group = this.createArcheryRangeModel(overrideMaterial, teamColor);
        break;
      case 'yenicheri_ocagi':
        group = this.createJanissaryBarracksModel(overrideMaterial, teamColor);
        break;
      case 'suvari_ocagi':
        group = this.createCavalryStableModel(overrideMaterial, teamColor);
        break;
      case 'tophane':
        group = this.createFoundryModel(overrideMaterial, teamColor);
        break;
      case 'fil_ocagi':
        group = this.createElephantPenModel(overrideMaterial, teamColor);
        break;
      case 'tersane':
        group = this.createShipyardModel(overrideMaterial, teamColor);
        break;
      case 'hisar':
        group = this.createCastleModel(overrideMaterial, teamColor);
        break;
      case 'mancinik_i_azam':
        group = this.createTrebuchetModel(overrideMaterial, teamColor);
        break;
      default:
        group = this.createJanissaryBarracksModel(overrideMaterial, teamColor);
        break;
    }

    // Hayalet veya özel materyal geçildiyse frustumCulled kapat
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.frustumCulled = false;
        if (overrideMaterial) {
          child.material = overrideMaterial;
        }
      }
    });

    return group;
  }
}
