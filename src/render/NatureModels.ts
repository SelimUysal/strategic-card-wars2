import * as THREE from 'three';
import { PALETTE } from './Palette';

/**
 * R11B: NatureModels.ts
 * Stilize low-poly zemin, doğa dekorları ve kaynak noktası model geometrileri.
 * Tüm modeller G1-G7 kurallarına uygun olarak sade geometrilerden (kutu, silindir, koni, ikosahedron) üretilir.
 */

export class NatureModels {
  // Geometri birleştirme yardımcısı
  public static mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const preparedGeos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    let totalVertices = 0;
    let totalNormals = 0;

    for (const g of preparedGeos) {
      totalVertices += g.attributes.position.array.length;
      if (g.attributes.normal) {
        totalNormals += g.attributes.normal.array.length;
      }
    }

    const posArray = new Float32Array(totalVertices);
    const normArray = new Float32Array(totalNormals);

    let posOffset = 0;
    let normOffset = 0;

    for (const g of preparedGeos) {
      const pos = g.attributes.position.array;
      posArray.set(pos, posOffset);
      posOffset += pos.length;

      if (g.attributes.normal) {
        const norm = g.attributes.normal.array;
        normArray.set(norm, normOffset);
        normOffset += norm.length;
      }
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    if (totalNormals > 0) {
      merged.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
    }
    return merged;
  }

  // S3: Çam Ağacı (Pine) - Üst üste 3 koni ve ince silindir gövde (~44 üçgen, <60)
  public static createPineGeometry(): THREE.BufferGeometry {
    const trunk = new THREE.CylinderGeometry(0.06, 0.08, 0.35, 5);
    trunk.translate(0, 0.175, 0);

    const cone1 = new THREE.ConeGeometry(0.36, 0.45, 5);
    cone1.translate(0, 0.45, 0);

    const cone2 = new THREE.ConeGeometry(0.28, 0.40, 5);
    cone2.translate(0, 0.72, 0);

    const cone3 = new THREE.ConeGeometry(0.20, 0.35, 5);
    cone3.translate(0, 0.98, 0);

    return this.mergeGeometries([trunk, cone1, cone2, cone3]);
  }

  // S3: Meşe Ağacı (Oak) - İkosahedron taç ve kalın gövde (~30 üçgen, <60)
  public static createOakGeometry(): THREE.BufferGeometry {
    const trunk = new THREE.CylinderGeometry(0.10, 0.13, 0.45, 5);
    trunk.translate(0, 0.225, 0);

    const crown = new THREE.IcosahedronGeometry(0.40, 0);
    crown.scale(1.1, 0.95, 1.05);
    crown.translate(0, 0.75, 0);

    return this.mergeGeometries([trunk, crown]);
  }

  // S3: Selvi Ağacı (Cypress) - Uzun ince koni ve kısa gövde (~22 üçgen, <60)
  public static createCypressGeometry(): THREE.BufferGeometry {
    const trunk = new THREE.CylinderGeometry(0.06, 0.08, 0.25, 5);
    trunk.translate(0, 0.125, 0);

    const foliage = new THREE.ConeGeometry(0.22, 1.15, 5);
    foliage.translate(0, 0.75, 0);

    return this.mergeGeometries([trunk, foliage]);
  }

  // S4: Dağ (Mountain) - İkosahedron'dan tohumlu bozulmuş ve tepesi karlı kayalık kütle (~80 üçgen, <120)
  public static createMountainGeometry(seed: number = 42): THREE.BufferGeometry {
    const geo = new THREE.IcosahedronGeometry(0.72, 1);
    const nonIndexed = geo.toNonIndexed();
    geo.dispose();

    const pos = nonIndexed.attributes.position;
    const vertexCount = pos.count;
    const colors = new Float32Array(vertexCount * 3);

    const rockColor = new THREE.Color(PALETTE.rockDark);
    const snowColor = new THREE.Color(PALETTE.rockSnow);
    const tempColor = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Tabanı düzleştir ve tepeyi yukarı sivrilt
      if (y < -0.1) {
        y = -0.1;
      } else {
        y = y * 1.55 + 0.35;
      }

      // Tohumlu gürültü ile yüzeyleri boz
      const noise = Math.sin(x * 5.2 + z * 4.8 + seed * 1.7) * 0.12;
      x += noise;
      z += noise * 0.8;

      pos.setXYZ(i, x, y, z);

      // Yüksekliğe bağlı kar rengi geçişi (y > 0.95 tepe karı)
      const snowT = Math.max(0, Math.min(1, (y - 0.75) / 0.55));
      tempColor.copy(rockColor).lerp(snowColor, snowT);

      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }

    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    nonIndexed.computeVertexNormals();
    return nonIndexed;
  }

  // S5: Kayalık Kümeleri (Rock Cluster) - 3-4 bozuk kutu/kaya (~48 üçgen)
  public static createRockClusterGeometry(): THREE.BufferGeometry {
    const r1 = new THREE.BoxGeometry(0.55, 0.38, 0.48);
    r1.rotateY(Math.PI / 6);
    r1.rotateX(0.1);
    r1.translate(0, 0.19, 0);

    const r2 = new THREE.BoxGeometry(0.35, 0.28, 0.32);
    r2.rotateY(-Math.PI / 4);
    r2.translate(0.24, 0.14, 0.18);

    const r3 = new THREE.BoxGeometry(0.28, 0.22, 0.30);
    r3.rotateZ(0.15);
    r3.translate(-0.25, 0.11, -0.15);

    return this.mergeGeometries([r1, r2, r3]);
  }

  // S5: Tepe (Hill) - Alçak, yarım küre biçimli yumuşak yeşil-kahve yükselti (~36 üçgen)
  public static createHillGeometry(): THREE.BufferGeometry {
    const geo = new THREE.SphereGeometry(0.68, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2.2);
    geo.scale(1.0, 0.48, 1.0);
    return geo;
  }

  // S6: Nehir Çift Ton ve Dalga Dokusu
  public static createRiverTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // İki tonlu su: merkez derin mavi, kenarlar sığ
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#38bdf8');   // Kıyı açık
    grad.addColorStop(0.25, '#0284c7'); // Derinleşme
    grad.addColorStop(0.5, '#0369a1');  // Orta derin
    grad.addColorStop(0.75, '#0284c7');
    grad.addColorStop(1, '#38bdf8');   // Karşı kıyı açık
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    // İnce stilize dalga çizgileri
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 18);
    ctx.quadraticCurveTo(16, 14, 28, 18);
    ctx.moveTo(36, 42);
    ctx.quadraticCurveTo(48, 46, 60, 42);
    ctx.stroke();

    // Kıyı köpük/kum noktaları
    ctx.fillStyle = 'rgba(254, 243, 199, 0.45)';
    ctx.fillRect(0, 0, 64, 3);
    ctx.fillRect(0, 61, 64, 3);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }

  // S7: Köprü (Bridge) - Ahşap tahta zemin, iki korkuluk ve destek kazıkları (~38 üçgen)
  public static createBridgeGeometry(): THREE.BufferGeometry {
    // Ahşap taban
    const deck = new THREE.BoxGeometry(1.0, 0.12, 0.88);
    deck.translate(0, 0.10, 0);

    // Korkuluklar
    const railNorth = new THREE.BoxGeometry(1.0, 0.18, 0.08);
    railNorth.translate(0, 0.22, -0.40);

    const railSouth = new THREE.BoxGeometry(1.0, 0.18, 0.08);
    railSouth.translate(0, 0.22, 0.40);

    // Destek kazıkları
    const post1 = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 4);
    post1.translate(-0.35, 0.02, -0.40);
    const post2 = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 4);
    post2.translate(0.35, 0.02, -0.40);
    const post3 = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 4);
    post3.translate(-0.35, 0.02, 0.40);
    const post4 = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 4);
    post4.translate(0.35, 0.02, 0.40);

    return this.mergeGeometries([deck, railNorth, railSouth, post1, post2, post3, post4]);
  }

  // S7: Sığ Geçit (Ford) - Sığ su ve basamak taşları (~28 üçgen)
  public static createFordGeometry(): THREE.BufferGeometry {
    const water = new THREE.BoxGeometry(1.0, 0.06, 1.0);
    water.translate(0, 0.03, 0);

    const step1 = new THREE.CylinderGeometry(0.14, 0.16, 0.08, 5);
    step1.translate(-0.25, 0.07, -0.20);

    const step2 = new THREE.CylinderGeometry(0.16, 0.18, 0.08, 5);
    step2.translate(0.10, 0.07, 0.0);

    const step3 = new THREE.CylinderGeometry(0.15, 0.17, 0.08, 5);
    step3.translate(-0.15, 0.07, 0.25);

    return this.mergeGeometries([water, step1, step2, step3]);
  }

  // S7: Kapı (Gate) - Taş kemer / iki kule açıklığı (~40 üçgen)
  public static createGateGeometry(): THREE.BufferGeometry {
    const postL = new THREE.BoxGeometry(0.24, 1.35, 0.35);
    postL.translate(-0.38, 0.675, 0);

    const postR = new THREE.BoxGeometry(0.24, 1.35, 0.35);
    postR.translate(0.38, 0.675, 0);

    const archTop = new THREE.BoxGeometry(1.0, 0.25, 0.40);
    archTop.translate(0, 1.25, 0);

    return this.mergeGeometries([postL, postR, archTop]);
  }

  // S8: Sur (Wall) - Taş blok ve mazgallar (~32 üçgen)
  public static createWallGeometry(): THREE.BufferGeometry {
    const baseWall = new THREE.BoxGeometry(1.0, 1.10, 0.60);
    baseWall.translate(0, 0.55, 0);

    // Üst kenar mazgal dişleri (crenellations)
    const tooth1 = new THREE.BoxGeometry(0.22, 0.20, 0.60);
    tooth1.translate(-0.35, 1.15, 0);

    const tooth2 = new THREE.BoxGeometry(0.22, 0.20, 0.60);
    tooth2.translate(0.35, 1.15, 0);

    return this.mergeGeometries([baseWall, tooth1, tooth2]);
  }

  // S8: Kale Kalıntıları (Ruins) - Yıkık duvar parçaları ve kırık kule (~36 üçgen)
  public static createRuinsGeometry(): THREE.BufferGeometry {
    const b1 = new THREE.BoxGeometry(0.70, 0.65, 0.45);
    b1.rotateY(0.2);
    b1.translate(-0.10, 0.325, 0);

    const b2 = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    b2.rotateZ(0.25);
    b2.translate(0.30, 0.175, 0.12);

    const col = new THREE.CylinderGeometry(0.18, 0.22, 0.75, 5);
    col.translate(-0.30, 0.375, -0.15);

    return this.mergeGeometries([b1, b2, col]);
  }

  // S9: Tarla Dokusu (Field) - Şerit şerit sarı/yeşil/toprak deseni
  public static createFieldTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#84cc16'; // Ekin yeşili
    ctx.fillRect(0, 0, 64, 64);

    // Çiftlik şeritleri
    ctx.fillStyle = '#eab308'; // Altın buğday şeritleri
    for (let y = 0; y < 64; y += 12) {
      ctx.fillRect(0, y, 64, 5);
    }

    ctx.fillStyle = '#78350f'; // Sürülmüş toprak çizgileri
    for (let y = 5; y < 64; y += 12) {
      ctx.fillRect(0, y, 64, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // S10: Altın Kaynağı Aktif Model - Koyu kaya, parlak altın külçeleri ve kazma (~50 üçgen, boy <1.35)
  public static createGoldNodeGeometry(): THREE.BufferGeometry {
    // Koyu ana kaya kütlesi
    const rock = new THREE.BoxGeometry(0.65, 0.40, 0.60);
    rock.rotateY(Math.PI / 5);
    rock.translate(0, 0.20, 0);

    // Altın külçeleri / damarları
    const nugget1 = new THREE.BoxGeometry(0.24, 0.18, 0.22);
    nugget1.rotateY(0.4);
    nugget1.translate(-0.12, 0.44, 0.08);

    const nugget2 = new THREE.BoxGeometry(0.20, 0.15, 0.18);
    nugget2.rotateY(-0.3);
    nugget2.translate(0.14, 0.42, -0.10);

    // Yanındaki kazma (küçük sap ve kafa)
    const handle = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4);
    handle.rotateZ(Math.PI / 3);
    handle.translate(0.28, 0.20, 0.22);

    const pickHead = new THREE.BoxGeometry(0.18, 0.04, 0.04);
    pickHead.rotateZ(Math.PI / 3 + Math.PI / 2);
    pickHead.translate(0.38, 0.35, 0.22);

    return this.mergeGeometries([rock, nugget1, nugget2, handle, pickHead]);
  }

  // S10: Altın Kaynağı Tükenmiş Kalıntı - Boş çukur ve çatlak kırık kaya (~32 üçgen)
  public static createDepletedGoldGeometry(): THREE.BufferGeometry {
    const rim1 = new THREE.BoxGeometry(0.55, 0.15, 0.18);
    rim1.translate(0, 0.075, -0.22);

    const rim2 = new THREE.BoxGeometry(0.55, 0.15, 0.18);
    rim2.translate(0, 0.075, 0.22);

    const sideR = new THREE.BoxGeometry(0.18, 0.15, 0.35);
    sideR.translate(0.24, 0.075, 0);

    const sideL = new THREE.BoxGeometry(0.18, 0.15, 0.35);
    sideL.translate(-0.24, 0.075, 0);

    return this.mergeGeometries([rim1, rim2, sideR, sideL]);
  }

  // S10: Odun Kaynağı Aktif Model - Kesilmiş kütük yığını ve yanında iki ağaç (~52 üçgen, boy <1.35)
  public static createWoodNodeGeometry(): THREE.BufferGeometry {
    // 3 yatay kesilmiş kütük yığını
    const log1 = new THREE.CylinderGeometry(0.11, 0.11, 0.65, 5);
    log1.rotateZ(Math.PI / 2);
    log1.translate(-0.10, 0.11, -0.12);

    const log2 = new THREE.CylinderGeometry(0.11, 0.11, 0.65, 5);
    log2.rotateZ(Math.PI / 2);
    log2.translate(-0.10, 0.11, 0.12);

    const log3 = new THREE.CylinderGeometry(0.10, 0.10, 0.62, 5);
    log3.rotateZ(Math.PI / 2);
    log3.translate(-0.10, 0.26, 0.0);

    // Yanındaki iki küçük ağaç (işçiden alçak, max 0.85)
    const trunk1 = new THREE.CylinderGeometry(0.06, 0.07, 0.35, 5);
    trunk1.translate(0.25, 0.175, 0.18);
    const crown1 = new THREE.ConeGeometry(0.25, 0.45, 5);
    crown1.translate(0.25, 0.52, 0.18);

    const trunk2 = new THREE.CylinderGeometry(0.05, 0.06, 0.28, 5);
    trunk2.translate(0.22, 0.14, -0.22);
    const crown2 = new THREE.ConeGeometry(0.22, 0.38, 5);
    crown2.translate(0.22, 0.44, -0.22);

    return this.mergeGeometries([log1, log2, log3, trunk1, crown1, trunk2, crown2]);
  }

  // S10: Odun Kaynağı Tükenmiş Kalıntı - Kesilmiş kütük tabanı (~24 üçgen)
  public static createDepletedWoodGeometry(): THREE.BufferGeometry {
    const stump1 = new THREE.CylinderGeometry(0.15, 0.18, 0.16, 5);
    stump1.translate(-0.12, 0.08, 0.08);

    const stump2 = new THREE.CylinderGeometry(0.13, 0.16, 0.14, 5);
    stump2.translate(0.18, 0.07, -0.12);

    return this.mergeGeometries([stump1, stump2]);
  }

  // S2: Ot / Çiçek Dekor Geometrisi (~16 üçgen)
  public static createDecorGeometry(type: 'grass' | 'flower' | 'pebble' | 'bush'): THREE.BufferGeometry {
    switch (type) {
      case 'grass': {
        const b1 = new THREE.BoxGeometry(0.03, 0.10, 0.20);
        b1.rotateY(0.4);
        b1.translate(0, 0.05, 0);
        const b2 = new THREE.BoxGeometry(0.03, 0.08, 0.18);
        b2.rotateY(-0.7);
        b2.translate(0.04, 0.04, 0.03);
        return this.mergeGeometries([b1, b2]);
      }
      case 'flower': {
        const stem = new THREE.CylinderGeometry(0.015, 0.015, 0.10, 4);
        stem.translate(0, 0.05, 0);
        const head = new THREE.BoxGeometry(0.06, 0.04, 0.06);
        head.translate(0, 0.11, 0);
        return this.mergeGeometries([stem, head]);
      }
      case 'pebble': {
        const p1 = new THREE.BoxGeometry(0.14, 0.07, 0.12);
        p1.rotateY(0.3);
        p1.translate(0, 0.035, 0);
        const p2 = new THREE.BoxGeometry(0.08, 0.05, 0.08);
        p2.translate(0.08, 0.025, 0.06);
        return this.mergeGeometries([p1, p2]);
      }
      case 'bush': {
        const bush = new THREE.IcosahedronGeometry(0.16, 0);
        bush.scale(1.2, 0.8, 1.1);
        bush.translate(0, 0.12, 0);
        return bush;
      }
    }
  }
}
