/**
 * Walking a parsed feature.
 *
 * A Feature's children are Backgrounds, Scenarios and Rules, and a Rule has
 * Backgrounds and Scenarios of its own. These helpers flatten that nesting so
 * rules do not each have to remember that Rules exist - several of the
 * original rules did not, and crashed on any feature file using `Rule:`.
 */
import type {Background, Examples, Feature, Rule, Scenario} from '@cucumber/messages';

/** A Background or Scenario, together with the Rule containing it, if any. */
export interface StepContainer {
  node: Background | Scenario;
  rule: Rule | undefined;
}

/** Every Rule in the feature. */
export function* rulesOf(feature: Feature): Generator<Rule> {
  for (const child of feature.children) {
    if (child.rule !== undefined) {
      yield child.rule;
    }
  }
}

/** Every Scenario and Scenario Outline, including those inside Rules. */
export function* scenariosOf(
  feature: Feature,
): Generator<{scenario: Scenario; rule: Rule | undefined}> {
  for (const child of feature.children) {
    if (child.scenario !== undefined) {
      yield {scenario: child.scenario, rule: undefined};
    }
    if (child.rule !== undefined) {
      for (const grandchild of child.rule.children) {
        if (grandchild.scenario !== undefined) {
          yield {scenario: grandchild.scenario, rule: child.rule};
        }
      }
    }
  }
}

/** Every Background, including those inside Rules. */
export function* backgroundsOf(
  feature: Feature,
): Generator<{background: Background; rule: Rule | undefined}> {
  for (const child of feature.children) {
    if (child.background !== undefined) {
      yield {background: child.background, rule: undefined};
    }
    if (child.rule !== undefined) {
      for (const grandchild of child.rule.children) {
        if (grandchild.background !== undefined) {
          yield {background: grandchild.background, rule: child.rule};
        }
      }
    }
  }
}

/** Every node that holds steps: Backgrounds and Scenarios, Rules included. */
export function* stepContainersOf(feature: Feature): Generator<StepContainer> {
  for (const child of feature.children) {
    if (child.background !== undefined) {
      yield {node: child.background, rule: undefined};
    }
    if (child.scenario !== undefined) {
      yield {node: child.scenario, rule: undefined};
    }
    if (child.rule !== undefined) {
      for (const grandchild of child.rule.children) {
        if (grandchild.background !== undefined) {
          yield {node: grandchild.background, rule: child.rule};
        }
        if (grandchild.scenario !== undefined) {
          yield {node: grandchild.scenario, rule: child.rule};
        }
      }
    }
  }
}

/** Anything a tag may be written on. */
export type TaggableNode = Feature | Rule | Scenario | Examples;

/** A tagged node, with the nodes it sits inside, nearest ancestor first. */
export interface TaggedNode {
  node: TaggableNode;
  /** Feature, and the Rule and Scenario Outline containing it, if any. */
  ancestors: TaggableNode[];
}

/**
 * Every node that can carry tags: the Feature, its Rules, every Scenario -
 * inside a Rule or not - and every Examples table.
 *
 * Each one comes with its ancestors, so that a rule comparing a node's tags
 * with the ones it inherits does not have to walk the tree itself.
 */
export function* taggedNodesOf(feature: Feature): Generator<TaggedNode> {
  yield {node: feature, ancestors: []};

  function* scenarios(scenario: Scenario, ancestors: TaggableNode[]): Generator<TaggedNode> {
    yield {node: scenario, ancestors};
    for (const examples of scenario.examples) {
      yield {node: examples, ancestors: [scenario, ...ancestors]};
    }
  }

  for (const child of feature.children) {
    if (child.scenario !== undefined) {
      yield* scenarios(child.scenario, [feature]);
    }
    if (child.rule !== undefined) {
      yield {node: child.rule, ancestors: [feature]};
      for (const grandchild of child.rule.children) {
        if (grandchild.scenario !== undefined) {
          yield* scenarios(grandchild.scenario, [child.rule, feature]);
        }
      }
    }
  }
}
