import { MapDef, MapId } from "../types";

export const MAPS: Record<MapId, MapDef> = {
  rumeli_ovasi: {
    id: "rumeli_ovasi",
    nameTr: "Rumeli Ovası",
    themeTr: "Geniş yeşil ovalar ve Balkan köyleri.",
    battleStyleTr: "Açık alan savaşı ve süvari hücumları.",
    width: 96,
    height: 64,
    playerStart: {"x":10,"y":29},
    enemyStart: {"x":80,"y":29},
    commonArea: {"x":33,"y":0,"w":30,"h":64},
    rects: [
      {
            "type": "forest",
            "look": "forest",
            "x": 4,
            "y": 14,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 4,
            "y": 40,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 80,
            "y": 14,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 80,
            "y": 40,
            "w": 12,
            "h": 10
      },
      {
            "type": "blocked",
            "look": "river",
            "x": 30,
            "y": 0,
            "w": 2,
            "h": 64
      },
      {
            "type": "passage",
            "look": "bridge",
            "x": 30,
            "y": 16,
            "w": 2,
            "h": 4
      },
      {
            "type": "passage",
            "look": "bridge",
            "x": 30,
            "y": 44,
            "w": 2,
            "h": 4
      },
      {
            "type": "blocked",
            "look": "river",
            "x": 64,
            "y": 0,
            "w": 2,
            "h": 64
      },
      {
            "type": "passage",
            "look": "bridge",
            "x": 64,
            "y": 20,
            "w": 2,
            "h": 4
      },
      {
            "type": "passage",
            "look": "ford",
            "x": 64,
            "y": 40,
            "w": 2,
            "h": 4
      },
      {
            "type": "blocked",
            "look": "hill",
            "x": 42,
            "y": 10,
            "w": 12,
            "h": 8
      },
      {
            "type": "blocked",
            "look": "hill",
            "x": 42,
            "y": 46,
            "w": 12,
            "h": 8
      }
],
    nodes: {
      "gold": {
            "player": [
                  {
                        "x": 20,
                        "y": 32
                  },
                  {
                        "x": 19,
                        "y": 35
                  },
                  {
                        "x": 18,
                        "y": 37
                  },
                  {
                        "x": 16,
                        "y": 38
                  },
                  {
                        "x": 13,
                        "y": 39
                  },
                  {
                        "x": 10,
                        "y": 38
                  },
                  {
                        "x": 8,
                        "y": 37
                  }
            ],
            "enemy": [
                  {
                        "x": 90,
                        "y": 32
                  },
                  {
                        "x": 89,
                        "y": 35
                  },
                  {
                        "x": 88,
                        "y": 37
                  },
                  {
                        "x": 86,
                        "y": 38
                  },
                  {
                        "x": 83,
                        "y": 39
                  },
                  {
                        "x": 80,
                        "y": 38
                  },
                  {
                        "x": 78,
                        "y": 37
                  }
            ]
      },
      "wood": {
            "player": [
                  {
                        "x": 4,
                        "y": 14
                  },
                  {
                        "x": 5,
                        "y": 14
                  },
                  {
                        "x": 6,
                        "y": 14
                  },
                  {
                        "x": 7,
                        "y": 14
                  },
                  {
                        "x": 8,
                        "y": 14
                  },
                  {
                        "x": 9,
                        "y": 14
                  },
                  {
                        "x": 10,
                        "y": 14
                  },
                  {
                        "x": 11,
                        "y": 14
                  }
            ],
            "enemy": [
                  {
                        "x": 80,
                        "y": 14
                  },
                  {
                        "x": 81,
                        "y": 14
                  },
                  {
                        "x": 82,
                        "y": 14
                  },
                  {
                        "x": 83,
                        "y": 14
                  },
                  {
                        "x": 84,
                        "y": 14
                  },
                  {
                        "x": 85,
                        "y": 14
                  },
                  {
                        "x": 86,
                        "y": 14
                  },
                  {
                        "x": 87,
                        "y": 14
                  }
            ]
      }
},
  },
  tuna_gecidi: {
    id: "tuna_gecidi",
    nameTr: "Tuna Geçidi",
    themeTr: "Büyük nehirler ve kaleler.",
    battleStyleTr: "Savunma ve kuşatma.",
    width: 80,
    height: 80,
    playerStart: {"x":37,"y":64},
    enemyStart: {"x":37,"y":10},
    commonArea: {"x":0,"y":28,"w":80,"h":24},
    rects: [
      {
            "type": "forest",
            "look": "forest",
            "x": 18,
            "y": 64,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 50,
            "y": 64,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 18,
            "y": 6,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 50,
            "y": 6,
            "w": 12,
            "h": 10
      },
      {
            "type": "blocked",
            "look": "river",
            "x": 0,
            "y": 35,
            "w": 80,
            "h": 10
      },
      {
            "type": "passage",
            "look": "bridge",
            "x": 22,
            "y": 35,
            "w": 4,
            "h": 10
      },
      {
            "type": "passage",
            "look": "bridge",
            "x": 54,
            "y": 35,
            "w": 4,
            "h": 10
      },
      {
            "type": "blocked",
            "look": "rock",
            "x": 8,
            "y": 30,
            "w": 8,
            "h": 4
      },
      {
            "type": "blocked",
            "look": "rock",
            "x": 64,
            "y": 30,
            "w": 8,
            "h": 4
      },
      {
            "type": "blocked",
            "look": "wall",
            "x": 16,
            "y": 24,
            "w": 12,
            "h": 2
      },
      {
            "type": "blocked",
            "look": "wall",
            "x": 50,
            "y": 54,
            "w": 12,
            "h": 2
      }
],
    nodes: {
      "gold": {
            "player": [
                  {
                        "x": 47,
                        "y": 67
                  },
                  {
                        "x": 46,
                        "y": 70
                  },
                  {
                        "x": 45,
                        "y": 72
                  },
                  {
                        "x": 43,
                        "y": 73
                  },
                  {
                        "x": 40,
                        "y": 74
                  },
                  {
                        "x": 37,
                        "y": 73
                  }
            ],
            "enemy": [
                  {
                        "x": 47,
                        "y": 13
                  },
                  {
                        "x": 46,
                        "y": 16
                  },
                  {
                        "x": 45,
                        "y": 18
                  },
                  {
                        "x": 43,
                        "y": 19
                  },
                  {
                        "x": 40,
                        "y": 20
                  },
                  {
                        "x": 37,
                        "y": 19
                  }
            ]
      },
      "wood": {
            "player": [
                  {
                        "x": 18,
                        "y": 64
                  },
                  {
                        "x": 19,
                        "y": 64
                  },
                  {
                        "x": 20,
                        "y": 64
                  },
                  {
                        "x": 21,
                        "y": 64
                  },
                  {
                        "x": 22,
                        "y": 64
                  },
                  {
                        "x": 23,
                        "y": 64
                  }
            ],
            "enemy": [
                  {
                        "x": 18,
                        "y": 6
                  },
                  {
                        "x": 19,
                        "y": 6
                  },
                  {
                        "x": 20,
                        "y": 6
                  },
                  {
                        "x": 21,
                        "y": 6
                  },
                  {
                        "x": 22,
                        "y": 6
                  },
                  {
                        "x": 23,
                        "y": 6
                  }
            ]
      }
},
  },
  karpat_daglari: {
    id: "karpat_daglari",
    nameTr: "Karpat Dağları",
    themeTr: "Dağlık ve ormanlık bölge.",
    battleStyleTr: "Dar geçit savunması.",
    width: 72,
    height: 88,
    playerStart: {"x":8,"y":68},
    enemyStart: {"x":58,"y":14},
    commonArea: {"x":24,"y":30,"w":24,"h":28},
    rects: [
      {
            "type": "forest",
            "look": "forest",
            "x": 2,
            "y": 58,
            "w": 12,
            "h": 8
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 18,
            "y": 72,
            "w": 12,
            "h": 8
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 58,
            "y": 22,
            "w": 12,
            "h": 8
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 42,
            "y": 6,
            "w": 12,
            "h": 8
      },
      {
            "type": "blocked",
            "look": "mountain",
            "x": 0,
            "y": 40,
            "w": 12,
            "h": 8
      },
      {
            "type": "blocked",
            "look": "mountain",
            "x": 16,
            "y": 40,
            "w": 18,
            "h": 8
      },
      {
            "type": "blocked",
            "look": "mountain",
            "x": 38,
            "y": 40,
            "w": 18,
            "h": 8
      },
      {
            "type": "blocked",
            "look": "mountain",
            "x": 60,
            "y": 40,
            "w": 12,
            "h": 8
      },
      {
            "type": "blocked",
            "look": "mountain",
            "x": 0,
            "y": 12,
            "w": 14,
            "h": 16
      },
      {
            "type": "blocked",
            "look": "mountain",
            "x": 58,
            "y": 60,
            "w": 14,
            "h": 16
      }
],
    nodes: {
      "gold": {
            "player": [
                  {
                        "x": 18,
                        "y": 71
                  },
                  {
                        "x": 17,
                        "y": 74
                  },
                  {
                        "x": 16,
                        "y": 76
                  },
                  {
                        "x": 14,
                        "y": 77
                  },
                  {
                        "x": 11,
                        "y": 78
                  },
                  {
                        "x": 8,
                        "y": 77
                  }
            ],
            "enemy": [
                  {
                        "x": 68,
                        "y": 17
                  },
                  {
                        "x": 67,
                        "y": 20
                  },
                  {
                        "x": 56,
                        "y": 22
                  },
                  {
                        "x": 55,
                        "y": 20
                  },
                  {
                        "x": 54,
                        "y": 17
                  },
                  {
                        "x": 55,
                        "y": 14
                  }
            ]
      },
      "wood": {
            "player": [
                  {
                        "x": 2,
                        "y": 58
                  },
                  {
                        "x": 3,
                        "y": 58
                  },
                  {
                        "x": 4,
                        "y": 58
                  },
                  {
                        "x": 5,
                        "y": 58
                  },
                  {
                        "x": 6,
                        "y": 58
                  },
                  {
                        "x": 7,
                        "y": 58
                  },
                  {
                        "x": 8,
                        "y": 58
                  },
                  {
                        "x": 9,
                        "y": 58
                  },
                  {
                        "x": 10,
                        "y": 58
                  }
            ],
            "enemy": [
                  {
                        "x": 58,
                        "y": 22
                  },
                  {
                        "x": 59,
                        "y": 22
                  },
                  {
                        "x": 60,
                        "y": 22
                  },
                  {
                        "x": 61,
                        "y": 22
                  },
                  {
                        "x": 62,
                        "y": 22
                  },
                  {
                        "x": 63,
                        "y": 22
                  },
                  {
                        "x": 64,
                        "y": 22
                  },
                  {
                        "x": 65,
                        "y": 22
                  },
                  {
                        "x": 66,
                        "y": 22
                  }
            ]
      }
},
  },
  viyana_ovasi: {
    id: "viyana_ovasi",
    nameTr: "Viyana Ovası",
    themeTr: "Büyük şehir, surlar ve geniş savaş alanı.",
    battleStyleTr: "Büyük çaplı kuşatma ve meydan savaşı.",
    width: 112,
    height: 72,
    playerStart: {"x":10,"y":33},
    enemyStart: {"x":96,"y":33},
    commonArea: {"x":44,"y":22,"w":24,"h":28},
    rects: [
      {
            "type": "forest",
            "look": "forest",
            "x": 6,
            "y": 16,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 6,
            "y": 46,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 94,
            "y": 16,
            "w": 12,
            "h": 10
      },
      {
            "type": "forest",
            "look": "forest",
            "x": 94,
            "y": 46,
            "w": 12,
            "h": 10
      },
      {
            "type": "flat",
            "look": "field",
            "x": 34,
            "y": 8,
            "w": 16,
            "h": 14
      },
      {
            "type": "flat",
            "look": "field",
            "x": 34,
            "y": 50,
            "w": 16,
            "h": 14
      },
      {
            "type": "flat",
            "look": "field",
            "x": 62,
            "y": 8,
            "w": 16,
            "h": 14
      },
      {
            "type": "flat",
            "look": "field",
            "x": 62,
            "y": 50,
            "w": 16,
            "h": 14
      },
      {
            "type": "blocked",
            "look": "river",
            "x": 28,
            "y": 0,
            "w": 2,
            "h": 72
      },
      {
            "type": "passage",
            "look": "bridge",
            "x": 28,
            "y": 34,
            "w": 2,
            "h": 4
      },
      {
            "type": "passage",
            "look": "ford",
            "x": 28,
            "y": 52,
            "w": 2,
            "h": 4
      },
      {
            "type": "blocked",
            "look": "river",
            "x": 82,
            "y": 0,
            "w": 2,
            "h": 72
      },
      {
            "type": "passage",
            "look": "bridge",
            "x": 82,
            "y": 34,
            "w": 2,
            "h": 4
      },
      {
            "type": "passage",
            "look": "ford",
            "x": 82,
            "y": 16,
            "w": 2,
            "h": 4
      },
      {
            "type": "blocked",
            "look": "wall",
            "x": 55,
            "y": 0,
            "w": 2,
            "h": 72
      },
      {
            "type": "passage",
            "look": "gate",
            "x": 55,
            "y": 14,
            "w": 2,
            "h": 4
      },
      {
            "type": "passage",
            "look": "gate",
            "x": 55,
            "y": 34,
            "w": 2,
            "h": 4
      },
      {
            "type": "passage",
            "look": "gate",
            "x": 55,
            "y": 54,
            "w": 2,
            "h": 4
      }
],
    nodes: {
      "gold": {
            "player": [
                  {
                        "x": 20,
                        "y": 36
                  },
                  {
                        "x": 19,
                        "y": 39
                  },
                  {
                        "x": 18,
                        "y": 41
                  },
                  {
                        "x": 16,
                        "y": 42
                  },
                  {
                        "x": 13,
                        "y": 43
                  },
                  {
                        "x": 10,
                        "y": 42
                  },
                  {
                        "x": 8,
                        "y": 41
                  },
                  {
                        "x": 7,
                        "y": 39
                  }
            ],
            "enemy": [
                  {
                        "x": 106,
                        "y": 36
                  },
                  {
                        "x": 105,
                        "y": 39
                  },
                  {
                        "x": 104,
                        "y": 41
                  },
                  {
                        "x": 102,
                        "y": 42
                  },
                  {
                        "x": 99,
                        "y": 43
                  },
                  {
                        "x": 96,
                        "y": 42
                  },
                  {
                        "x": 94,
                        "y": 41
                  },
                  {
                        "x": 93,
                        "y": 39
                  }
            ]
      },
      "wood": {
            "player": [
                  {
                        "x": 6,
                        "y": 16
                  },
                  {
                        "x": 7,
                        "y": 16
                  },
                  {
                        "x": 8,
                        "y": 16
                  },
                  {
                        "x": 9,
                        "y": 16
                  },
                  {
                        "x": 10,
                        "y": 16
                  },
                  {
                        "x": 11,
                        "y": 16
                  },
                  {
                        "x": 12,
                        "y": 16
                  }
            ],
            "enemy": [
                  {
                        "x": 94,
                        "y": 16
                  },
                  {
                        "x": 95,
                        "y": 16
                  },
                  {
                        "x": 96,
                        "y": 16
                  },
                  {
                        "x": 97,
                        "y": 16
                  },
                  {
                        "x": 98,
                        "y": 16
                  },
                  {
                        "x": 99,
                        "y": 16
                  },
                  {
                        "x": 100,
                        "y": 16
                  }
            ]
      }
},
  },
};
