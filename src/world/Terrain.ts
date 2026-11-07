import * as THREE from 'three';
import { TerrainLook } from '../types';
import { GameMap } from './MapConfig';

export class Terrain {
  private group: THREE.Group;
  private instancedMeshes: THREE.InstancedMesh[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(private map: GameMap) {
    this.group = new THREE.Group();
    this.buildTerrain();
  }

  private buildTerrain(): void {
    // Kareleri görünümlerine göre grupla
    const lookPositions: Map<TerrainLook, THREE.Vector3[]> = new Map();

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const look = this.map.looks[y * this.map.width + x];
        if (!lookPositions.has(look)) {
          lookPositions.set(look, []);
        }
        // Dünya koordinatları: 1 kare = 1 birim, merkezleme için +0.5
        lookPositions.get(look)!.push(new THREE.Vector3(x + 0.5, 0, y + 0.5));
      }
    }

    // Her TerrainLook için tek bir InstancedMesh oluştur (SPEC S5)
    for (const [look, positions] of lookPositions.entries()) {
      const { geometry, material, yOffset } = this.createLookAssets(look);
      this.geometries.push(geometry);
      this.materials.push(material);

      const instancedMesh = new THREE.InstancedMesh(
        geometry,
        material,
        positions.length
      );
      instancedMesh.castShadow = false;
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

  // SPEC S5: Her TerrainLook farklı renk ve şekilde oluşturulur
  private createLookAssets(look: TerrainLook): {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    yOffset: number;
  } {
    switch (look) {
      case 'grass':
        // Düz yeşil kare
        return {
          geometry: new THREE.BoxGeometry(1, 0.1, 1),
          material: new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
          yOffset: 0.05,
        };

      case 'forest':
        // Ağaç (koni ve gövde silindiri birleşimi) - S2: işçilerden alçak/hafif küçük
        const trunkGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.25, 5);
        trunkGeo.translate(0, 0.125, 0);
        const foliageGeo = new THREE.ConeGeometry(0.32, 0.65, 5);
        foliageGeo.translate(0, 0.55, 0);

        // İki parçayı birleştir
        const forestGeo = this.mergeGeometries([trunkGeo, foliageGeo]);
        return {
          geometry: forestGeo,
          material: new THREE.MeshLambertMaterial({ color: 0x1b5e20 }),
          yOffset: 0,
        };

      case 'river':
        // Alçak mavi kare
        return {
          geometry: new THREE.BoxGeometry(1, 0.04, 1),
          material: new THREE.MeshLambertMaterial({ color: 0x0284c7 }),
          yOffset: 0.02,
        };

      case 'mountain':
        // Yüksek gri piramidal dağ konisi
        return {
          geometry: new THREE.ConeGeometry(0.58, 1.8, 4),
          material: new THREE.MeshLambertMaterial({ color: 0x475569 }),
          yOffset: 0.9,
        };

      case 'rock':
        // Gri kutu
        return {
          geometry: new THREE.BoxGeometry(0.85, 0.5, 0.85),
          material: new THREE.MeshLambertMaterial({ color: 0x64748b }),
          yOffset: 0.25,
        };

      case 'hill':
        // Alçak yeşil-kahve kutu
        return {
          geometry: new THREE.BoxGeometry(1, 0.45, 1),
          material: new THREE.MeshLambertMaterial({ color: 0x65a30d }),
          yOffset: 0.225,
        };

      case 'wall':
        // Yüksek bej kutu
        return {
          geometry: new THREE.BoxGeometry(1, 1.2, 1),
          material: new THREE.MeshLambertMaterial({ color: 0xd4b996 }),
          yOffset: 0.6,
        };

      case 'bridge':
        // Kahverengi kutu
        return {
          geometry: new THREE.BoxGeometry(1, 0.16, 1),
          material: new THREE.MeshLambertMaterial({ color: 0x854d0e }),
          yOffset: 0.08,
        };

      case 'ford':
        // Açık mavi alçak kare
        return {
          geometry: new THREE.BoxGeometry(1, 0.06, 1),
          material: new THREE.MeshLambertMaterial({ color: 0x38bdf8 }),
          yOffset: 0.03,
        };

      case 'gate':
        // İki direkli açık kapı çerçevesi
        const leftPost = new THREE.BoxGeometry(0.2, 1.2, 0.3);
        leftPost.translate(-0.35, 0.6, 0);
        const rightPost = new THREE.BoxGeometry(0.2, 1.2, 0.3);
        rightPost.translate(0.35, 0.6, 0);
        const topBeam = new THREE.BoxGeometry(0.9, 0.2, 0.3);
        topBeam.translate(0, 1.1, 0);
        const gateGeo = this.mergeGeometries([leftPost, rightPost, topBeam]);
        return {
          geometry: gateGeo,
          material: new THREE.MeshLambertMaterial({ color: 0x78350f }),
          yOffset: 0,
        };

      case 'field':
        // Sarımsı yeşil düz kare
        return {
          geometry: new THREE.BoxGeometry(1, 0.1, 1),
          material: new THREE.MeshLambertMaterial({ color: 0x84cc16 }),
          yOffset: 0.05,
        };

      default:
        return {
          geometry: new THREE.BoxGeometry(1, 0.1, 1),
          material: new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
          yOffset: 0.05,
        };
    }
  }

  // Basit geometri birleştirme
  private mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalVertices = 0;
    let totalNormals = 0;

    for (const g of geos) {
      totalVertices += g.attributes.position.array.length;
      if (g.attributes.normal) {
        totalNormals += g.attributes.normal.array.length;
      }
    }

    const posArray = new Float32Array(totalVertices);
    const normArray = new Float32Array(totalNormals);

    let posOffset = 0;
    let normOffset = 0;

    for (const g of geos) {
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

  public getGroup(): THREE.Group {
    return this.group;
  }

  public dispose(): void {
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
    this.group.clear();
  }
}
