import { CommanderDef, CommanderEffect, CommanderId, Team } from '../types';

export class Commander {
  constructor(
    public readonly def: CommanderDef,
    public readonly team: Team
  ) {}

  public get id(): CommanderId {
    return this.def.id;
  }

  public get nameTr(): string {
    return this.def.nameTr;
  }

  public get abilityNameTr(): string {
    return this.def.abilityNameTr;
  }

  public get bonusTextTr(): string {
    return this.def.bonusTextTr;
  }

  public get effects(): CommanderEffect[] {
    return this.def.effects;
  }
}
