/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/lottery.json`.
 */
export type Lottery = {
  "address": "HQ86E1qrGs7axPuNZKHsc23MUhL9SFKdygkNM8K95uop",
  "metadata": {
    "name": "lottery",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "On-chain lottery program for sol-lottery"
  },
  "instructions": [
    {
      "name": "acceptAdmin",
      "discriminator": [
        112,
        42,
        45,
        90,
        116,
        181,
        13,
        170
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "newAdmin",
          "docs": [
            "The pubkey proposed in `propose_admin`, signing to confirm."
          ],
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "allocateShard",
      "discriminator": [
        168,
        31,
        44,
        209,
        41,
        237,
        6,
        188
      ],
      "accounts": [
        {
          "name": "lottery",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "previousShard",
          "docs": [
            "The shard that's currently active (and full)."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round"
              },
              {
                "kind": "account",
                "path": "round.current_shard",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "newShard",
          "docs": [
            "The new shard being allocated; must equal `round.current_shard + 1`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round"
              },
              {
                "kind": "arg",
                "path": "newShardIndex"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newShardIndex",
          "type": "u32"
        }
      ]
    },
    {
      "name": "beginDisableLottery",
      "discriminator": [
        137,
        121,
        157,
        207,
        218,
        211,
        187,
        216
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "buyTickets",
      "discriminator": [
        48,
        16,
        122,
        137,
        24,
        214,
        198,
        58
      ],
      "accounts": [
        {
          "name": "lottery",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "currentShard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round"
              },
              {
                "kind": "account",
                "path": "round.current_shard",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "quantity",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeLottery",
      "discriminator": [
        253,
        97,
        216,
        187,
        251,
        189,
        113,
        22
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "closeShard",
      "discriminator": [
        18,
        225,
        167,
        168,
        223,
        60,
        73,
        176
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "shard",
          "docs": [
            "The shard to close."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round"
              },
              {
                "kind": "account",
                "path": "shard.shard_index",
                "account": "ticketShard"
              }
            ]
          }
        },
        {
          "name": "rentRecipient",
          "docs": [
            "Where the shard's rent goes. Pinned to the program admin so the rent",
            "is reclaimable but no random caller can redirect it."
          ],
          "writable": true
        },
        {
          "name": "caller",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "consumeOraoResolution",
      "discriminator": [
        32,
        225,
        220,
        225,
        143,
        128,
        2,
        246
      ],
      "accounts": [
        {
          "name": "globalConfig"
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "vrfRequest",
          "docs": [
            "ORAO's randomness account; we deserialize it manually."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  114,
                  97,
                  110,
                  100,
                  111,
                  109,
                  110,
                  101,
                  115,
                  115,
                  45,
                  114,
                  101,
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "round"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120
              ]
            }
          }
        },
        {
          "name": "winnerShard",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round"
              },
              {
                "kind": "account",
                "path": "winner_shard.shard_index",
                "account": "ticketShard"
              }
            ]
          }
        },
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "nextRound",
          "writable": true,
          "optional": true
        },
        {
          "name": "nextShard",
          "writable": true,
          "optional": true
        },
        {
          "name": "systemProgram",
          "optional": true,
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "consumeResolution",
      "discriminator": [
        25,
        182,
        192,
        132,
        199,
        248,
        137,
        9
      ],
      "accounts": [
        {
          "name": "globalConfig"
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "vrfRequest",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  114,
                  102
                ]
              },
              {
                "kind": "account",
                "path": "round"
              }
            ]
          }
        },
        {
          "name": "winnerShard",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round"
              },
              {
                "kind": "account",
                "path": "winner_shard.shard_index",
                "account": "ticketShard"
              }
            ]
          }
        },
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "nextRound",
          "docs": [
            "Optional rollover target — see `resolve_round.rs` for semantics."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "nextShard",
          "writable": true,
          "optional": true
        },
        {
          "name": "systemProgram",
          "optional": true,
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createLottery",
      "discriminator": [
        242,
        165,
        247,
        119,
        17,
        203,
        21,
        42
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "global_config.next_lottery_id",
                "account": "globalConfig"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "durationSeconds",
          "type": "i64"
        },
        {
          "name": "ticketPriceLamports",
          "type": "u64"
        },
        {
          "name": "prizeKind",
          "type": {
            "defined": {
              "name": "prizeKind"
            }
          }
        },
        {
          "name": "autoRollover",
          "type": "bool"
        },
        {
          "name": "splits",
          "type": {
            "vec": {
              "defined": {
                "name": "split"
              }
            }
          }
        }
      ]
    },
    {
      "name": "donateToRound",
      "docs": [
        "Top up the round's prize pool. The donation goes 100% to the winner",
        "at resolve, on top of the percentages from ticket sales. Anyone may",
        "donate; the lottery must have a pool split (i.e. a Sol-prize lottery)."
      ],
      "discriminator": [
        199,
        147,
        117,
        14,
        46,
        232,
        91,
        45
      ],
      "accounts": [
        {
          "name": "lottery",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "donor",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalizeDisableLottery",
      "discriminator": [
        205,
        149,
        252,
        130,
        253,
        105,
        63,
        221
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "docs": [
            "In-flight round; pass `None` when no round is open."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "lottery.current_round_index",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "fulfillResolution",
      "discriminator": [
        255,
        125,
        228,
        148,
        106,
        60,
        91,
        212
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vrfRequest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  114,
                  102
                ]
              },
              {
                "kind": "account",
                "path": "vrf_request.round",
                "account": "vrfRequest"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    },
    {
      "name": "initializeGlobal",
      "discriminator": [
        47,
        225,
        15,
        112,
        86,
        51,
        190,
        231
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "vrfProgram",
          "type": "pubkey"
        },
        {
          "name": "vrfTreasury",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "openRound",
      "discriminator": [
        66,
        235,
        123,
        240,
        8,
        35,
        185,
        159
      ],
      "accounts": [
        {
          "name": "globalConfig"
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "previousRound",
          "docs": [
            "The previous round (must be Resolved) — required when `round_index > 1`.",
            "Pass `None` only for round 1."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "arg",
                "path": "round_index.checked_sub(1).unwrap_or(0)"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "arg",
                "path": "roundIndex"
              }
            ]
          }
        },
        {
          "name": "shardZero",
          "docs": [
            "Header-only allocation; grows via `realloc` on each `buy_tickets`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round"
              },
              {
                "kind": "const",
                "value": [
                  0,
                  0,
                  0,
                  0
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roundIndex",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pauseLottery",
      "discriminator": [
        178,
        234,
        69,
        222,
        135,
        30,
        243,
        172
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "docs": [
            "In-flight round; pass `None` when no round is open."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "lottery.current_round_index",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "proposeAdmin",
      "discriminator": [
        121,
        214,
        199,
        212,
        87,
        39,
        117,
        234
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "requestOraoResolution",
      "docs": [
        "Public resolution backed by ORAO VRF. Anyone may call this once the",
        "round timer has elapsed (admin may call any time). It CPIs into the",
        "ORAO program to request verifiable randomness — ORAO oracles fulfill",
        "off-chain, then anyone calls `consume_orao_resolution` to draw."
      ],
      "discriminator": [
        0,
        178,
        239,
        161,
        77,
        171,
        60,
        76
      ],
      "accounts": [
        {
          "name": "globalConfig"
        },
        {
          "name": "lottery",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "vrfRequest",
          "docs": [
            "ORAO's randomness account, derived from the seed (= round pubkey)."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  114,
                  97,
                  110,
                  100,
                  111,
                  109,
                  110,
                  101,
                  115,
                  115,
                  45,
                  114,
                  101,
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "round"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120
              ]
            }
          }
        },
        {
          "name": "vrfTreasury",
          "writable": true
        },
        {
          "name": "vrfNetworkState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  110,
                  101,
                  116,
                  119,
                  111,
                  114,
                  107,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120
              ]
            }
          }
        },
        {
          "name": "vrfProgram",
          "address": "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
        },
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "requestResolution",
      "discriminator": [
        200,
        62,
        148,
        110,
        22,
        92,
        78,
        187
      ],
      "accounts": [
        {
          "name": "globalConfig"
        },
        {
          "name": "lottery",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "vrfRequest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  114,
                  102
                ]
              },
              {
                "kind": "account",
                "path": "round"
              }
            ]
          }
        },
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "resolveEmptyRound",
      "discriminator": [
        133,
        14,
        75,
        54,
        181,
        98,
        72,
        227
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "resolveRound",
      "docs": [
        "Admin-driven resolution. Admin supplies a 32-byte seed; the program",
        "derives the winner and distributes splits."
      ],
      "discriminator": [
        165,
        114,
        237,
        158,
        1,
        36,
        70,
        254
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "round.index",
                "account": "round"
              }
            ]
          }
        },
        {
          "name": "winnerShard",
          "docs": [
            "Shard containing the winning ticket. Its `shard_index` must match",
            "what we derive from the seed; otherwise the resolve aborts."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "round"
              },
              {
                "kind": "account",
                "path": "winner_shard.shard_index",
                "account": "ticketShard"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        },
        {
          "name": "nextRound",
          "docs": [
            "Optional rollover target — the next Round PDA. Pass alongside",
            "`next_shard` and `system_program` to atomically open round N+1."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "nextShard",
          "docs": [
            "Optional rollover target — shard 0 for the next round."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "systemProgram",
          "optional": true,
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "seed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "resumeLottery",
      "discriminator": [
        182,
        218,
        255,
        185,
        203,
        8,
        20,
        138
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "round",
          "docs": [
            "In-flight round; pass `None` when no round is open."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "lottery"
              },
              {
                "kind": "account",
                "path": "lottery.current_round_index",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateLotteryDuration",
      "discriminator": [
        227,
        112,
        142,
        137,
        169,
        218,
        213,
        60
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "newDurationSeconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "updateLotteryPrice",
      "discriminator": [
        220,
        158,
        97,
        103,
        194,
        140,
        167,
        107
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "newPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateLotterySplits",
      "discriminator": [
        35,
        10,
        225,
        2,
        172,
        180,
        179,
        50
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "lottery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  116,
                  116,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lottery.id",
                "account": "lottery"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "newSplits",
          "type": {
            "vec": {
              "defined": {
                "name": "split"
              }
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "globalConfig",
      "discriminator": [
        149,
        8,
        156,
        202,
        160,
        252,
        176,
        217
      ]
    },
    {
      "name": "lottery",
      "discriminator": [
        162,
        182,
        26,
        12,
        164,
        214,
        112,
        3
      ]
    },
    {
      "name": "networkState",
      "discriminator": [
        212,
        237,
        148,
        56,
        97,
        245,
        51,
        169
      ]
    },
    {
      "name": "round",
      "discriminator": [
        87,
        127,
        165,
        51,
        73,
        78,
        116,
        174
      ]
    },
    {
      "name": "ticketShard",
      "discriminator": [
        97,
        3,
        68,
        55,
        47,
        210,
        241,
        129
      ]
    },
    {
      "name": "vrfRequest",
      "discriminator": [
        153,
        180,
        194,
        105,
        91,
        34,
        95,
        113
      ]
    }
  ],
  "events": [
    {
      "name": "adminTransferAccepted",
      "discriminator": [
        79,
        229,
        204,
        202,
        134,
        43,
        177,
        26
      ]
    },
    {
      "name": "adminTransferProposed",
      "discriminator": [
        203,
        168,
        175,
        51,
        239,
        104,
        20,
        85
      ]
    },
    {
      "name": "donationReceived",
      "discriminator": [
        160,
        135,
        32,
        7,
        241,
        105,
        91,
        158
      ]
    },
    {
      "name": "lotteryConfigUpdated",
      "discriminator": [
        237,
        50,
        147,
        153,
        78,
        255,
        61,
        128
      ]
    },
    {
      "name": "lotteryCreated",
      "discriminator": [
        162,
        18,
        70,
        148,
        241,
        124,
        57,
        74
      ]
    },
    {
      "name": "lotteryStateChanged",
      "discriminator": [
        116,
        62,
        184,
        135,
        124,
        90,
        153,
        26
      ]
    },
    {
      "name": "resolutionRequested",
      "discriminator": [
        207,
        202,
        117,
        88,
        217,
        92,
        241,
        12
      ]
    },
    {
      "name": "roundOpened",
      "discriminator": [
        99,
        173,
        228,
        72,
        142,
        57,
        109,
        178
      ]
    },
    {
      "name": "roundResolved",
      "discriminator": [
        204,
        146,
        253,
        187,
        8,
        61,
        75,
        29
      ]
    },
    {
      "name": "shardClosed",
      "discriminator": [
        181,
        79,
        79,
        41,
        139,
        177,
        154,
        14
      ]
    },
    {
      "name": "ticketBought",
      "discriminator": [
        80,
        244,
        35,
        181,
        211,
        143,
        3,
        166
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "splitsCountOutOfRange",
      "msg": "Splits must contain between 1 and 8 entries."
    },
    {
      "code": 6001,
      "name": "splitsMustSumTo100Percent",
      "msg": "Splits must sum to exactly 10000 basis points (100%)."
    },
    {
      "code": 6002,
      "name": "bpsNotMultipleOf100",
      "msg": "Each split bps must be a multiple of 100 (1% increments)."
    },
    {
      "code": 6003,
      "name": "missingPoolSplitForSolPrize",
      "msg": "Sol-prize lotteries must have exactly one split marked is_pool=true."
    },
    {
      "code": 6004,
      "name": "unexpectedPoolSplitForPhysicalPrize",
      "msg": "Physical-prize lotteries must not have any is_pool=true split."
    },
    {
      "code": 6005,
      "name": "nameTooLong",
      "msg": "Lottery name exceeds 32 bytes."
    },
    {
      "code": 6006,
      "name": "labelTooLong",
      "msg": "Split label exceeds 16 bytes."
    },
    {
      "code": 6007,
      "name": "durationMustBePositive",
      "msg": "Round duration must be greater than zero."
    },
    {
      "code": 6008,
      "name": "priceMustBePositive",
      "msg": "Ticket price must be greater than zero."
    },
    {
      "code": 6009,
      "name": "lotteryNotActive",
      "msg": "Lottery is not in Active state."
    },
    {
      "code": 6010,
      "name": "lotteryNotPendingDisable",
      "msg": "Lottery is not in PendingDisable state."
    },
    {
      "code": 6011,
      "name": "lotteryNotDisabled",
      "msg": "Lottery is not in Disabled state."
    },
    {
      "code": 6012,
      "name": "pauseRequiresActive",
      "msg": "Cannot pause: lottery is not Active."
    },
    {
      "code": 6013,
      "name": "resumeRequiresPaused",
      "msg": "Cannot resume: lottery is not Paused."
    },
    {
      "code": 6014,
      "name": "openRoundPreventsClose",
      "msg": "Cannot close lottery: an open or unresolved round exists."
    },
    {
      "code": 6015,
      "name": "roundNotOpen",
      "msg": "Round is not Open."
    },
    {
      "code": 6016,
      "name": "roundNotClosed",
      "msg": "Round is not Closed; cannot request resolution yet."
    },
    {
      "code": 6017,
      "name": "roundNotResolved",
      "msg": "Round is not Resolved."
    },
    {
      "code": 6018,
      "name": "roundAlreadyResolved",
      "msg": "Round is already resolved."
    },
    {
      "code": 6019,
      "name": "roundStillRunning",
      "msg": "Round duration has not elapsed; only admin can force-resolve early."
    },
    {
      "code": 6020,
      "name": "roundExpired",
      "msg": "Round duration has elapsed; ticket sales closed."
    },
    {
      "code": 6021,
      "name": "lotteryPaused",
      "msg": "Lottery is paused; ticket sales suspended."
    },
    {
      "code": 6022,
      "name": "roundAlreadyOpen",
      "msg": "Round is already in flight; cannot open a new one."
    },
    {
      "code": 6023,
      "name": "roundHasNoTickets",
      "msg": "Round has zero tickets; nothing to draw."
    },
    {
      "code": 6024,
      "name": "previousRoundNotResolved",
      "msg": "Auto-rollover requires the previous round to be passed and Resolved."
    },
    {
      "code": 6025,
      "name": "ticketShardFull",
      "msg": "Ticket shard is full; allocate the next shard."
    },
    {
      "code": 6026,
      "name": "ticketShardNotFull",
      "msg": "Cannot allocate the next shard until the current one is full."
    },
    {
      "code": 6027,
      "name": "wrongTicketShard",
      "msg": "Wrong ticket shard supplied for current state."
    },
    {
      "code": 6028,
      "name": "quantityZero",
      "msg": "Quantity must be greater than zero."
    },
    {
      "code": 6029,
      "name": "quantityTooLarge",
      "msg": "Quantity exceeds the per-call cap (320). Split the purchase across multiple calls."
    },
    {
      "code": 6030,
      "name": "insufficientFunds",
      "msg": "Insufficient funds to purchase that many tickets."
    },
    {
      "code": 6031,
      "name": "unauthorized",
      "msg": "Caller is not the admin."
    },
    {
      "code": 6032,
      "name": "noPendingAdmin",
      "msg": "No pending admin to accept."
    },
    {
      "code": 6033,
      "name": "notPendingAdmin",
      "msg": "Caller is not the pending admin."
    },
    {
      "code": 6034,
      "name": "vrfNotFulfilled",
      "msg": "VRF request not yet fulfilled."
    },
    {
      "code": 6035,
      "name": "vrfAlreadyRequested",
      "msg": "VRF request already in flight."
    },
    {
      "code": 6036,
      "name": "wrongSplitDestination",
      "msg": "Wrong destination pubkey for split at this index."
    },
    {
      "code": 6037,
      "name": "donationRequiresPoolSplit",
      "msg": "Donations require a lottery with a pool split (Sol prize kind)."
    },
    {
      "code": 6038,
      "name": "donationRoundNotAcceptingFunds",
      "msg": "Donations are only accepted while the round is Open or Closed."
    },
    {
      "code": 6039,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow."
    }
  ],
  "types": [
    {
      "name": "adminTransferAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "previousAdmin",
            "type": "pubkey"
          },
          {
            "name": "newAdmin",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "adminTransferProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "currentAdmin",
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "donationReceived",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "pubkey"
          },
          {
            "name": "donor",
            "type": "pubkey"
          },
          {
            "name": "amountLamports",
            "type": "u64"
          },
          {
            "name": "runningTotalLamports",
            "docs": [
              "Cumulative donations for this round after this event."
            ],
            "type": "u64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "globalConfig",
      "docs": [
        "Singleton account holding the program's admin authority and VRF wiring.",
        "",
        "**PDA seeds:** `[b\"config\"]`",
        "**Created by:** `initialize_global` (once per deployment).",
        "**Rent payer:** the deployer (becomes the initial admin)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "The wallet authorized to administer every lottery (create, pause,",
              "disable, etc.). Single-sig today; we assume the user controls it via",
              "a hardware wallet or multisig at the wallet layer."
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "docs": [
              "Two-step admin handover: when the current admin proposes a new admin,",
              "it lands here. The new admin must call `accept_admin` to take over.",
              "`None` means no transfer in flight."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "vrfProgram",
            "docs": [
              "ORAO VRF program id. Varies between localnet/devnet/mainnet, so we",
              "store it on-chain rather than hardcoding it."
            ],
            "type": "pubkey"
          },
          {
            "name": "vrfTreasury",
            "docs": [
              "ORAO treasury account used to pay fulfillment fees."
            ],
            "type": "pubkey"
          },
          {
            "name": "nextLotteryId",
            "docs": [
              "Monotonically increasing counter; the next created Lottery uses this",
              "as its `id` (and as a seed for its PDA)."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump for `[b\"config\"]`. Stored to avoid recomputing on every CPI."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "lottery",
      "docs": [
        "A configurable lottery. One Lottery has at most one active Round at a time.",
        "",
        "**PDA seeds:** `[b\"lottery\", id.to_le_bytes()]`",
        "**Created by:** `create_lottery` (admin).",
        "**Rent payer:** admin. Reclaimed on `close_lottery` once Disabled."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "docs": [
              "Stable id, assigned from `GlobalConfig.next_lottery_id`. Used as a",
              "PDA seed so we don't need a global lookup table."
            ],
            "type": "u64"
          },
          {
            "name": "name",
            "docs": [
              "Human label, ASCII, zero-padded."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "lotteryState"
              }
            }
          },
          {
            "name": "prizeKind",
            "type": {
              "defined": {
                "name": "prizeKind"
              }
            }
          },
          {
            "name": "ticketPriceLamports",
            "docs": [
              "Price per ticket. Editable any time; the change applies to the NEXT",
              "round only (each Round snapshots its price on open)."
            ],
            "type": "u64"
          },
          {
            "name": "roundDurationSeconds",
            "docs": [
              "Round duration in seconds (e.g. 86_400 for 24h). Same edit semantics."
            ],
            "type": "i64"
          },
          {
            "name": "autoRollover",
            "docs": [
              "If true, `resolve_round` immediately opens round N+1."
            ],
            "type": "bool"
          },
          {
            "name": "splits",
            "docs": [
              "Revenue splits for new rounds. Edited via `update_splits`. The current",
              "round's snapshot is what governs payouts for that round."
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "split"
                }
              }
            }
          },
          {
            "name": "currentRoundIndex",
            "docs": [
              "`0` until the first `open_round`; thereafter the index of the",
              "most-recently-opened round."
            ],
            "type": "u64"
          },
          {
            "name": "totalRoundsResolved",
            "docs": [
              "Lifetime counter incremented in `resolve_round`."
            ],
            "type": "u64"
          },
          {
            "name": "totalTicketsSold",
            "docs": [
              "Lifetime counter incremented on every successful `buy_tickets`."
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "lotteryConfigUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lottery",
            "type": "pubkey"
          },
          {
            "name": "field",
            "docs": [
              "ASCII tag for which field changed: \"price\", \"duration\", \"splits\"."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "lotteryCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lottery",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "lotteryState",
      "docs": [
        "Lifecycle of a lottery configuration.",
        "",
        "```text",
        "Active  <->  Paused",
        "\\         /",
        "v       v",
        "PendingDisable  --(current round resolves)-->  Disabled",
        "```",
        "",
        "* **Active**: rounds can run, tickets sell.",
        "* **Paused**: no sales; the in-flight round's timer freezes.",
        "* **PendingDisable**: in-flight round will finish; no new round opens after.",
        "* **Disabled**: terminal. The Lottery PDA may be closed by the admin to",
        "reclaim rent."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "paused"
          },
          {
            "name": "pendingDisable"
          },
          {
            "name": "disabled"
          }
        ]
      }
    },
    {
      "name": "lotteryStateChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lottery",
            "type": "pubkey"
          },
          {
            "name": "previousState",
            "type": "u8"
          },
          {
            "name": "newState",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "networkConfiguration",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "requestFee",
            "type": "u64"
          },
          {
            "name": "fulfillmentAuthorities",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "tokenFeeConfig",
            "type": {
              "option": {
                "defined": {
                  "name": "oraoTokenFeeConfig"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "networkState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "networkConfiguration"
              }
            }
          },
          {
            "name": "numReceived",
            "docs": [
              "Total number of received requests."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "oraoTokenFeeConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "ORAO token mint address."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "ORAO token treasury account."
            ],
            "type": "pubkey"
          },
          {
            "name": "fee",
            "docs": [
              "Fee in ORAO SPL token smallest units."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "prizeKind",
      "docs": [
        "What kind of prize a lottery awards.",
        "",
        "* **Sol** — winner is paid SOL out of the round's pool split.",
        "* **Physical** — off-chain prize delivery. The contract still picks and",
        "records a winner pubkey, but pays them no SOL. The full ticket revenue",
        "is split among the configured (non-pool) destinations."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "sol"
          },
          {
            "name": "physical"
          }
        ]
      }
    },
    {
      "name": "resolutionRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "pubkey"
          },
          {
            "name": "vrfRequest",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "round",
      "docs": [
        "One in-flight or historical lottery round.",
        "",
        "**PDA seeds:** `[b\"round\", lottery.key(), index.to_le_bytes()]`",
        "**Created by:** `open_round`.",
        "**Rent payer:** the caller of `open_round` (admin always for round 1;",
        "admin or anyone with `auto_rollover` enabled for subsequent rounds).",
        "",
        "The Round PDA also holds the SOL escrow for ticket sales:",
        "`buy_tickets` `system::transfer`s lamports onto this account; on resolve",
        "the program drains them back out via direct lamport mutation (allowed",
        "because the program owns the Round account). The rent-exempt minimum is",
        "preserved across all transitions."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lottery",
            "docs": [
              "The Lottery this round belongs to."
            ],
            "type": "pubkey"
          },
          {
            "name": "index",
            "docs": [
              "1-based index within its Lottery."
            ],
            "type": "u64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "roundState"
              }
            }
          },
          {
            "name": "startedAt",
            "docs": [
              "Unix seconds at which `open_round` ran."
            ],
            "type": "i64"
          },
          {
            "name": "durationSeconds",
            "docs": [
              "Snapshot of `Lottery.round_duration_seconds` at open time."
            ],
            "type": "i64"
          },
          {
            "name": "ticketPriceLamports",
            "docs": [
              "Snapshot of `Lottery.ticket_price_lamports` at open time."
            ],
            "type": "u64"
          },
          {
            "name": "splits",
            "docs": [
              "Snapshot of `Lottery.splits` at open time. Frozen for the life of the",
              "round so mid-round config edits never affect existing buyers."
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "split"
                }
              }
            }
          },
          {
            "name": "pausedAt",
            "docs": [
              "`Some(timestamp)` while the round is paused; `None` otherwise."
            ],
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "pausedTotalSeconds",
            "docs": [
              "Total seconds the round has been paused for, accumulated across",
              "pause/resume cycles. Used to extend `effective_end`."
            ],
            "type": "i64"
          },
          {
            "name": "ticketsSold",
            "docs": [
              "Lifetime ticket count for this round."
            ],
            "type": "u64"
          },
          {
            "name": "donatedLamports",
            "docs": [
              "Cumulative SOL donated to this round's prize pool via `donate_to_round`.",
              "Added on top of the `is_pool` split's share at resolve."
            ],
            "type": "u64"
          },
          {
            "name": "currentShard",
            "docs": [
              "Index of the active TicketShard PDA receiving new ticket writes.",
              "Advanced by `allocate_shard` when the previous shard fills."
            ],
            "type": "u32"
          },
          {
            "name": "maxShard",
            "docs": [
              "Highest shard index ever allocated for this round (== `current_shard`",
              "when no rollover has happened, otherwise greater). Used by",
              "`close_shard` to know how many shards exist after resolve."
            ],
            "type": "u32"
          },
          {
            "name": "winner",
            "docs": [
              "Set on resolution. `None` for empty rounds (zero tickets)."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "vrfRequest",
            "docs": [
              "VRF request PDA while in `AwaitingVrf`; cleared after resolve."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "roundOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lottery",
            "type": "pubkey"
          },
          {
            "name": "round",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "startedAt",
            "type": "i64"
          },
          {
            "name": "effectiveEnd",
            "type": "i64"
          },
          {
            "name": "ticketPriceLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "roundResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lottery",
            "type": "pubkey"
          },
          {
            "name": "round",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "docs": [
              "`None` for empty rounds (zero tickets)."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "winningTicketIndex",
            "docs": [
              "`None` for empty rounds."
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "poolAmountLamports",
            "docs": [
              "Lamports paid to the winner (0 if no pool split or empty round)."
            ],
            "type": "u64"
          },
          {
            "name": "totalDistributedLamports",
            "docs": [
              "Sum of every transfer made by `resolve_round`."
            ],
            "type": "u64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "roundState",
      "docs": [
        "Round-level lifecycle.",
        "",
        "```text",
        "Open  --(timer expires OR admin force)--> Closed",
        "Closed --(request_resolution)--> AwaitingVrf",
        "AwaitingVrf --(consume_resolution)--> Resolved",
        "```",
        "`Resolved` is terminal. There is no cancel/refund path: ticket sales",
        "are non-refundable by design."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "closed"
          },
          {
            "name": "awaitingVrf"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "shardClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "pubkey"
          },
          {
            "name": "shardIndex",
            "type": "u32"
          },
          {
            "name": "rentReturnedTo",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "split",
      "docs": [
        "One slice of ticket-sale revenue.",
        "",
        "Per-collection rules (validated on `create_lottery` / `update_splits`):",
        "* 1 ≤ `splits.len()` ≤ 8.",
        "* `sum(bps) == 10_000`  (100.00%).",
        "* Each `bps` is a multiple of 100 (1% increments only).",
        "* `PrizeKind::Sol` ⇒ exactly one Split has `is_pool == true`.",
        "* `PrizeKind::Physical` ⇒ no Split has `is_pool == true`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "label",
            "docs": [
              "Human label, ASCII, zero-padded. Used by UIs; not interpreted on-chain."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "destination",
            "docs": [
              "Destination wallet for this slice. Ignored for `is_pool` splits — the",
              "pool is paid to the round's winner (computed at resolve time)."
            ],
            "type": "pubkey"
          },
          {
            "name": "bps",
            "docs": [
              "Basis points of the round's gross sales. `100 bps == 1%`.",
              "Constrained to multiples of 100."
            ],
            "type": "u16"
          },
          {
            "name": "isPool",
            "docs": [
              "Marks the prize-pool slice. At most one per Lottery."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "ticketBought",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "quantity",
            "type": "u64"
          },
          {
            "name": "totalPaidLamports",
            "type": "u64"
          },
          {
            "name": "runningTotal",
            "docs": [
              "Cumulative ticket count for the round after this purchase."
            ],
            "type": "u64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ticketShard",
      "docs": [
        "One page of the round's ticket book.",
        "",
        "We shard tickets across multiple PDAs because:",
        "1. Solana account allocation is bounded per instruction.",
        "2. Capping shard size simplifies error recovery and reasoning about gas.",
        "",
        "**PDA seeds:** `[b\"shard\", round.key(), shard_index.to_le_bytes()]`",
        "**Created by:** the first `buy_tickets` that needs a fresh shard.",
        "**Rent payer:** that buyer.",
        "",
        "Drawing math:",
        "`winner_index = randomness % round.tickets_sold`",
        "`shard_index  = winner_index / CAPACITY`",
        "`offset       = winner_index % CAPACITY`",
        "→ read `shard_index`'s `buyers[offset]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "docs": [
              "The round this shard belongs to."
            ],
            "type": "pubkey"
          },
          {
            "name": "shardIndex",
            "docs": [
              "0-based index of this shard within the round."
            ],
            "type": "u32"
          },
          {
            "name": "len",
            "docs": [
              "Number of tickets currently stored. Always ≤ `CAPACITY`."
            ],
            "type": "u32"
          },
          {
            "name": "buyers",
            "docs": [
              "Buyers, indexed by ticket number within the shard. Pre-allocated to",
              "`CAPACITY` so individual buys never have to realloc."
            ],
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vrfRequest",
      "docs": [
        "One VRF request bridging `request_resolution` to `vrf_callback`.",
        "",
        "The request lifecycle:",
        "1. `request_resolution` creates this PDA, sets `seed`, leaves",
        "`fulfilled = false`.",
        "2. ORAO's fulfillment quorum invokes `vrf_callback` (signed by ORAO's",
        "callback authority); we write the 64-byte randomness and flip",
        "`fulfilled = true`.",
        "3. The same callback (or `force_resolve` after a timeout) reads",
        "`randomness` and resolves the round.",
        "",
        "**PDA seeds:** `[b\"vrf\", round.key()]`",
        "**Created by:** `request_resolution`.",
        "**Rent payer:** the resolver (admin or cron caller)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "round",
            "docs": [
              "The round this request fulfills."
            ],
            "type": "pubkey"
          },
          {
            "name": "seed",
            "docs": [
              "Seed sent to ORAO. Must be unique per request to avoid collisions",
              "(we use the round's pubkey + slot at request time)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "fulfilled",
            "docs": [
              "Set to true once `vrf_callback` writes the randomness."
            ],
            "type": "bool"
          },
          {
            "name": "randomness",
            "docs": [
              "64-byte VRF output. Only the first 8 bytes are used to derive the",
              "winner index; the rest is stored for auditability."
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "requestedAt",
            "docs": [
              "Unix-seconds time of the request, used by `force_resolve` to enforce",
              "the 1-hour timeout."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
