import { Node } from "..";
import Prando from "prando";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";

export function generateName(this: Node): string {
  const r = new Prando(
    `${this.network}-${this.poolId}-${this.runtime.name}-${this.runtime.version}-${this.client.account.address}`
  );

  return uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: "-",
    length: 3,
    style: "lowerCase",
    seed: r.nextInt(0, adjectives.length * colors.length * animals.length),
  }).replace(" ", "-");
}
