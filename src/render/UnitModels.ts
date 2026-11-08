import * as THREE from 'three';
import { UnitId } from '../types';

/**
 * R11C: UnitModels.ts
 * Osmanlı esintili, özgün, stilize low-poly birim model geometrileri.
 * Her birim türü tek InstancedMesh'te çizilmek üzere köşe renkleriyle (vertex colors)
 * birleştirilmiş geometrilerden üretilir.
 */

export class UnitModels {
  // Model baş üstü toplam yükseklikleri (R4 ve UnitOverlay için)
  public static modelHeight(defId: UnitId): number {
    switch (defId) {
      case 'altin_madencisi':
      case 'oduncu':
        return 1.35;
      case 'tirendaz':
        return 1.30;
      case 'yenicheri':
        return 1.35;
      case 'deliler':
        return 1.60;
      case 'sahi':
        return 0.90;
      case 'zirhli_fil':
        return 1.80;
      case 'fetih_gemisi':
        return 1.90;
      default:
        return 1.35;
    }
  }

  // Model merkezinin zemine tam oturması için taban yüksekliği
  public static getUnitBaseHeight(defId: UnitId): number {
    switch (defId) {
      case 'altin_madencisi':
      case 'oduncu':
        return 0.675;
      case 'tirendaz':
        return 0.65;
      case 'yenicheri':
        return 0.675;
      case 'deliler':
        return 0.80;
      case 'sahi':
        return 0.45;
      case 'zirhli_fil':
        return 0.90;
      case 'fetih_gemisi':
        return 0.95;
      default:
        return 0.65;
    }
  }

  // Köşe rengi boyanmış geometri üretim yardımcıları
  private static setVertexColor(geo: THREE.BufferGeometry, colorHex: number): THREE.BufferGeometry {
    const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
    const count = nonIndexed.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color(colorHex);

    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return nonIndexed;
  }

  public static mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalPositions = 0;
    const nonIndexedList: THREE.BufferGeometry[] = [];

    for (const g of geos) {
      const nonIndexed = g.index ? g.toNonIndexed() : g;
      nonIndexedList.push(nonIndexed);
      totalPositions += nonIndexed.attributes.position.array.length;
    }

    const mergedPositions = new Float32Array(totalPositions);
    const mergedNormals = new Float32Array(totalPositions);
    const mergedColors = new Float32Array(totalPositions);

    let offset = 0;

    for (const g of nonIndexedList) {
      const pos = g.attributes.position.array;
      mergedPositions.set(pos, offset);

      if (g.attributes.normal) {
        mergedNormals.set(g.attributes.normal.array, offset);
      }
      if (g.attributes.color) {
        mergedColors.set(g.attributes.color.array, offset);
      } else {
        // Renk yoksa varsayılan açık gri
        for (let i = 0; i < pos.length; i++) {
          mergedColors[offset + i] = 0.85;
        }
      }
      offset += pos.length;
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(mergedColors, 3));
    return merged;
  }

  // M1: Altın Madencisi - Yuvarlak başlık/miğfer, sırtında çuval, elinde kazma, takım yeleği (~132 üçgen)
  private static createMinerGeometry(teamColor: number): THREE.BufferGeometry {
    // Takım yeleği (gövde)
    const body = new THREE.BoxGeometry(0.48, 0.50, 0.38);
    body.translate(0, 0, 0);
    const bodyColored = this.setVertexColor(body, teamColor);

    // Koyu pantolon ve bacaklar
    const legs = new THREE.BoxGeometry(0.42, 0.40, 0.32);
    legs.translate(0, -0.42, 0);
    const legsColored = this.setVertexColor(legs, 0x334155);

    // Baş ve yuvarlak madenci miğferi (metal/bronz)
    const head = new THREE.SphereGeometry(0.19, 6, 5);
    head.translate(0, 0.38, 0);
    const headColored = this.setVertexColor(head, 0xd4af37);

    // Sırtında çuval (parşömen/keten kahvesi, asimetrik arka yön)
    const sack = new THREE.BoxGeometry(0.36, 0.42, 0.24);
    sack.translate(0, 0.05, -0.28);
    const sackColored = this.setVertexColor(sack, 0xb45309);

    // Elinde kazma (tahta sap ve demir kazma ucu, asimetrik ön sağ yön)
    const pickHandle = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 4);
    pickHandle.rotateZ(Math.PI / 4);
    pickHandle.translate(0.30, -0.05, 0.22);
    const handleColored = this.setVertexColor(pickHandle, 0x78350f);

    const pickBlade = new THREE.BoxGeometry(0.20, 0.04, 0.04);
    pickBlade.rotateZ(Math.PI / 4 + Math.PI / 2);
    pickBlade.translate(0.44, 0.12, 0.22);
    const bladeColored = this.setVertexColor(pickBlade, 0x94a3b8);

    return this.mergeBufferGeometries([bodyColored, legsColored, headColored, sackColored, handleColored, bladeColored]);
  }

  // M2: Oduncu - Sarık/başlık, kısa pelerin yelek, elinde balta, belinde ip (~136 üçgen)
  private static createLumberjackGeometry(teamColor: number): THREE.BufferGeometry {
    // Takım yeleği / pelerin
    const body = new THREE.BoxGeometry(0.50, 0.52, 0.40);
    body.translate(0, 0, 0);
    const bodyColored = this.setVertexColor(body, teamColor);

    // Bacaklar ve çizmeler
    const legs = new THREE.BoxGeometry(0.44, 0.40, 0.34);
    legs.translate(0, -0.42, 0);
    const legsColored = this.setVertexColor(legs, 0x451a03);

    // Baş ve sarık (beyaz kumaş)
    const head = new THREE.CylinderGeometry(0.18, 0.16, 0.24, 6);
    head.translate(0, 0.38, 0);
    const headColored = this.setVertexColor(head, 0xf8fafc);

    // Belinde ip (halat sarısı)
    const rope = new THREE.BoxGeometry(0.54, 0.08, 0.44);
    rope.translate(0, -0.16, 0);
    const ropeColored = this.setVertexColor(rope, 0xd97706);

    // Elinde balta (asimetrik ön sol yön)
    const axeHandle = new THREE.CylinderGeometry(0.02, 0.02, 0.60, 4);
    axeHandle.rotateZ(-Math.PI / 4);
    axeHandle.translate(-0.30, -0.05, 0.22);
    const handleColored = this.setVertexColor(axeHandle, 0x78350f);

    const axeHead = new THREE.BoxGeometry(0.18, 0.14, 0.03);
    axeHead.translate(-0.44, 0.10, 0.22);
    const headAxeColored = this.setVertexColor(axeHead, 0x94a3b8);

    return this.mergeBufferGeometries([bodyColored, legsColored, headColored, ropeColored, handleColored, headAxeColored]);
  }

  // M3: Tirendaz (Okçu) - İnce narin gövde, sarık, sırtında ok kılıfı, elinde kavisli yay (~132 üçgen)
  private static createArcherGeometry(teamColor: number): THREE.BufferGeometry {
    // İnce uzun kaftan (takım rengi)
    const body = new THREE.BoxGeometry(0.40, 0.56, 0.32);
    body.translate(0, 0, 0);
    const bodyColored = this.setVertexColor(body, teamColor);

    // Bacaklar
    const legs = new THREE.BoxGeometry(0.36, 0.40, 0.28);
    legs.translate(0, -0.44, 0);
    const legsColored = this.setVertexColor(legs, 0x1e293b);

    // Baş ve sarık (sarık ucu takım rengi)
    const head = new THREE.SphereGeometry(0.16, 5, 5);
    head.translate(0, 0.40, 0);
    const headColored = this.setVertexColor(head, 0xf8fafc);

    const turbanTip = new THREE.ConeGeometry(0.08, 0.16, 4);
    turbanTip.translate(0, 0.54, 0.04);
    const tipColored = this.setVertexColor(turbanTip, teamColor);

    // Sırtında ok kılıfı (ok sadakı, asimetrik arka yön)
    const quiver = new THREE.CylinderGeometry(0.08, 0.06, 0.45, 4);
    quiver.rotateX(0.2);
    quiver.translate(-0.16, 0.10, -0.20);
    const quiverColored = this.setVertexColor(quiver, 0x92400e);

    // Elinde kavisli yay (asimetrik ön yön)
    const bow = new THREE.TorusGeometry(0.22, 0.02, 3, 8, Math.PI);
    bow.rotateY(-Math.PI / 2);
    bow.translate(0.28, 0.05, 0.22);
    const bowColored = this.setVertexColor(bow, 0x78350f);

    return this.mergeBufferGeometries([bodyColored, legsColored, headColored, tipColored, quiverColored, bowColored]);
  }

  // M4: Yeniçeri (Piyade) - Beyaz börk, geniş omuzlu kaftan, yuvarlak kalkan ve kılıç (~140 üçgen)
  private static createJanissaryGeometry(teamColor: number): THREE.BufferGeometry {
    // Geniş omuzlu kaftan (takım rengi)
    const body = new THREE.BoxGeometry(0.56, 0.54, 0.42);
    body.translate(0, 0, 0);
    const bodyColored = this.setVertexColor(body, teamColor);

    // Bacaklar ve çizmeler
    const legs = new THREE.BoxGeometry(0.48, 0.38, 0.36);
    legs.translate(0, -0.42, 0);
    const legsColored = this.setVertexColor(legs, 0x0f172a);

    // Baş
    const head = new THREE.SphereGeometry(0.18, 5, 5);
    head.translate(0, 0.38, 0);
    const headColored = this.setVertexColor(head, 0xfde68a);

    // Uzun beyaz börk ve arkaya sarkan kumaş kanadı (asimetrik arka yön)
    const borkCap = new THREE.CylinderGeometry(0.16, 0.20, 0.28, 5);
    borkCap.translate(0, 0.55, 0);
    const borkColored = this.setVertexColor(borkCap, 0xf8fafc);

    const borkFlap = new THREE.BoxGeometry(0.14, 0.35, 0.04);
    borkFlap.rotateX(-0.25);
    borkFlap.translate(0, 0.42, -0.20);
    const flapColored = this.setVertexColor(borkFlap, 0xf8fafc);

    // Sol elde yuvarlak kalkan (bronz/demir)
    const shield = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 8);
    shield.rotateZ(Math.PI / 2);
    shield.translate(-0.36, 0.05, 0.15);
    const shieldColored = this.setVertexColor(shield, 0xd97706);

    // Sağ elde kılıç (kavisli pala/yatağan)
    const sword = new THREE.BoxGeometry(0.04, 0.48, 0.06);
    sword.rotateX(Math.PI / 4);
    sword.translate(0.35, 0.05, 0.22);
    const swordColored = this.setVertexColor(sword, 0xe2e8f0);

    return this.mergeBufferGeometries([bodyColored, legsColored, headColored, borkColored, flapColored, shieldColored, swordColored]);
  }

  // M5: Deliler (Süvari) - At, tüylü binici, takım rengi at örtüsü ve mızrak flaması (~158 üçgen)
  private static createDelilerGeometry(teamColor: number): THREE.BufferGeometry {
    // At gövdesi (kahverengi yatay uzun)
    const horseBody = new THREE.BoxGeometry(0.50, 0.48, 0.95);
    horseBody.translate(0, 0, 0);
    const bodyColored = this.setVertexColor(horseBody, 0x5c3a21);

    // At boyun ve kafa (asimetrik ön yön)
    const horseNeck = new THREE.BoxGeometry(0.28, 0.45, 0.35);
    horseNeck.rotateX(-0.35);
    horseNeck.translate(0, 0.28, 0.48);
    const neckColored = this.setVertexColor(horseNeck, 0x5c3a21);

    const horseHead = new THREE.BoxGeometry(0.24, 0.22, 0.32);
    horseHead.translate(0, 0.45, 0.62);
    const headColored = this.setVertexColor(horseHead, 0x3d2314);

    // At bacakları (4 ayak)
    const legFL = new THREE.BoxGeometry(0.12, 0.50, 0.12);
    legFL.translate(-0.18, -0.45, 0.35);
    const legFR = new THREE.BoxGeometry(0.12, 0.50, 0.12);
    legFR.translate(0.18, -0.45, 0.35);
    const legBL = new THREE.BoxGeometry(0.12, 0.50, 0.12);
    legBL.translate(-0.18, -0.45, -0.35);
    const legBR = new THREE.BoxGeometry(0.12, 0.50, 0.12);
    legBR.translate(0.18, -0.45, -0.35);
    const legsColored = this.setVertexColor(this.mergeBufferGeometries([legFL, legFR, legBL, legBR]), 0x271406);

    // Takım rengi at örtüsü (eyer altı geniş bez)
    const saddleCloth = new THREE.BoxGeometry(0.54, 0.36, 0.52);
    saddleCloth.translate(0, 0.05, 0);
    const clothColored = this.setVertexColor(saddleCloth, teamColor);

    // Binici gövdesi ve tüylü başlık
    const rider = new THREE.BoxGeometry(0.40, 0.42, 0.32);
    rider.translate(0, 0.45, 0);
    const riderColored = this.setVertexColor(rider, 0x1e293b);

    const riderHead = new THREE.SphereGeometry(0.16, 5, 4);
    riderHead.translate(0, 0.72, 0);
    const rHeadColored = this.setVertexColor(riderHead, 0xd97706);

    // Uzun mızrak ve takım flama ucu (asimetrik ileri yön)
    const lance = new THREE.CylinderGeometry(0.02, 0.02, 1.40, 4);
    lance.rotateX(Math.PI / 2.8);
    lance.translate(0.28, 0.45, 0.45);
    const lanceColored = this.setVertexColor(lance, 0x78350f);

    const pennant = new THREE.BoxGeometry(0.02, 0.16, 0.32);
    pennant.translate(0.28, 0.75, 0.95);
    const pennantColored = this.setVertexColor(pennant, teamColor);

    return this.mergeBufferGeometries([bodyColored, neckColored, headColored, legsColored, clothColored, riderColored, rHeadColored, lanceColored, pennantColored]);
  }

  // M6: Şahi (Hareketli Topçu) - İki büyük tekerlek, ahşap lafet, bronz namlu, barut fıçısı ve takım flaması (~100 üçgen)
  private static createSahiGeometry(teamColor: number): THREE.BufferGeometry {
    // Ahşap lafet şasisi
    const carriage = new THREE.BoxGeometry(0.70, 0.28, 0.95);
    carriage.translate(0, 0, 0);
    const carriageColored = this.setVertexColor(carriage, 0x78350f);

    // İki büyük yan tekerlek
    const wheelL = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 8);
    wheelL.rotateZ(Math.PI / 2);
    wheelL.translate(-0.44, -0.05, 0.10);

    const wheelR = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 8);
    wheelR.rotateZ(Math.PI / 2);
    wheelR.translate(0.44, -0.05, 0.10);
    const wheelsColored = this.setVertexColor(this.mergeBufferGeometries([wheelL, wheelR]), 0x451a03);

    // Uzun bronz top namlusu (asimetrik ileri yönelmiş)
    const barrel = new THREE.CylinderGeometry(0.18, 0.26, 1.35, 7);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(0, 0.22, 0.15);
    const barrelColored = this.setVertexColor(barrel, 0xb45309);

    // Yanında barut fıçısı
    const barrelKeg = new THREE.CylinderGeometry(0.14, 0.14, 0.30, 6);
    barrelKeg.translate(0.25, 0.05, -0.32);
    const kegColored = this.setVertexColor(barrelKeg, 0x1c1917);

    // Takım flaması / bezi
    const cloth = new THREE.BoxGeometry(0.72, 0.12, 0.35);
    cloth.translate(0, 0.12, -0.25);
    const clothColored = this.setVertexColor(cloth, teamColor);

    return this.mergeBufferGeometries([carriageColored, wheelsColored, barrelColored, kegColored, clothColored]);
  }

  // M7: Zırhlı Fil - İri gövde, kalın bacaklar, hortum, fildişleri, takım örtüsü ve kule (~168 üçgen)
  private static createWarElephantGeometry(teamColor: number): THREE.BufferGeometry {
    // İri fil gövdesi (gri)
    const body = new THREE.BoxGeometry(1.05, 0.95, 1.40);
    body.translate(0, 0, 0);
    const bodyColored = this.setVertexColor(body, 0x64748b);

    // Fil kafası ve uzun hortumu (asimetrik ön yön)
    const head = new THREE.BoxGeometry(0.68, 0.60, 0.55);
    head.translate(0, 0.25, 0.85);

    const trunk = new THREE.CylinderGeometry(0.10, 0.14, 0.70, 5);
    trunk.rotateX(0.25);
    trunk.translate(0, -0.15, 1.15);
    const headColored = this.setVertexColor(this.mergeBufferGeometries([head, trunk]), 0x475569);

    // İki fildişi
    const tuskL = new THREE.ConeGeometry(0.05, 0.40, 4);
    tuskL.rotateX(Math.PI / 3);
    tuskL.translate(-0.25, 0.05, 1.10);

    const tuskR = new THREE.ConeGeometry(0.05, 0.40, 4);
    tuskR.rotateX(Math.PI / 3);
    tuskR.translate(0.25, 0.05, 1.10);
    const tusksColored = this.setVertexColor(this.mergeBufferGeometries([tuskL, tuskR]), 0xfef08a);

    // 4 Kalın bacak
    const legFL = new THREE.CylinderGeometry(0.16, 0.18, 0.70, 5);
    legFL.translate(-0.40, -0.65, 0.50);
    const legFR = new THREE.CylinderGeometry(0.16, 0.18, 0.70, 5);
    legFR.translate(0.40, -0.65, 0.50);
    const legBL = new THREE.CylinderGeometry(0.16, 0.18, 0.70, 5);
    legBL.translate(-0.40, -0.65, -0.50);
    const legBR = new THREE.CylinderGeometry(0.16, 0.18, 0.70, 5);
    legBR.translate(0.40, -0.65, -0.50);
    const legsColored = this.setVertexColor(this.mergeBufferGeometries([legFL, legFR, legBL, legBR]), 0x334155);

    // Takım örtüsü (kilimli geniş eyer örtüsü)
    const rug = new THREE.BoxGeometry(1.10, 0.55, 0.90);
    rug.translate(0, 0.18, 0);
    const rugColored = this.setVertexColor(rug, teamColor);

    // Sırt kulesi (küçük tahta hisar/howdah)
    const tower = new THREE.BoxGeometry(0.80, 0.35, 0.75);
    tower.translate(0, 0.65, 0);
    const towerColored = this.setVertexColor(tower, 0x854d0e);

    return this.mergeBufferGeometries([bodyColored, headColored, tusksColored, legsColored, rugColored, towerColored]);
  }

  // M8: Fetih Gemisi - Karada ilerleyen ahşap gemi gövdesi, tekerlekler, direk, takım yelkeni ve yan toplar (~140 üçgen)
  private static createConquestShipGeometry(teamColor: number): THREE.BufferGeometry {
    // Ahşap gemi teknesi (uzun kavisli burun)
    const hull = new THREE.BoxGeometry(0.85, 0.55, 1.85);
    hull.translate(0, 0, 0);
    const hullColored = this.setVertexColor(hull, 0x78350f);

    // Gemi burnu (pruva, asimetrik ön yön)
    const bow = new THREE.ConeGeometry(0.45, 0.65, 4);
    bow.rotateX(Math.PI / 2);
    bow.translate(0, 0.05, 1.15);
    const bowColored = this.setVertexColor(bow, 0x5c3a21);

    // Karada yürüten 4 kızak / dev tekerlek
    const w1 = new THREE.CylinderGeometry(0.20, 0.20, 0.12, 6);
    w1.rotateZ(Math.PI / 2);
    w1.translate(-0.48, -0.32, 0.60);
    const w2 = new THREE.CylinderGeometry(0.20, 0.20, 0.12, 6);
    w2.rotateZ(Math.PI / 2);
    w2.translate(0.48, -0.32, 0.60);
    const w3 = new THREE.CylinderGeometry(0.20, 0.20, 0.12, 6);
    w3.rotateZ(Math.PI / 2);
    w3.translate(-0.48, -0.32, -0.60);
    const w4 = new THREE.CylinderGeometry(0.20, 0.20, 0.12, 6);
    w4.rotateZ(Math.PI / 2);
    w4.translate(0.48, -0.32, -0.60);
    const wheelsColored = this.setVertexColor(this.mergeBufferGeometries([w1, w2, w3, w4]), 0x292524);

    // Ana direk
    const mast = new THREE.CylinderGeometry(0.04, 0.06, 1.45, 5);
    mast.translate(0, 0.90, 0);
    const mastColored = this.setVertexColor(mast, 0x451a03);

    // Takım yelkeni (şişkin takım rengi yelken)
    const sail = new THREE.BoxGeometry(0.95, 0.70, 0.08);
    sail.translate(0, 0.95, 0.08);
    const sailColored = this.setVertexColor(sail, teamColor);

    // Yan top lüleleri (her iki yanda ikişer adet)
    const cannonL1 = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 4);
    cannonL1.rotateZ(Math.PI / 2);
    cannonL1.translate(-0.48, 0.10, 0.25);
    const cannonL2 = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 4);
    cannonL2.rotateZ(Math.PI / 2);
    cannonL2.translate(-0.48, 0.10, -0.25);
    const cannonR1 = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 4);
    cannonR1.rotateZ(Math.PI / 2);
    cannonR1.translate(0.48, 0.10, 0.25);
    const cannonR2 = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 4);
    cannonR2.rotateZ(Math.PI / 2);
    cannonR2.translate(0.48, 0.10, -0.25);
    const cannonsColored = this.setVertexColor(this.mergeBufferGeometries([cannonL1, cannonL2, cannonR1, cannonR2]), 0x1c1917);

    return this.mergeBufferGeometries([hullColored, bowColored, wheelsColored, mastColored, sailColored, cannonsColored]);
  }

  // Ortak üretici fonksiyon
  public static createUnitGeometry(defId: UnitId, teamColor: number): THREE.BufferGeometry {
    switch (defId) {
      case 'altin_madencisi':
        return this.createMinerGeometry(teamColor);
      case 'oduncu':
        return this.createLumberjackGeometry(teamColor);
      case 'tirendaz':
        return this.createArcherGeometry(teamColor);
      case 'yenicheri':
        return this.createJanissaryGeometry(teamColor);
      case 'deliler':
        return this.createDelilerGeometry(teamColor);
      case 'sahi':
        return this.createSahiGeometry(teamColor);
      case 'zirhli_fil':
        return this.createWarElephantGeometry(teamColor);
      case 'fetih_gemisi':
        return this.createConquestShipGeometry(teamColor);
      default:
        return this.createJanissaryGeometry(teamColor);
    }
  }
}
