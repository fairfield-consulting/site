import * as Schema from "effect/Schema";

const ProductionState = Schema.Struct({
  status: Schema.Literals(["created", "updated"]),
  fqn: Schema.Literal("website"),
  logicalId: Schema.Literal("website"),
  attr: Schema.Struct({
    accountId: Schema.String,
    workerName: Schema.Literal("fairfield-consulting-worker-prod-5hd5v3cmaxxxlw4w"),
    domain: Schema.Struct({ name: Schema.Literal("fairfieldconsulting.llc") }),
    tags: Schema.Array(Schema.String),
  }),
});

const expectedTags = [
  "alchemy:stack:fairfield-consulting",
  "alchemy:stage:prod",
  "alchemy:id:website",
];

export const isProductionState = (state: unknown, accountId: string): boolean =>
  accountId.length > 0 &&
  Schema.is(ProductionState)(state) &&
  state.attr.accountId === accountId &&
  expectedTags.every((tag) => state.attr.tags.includes(tag));
